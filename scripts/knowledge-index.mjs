import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(process.env.AGENT_WORKBENCH_REPOSITORY_ROOT || moduleRoot);
const entriesPath = path.join(root, "knowledge", "entries.json");
const guidesPath = path.join(root, "knowledge", "guides.json");
const indexPath = path.join(root, "knowledge", "index.json");
const stopWords = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "for", "with", "on", "is", "are", "这", "的", "了", "与", "和", "在", "是"]);

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, filePath);
}

export function tokenizeKnowledge(text = "") {
  const tokens = [];
  const normalized = String(text).normalize("NFKC").toLowerCase();
  for (const match of normalized.matchAll(/[\p{Script=Han}]+|[a-z0-9][a-z0-9_.+-]*/gu)) {
    const value = match[0];
    if (/^\p{Script=Han}+$/u.test(value)) {
      if (value.length === 1) tokens.push(value);
      for (let index = 0; index < value.length - 1; index += 1) tokens.push(value.slice(index, index + 2));
      continue;
    }
    if (!stopWords.has(value)) tokens.push(value);
  }
  return tokens;
}

export async function buildKnowledgeIndex() {
  const [entries, guides] = await Promise.all([readJson(entriesPath, []), readJson(guidesPath, {})]);
  const documents = {};
  const postings = {};
  for (const entry of entries) {
    if (!entry?.id || ["cleanup", "archived"].includes(entry.status)) continue;
    const guide = guides[entry.id] ?? {};
    const text = [
      entry.title, entry.category, entry.source, entry.summary, entry.impact, entry.action,
      ...(entry.tags ?? []), guide.summary, guide.impact, guide.action, ...(guide.highlights ?? []),
    ].filter(Boolean).join(" ");
    const tokens = tokenizeKnowledge(text);
    const frequencies = {};
    for (const token of tokens) frequencies[token] = (frequencies[token] ?? 0) + 1;
    documents[entry.id] = { length: tokens.length };
    for (const [token, frequency] of Object.entries(frequencies)) {
      (postings[token] ??= []).push([entry.id, frequency]);
    }
  }
  const lengths = Object.values(documents).map((document) => document.length);
  const index = {
    version: 1,
    builtAt: new Date().toISOString(),
    documentCount: lengths.length,
    averageLength: lengths.length ? lengths.reduce((sum, length) => sum + length, 0) / lengths.length : 0,
    documents,
    postings,
  };
  await writeJsonAtomic(indexPath, index);
  return index;
}

export async function getKnowledgeIndexMetadata() {
  const index = await readJson(indexPath, null) ?? await buildKnowledgeIndex();
  return { version: index.version, builtAt: index.builtAt, documentCount: index.documentCount };
}

export async function searchKnowledge(query, topK = 8) {
  if (typeof query !== "string" || !query.trim()) throw new Error("query is required");
  const limit = Math.min(20, Math.max(1, Math.round(Number(topK) || 8)));
  const [entries, guides] = await Promise.all([readJson(entriesPath, []), readJson(guidesPath, {})]);
  let index = await readJson(indexPath, null);
  const activeCount = entries.filter((entry) => entry?.id && !["cleanup", "archived"].includes(entry.status)).length;
  if (!index || index.documentCount !== activeCount) index = await buildKnowledgeIndex();
  const tokens = [...new Set(tokenizeKnowledge(query))];
  const scores = new Map();
  const averageLength = index.averageLength || 1;
  const documentCount = index.documentCount || 1;
  for (const token of tokens) {
    const posting = index.postings[token] ?? [];
    const inverseFrequency = Math.log(1 + (documentCount - posting.length + 0.5) / (posting.length + 0.5));
    for (const [id, frequency] of posting) {
      const length = index.documents[id]?.length || averageLength;
      const score = inverseFrequency * ((frequency * 2.2) / (frequency + 1.2 * (0.25 + 0.75 * length / averageLength)));
      scores.set(id, (scores.get(id) ?? 0) + score);
    }
  }
  const normalizedQuery = query.trim().toLowerCase();
  for (const entry of entries) {
    if (String(entry.title ?? "").toLowerCase().includes(normalizedQuery)) scores.set(entry.id, (scores.get(entry.id) ?? 0) + 4);
  }
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([id, score]) => {
      const entry = byId.get(id);
      const guide = guides[id];
      return {
        id,
        score: Number(score.toFixed(4)),
        title: entry.title,
        category: guide?.category ?? entry.category,
        sourceType: entry.sourceType,
        source: entry.source,
        sourceUrl: entry.sourceUrl,
        imageUrl: entry.imageUrl ?? "",
        summary: guide?.summary ?? entry.summary,
        highlights: guide?.highlights ?? [],
        impact: guide?.impact ?? entry.impact,
      };
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = await buildKnowledgeIndex();
  process.stdout.write(`Knowledge index contains ${index.documentCount} document${index.documentCount === 1 ? "" : "s"}.\n`);
}
