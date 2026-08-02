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
const discovered = [];

for (const source of watchlist) {
  const response = await fetch(`https://api.github.com/repos/${source.repo}/releases?per_page=5`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "agent-engineer-workbench",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    console.warn(`Skipping ${source.repo}: ${response.status}`);
    continue;
  }
  const releases = await response.json();
  for (const release of releases) {
    const publishedAt = new Date(release.published_at ?? release.created_at);
    if (publishedAt < cutoff) continue;
    const id = `${source.repo.replace("/", "-")}-${release.tag_name}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (known.has(id)) continue;
    const validUntil = new Date(now);
    validUntil.setUTCDate(validUntil.getUTCDate() + source.ttlDays);
    const summary = String(release.body ?? "No release notes supplied.").replace(/[#*_`>\r\n]+/g, " ").trim().slice(0, 240);
    discovered.push({
      id,
      title: `${source.repo} 发布 ${release.name || release.tag_name}`,
      category: source.category,
      status: "candidate",
      confidence: "medium",
      freshnessClass: "fast",
      source: source.repo,
      sourceUrl: release.html_url,
      sourceVersion: release.tag_name,
      observedAt: now.toISOString().slice(0, 10),
      lastVerifiedAt: "",
      validUntil: validUntil.toISOString().slice(0, 10),
      summary: summary || "检测到新的 GitHub Release，等待工程验证。",
      impact: "候选变化尚未复现，不会进入已验证知识检索。",
      tags: ["release", source.category.toLowerCase(), "candidate"],
      action: "阅读变更记录并运行最小复现实验",
    });
    known.add(id);
  }
}

if (discovered.length) {
  await writeFile(entriesPath, `${JSON.stringify([...discovered, ...entries], null, 2)}\n`);
}
await mkdir(path.join(root, "knowledge/reports"), { recursive: true });
await writeFile(path.join(root, "knowledge/reports/radar-latest.json"), `${JSON.stringify({ generatedAt: now.toISOString(), discovered }, null, 2)}\n`);
console.log(`Discovered ${discovered.length} release signal(s).`);
