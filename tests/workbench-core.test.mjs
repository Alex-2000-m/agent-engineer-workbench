import assert from "node:assert/strict";
import test from "node:test";
import { defaultSettings, getSnapshot, normalizeSettings } from "../scripts/workbench-core.mjs";

test("normalizes local Agent patches without letting null values erase policy", () => {
  const normalized = normalizeSettings({
    enabledSources: ["github", "report", "invalid"],
    radarTime: "09:00",
    reviewWindowDays: null,
    archiveAfterDays: 999,
  });
  assert.deepEqual(normalized.enabledSources, ["github", "report"]);
  assert.equal(normalized.radarTime, "09:00");
  assert.equal(normalized.reviewWindowDays, defaultSettings.reviewWindowDays);
  assert.equal(normalized.archiveAfterDays, 365);
});

test("shared knowledge snapshot contains entries, sources, and settings", async () => {
  const snapshot = await getSnapshot();
  assert.equal(snapshot.version, 1);
  assert.ok(snapshot.entries.length > 0);
  assert.ok(snapshot.sources.length > 0);
  assert.ok(snapshot.settings.enabledSources.length > 0);
});
