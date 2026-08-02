"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const upstreamRepository = "https://github.com/Alex-2000-m/agent-engineer-workbench";

function normalizeForkUrl(value: string) {
  const match = value.trim().match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  return match ? `https://github.com/${match[1]}/${match[2]}.git` : "";
}

export function Quickstart() {
  const builtRepository = process.env.NEXT_PUBLIC_REPOSITORY_URL ?? upstreamRepository;
  const isUpstream = builtRepository.replace(/\.git$/, "") === upstreamRepository;
  const [forkUrl, setForkUrl] = useState(isUpstream ? "" : builtRepository);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const normalizedInput = normalizeForkUrl(forkUrl);
  const pointsToUpstream = normalizedInput.replace(/\.git$/, "") === upstreamRepository;
  const normalizedFork = pointsToUpstream ? "" : normalizedInput;
  const installCommand = useMemo(() => normalizedFork
    ? `sh -c 'R="${normalizedFork}"; D="$HOME/.agent-engineer-workbench"; if [ -d "$D/.git" ]; then O="$(git -C "$D" remote get-url origin)"; [ "$O" = "$R" ] || { echo "安装目录已连接其他仓库：$O"; exit 1; }; git -C "$D" pull --ff-only; else git clone "$R" "$D"; fi; npm --prefix "$D" install && node "$D/scripts/workbench-install.mjs"'`
    : "先填写你自己的 Fork 仓库地址，安装命令会在这里生成。", [normalizedFork]);

  const copyCommand = async () => {
    if (!normalizedFork) return;
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopyError("");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopyError("浏览器无法访问剪贴板，请手动选择命令复制。");
    }
  };

  return (
    <main className="quickstart-page">
      <header className="site-header">
        <Link className="brand" href="/"><span className="brand-mark">AW</span><span>Agent Workbench</span></Link>
        <nav aria-label="教程导航"><Link href="/">返回 Dashboard</Link></nav>
      </header>

      <section className="hero quickstart-hero">
        <div className="hero-copy">
          <p className="eyebrow">QUICK START · YOUR FORK</p>
          <h1>框架共用，<br /><em>知识归你。</em></h1>
          <p className="hero-lede">先把框架 Fork 到自己的 GitHub。知识、导读、设置和审计记录只提交到你的 Fork；本机 CLI 只是计算与同步通道，网页不接收 API Key。</p>
          <div className="quickstart-status"><span className={normalizedFork ? "ready" : "waiting"} /><div><strong>{normalizedFork ? "个人 Fork 已识别" : "等待你的 Fork 地址"}</strong><small>{normalizedFork ? normalizedFork : "不会保存你输入的仓库地址"}</small></div></div>
          <div className="hero-actions">
            <a className="primary-button" href={`${upstreamRepository}/fork`} target="_blank" rel="noreferrer">Fork 框架 <span>↗</span></a>
            <Link className="text-button" href="/">查看 Dashboard <span>→</span></Link>
          </div>
        </div>

        <div className="quickstart-console" aria-label="个人 Fork 快速开始">
          <div className="console-topline"><span>YOUR GITHUB WORKSPACE</span><span className={normalizedFork ? "connected" : "idle"}>{normalizedFork ? "READY" : "3 STEPS"}</span></div>
          <div className="setup-step fork-step">
            <span>01</span><div><strong>Fork 并启用 Pages</strong><p>在自己的 Fork 中启用 Actions 与 GitHub Pages；之后知识只进入这个仓库。</p></div>
          </div>
          <div className="setup-step fork-step">
            <span>02</span><div><strong>填写你的 Fork 地址</strong><p>这里只生成命令，不会保存地址。</p><input value={forkUrl} onChange={(event) => setForkUrl(event.target.value)} placeholder="https://github.com/你的账号/agent-engineer-workbench" aria-label="你的 Fork 仓库地址" />{forkUrl && !normalizedFork && <small className="input-error">{pointsToUpstream ? "请填写你自己的 Fork，不能直接安装上游仓库。" : "请输入完整的 GitHub HTTPS 仓库地址。"}</small>}</div>
          </div>
          <div className="setup-step fork-step command-step">
            <span>03</span><div><strong>安装 MCP 并打开你的站点</strong><p>命令只克隆或更新你的 Fork，安装器会从 origin 自动推导你的 Pages 地址。</p><code>{installCommand}</code></div>
            <button type="button" onClick={() => void copyCommand()} disabled={!normalizedFork}>{copied ? "已复制" : "复制"}</button>
          </div>
          {copyError && <p className="console-error" role="alert">{copyError}</p>}
          <div className="setup-flow" aria-hidden="true"><span>YOUR FORK</span><i>→</i><span>YOUR PAGES</span><i>→</i><span>LOCAL CLI</span><b /></div>
        </div>
      </section>

      <section className="tutorial-notes">
        <article><span>01</span><h2>数据在哪里？</h2><p><code>knowledge/</code>、<code>watchlist/</code> 与 <code>workspace/</code> 都在你的 GitHub Fork。浏览器不另建云端账户，本机也不是事实源。</p></article>
        <article><span>02</span><h2>如何更新框架？</h2><p>在 GitHub 使用 Sync fork 合并上游框架更新，再重新执行安装命令；命令只从你的 origin 拉取。</p></article>
        <article><span>03</span><h2>AI 如何写回？</h2><p>本地 Codex 通过 MCP 修改工作副本；检查差异后提交并推送到你的 Fork，Pages 随后展示新知识。</p></article>
      </section>
    </main>
  );
}
