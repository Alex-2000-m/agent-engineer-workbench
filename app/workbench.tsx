"use client";

import { useMemo, useState } from "react";

type KnowledgeStatus = "verified" | "candidate" | "review" | "stale" | "archived" | "quarantined";

export type KnowledgeEntry = {
  id: string;
  title: string;
  category: string;
  status: KnowledgeStatus;
  confidence: "high" | "medium" | "low";
  freshnessClass: "fast" | "medium" | "slow";
  source: string;
  sourceUrl: string;
  sourceVersion: string;
  observedAt: string;
  lastVerifiedAt: string;
  validUntil: string;
  summary: string;
  impact: string;
  tags: string[];
  action: string;
};

const statusLabel: Record<KnowledgeStatus, string> = {
  verified: "已验证",
  candidate: "待验证",
  review: "需复核",
  stale: "已过期",
  archived: "已归档",
  quarantined: "已隔离",
};

const categoryMark: Record<string, string> = {
  MCP: "MC",
  Plugin: "PL",
  Skill: "SK",
  SDK: "SD",
  Tool: "TL",
  Research: "RS",
  Security: "SE",
};

export function Workbench({ entries }: { entries: KnowledgeEntry[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | KnowledgeStatus>("all");
  const repositoryUrl = process.env.NEXT_PUBLIC_REPOSITORY_URL ?? "https://github.com";

  const activeEntries = entries.filter((entry) => entry.status !== "archived");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return activeEntries.filter((entry) => {
      const matchesFilter = filter === "all" || entry.status === filter;
      const haystack = [entry.title, entry.summary, entry.category, ...entry.tags]
        .join(" ")
        .toLowerCase();
      return matchesFilter && (!needle || haystack.includes(needle));
    });
  }, [activeEntries, filter, query]);

  const verified = activeEntries.filter((entry) => entry.status === "verified").length;
  const review = activeEntries.filter((entry) => entry.status === "review").length;
  const stale = activeEntries.filter((entry) => entry.status === "stale").length;
  const health = Math.round((verified / Math.max(activeEntries.length, 1)) * 100);
  const radar = activeEntries.slice(0, 3);

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Agent Workbench 首页">
          <span className="brand-mark">AW</span>
          <span>Agent Workbench</span>
        </a>
        <nav aria-label="主导航">
          <a href="#radar">今日雷达</a>
          <a href="#knowledge">知识库</a>
          <a href="#workflow">工作流</a>
        </nav>
        <div className="sync-pill"><span />下次同步 08:37</div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">AGENT ENGINEERING INTELLIGENCE</p>
          <h1>不追热点，追踪<br /><em>可验证的变化。</em></h1>
          <p className="hero-lede">
            把最新论文、仓库与工具变化，沉淀成有来源、有期限、能复现的工程知识。
            陈旧内容会自动退出默认检索。
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#radar">查看今日变化 <span>↘</span></a>
            <a className="text-link" href="#freshness">知识健康度 <span>→</span></a>
          </div>
        </div>

        <div className="signal-board" aria-label="知识雷达摘要">
          <div className="board-topline">
            <span>LIVE KNOWLEDGE GRAPH</span>
            <span className="live-dot">LIVE</span>
          </div>
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="signal-core">
            <strong>{health}%</strong>
            <span>知识健康度</span>
          </div>
          <span className="node node-a">MCP</span>
          <span className="node node-b">SDK</span>
          <span className="node node-c">EVAL</span>
          <span className="node node-d">PAPER</span>
          <div className="board-caption">
            <span>{activeEntries.length} 条活跃知识</span>
            <span>{review + stale} 条等待处理</span>
          </div>
        </div>
      </section>

      <section className="metrics" aria-label="知识指标">
        <article><span>01</span><strong>{verified}</strong><p>已验证知识</p></article>
        <article><span>02</span><strong>{review}</strong><p>即将到期</p></article>
        <article><span>03</span><strong>{stale}</strong><p>退出检索</p></article>
        <article><span>04</span><strong>3</strong><p>复现实验</p></article>
      </section>

      <section className="section" id="radar">
        <div className="section-heading">
          <div><p className="eyebrow">DAILY SIGNALS · 过去 24 小时</p><h2>今天值得你注意的变化</h2></div>
          <a href="#knowledge">查看全部知识 <span>↗</span></a>
        </div>
        <div className="radar-grid">
          {radar.map((entry, index) => (
            <article className={`radar-card card-${index + 1}`} key={entry.id}>
              <div className="card-meta">
                <span className="category-mark">{categoryMark[entry.category] ?? "KN"}</span>
                <span>{entry.source}</span>
                <span className={`status status-${entry.status}`}>{statusLabel[entry.status]}</span>
              </div>
              <h3>{entry.title}</h3>
              <p>{entry.summary}</p>
              <div className="tag-row">{entry.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
              <div className="card-footer">
                <span>有效至 {entry.validUntil}</span>
                <a href={entry.sourceUrl} target="_blank" rel="noreferrer" aria-label={`打开 ${entry.title} 的来源`}>原始来源 ↗</a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="freshness-section" id="freshness">
        <div className="freshness-copy">
          <p className="eyebrow">KNOWLEDGE FRESHNESS</p>
          <h2>每条知识，都有保质期。</h2>
          <p>系统依据上游版本、最后验证时间和知识类型计算新鲜度。过期不等于删除：它会退出默认检索，等待重新验证或进入归档。</p>
          <div className="lifecycle" aria-label="知识生命周期">
            <span>发现</span><i>→</i><span>验证</span><i>→</i><span>采用</span><i>→</i><span>复核</span><i>→</i><span>归档</span>
          </div>
        </div>
        <div className="expiry-panel">
          <div className="expiry-header"><span>即将到期</span><strong>{review + stale}</strong></div>
          {activeEntries.filter((entry) => ["review", "stale"].includes(entry.status)).map((entry) => (
            <div className="expiry-item" key={entry.id}>
              <div><strong>{entry.title}</strong><span>{entry.sourceVersion} · {entry.freshnessClass}</span></div>
              <span className={`status status-${entry.status}`}>{statusLabel[entry.status]}</span>
            </div>
          ))}
          <a className="audit-link" href={`${repositoryUrl}/actions/workflows/freshness-audit.yml`} target="_blank" rel="noreferrer">查看审计工作流 <span>↗</span></a>
        </div>
      </section>

      <section className="section library" id="knowledge">
        <div className="section-heading library-heading">
          <div><p className="eyebrow">VERIFIED LIBRARY</p><h2>知识库</h2></div>
          <label className="search-box">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索工具、论文、框架…" aria-label="搜索知识库" />
          </label>
        </div>
        <div className="filter-row" role="group" aria-label="知识状态筛选">
          {(["all", "verified", "candidate", "review", "stale"] as const).map((value) => (
            <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
              {value === "all" ? "全部" : statusLabel[value]}
            </button>
          ))}
          <span>{filtered.length} 个结果</span>
        </div>
        <div className="knowledge-list">
          {filtered.map((entry) => (
            <article className="knowledge-row" key={entry.id}>
              <span className="knowledge-icon">{categoryMark[entry.category] ?? "KN"}</span>
              <div className="knowledge-main">
                <div><h3>{entry.title}</h3><span className={`status status-${entry.status}`}>{statusLabel[entry.status]}</span></div>
                <p>{entry.impact}</p>
              </div>
              <div className="knowledge-source"><span>来源 / 版本</span><strong>{entry.source}</strong><small>{entry.sourceVersion}</small></div>
              <div className="knowledge-date"><span>最后验证</span><strong>{entry.lastVerifiedAt}</strong><small>置信度 {entry.confidence}</small></div>
              <a href={entry.sourceUrl} target="_blank" rel="noreferrer" aria-label={`查看 ${entry.title}`}>↗</a>
            </article>
          ))}
          {filtered.length === 0 && <div className="empty-state">没有符合条件的知识条目。</div>}
        </div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="section-heading">
          <div><p className="eyebrow">AUTOMATED ROUTINES</p><h2>让知识自己保持清醒</h2></div>
        </div>
        <div className="workflow-grid">
          <article><span>DAILY · 08:37</span><h3>Agent Radar</h3><p>发现 Release、论文与工具变化，去重后生成候选知识 PR。</p><code>$agent-radar-daily</code></article>
          <article><span>WEEKLY · FRI</span><h3>Freshness Audit</h3><p>复核即将过期的主张，更新版本和证据，隔离失效内容。</p><code>$knowledge-freshness-auditor</code></article>
          <article><span>MONTHLY · 01</span><h3>Knowledge GC</h3><p>合并重复项，清理活跃索引，保留淘汰理由和替代关系。</p><code>$knowledge-gc</code></article>
        </div>
      </section>

      <footer>
        <div><span className="brand-mark">AW</span><strong>Agent Workbench</strong></div>
        <p>Evidence over hype. Freshness over accumulation.</p>
        <span>Git-backed · Human-reviewed · Agent-ready</span>
      </footer>
    </main>
  );
}
