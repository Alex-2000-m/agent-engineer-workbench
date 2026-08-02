import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("MCP lets a local CLI customize sources and knowledge in an isolated Fork worktree", async () => {
  const worktree = await mkdtemp(path.join(os.tmpdir(), "agent-workbench-mcp-"));
  await Promise.all([
    mkdir(path.join(worktree, "knowledge"), { recursive: true }),
    mkdir(path.join(worktree, "watchlist"), { recursive: true }),
    mkdir(path.join(worktree, "workspace"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(worktree, "knowledge", "entries.json"), "[]\n"),
    writeFile(path.join(worktree, "knowledge", "guides.json"), "{}\n"),
    writeFile(path.join(worktree, "watchlist", "sources.json"), "[]\n"),
    writeFile(path.join(worktree, "workspace", "settings.json"), await readFile(path.join(repositoryRoot, "workspace", "settings.json"))),
  ]);

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repositoryRoot, "scripts", "workbench-mcp.mjs")],
    cwd: repositoryRoot,
    env: { AGENT_WORKBENCH_REPOSITORY_ROOT: worktree },
    stderr: "pipe",
  });
  const client = new Client({ name: "agent-workbench-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "get_workbench_snapshot", "propose_knowledge_entry", "record_knowledge_access", "remove_watch_source", "rename_watch_category",
      "resolve_cleanup_candidate", "run_knowledge_routine", "search_knowledge", "update_knowledge_entry", "update_workspace_settings", "upsert_watch_source",
    ]);
    const resources = await client.listResources();
    assert.deepEqual(resources.resources.map((resource) => resource.uri).sort(), [
      "workbench://index", "workbench://knowledge", "workbench://settings", "workbench://snapshot", "workbench://sources",
    ]);
    const sourceResource = await client.readResource({ uri: "workbench://sources" });
    assert.deepEqual(JSON.parse(sourceResource.contents[0].text), []);
    const prompts = await client.listPrompts();
    assert.ok(prompts.prompts.some((prompt) => prompt.name === "manage-workbench"));
    const prompt = await client.getPrompt({ name: "manage-workbench", arguments: { request: "Add a source" } });
    assert.match(prompt.messages[0].content.text, /workbench:\/\/snapshot/);

    await client.callTool({ name: "upsert_watch_source", arguments: {
      id: "anthropic-sdk", adapter: "github-releases", sourceType: "github", category: "SDK", ttlDays: 14,
      repo: "anthropics/anthropic-sdk-python",
    } });
    await client.callTool({ name: "rename_watch_category", arguments: { from: "SDK", to: "Agent SDK" } });
    const proposed = await client.callTool({ name: "propose_knowledge_entry", arguments: {
      title: "Agent evaluation note", sourceType: "report", source: "Example Lab",
      sourceUrl: "https://example.com/report", summary: "A sourced item for evaluation workflows.",
    } });
    const entryId = proposed.structuredContent.id;
    await client.callTool({ name: "update_knowledge_entry", arguments: {
      id: entryId, impact: "Use this knowledge when designing multi-Agent evaluation routes.", tags: ["eval", "multi-agent"],
    } });

    const snapshotResult = await client.callTool({ name: "get_workbench_snapshot", arguments: {} });
    assert.equal(snapshotResult.structuredContent.sources[0].repo, "anthropics/anthropic-sdk-python");
    assert.equal(snapshotResult.structuredContent.sources[0].category, "Agent SDK");
    assert.equal(snapshotResult.structuredContent.entries[0].id, entryId);
    assert.equal(snapshotResult.structuredContent.entries[0].status, "active");
    assert.deepEqual(snapshotResult.structuredContent.entries[0].tags, ["eval", "multi-agent"]);
    const retrieved = await client.callTool({ name: "search_knowledge", arguments: { query: "multi-Agent evaluation", topK: 3 } });
    assert.equal(retrieved.structuredContent.results[0].id, entryId);
    await client.callTool({ name: "record_knowledge_access", arguments: { id: entryId } });

    await client.callTool({ name: "remove_watch_source", arguments: { id: "anthropic-sdk" } });
    const finalSources = JSON.parse(await readFile(path.join(worktree, "watchlist", "sources.json"), "utf8"));
    assert.deepEqual(finalSources, []);
  } finally {
    await client.close().catch(() => {});
    await rm(worktree, { recursive: true, force: true });
  }
});
