import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const watchlist = JSON.parse(await readFile(path.join(root, "watchlist/sources.json"), "utf8"));
const settings = JSON.parse(await readFile(path.join(root, "workspace/settings.json"), "utf8"));
const entriesPath = path.join(root, "knowledge/entries.json");
const entries = JSON.parse(await readFile(entriesPath, "utf8"));
const known = new Set(entries.map((entry) => entry.id));
const existingById = new Map(entries.map((entry) => [entry.id, entry]));
let refreshedExisting = 0;
const now = new Date();
const lookbackHours = Number(process.env.LOOKBACK_HOURS ?? 36);
const cutoff = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
const token = process.env.GITHUB_TOKEN;
const dryRun = process.env.DRY_RUN === "1";
const queueOnly = process.env.QUEUE_ONLY === "1";
const discovered = [];

function decodeEntities(text) {
  return text
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gi, "&");
}

function decodeXml(value = "") {

  let text = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // Feeds such as Google News HTML-encode their description markup. Decode
  // before stripping tags, then repeat once for doubly encoded fragments.
  for (let pass = 0; pass < 2; pass += 1) {
    text = decodeEntities(text)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ");
  }
  return decodeEntities(text).replace(/<[^>]+>/g, " ").replace(/\\n|\s+/g, " ").trim();
}

function tag(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (match) return decodeXml(match[1]);
  }
  return "";
}

function feedLink(block) {
  const href = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i)?.[1];
  return decodeXml(href || tag(block, ["link", "guid", "id"]));
}

function feedImage(block, pageUrl) {
  let markup = block.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  for (let pass = 0; pass < 2; pass += 1) markup = decodeEntities(markup);
  const value = markup.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*(?:url|href)=["']([^"']+)["'][^>]*>/i)?.[1]
    ?? markup.match(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/i)?.[1]
    ?? "";
  if (!value) return "";
  try {
    const url = new URL(decodeEntities(value), pageUrl);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function idFor(prefix, value) {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function candidate(source, item) {
  const validUntil = new Date(now);
  validUntil.setUTCDate(validUntil.getUTCDate() + source.ttlDays);
  return {
    id: item.id,
    title: item.title,
    category: source.category,
    sourceType: source.sourceType,
    status: "active",
    generation: "young",
    gcSurvivals: 0,
    lastGcAt: "",
    confidence: "medium",
    freshnessClass: source.ttlDays <= 14 ? "fast" : "medium",
    source: item.source,
    sourceUrl: item.url,
    sourceVersion: item.version,
    observedAt: now.toISOString().slice(0, 10),
    lastSummarizedAt: "",
    validUntil: validUntil.toISOString().slice(0, 10),
    imageUrl: item.imageUrl || "",
    summary: item.summary || "AI 中文摘要正在生成。",
    impact: "本地 Agent 将在采集流程中自动整理工程影响。",
    tags: [source.sourceType, source.category.toLowerCase()],
    action: "阅读 AI 摘要或直达原文。",
  };
}

async function githubReleases(source) {
  const response = await fetch(`https://api.github.com/repos/${source.repo}/releases?per_page=5`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "agent-engineer-workbench",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`${response.status}`);
  const releases = await response.json();
  return releases
    .map((release) => {
      const publishedAt = new Date(release.published_at ?? release.created_at);
      return {
        publishedAt,
        id: `${source.repo.replace("/", "-")}-${release.tag_name}`.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        title: `${source.repo} 发布 ${release.name || release.tag_name}`,
        source: source.repo,
        url: release.html_url,
        version: release.tag_name,
        imageUrl: "",
        summary: decodeXml(String(release.body ?? "")).slice(0, 320),
      };
    })
    .filter((item) => item.publishedAt >= cutoff);
}

async function rssItems(source) {
  const response = await fetch(source.feedUrl, { headers: { "User-Agent": "agent-engineer-workbench/0.1" } });
  if (!response.ok) throw new Error(`${response.status}`);
  const xml = await response.text();
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  return blocks
    .map((block) => {
      const title = tag(block, ["title"]);
      const url = feedLink(block);
      const summary = tag(block, ["description", "summary", "content", "content:encoded"]);
      const publishedAt = new Date(tag(block, ["pubDate", "published", "updated", "dc:date"]));
      return {
        publishedAt,
        id: idFor(source.id, url || title),
        title,
        source: source.name,
        url,
        version: Number.isNaN(publishedAt.getTime()) ? "feed" : `feed@${publishedAt.toISOString().slice(0, 10)}`,
        imageUrl: feedImage(block, url),
        summary: summary.slice(0, 320),
      };
    })
    .filter((item) => item.title && item.url)
    .filter((item) => Number.isNaN(item.publishedAt.getTime()) || item.publishedAt >= cutoff)
    .filter((item) => !source.keywords?.length || source.keywords.some((word) => `${item.title} ${item.summary}`.toLowerCase().includes(word.toLowerCase())))
    .slice(0, 5);
}

for (const source of watchlist) {
  if (!settings.enabledSources.includes(source.sourceType)) continue;
  try {
    const items = source.adapter === "rss" ? await rssItems(source) : await githubReleases(source);
    for (const item of items) {
      if (known.has(item.id)) {
        const existing = existingById.get(item.id);
        if (existing && !["cleanup", "archived"].includes(existing.status)) {
          if (existing.status !== "active") { existing.status = "active"; refreshedExisting += 1; }
          if (!existing.generation) existing.generation = "young";
          if (!Number.isFinite(existing.gcAge)) existing.gcAge = Number(existing.gcSurvivals ?? 0);
          if (!Number.isFinite(existing.accessCount)) existing.accessCount = 0;
          if (typeof existing.lastAccessedAt !== "string") existing.lastAccessedAt = "";
          if (typeof existing.lastGcAt !== "string") existing.lastGcAt = "";
          if (typeof existing.lastSummarizedAt !== "string") existing.lastSummarizedAt = "";
          if (item.imageUrl && existing.imageUrl !== item.imageUrl) { existing.imageUrl = item.imageUrl; refreshedExisting += 1; }
        }
        continue;
      }
      discovered.push(candidate(source, item));
      known.add(item.id);
    }
  } catch (error) {
    console.warn(`Skipping ${source.id}: ${error instanceof Error ? error.message : error}`);
  }
}

if (!dryRun && !queueOnly && (discovered.length || refreshedExisting)) await writeFile(entriesPath, `${JSON.stringify([...discovered, ...entries], null, 2)}\n`);
if (!dryRun) {
  await mkdir(path.join(root, "knowledge/reports"), { recursive: true });
  await writeFile(path.join(root, "knowledge/reports/radar-latest.json"), `${JSON.stringify({ generatedAt: now.toISOString(), discovered }, null, 2)}\n`);
}
console.log(`${dryRun ? "Dry run discovered" : queueOnly ? "Queued" : "Discovered"} ${discovered.length} multi-source signal(s); refreshed ${refreshedExisting} existing field(s).`);
