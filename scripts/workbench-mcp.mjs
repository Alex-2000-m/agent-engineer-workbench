#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getSnapshot, proposeKnowledge, runRoutine, updateSettings } from "./workbench-core.mjs";

const server = new McpServer(
  { name: "agent-engineer-workbench", version: "0.2.0" },
  { instructions: "This MCP edits the current user's GitHub Fork worktree. Read get_workbench_snapshot before changing it. New knowledge must enter as candidate. Never mark knowledge verified automatically. Use only the named maintenance routines; no arbitrary shell execution is available. Show the Git diff and let the user review before commit or push." },
);

const jsonResult = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  structuredContent: value,
});

server.registerTool("get_workbench_snapshot", {
  title: "Get workbench snapshot",
  description: "Read knowledge entries, guides, watched sources, and settings from the current user's Fork worktree.",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async () => jsonResult(await getSnapshot()));

server.registerTool("update_workspace_settings", {
  title: "Update workspace settings",
  description: "Change enabled source categories, schedules, and expiration policy. Omitted fields remain unchanged.",
  inputSchema: {
    enabledSources: z.array(z.enum(["github", "blog", "report", "news", "web"])).optional(),
    radarTime: z.string().optional(),
    auditDay: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]).optional(),
    auditTime: z.string().optional(),
    gcDay: z.number().int().optional(),
    gcTime: z.string().optional(),
    reviewWindowDays: z.number().int().optional(),
    archiveAfterDays: z.number().int().optional(),
    defaultTtlDays: z.number().int().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async (patch) => jsonResult(await updateSettings(patch)));

server.registerTool("run_knowledge_routine", {
  title: "Run knowledge maintenance",
  description: "Run one allow-listed routine: multi-source sync, freshness audit, or stale knowledge garbage collection.",
  inputSchema: { routine: z.enum(["sync", "audit", "gc"]) },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
}, async ({ routine }) => jsonResult(await runRoutine(routine)));

server.registerTool("propose_knowledge_entry", {
  title: "Propose knowledge entry",
  description: "Add a sourced item as an unverified candidate. This tool cannot create verified knowledge.",
  inputSchema: {
    title: z.string().min(1),
    sourceType: z.enum(["github", "blog", "report", "news", "web"]),
    source: z.string().min(1),
    sourceUrl: z.string().url(),
    summary: z.string().min(1),
    category: z.string().optional(),
    sourceVersion: z.string().optional(),
    freshnessClass: z.enum(["fast", "medium", "slow"]).optional(),
    impact: z.string().optional(),
    action: z.string().optional(),
    tags: z.array(z.string()).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, async (entry) => jsonResult(await proposeKnowledge(entry)));

const transport = new StdioServerTransport();
await server.connect(transport);
