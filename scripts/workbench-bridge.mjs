#!/usr/bin/env node
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { getSnapshot, runLocalAgent, runRoutine, updateSettings } from "./workbench-core.mjs";

const host = "127.0.0.1";
const port = Number(process.env.WORKBENCH_BRIDGE_PORT || 4317);
const token = process.env.WORKBENCH_BRIDGE_TOKEN || randomBytes(24).toString("base64url");
const productionOrigin = "https://alex-2000-m.github.io";
const siteUrl = process.env.WORKBENCH_SITE_URL || `${productionOrigin}/agent-engineer-workbench/`;

function allowedOrigin(origin = "") {
  return origin === productionOrigin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function authorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const left = Buffer.from(supplied);
  const right = Buffer.from(token);
  return left.length === right.length && timingSafeEqual(left, right);
}

function respond(response, status, body, origin) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(allowedOrigin(origin) ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, PATCH, POST, OPTIONS",
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
  if (!authorized(request)) return respond(response, 401, { error: "Invalid bridge token" }, origin);

  try {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    if (request.method === "GET" && url.pathname === "/health") {
      return respond(response, 200, { ok: true, service: "agent-workbench-bridge", version: 1 }, origin);
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
  const fragment = new URLSearchParams({ bridge: `http://${host}:${port}`, token });
  process.stdout.write(`Agent Workbench local bridge is ready.\n\nBridge: http://${host}:${port}\nToken:  ${token}\nOpen:   ${siteUrl}#${fragment}\n\nKeep this terminal open. The token is temporary and is never written to disk.\n`);
});
