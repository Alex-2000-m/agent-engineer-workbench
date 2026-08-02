import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const watchlist = JSON.parse(await readFile(path.join(root, "watchlist/sources.json"), "utf8"));
const entriesPath = path.join(root, "knowledge/entries.json");
const entries = JSON.parse(await readFile(entriesPath, "utf8"));
const known = new Set(entries.map((entry) => entry.id));
const now = new Date();
const lookbackHours = Number(process.env.LOOKBACK_HOURS ?? 36);
const cutoff = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
const token = process.env.GITHUB_TOKEN;
const dryRun = process.env.DRY_RUN === "1";
const discovered = [];

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
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
    status: "candidate",
    confidence: "medium",
    freshnessClass: source.ttlDays <= 14 ? "fast" : "medium",
    source: item.source,
    sourceUrl: item.url,
    sourceVersion: item.version,
    observedAt: now.toISOString().slice(0, 10),
    lastVerifiedAt: "",
    validUntil: validUntil.toISOString().slice(0, 10),
    summary: item.summary || "检测到新的来源变化，等待工程验证。",
    impact: "候选变化尚未复现，不会自动升级为已验证知识。",
    tags: [source.sourceType, source.category.toLowerCase(), "candidate"],
    action: "核对原始来源并运行最小复现实验",
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
        summary: summary.slice(0, 320),
      };
    })
    .filter((item) => item.title && item.url)
    .filter((item) => Number.isNaN(item.publishedAt.getTime()) || item.publishedAt >= cutoff)
    .filter((item) => !source.keywords?.length || source.keywords.some((word) => `${item.title} ${item.summary}`.toLowerCase().includes(word.toLowerCase())))
    .slice(0, 5);
}

for (const source of watchlist) {
  try {
    const items = source.adapter === "rss" ? await rssItems(source) : await githubReleases(source);
    for (const item of items) {
      if (known.has(item.id)) continue;
      discovered.push(candidate(source, item));
      known.add(item.id);
    }
  } catch (error) {
    console.warn(`Skipping ${source.id}: ${error instanceof Error ? error.message : error}`);
  }
}

if (!dryRun && discovered.length) await writeFile(entriesPath, `${JSON.stringify([...discovered, ...entries], null, 2)}\n`);
if (!dryRun) {
  await mkdir(path.join(root, "knowledge/reports"), { recursive: true });
  await writeFile(path.join(root, "knowledge/reports/radar-latest.json"), `${JSON.stringify({ generatedAt: now.toISOString(), discovered }, null, 2)}\n`);
}
console.log(`${dryRun ? "Dry run discovered" : "Discovered"} ${discovered.length} multi-source signal(s).`);
