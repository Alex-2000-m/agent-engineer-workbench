import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const entriesPath = path.join(root, "knowledge/entries.json");
const entries = JSON.parse(await readFile(entriesPath, "utf8"));
const settings = JSON.parse(await readFile(path.join(root, "workspace/settings.json"), "utf8"));
const today = new Date(process.env.GC_DATE ? `${process.env.GC_DATE}T00:00:00Z` : Date.now());
const archived = [];

for (const entry of entries) {
  const expiredDays = Math.floor((today - new Date(`${entry.validUntil}T00:00:00Z`)) / 86_400_000);
  if (entry.status === "stale" && expiredDays > settings.archiveAfterDays) {
    entry.status = "archived";
    archived.push({ id: entry.id, expiredDays, reason: `stale-for-more-than-${settings.archiveAfterDays}-days` });
  }
}

await writeFile(entriesPath, `${JSON.stringify(entries, null, 2)}\n`);
await mkdir(path.join(root, "knowledge/reports"), { recursive: true });
await writeFile(path.join(root, "knowledge/reports/gc-latest.json"), `${JSON.stringify({ generatedAt: today.toISOString(), archived }, null, 2)}\n`);
console.log(`Knowledge GC archived ${archived.length} entr${archived.length === 1 ? "y" : "ies"}.`);
