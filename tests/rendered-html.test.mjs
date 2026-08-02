import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders a focused Dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Agent Workbench/);
  assert.match(html, /Dashboard/);
  assert.match(html, /你的知识库还是空的/);
  assert.match(html, /GitHub 基础模式/);
  assert.doesNotMatch(html, /五路信号，分开判断|知识库与导读|让知识自己保持清醒/);
  assert.doesNotMatch(html, /type="password"|Responses API 地址/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/);
});

test("quickstart is a separate Fork-first tutorial", async () => {
  const response = await render("/quickstart");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /框架共用/);
  assert.match(html, /填写你的 Fork 地址/);
  assert.match(html, /先填写你自己的 Fork 仓库地址/);
  assert.doesNotMatch(html, /Alex-2000-m\/agent-engineer-workbench\.git/);
  assert.doesNotMatch(html, /知识库与导读|今天值得你注意的变化/);
});

test("knowledge, sources, and automation have separate pages", async () => {
  const [knowledge, sources, automation] = await Promise.all([
    render("/knowledge").then((response) => response.text()),
    render("/sources").then((response) => response.text()),
    render("/automation").then((response) => response.text()),
  ]);
  assert.match(knowledge, /知识库与导读/);
  assert.doesNotMatch(knowledge, /五路信号，分开判断/);
  assert.match(sources, /五路信号，分开判断/);
  assert.doesNotMatch(sources, /知识库与导读/);
  assert.match(automation, /让知识自己保持清醒/);
  assert.match(automation, /配置来源、时间与过期策略/);
});
