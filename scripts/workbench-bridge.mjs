#!/usr/bin/env node
import { createServer } from "node:http";
import { getDueRoutines, getSnapshot, readSettings, runLocalAgent, runLocalEnhancement, runRoutine, updateSettings } from "./workbench-core.mjs";

const host = "127.0.0.1";
const port = Number(process.env.WORKBENCH_BRIDGE_PORT || 4317);
const productionOrigin = "https://alex-2000-m.github.io";
const siteUrl = process.env.WORKBENCH_SITE_URL || `${productionOrigin}/agent-engineer-workbench/`;
const scheduledRuns = new Set();
const runningRoutines = new Set();
const connectionLeaseMs = Number(process.env.WORKBENCH_CONNECTION_LEASE_MS || 30_000);
let lastSeenAt = Date.now();
let shuttingDown = false;

async function runScheduledRoutine(routine, key) {
  if (scheduledRuns.has(key) || runningRoutines.has(routine)) return;
  scheduledRuns.add(key);
  runningRoutines.add(routine);
  try {
    const result = await runRoutine(routine);
    process.stdout.write(`[scheduler] ${result.stdout || `${routine} completed`}\n`);
  } catch (error) {
    process.stderr.write(`[scheduler] ${error instanceof Error ? error.message : String(error)}\n`);
  } finally {
    runningRoutines.delete(routine);
  }
}

async function tickScheduler() {
  const settings = await readSettings();
  const now = new Date();
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  for (const routine of getDueRoutines(settings, now)) void runScheduledRoutine(routine, `${date}:${routine}`);
  for (const key of scheduledRuns) if (!key.startsWith(date)) scheduledRuns.delete(key);
}

function allowedOrigin(origin = "") {
  return origin === productionOrigin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function respond(response, status, body, origin) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(allowedOrigin(origin) ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, PATCH, POST, OPTIONS",
      "Access-Control-Allow-Private-Network": "true",
      Vary: "Origin",
    } : {}),
  });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  let value = "";
  for await (const chunk of request) {
    value += chunk;
    if (value.length > 64 * 1024) throw new Error("Request body is too large");
  }
  return value ? JSON.parse(value) : {};
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin ?? "";
  if (request.method === "OPTIONS") {
    if (!allowedOrigin(origin)) return respond(response, 403, { error: "Origin not allowed" }, origin);
    return respond(response, 204, {}, origin);
  }
  if (!allowedOrigin(origin)) return respond(response, 403, { error: "Origin not allowed" }, origin);
  lastSeenAt = Date.now();

  try {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    if (request.method === "GET" && url.pathname === "/health") {
      return respond(response, 200, { ok: true, service: "agent-workbench-bridge", version: 1, scheduler: "active" }, origin);
    }
    if (request.method === "GET" && url.pathname === "/snapshot") {
      return respond(response, 200, await getSnapshot(), origin);
    }
    if (request.method === "PATCH" && url.pathname === "/settings") {
      return respond(response, 200, { settings: await updateSettings(await readBody(request)) }, origin);
    }
    if (request.method === "POST" && url.pathname === "/agent") {
      const body = await readBody(request);
      return respond(response, 200, await runLocalAgent(body.message), origin);
    }
    if (request.method === "POST" && url.pathname === "/enhance") {
      const body = await readBody(request);
      return respond(response, 200, await runLocalEnhancement(body.entries), origin);
    }
    if (request.method === "POST" && url.pathname === "/disconnect") {
      respond(response, 200, { ok: true, disconnected: true }, origin);
      setTimeout(() => shutdown("explicit disconnect"), 100);
      return;
    }
    const routine = url.pathname.match(/^\/actions\/(sync|audit|gc)$/)?.[1];
    if (request.method === "POST" && routine) {
      return respond(response, 200, { result: await runRoutine(routine), snapshot: await getSnapshot() }, origin);
    }
    return respond(response, 404, { error: "Not found" }, origin);
  } catch (error) {
    return respond(response, 500, { error: error instanceof Error ? error.message : String(error) }, origin);
  }
});

server.listen(port, host, () => {
  const fragment = new URLSearchParams({ bridge: `http://${host}:${port}` });
  process.stdout.write(`Agent Workbench local bridge is ready.\n\nBridge: http://${host}:${port}\nOpen:   ${siteUrl}#${fragment}\n\nThe connection closes automatically after the website heartbeat stops.\n`);
});

function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`[bridge] shutting down: ${reason}\n`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
}

void tickScheduler();
setInterval(() => void tickScheduler().catch((error) => process.stderr.write(`[scheduler] ${error.message}\n`)), 15_000).unref();
setInterval(() => {
  if (Date.now() - lastSeenAt > connectionLeaseMs) shutdown("website heartbeat expired");
}, 5_000).unref();
