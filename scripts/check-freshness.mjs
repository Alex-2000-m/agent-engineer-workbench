import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const entriesPath = path.join(root, "knowledge/entries.json");
const entries = JSON.parse(await readFile(entriesPath, "utf8"));
const today = new Date(process.env.AUDIT_DATE ? `${process.env.AUDIT_DATE}T00:00:00Z` : Date.now());
const changes = [];

for (const entry of entries) {
  if (["archived", "quarantined", "candidate"].includes(entry.status)) continue;
  const daysRemaining = Math.ceil((new Date(`${entry.validUntil}T00:00:00Z`) - today) / 86_400_000);
  const nextStatus = daysRemaining < 0 ? "stale" : daysRemaining <= 7 ? "review" : "verified";
  if (entry.status !== nextStatus) {
    changes.push({ id: entry.id, from: entry.status, to: nextStatus, daysRemaining });
    entry.status = nextStatus;
  }
}

await writeFile(entriesPath, `${JSON.stringify(entries, null, 2)}\n`);
await mkdir(path.join(root, "knowledge/reports"), { recursive: true });
await writeFile(path.join(root, "knowledge/reports/freshness-latest.json"), `${JSON.stringify({ auditedAt: today.toISOString(), changes }, null, 2)}\n`);
console.log(`Freshness audit completed with ${changes.length} status change(s).`);
