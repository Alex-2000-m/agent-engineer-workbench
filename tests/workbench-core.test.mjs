import assert from "node:assert/strict";
import test from "node:test";
import { defaultSettings, getDueRoutines, getSnapshot, normalizeSettings, runLocalEnhancement } from "../scripts/workbench-core.mjs";
import { githubPagesUrl, parseGitHubRemote } from "../scripts/workbench-repository.mjs";

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

test("fork knowledge snapshot contains repository data and settings", async () => {
  const snapshot = await getSnapshot();
  assert.equal(snapshot.version, 1);
  assert.ok(Array.isArray(snapshot.entries));
  assert.ok(snapshot.sources.length > 0);
  assert.ok(snapshot.settings.enabledSources.length > 0);
});

test("local scheduler honors personal daily, weekly, and monthly times", () => {
  const settings = { ...defaultSettings, radarTime: "09:00", auditDay: "sun", auditTime: "09:00", gcDay: 2, gcTime: "09:00" };
  const due = getDueRoutines(settings, new Date(2026, 7, 2, 9, 0));
  assert.deepEqual(due, ["sync", "audit", "gc"]);
  assert.deepEqual(getDueRoutines(settings, new Date(2026, 7, 2, 9, 1)), []);
});

test("local enhancement accepts only IDs from the current Fork", async () => {
  await assert.rejects(runLocalEnhancement([]), /between 1 and 20/);
  await assert.rejects(runLocalEnhancement(["missing-entry"]), /were not found/);
});

test("installer derives Pages from the user's own Fork remote", () => {
  assert.deepEqual(parseGitHubRemote("https://github.com/alice/my-workbench.git"), { owner: "alice", name: "my-workbench" });
  assert.deepEqual(parseGitHubRemote("git@github.com:bob/agent-engineer-workbench.git"), { owner: "bob", name: "agent-engineer-workbench" });
  assert.equal(githubPagesUrl({ owner: "alice", name: "my-workbench" }), "https://alice.github.io/my-workbench/");
  assert.throws(() => parseGitHubRemote("https://example.com/alice/repo.git"), /GitHub Fork/);
});
