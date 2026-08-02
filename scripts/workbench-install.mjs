#!/usr/bin/env node
import { randomInt } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { githubPagesUrl, parseGitHubRemote } from "./workbench-repository.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = path.join(os.homedir(), ".agent-workbench-runtime");
const logPath = path.join(runtimeDir, "bridge.log");

function run(command, args, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || allowFailure) resolve(code);
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `${command} exited with ${code}`)));
  });
}

const originRemote = await capture("git", ["remote", "get-url", "origin"]);
const repository = parseGitHubRemote(originRemote);
const defaultSiteUrl = githubPagesUrl(repository);
const siteUrl = process.env.WORKBENCH_SITE_URL || defaultSiteUrl;

async function isHealthy(connection) {
  if (!connection?.bridge) return false;
  try {
    const response = await fetch(`${connection.bridge}/health`, {
      headers: { Origin: new URL(siteUrl).origin },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function startBridge() {
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const port = randomInt(4317, 5317);
    const log = openSync(logPath, "a", 0o600);
    const child = spawn(process.execPath, [path.join(root, "scripts", "workbench-bridge.mjs")], {
      cwd: root,
      detached: true,
      env: { ...process.env, WORKBENCH_BRIDGE_PORT: String(port), WORKBENCH_SITE_URL: siteUrl },
      stdio: ["ignore", log, log],
    });
    child.unref();
    closeSync(log);
    const connection = { bridge: `http://127.0.0.1:${port}` };
    for (let check = 0; check < 20; check += 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (await isHealthy(connection)) {
        return connection;
      }
    }
  }
  throw new Error(`本地能力启动失败，请查看 ${logPath}`);
}

function openWebsite(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

process.stdout.write("\n[1/3] 正在注册 Agent Workbench MCP…\n");
await run("codex", ["mcp", "remove", "agent-workbench"], { allowFailure: true });
await run("codex", ["mcp", "add", "agent-workbench", "--", process.execPath, path.join(root, "scripts", "workbench-mcp.mjs")]);

process.stdout.write("\n[2/3] 正在启动本地 AI 能力…\n");
const connection = await startBridge();

const fragment = new URLSearchParams({ bridge: connection.bridge });
const connectedUrl = `${siteUrl}#${fragment}`;
process.stdout.write("\n[3/3] 安装完成，正在打开工作台…\n");
process.stdout.write(`${connectedUrl}\n`);
openWebsite(connectedUrl);
