import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const entriesPath = path.join(root, "knowledge/entries.json");
const entries = JSON.parse(await readFile(entriesPath, "utf8"));
const settings = JSON.parse(await readFile(path.join(root, "workspace/settings.json"), "utf8"));
const today = new Date(process.env.AUDIT_DATE ? `${process.env.AUDIT_DATE}T00:00:00Z` : Date.now());
const changes = [];

function generationForAge(age) {
  if (age >= 8) return "old";
  if (age >= 2) return "survivor";
  return "young";
}

for (const entry of entries) {
  if (["archived", "cleanup"].includes(entry.status)) continue;
  const previousAge = Number(entry.gcAge ?? entry.gcSurvivals ?? 0);
  const lastAccess = entry.lastAccessedAt ? new Date(entry.lastAccessedAt) : null;
  const lastGc = entry.lastGcAt ? new Date(entry.lastGcAt) : null;
  const usedSinceLastGc = lastAccess && !Number.isNaN(lastAccess.getTime()) && (!lastGc || lastAccess > lastGc);
  const nextAge = Math.min(15, previousAge + 1 + (usedSinceLastGc ? 1 : 0));
  const expiredDays = Math.floor((today - new Date(`${entry.validUntil}T00:00:00Z`)) / 86_400_000);
  const retentionDays = nextAge >= 8 ? settings.archiveAfterDays : nextAge >= 2 ? settings.reviewWindowDays : 0;
  entry.status = expiredDays > retentionDays ? "cleanup" : "active";
  entry.gcAge = nextAge;
  entry.gcSurvivals = Number(entry.gcSurvivals ?? 0) + 1;
  entry.generation = generationForAge(nextAge);
  entry.lastGcAt = today.toISOString();
  if (entry.status === "cleanup") {
    entry.cleanupReason = `内容已超过保留窗口 ${expiredDays} 天，且近期使用不足。`;
    entry.cleanupProposedAt = today.toISOString();
  }
  changes.push({ id: entry.id, action: entry.status === "cleanup" ? "propose-cleanup" : "retain", age: nextAge });
}

await writeFile(entriesPath, `${JSON.stringify(entries, null, 2)}\n`);
await mkdir(path.join(root, "knowledge/reports"), { recursive: true });
await writeFile(path.join(root, "knowledge/reports/gc-minor-latest.json"), `${JSON.stringify({ generatedAt: today.toISOString(), changes }, null, 2)}\n`);
console.log(`Minor knowledge GC processed ${changes.length} entr${changes.length === 1 ? "y" : "ies"}.`);
