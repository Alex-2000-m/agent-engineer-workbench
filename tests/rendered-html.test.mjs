import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Agent Workbench", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Agent Workbench/);
  assert.match(html, /3 分钟连接/);
  assert.match(html, /复制一键安装命令/);
  assert.match(html, /CLI 自动完成配置/);
  assert.match(html, /五路信号，分开判断/);
  assert.match(html, /知识库与导读/);
  assert.match(html, /让知识自己保持清醒/);
  assert.match(html, /GitHub 基础模式/);
  assert.match(html, /来源摘录 · 未经 AI 提炼/);
  assert.doesNotMatch(html, /内置导读/);
  assert.doesNotMatch(html, /type="password"|Responses API 地址/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/);
});
