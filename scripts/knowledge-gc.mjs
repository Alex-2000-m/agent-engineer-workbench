import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const entriesPath = path.join(root, "knowledge/entries.json");
const entries = JSON.parse(await readFile(entriesPath, "utf8"));
const settings = JSON.parse(await readFile(path.join(root, "workspace/settings.json"), "utf8"));
const today = new Date(process.env.GC_DATE ? `${process.env.GC_DATE}T00:00:00Z` : Date.now());
const proposed = [];
const seenUrls = new Map();

function generationForAge(age) {
  if (age >= 8) return "old";
  if (age >= 2) return "survivor";
  return "young";
}

function proposeCleanup(entry, reason) {
  entry.status = "cleanup";
  entry.cleanupReason = reason;
  entry.cleanupProposedAt = today.toISOString();
  proposed.push({ id: entry.id, reason });
}

for (const entry of entries) {
  if (["archived", "cleanup"].includes(entry.status)) continue;
  const canonicalUrl = String(entry.sourceUrl ?? "").replace(/[?#].*$/, "").replace(/\/$/, "");
  if (canonicalUrl && seenUrls.has(canonicalUrl)) {
    proposeCleanup(entry, `与知识 ${seenUrls.get(canonicalUrl)} 指向同一原文。`);
    continue;
  }
  if (canonicalUrl) seenUrls.set(canonicalUrl, entry.id);

  const previousAge = Number(entry.gcAge ?? entry.gcSurvivals ?? 0);
  const lastAccess = entry.lastAccessedAt ? new Date(entry.lastAccessedAt) : null;
  const lastGc = entry.lastGcAt ? new Date(entry.lastGcAt) : null;
  const usedSinceLastGc = lastAccess && !Number.isNaN(lastAccess.getTime()) && (!lastGc || lastAccess > lastGc);
  const nextAge = Math.min(15, previousAge + 1 + (usedSinceLastGc ? 2 : 0));
  const expiredDays = Math.floor((today - new Date(`${entry.validUntil}T00:00:00Z`)) / 86_400_000);
  const retentionDays = nextAge >= 8 ? settings.archiveAfterDays : nextAge >= 2 ? settings.reviewWindowDays : 0;

  entry.status = "active";
  entry.gcAge = nextAge;
  entry.gcSurvivals = Number(entry.gcSurvivals ?? 0) + 1;
  entry.generation = generationForAge(nextAge);
  entry.lastGcAt = today.toISOString();
  if (expiredDays > retentionDays) {
    proposeCleanup(entry, `内容已超过保留窗口 ${expiredDays} 天；进入待清理区，由你决定保留或归档。`);
  }
}

await writeFile(entriesPath, `${JSON.stringify(entries, null, 2)}\n`);
await mkdir(path.join(root, "knowledge/reports"), { recursive: true });
await writeFile(path.join(root, "knowledge/reports/gc-latest.json"), `${JSON.stringify({ generatedAt: today.toISOString(), proposed }, null, 2)}\n`);
console.log(`Knowledge GC proposed ${proposed.length} cleanup candidate${proposed.length === 1 ? "" : "s"}; nothing was deleted.`);
