"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { requestGuide, requestWorkspaceUpdate, type Guide, type WorkspacePatch } from "./ai-guide";

type KnowledgeStatus = "verified" | "candidate" | "review" | "stale" | "archived" | "quarantined";
type SourceType = "github" | "blog" | "report" | "news" | "web";

type WorkspaceSettings = {
  enabledSources: SourceType[];
  radarTime: string;
  auditDay: string;
  auditTime: string;
  gcDay: number;
  gcTime: string;
  reviewWindowDays: number;
  archiveAfterDays: number;
  defaultTtlDays: number;
};

type BridgeSnapshot = {
  updatedAt: string;
  entries: KnowledgeEntry[];
  settings: WorkspaceSettings;
};

const defaultWorkspaceSettings: WorkspaceSettings = {
  enabledSources: ["github", "blog", "report", "news", "web"],
  radarTime: "08:37",
  auditDay: "fri",
  auditTime: "17:17",
  gcDay: 1,
  gcTime: "09:23",
  reviewWindowDays: 7,
  archiveAfterDays: 30,
  defaultTtlDays: 21,
};

const dayLabels: Record<string, string> = { mon: "周一", tue: "周二", wed: "周三", thu: "周四", fri: "周五", sat: "周六", sun: "周日" };

export type KnowledgeEntry = {
  id: string;
  title: string;
  category: string;
  sourceType: SourceType;
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

const sourceTypes: Array<{ id: SourceType; mark: string; label: string; description: string }> = [
  { id: "github", mark: "GH", label: "GitHub", description: "Release、仓库与规范变更" },
  { id: "blog", mark: "BL", label: "技术博客", description: "团队实践与工程复盘" },
  { id: "report", mark: "RP", label: "技术报告", description: "论文、评测与行业报告" },
  { id: "news", mark: "NW", label: "新闻", description: "产品发布与行业事件" },
  { id: "web", mark: "WB", label: "网络知识", description: "文档、社区与专题资料" },
];

const sourceLabel = Object.fromEntries(sourceTypes.map((source) => [source.id, source.label])) as Record<SourceType, string>;

const categoryMark: Record<string, string> = {
  MCP: "MC",
  Plugin: "PL",
  Skill: "SK",
  SDK: "SD",
  Tool: "TL",
  Research: "RS",
  Security: "SE",
};

function GuidePanel({
  entry,
  guide,
  loading,
  onGenerate,
  aiEnabled,
  compact = false,
}: {
  entry: KnowledgeEntry;
  guide?: Guide;
  loading: boolean;
  onGenerate: () => void;
  aiEnabled: boolean;
  compact?: boolean;
}) {
  if (!guide) {
    return (
      <div className={`guide-panel source-extract${compact ? " guide-compact" : ""}`}>
        <div className="guide-heading">
          <span>来源摘录 · 未经 AI 提炼</span>
          <small>AUTO CRAWLER</small>
        </div>
        <p>{entry.summary}</p>
        <div className="non-ai-note">仅按过期规则整理，等待人工复核；这不是 AI 导读或事实核验结论。</div>
        <button type="button" className="guide-button" onClick={onGenerate} disabled={loading}>
          {loading ? "正在提炼与核验…" : aiEnabled ? "运行 AI 增强" : "配置 AI 获取导读与核验"} <span>✦</span>
        </button>
      </div>
    );
  }
  return (
    <div className={`guide-panel${compact ? " guide-compact" : ""}`}>
      <div className="guide-heading">
        <span>AI 导读 · 证据核验</span>
        <small>{guide.model}</small>
      </div>
      <div className="guide-badges"><span>{guide.category}</span><span className={`verification verification-${guide.verification}`}>{guide.verification}</span></div>
      <p>{guide.summary}</p>
      <dl>
        <div><dt>工程影响</dt><dd>{guide.impact}</dd></div>
        <div><dt>建议动作</dt><dd>{guide.action}</dd></div>
        <div><dt>证据说明</dt><dd>{guide.verificationNote}</dd></div>
      </dl>
      <button type="button" className="guide-button" onClick={onGenerate} disabled={loading}>
        {loading ? "正在提炼与核验…" : "重新运行 AI 增强"} <span>✦</span>
      </button>
    </div>
  );
}

function clamp(value: unknown, minimum: number, maximum: number, fallback: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.round(number))) : fallback;
}

function applyWorkspacePatch(current: WorkspaceSettings, patch?: WorkspacePatch): WorkspaceSettings {
  if (!patch) return current;
  const allowedSources = new Set<SourceType>(["github", "blog", "report", "news", "web"]);
  const sources = Array.isArray(patch.enabledSources)
    ? patch.enabledSources.filter((source): source is SourceType => allowedSources.has(source as SourceType))
    : current.enabledSources;
  const isTime = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const isDay = (value: unknown): value is string => typeof value === "string" && value in dayLabels;
  return {
    enabledSources: sources.length ? [...new Set(sources)] : current.enabledSources,
    radarTime: isTime(patch.radarTime) ? patch.radarTime : current.radarTime,
    auditDay: isDay(patch.auditDay) ? patch.auditDay : current.auditDay,
    auditTime: isTime(patch.auditTime) ? patch.auditTime : current.auditTime,
    gcDay: clamp(patch.gcDay, 1, 28, current.gcDay),
    gcTime: isTime(patch.gcTime) ? patch.gcTime : current.gcTime,
    reviewWindowDays: clamp(patch.reviewWindowDays, 1, 90, current.reviewWindowDays),
    archiveAfterDays: clamp(patch.archiveAfterDays, 1, 365, current.archiveAfterDays),
    defaultTtlDays: clamp(patch.defaultTtlDays, 1, 365, current.defaultTtlDays),
  };
}

function applyFreshnessPolicy(entry: KnowledgeEntry, settings: WorkspaceSettings): KnowledgeEntry {
  if (["candidate", "quarantined"].includes(entry.status)) return entry;
  const today = new Date();
  const validUntil = new Date(`${entry.validUntil}T00:00:00Z`);
  const daysRemaining = Math.ceil((validUntil.getTime() - today.getTime()) / 86_400_000);
  if (daysRemaining < -settings.archiveAfterDays) return { ...entry, status: "archived" };
  if (daysRemaining < 0) return { ...entry, status: "stale" };
  if (daysRemaining <= settings.reviewWindowDays) return { ...entry, status: "review" };
  return { ...entry, status: "verified" };
}

export function Workbench({ entries }: { entries: KnowledgeEntry[] }) {
  const [knowledgeEntries, setKnowledgeEntries] = useState(entries);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | KnowledgeStatus>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | SourceType>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspace, setWorkspace] = useState(defaultWorkspaceSettings);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-5.6-sol");
  const [endpoint, setEndpoint] = useState("https://api.openai.com/v1/responses");
  const [guides, setGuides] = useState<Record<string, Guide>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [autoProgress, setAutoProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [petOpen, setPetOpen] = useState(false);
  const [petInput, setPetInput] = useState("");
  const [petLoading, setPetLoading] = useState(false);
  const [bridgeUrl, setBridgeUrl] = useState("http://127.0.0.1:4317");
  const [bridgeToken, setBridgeToken] = useState("");
  const [bridgeStatus, setBridgeStatus] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [bridgeUpdatedAt, setBridgeUpdatedAt] = useState("");
  const [bridgeRoutine, setBridgeRoutine] = useState<string | null>(null);
  const [petMessages, setPetMessages] = useState<Array<{ role: "agent" | "user"; text: string }>>([
    { role: "agent", text: "我是你的工作台 Agent。告诉我想关注哪些来源、几点更新，或知识多久复核一次。" },
  ]);
  const repositoryUrl = process.env.NEXT_PUBLIC_REPOSITORY_URL ?? "https://github.com";

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("agent-workbench-settings-v1");
      if (saved) setWorkspace((current) => applyWorkspacePatch(current, JSON.parse(saved) as WorkspacePatch));
    } catch {
      // Ignore malformed device-local preferences and keep safe defaults.
    } finally {
      setWorkspaceLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (workspaceLoaded) window.localStorage.setItem("agent-workbench-settings-v1", JSON.stringify(workspace));
  }, [workspace, workspaceLoaded]);

  const bridgeRequest = useCallback(async (path: string, init?: RequestInit, connection?: { url: string; token: string }) => {
    const url = new URL(connection?.url ?? bridgeUrl);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      throw new Error("本地 Bridge 只允许 http://127.0.0.1 或 http://localhost");
    }
    const response = await fetch(new URL(path, `${url.origin}/`), {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${(connection?.token ?? bridgeToken).trim()}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(payload.error || `Bridge 返回 ${response.status}`);
    return payload;
  }, [bridgeToken, bridgeUrl]);

  const applyBridgeSnapshot = useCallback((snapshot: BridgeSnapshot) => {
    if (Array.isArray(snapshot.entries)) setKnowledgeEntries(snapshot.entries);
    if (snapshot.settings) setWorkspace((current) => applyWorkspacePatch(current, snapshot.settings));
    setBridgeUpdatedAt(snapshot.updatedAt || new Date().toISOString());
  }, []);

  const connectBridge = useCallback(async (connection?: { url: string; token: string }, quiet = false) => {
    const nextUrl = connection?.url ?? bridgeUrl;
    const nextToken = connection?.token ?? bridgeToken;
    if (!nextToken.trim()) {
      if (!quiet) setNotice("请粘贴 Bridge 启动时显示的临时 Token。");
      return;
    }
    if (!quiet) setBridgeStatus("connecting");
    try {
      await bridgeRequest("/health", undefined, { url: nextUrl, token: nextToken });
      const snapshot = await bridgeRequest("/snapshot", undefined, { url: nextUrl, token: nextToken }) as BridgeSnapshot;
      setBridgeUrl(nextUrl);
      setBridgeToken(nextToken);
      applyBridgeSnapshot(snapshot);
      setBridgeStatus("connected");
      if (!quiet) setNotice("本地 CLI / MCP 已连接，网站正在读取本地知识核心。");
    } catch (error) {
      setBridgeStatus("error");
      if (!quiet) setNotice(error instanceof Error ? error.message : "无法连接本地 Bridge");
    }
  }, [applyBridgeSnapshot, bridgeRequest, bridgeToken, bridgeUrl]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const url = params.get("bridge");
    const token = params.get("token");
    if (!url || !token) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    void connectBridge({ url, token });
  }, [connectBridge]);

  useEffect(() => {
    if (bridgeStatus !== "connected") return;
    const timer = window.setInterval(async () => {
      try {
        const snapshot = await bridgeRequest("/snapshot") as BridgeSnapshot;
        applyBridgeSnapshot(snapshot);
      } catch {
        setBridgeStatus("error");
      }
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [applyBridgeSnapshot, bridgeRequest, bridgeStatus]);

  const policyEntries = knowledgeEntries.map((entry) => applyFreshnessPolicy(entry, workspace));
  const activeEntries = policyEntries.filter((entry) => entry.status !== "archived" && workspace.enabledSources.includes(entry.sourceType));
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return activeEntries.filter((entry) => {
      const matchesStatus = statusFilter === "all" || entry.status === statusFilter;
      const matchesSource = sourceFilter === "all" || entry.sourceType === sourceFilter;
      const haystack = [entry.title, entry.summary, entry.impact, entry.action, entry.category, entry.source, ...entry.tags]
        .join(" ")
        .toLowerCase();
      return matchesStatus && matchesSource && (!needle || haystack.includes(needle));
    });
  }, [activeEntries, query, sourceFilter, statusFilter]);

  const verified = activeEntries.filter((entry) => entry.status === "verified").length;
  const review = activeEntries.filter((entry) => entry.status === "review").length;
  const stale = activeEntries.filter((entry) => entry.status === "stale").length;
  const health = Math.round((verified / Math.max(activeEntries.length, 1)) * 100);
  const radar = activeEntries.slice(0, 3);

  const generateGuide = async (entry: KnowledgeEntry) => {
    if (!apiKey.trim()) {
      setNotice("先配置 API Key，再生成个性化导读。");
      setSettingsOpen(true);
      return;
    }
    setLoadingId(entry.id);
    setNotice("");
    try {
      const guide = await requestGuide(entry, { apiKey, endpoint, model });
      setGuides((current) => ({ ...current, [entry.id]: guide }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "导读生成失败");
      setSettingsOpen(true);
    } finally {
      setLoadingId(null);
    }
  };

  const runAutoEnhance = async () => {
    if (!apiKey.trim() || autoProgress) return;
    const targets = activeEntries.filter((entry) => !guides[entry.id]);
    if (!targets.length) {
      setNotice("当前活跃知识都已完成 AI 增强。");
      return;
    }
    setAutoProgress({ done: 0, total: targets.length });
    setNotice("");
    let failures = 0;
    for (let index = 0; index < targets.length; index += 1) {
      const entry = targets[index];
      setLoadingId(entry.id);
      try {
        const guide = await requestGuide(entry, { apiKey, endpoint, model });
        setGuides((current) => ({ ...current, [entry.id]: guide }));
      } catch {
        failures += 1;
      }
      setAutoProgress({ done: index + 1, total: targets.length });
    }
    setLoadingId(null);
    setAutoProgress(null);
    setNotice(failures ? `AI 增强完成，${targets.length - failures} 条成功、${failures} 条需重试。` : `AI 增强完成：${targets.length} 条已提炼、分类并核验。`);
  };

  const saveSettings = async () => {
    if (bridgeStatus === "connected") {
      try {
        const result = await bridgeRequest("/settings", { method: "PATCH", body: JSON.stringify(workspace) }) as { settings?: WorkspaceSettings };
        if (result.settings) setWorkspace((current) => applyWorkspacePatch(current, result.settings));
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "本地设置同步失败");
        return;
      }
    }
    setSettingsOpen(false);
    if (apiKey.trim()) void runAutoEnhance();
  };

  const runBridgeRoutine = async (routine: "sync" | "audit" | "gc") => {
    if (bridgeStatus !== "connected" || bridgeRoutine) return;
    setBridgeRoutine(routine);
    setNotice("");
    try {
      const result = await bridgeRequest(`/actions/${routine}`, { method: "POST" }) as { snapshot?: BridgeSnapshot };
      if (result.snapshot) applyBridgeSnapshot(result.snapshot);
      setNotice(`${routine.toUpperCase()} 已由本地 CLI Bridge 执行完成。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "本地任务执行失败");
    } finally {
      setBridgeRoutine(null);
    }
  };

  const chooseSource = (source: SourceType) => {
    setSourceFilter(source);
    document.getElementById("knowledge")?.scrollIntoView({ behavior: "smooth" });
  };

  const toggleSource = (source: SourceType) => {
    setWorkspace((current) => {
      const enabled = current.enabledSources.includes(source);
      if (enabled && current.enabledSources.length === 1) {
        setNotice("至少保留一个知识来源。");
        return current;
      }
      return {
        ...current,
        enabledSources: enabled
          ? current.enabledSources.filter((item) => item !== source)
          : [...current.enabledSources, source],
      };
    });
  };

  const sendPetMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = petInput.trim();
    if (!message || petLoading) return;
    setPetMessages((current) => [...current, { role: "user", text: message }]);
    setPetInput("");
    setPetLoading(true);
    try {
      if (bridgeStatus === "connected") {
        const result = await bridgeRequest("/agent", { method: "POST", body: JSON.stringify({ message }) }) as { reply: string; snapshot?: BridgeSnapshot };
        if (result.snapshot) applyBridgeSnapshot(result.snapshot);
        setPetMessages((current) => [...current, { role: "agent", text: result.reply }]);
      } else {
        const result = await requestWorkspaceUpdate(workspace, message, { apiKey, endpoint, model });
        if (result.patch) setWorkspace((current) => applyWorkspacePatch(current, result.patch));
        setPetMessages((current) => [...current, { role: "agent", text: result.reply }]);
      }
    } catch (error) {
      setPetMessages((current) => [...current, { role: "agent", text: error instanceof Error ? error.message : "我暂时没能完成设置。" }]);
    } finally {
      setPetLoading(false);
    }
  };

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Agent Workbench 首页">
          <span className="brand-mark">AW</span>
          <span>Agent Workbench</span>
        </a>
        <nav aria-label="主导航">
          <a href="#radar">今日雷达</a>
          <a href="#sources">来源</a>
          <a href="#knowledge">知识库</a>
          <a href="#workflow">工作流</a>
        </nav>
        <div className="header-actions">
          <button type="button" className={`ai-config-button${apiKey ? " configured" : ""}`} onClick={() => setSettingsOpen(true)}>
            <span>{apiKey ? "✦" : "⚙"}</span>{apiKey ? model : "工作台设置"}
          </button>
          <div className={`sync-pill${bridgeStatus === "connected" ? " bridge-live" : ""}`}><span />{bridgeStatus === "connected" ? "LOCAL MCP · LIVE" : `个人雷达 ${workspace.radarTime}`}</div>
        </div>
      </header>

      <div className={`mode-strip ${apiKey ? "ai-mode" : "basic-mode"}`}>
        <strong>{apiKey ? "AI 增强模式" : "基础模式"}</strong>
        <span>{apiKey ? "自动导读 · 自动分类 · 联网证据核验" : "自动采集 · 过期整理 · 人工复核"}</span>
        {autoProgress && <span className="mode-progress">正在增强 {autoProgress.done}/{autoProgress.total}</span>}
        {bridgeStatus === "connected" && <span className="bridge-indicator">本地 CLI 正在驱动 · {bridgeUpdatedAt ? new Date(bridgeUpdatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "已连接"}</span>}
        {notice && !settingsOpen && <button type="button" onClick={() => setNotice("")} aria-label="关闭通知">{notice} ×</button>}
      </div>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">AGENT ENGINEERING INTELLIGENCE</p>
          <h1>不打开十个页面，<br /><em>也能看懂变化。</em></h1>
          <p className="hero-lede">{apiKey
            ? "聚合 GitHub、技术博客、技术报告、新闻与网络知识，由 AI 自动提炼、分类并联网核验；最终仍由证据和人工审核决定是否采信。"
            : "聚合 GitHub、技术博客、技术报告、新闻与网络知识。未配置 API Key 时保留来源摘录，按过期策略整理并交给人工复核。"}</p>
          <div className="hero-actions">
            <a className="primary-button" href="#radar">阅读今日导读 <span>↘</span></a>
            <button type="button" className="text-button" onClick={() => setSettingsOpen(true)}>配置我的工作台 <span>→</span></button>
          </div>
        </div>

        <div className="signal-board" aria-label="知识雷达摘要">
          <div className="board-topline">
            <span>MULTI-SOURCE KNOWLEDGE GRAPH</span>
            <span className="live-dot">LIVE</span>
          </div>
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="signal-core"><strong>{health}%</strong><span>知识健康度</span></div>
          <span className="node node-a">GIT</span>
          <span className="node node-b">BLOG</span>
          <span className="node node-c">NEWS</span>
          <span className="node node-d">PAPER</span>
          <div className="board-caption"><span>{activeEntries.length} 条活跃知识</span><span>5 类来源</span></div>
        </div>
      </section>

      <section className="metrics" aria-label="知识指标">
        <article><span>01</span><strong>{verified}</strong><p>已验证知识</p></article>
        <article><span>02</span><strong>{review}</strong><p>即将到期</p></article>
        <article><span>03</span><strong>{stale}</strong><p>退出检索</p></article>
        <article><span>04</span><strong>5</strong><p>来源板块</p></article>
      </section>

      <section className="section" id="radar">
        <div className="section-heading">
          <div><p className="eyebrow">DAILY BRIEFING · 过去 24 小时</p><h2>今天值得你注意的变化</h2></div>
          <a href="#knowledge">查看全部知识 <span>↗</span></a>
        </div>
        <div className="radar-grid">
          {radar.map((entry, index) => (
            <article className={`radar-card card-${index + 1}`} key={entry.id}>
              <div className="card-meta">
                <span className="category-mark">{categoryMark[entry.category] ?? "KN"}</span>
                <span>{sourceLabel[entry.sourceType]}</span>
                <span className={`status status-${entry.status}`}>{statusLabel[entry.status]}</span>
              </div>
              <h3>{entry.title}</h3>
              <GuidePanel entry={entry} guide={guides[entry.id]} loading={loadingId === entry.id} onGenerate={() => generateGuide(entry)} aiEnabled={Boolean(apiKey)} compact />
              <div className="card-footer">
                <span>{entry.source} · 有效至 {entry.validUntil}</span>
                <a href={entry.sourceUrl} target="_blank" rel="noreferrer" aria-label={`打开 ${entry.title} 的来源`}>核对原文 ↗</a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="source-section" id="sources">
        <div className="source-intro">
          <p className="eyebrow">SOURCE LENSES</p>
          <h2>五路信号，分开判断。</h2>
          <p>代码变化看版本，博客看经验边界，报告看方法与样本，新闻看事件，网络知识看可追溯性。不同来源使用不同验证标准。</p>
        </div>
        <div className="source-grid">
          {sourceTypes.map((source) => {
            const enabled = workspace.enabledSources.includes(source.id);
            const count = policyEntries.filter((entry) => entry.status !== "archived" && entry.sourceType === source.id).length;
            return (
              <button type="button" className={enabled ? "" : "source-disabled"} key={source.id} onClick={() => { if (!enabled) toggleSource(source.id); chooseSource(source.id); }}>
                <span className="source-mark">{source.mark}</span>
                <strong>{source.label}</strong>
                <p>{source.description}</p>
                <small>{enabled ? `${count} 条知识` : "已暂停"} <b>→</b></small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="freshness-section" id="freshness">
        <div className="freshness-copy">
          <p className="eyebrow">KNOWLEDGE FRESHNESS</p>
          <h2>{apiKey ? "AI 自动增强，证据负责定级。" : "规则保持新鲜，人工决定采信。"}</h2>
          <p>{apiKey
            ? "AI 自动生成导读、知识分类并通过联网搜索交叉核验，但不会把候选内容自动升级为可信知识。来源核对、版本快照、复现实验和人工 PR 审核仍是验证门槛。"
            : "采集器持续抓取五类来源，不生成 AI 导读。知识只按有效期进入复核、过期和归档阶段，可信度由人工检查来源与实验结果后决定。"}</p>
          <div className="lifecycle" aria-label="知识生命周期">
            <span>发现</span><i>→</i><span>{apiKey ? "AI 增强" : "来源摘录"}</span><i>→</i><span>{apiKey ? "证据建议" : "人工核对"}</span><i>→</i><span>复核</span><i>→</i><span>归档</span>
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
          <div><p className="eyebrow">GUIDED LIBRARY</p><h2>知识库与导读</h2></div>
          <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索工具、论文、框架…" aria-label="搜索知识库" /></label>
        </div>
        <div className="filter-groups">
          <div className="filter-row" role="group" aria-label="来源筛选">
            <span className="filter-label">来源</span>
            <button className={sourceFilter === "all" ? "active" : ""} onClick={() => setSourceFilter("all")}>全部</button>
            {sourceTypes.map((source) => <button key={source.id} className={sourceFilter === source.id ? "active" : ""} onClick={() => setSourceFilter(source.id)}>{source.label}</button>)}
          </div>
          <div className="filter-row" role="group" aria-label="知识状态筛选">
            <span className="filter-label">状态</span>
            {(["all", "verified", "candidate", "review", "stale"] as const).map((value) => (
              <button key={value} className={statusFilter === value ? "active" : ""} onClick={() => setStatusFilter(value)}>{value === "all" ? "全部" : statusLabel[value]}</button>
            ))}
            <span className="result-count">{filtered.length} 个结果</span>
          </div>
        </div>
        <div className="knowledge-grid">
          {filtered.map((entry) => (
            <article className="knowledge-card" key={entry.id}>
              <div className="knowledge-card-top">
                <span className="knowledge-icon">{categoryMark[entry.category] ?? "KN"}</span>
                <div><span>{sourceLabel[entry.sourceType]} · {entry.source}</span><h3>{entry.title}</h3></div>
                <span className={`status status-${entry.status}`}>{statusLabel[entry.status]}</span>
              </div>
              <GuidePanel entry={entry} guide={guides[entry.id]} loading={loadingId === entry.id} onGenerate={() => generateGuide(entry)} aiEnabled={Boolean(apiKey)} />
              <div className="knowledge-card-bottom">
                <span>版本 {entry.sourceVersion}</span><span>置信度 {entry.confidence}</span><span>验证 {entry.lastVerifiedAt || "待完成"}</span>
                <a href={entry.sourceUrl} target="_blank" rel="noreferrer">查看证据 ↗</a>
              </div>
            </article>
          ))}
          {filtered.length === 0 && <div className="empty-state">没有符合条件的知识条目。</div>}
        </div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="section-heading"><div><p className="eyebrow">AUTOMATED ROUTINES</p><h2>让知识自己保持清醒</h2></div></div>
        <div className="workflow-grid">
          <article><span>PERSONAL · {workspace.radarTime}</span><h3>Multi-source Radar</h3><p>按你的五类来源开关与默认 {workspace.defaultTtlDays} 天有效期整理个人知识视图。</p><code>{workspace.enabledSources.length} sources enabled</code>{bridgeStatus === "connected" && <button type="button" onClick={() => runBridgeRoutine("sync")} disabled={Boolean(bridgeRoutine)}>{bridgeRoutine === "sync" ? "正在采集…" : "由本地 CLI 立即采集"}</button>}</article>
          <article><span>{dayLabels[workspace.auditDay]} · {workspace.auditTime}</span><h3>Freshness Audit</h3><p>提前 {workspace.reviewWindowDays} 天进入复核，过期内容退出默认检索。</p><code>review_window={workspace.reviewWindowDays}d</code>{bridgeStatus === "connected" && <button type="button" onClick={() => runBridgeRoutine("audit")} disabled={Boolean(bridgeRoutine)}>{bridgeRoutine === "audit" ? "正在审计…" : "由本地 CLI 立即审计"}</button>}</article>
          <article><span>MONTHLY · {workspace.gcDay} 日 {workspace.gcTime}</span><h3>Knowledge GC</h3><p>过期超过 {workspace.archiveAfterDays} 天后归档，同时保留来源和审计记录。</p><code>archive_after={workspace.archiveAfterDays}d</code>{bridgeStatus === "connected" && <button type="button" onClick={() => runBridgeRoutine("gc")} disabled={Boolean(bridgeRoutine)}>{bridgeRoutine === "gc" ? "正在归档…" : "由本地 CLI 立即归档"}</button>}</article>
        </div>
        <p className="workflow-note">{bridgeStatus === "connected" ? "本地 Bridge 已连接：Codex/CLI 通过 MCP 修改设置或知识后，网页会在 5 秒内同步；三个维护任务也可从网页安全触发。" : "个人计划保存在本设备并影响当前工作台；仓库后台的 GitHub Actions 使用管理员全局计划。启动本地 Bridge 后，CLI 可通过 MCP 直接驱动网站。"}</p>
      </section>

      <footer>
        <div><span className="brand-mark">AW</span><strong>Agent Workbench</strong></div>
        <p>AI summarizes. Evidence decides.</p>
        <span>Git-backed · Human-reviewed · Agent-ready</span>
      </footer>

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="settings-topline"><span>PERSONAL WORKBENCH</span><button type="button" onClick={() => setSettingsOpen(false)} aria-label="关闭工作台设置">×</button></div>
            <h2 id="settings-title">配置你的工作台</h2>
            <p className="settings-lede">所有人都能手动设置来源、时间和过期策略。配置 API Key 后自动提炼、整理和联网核验；连接本地 Bridge 后，Codex/CLI 可通过 MCP 驱动整个工作台。</p>

            <fieldset className="settings-group bridge-settings">
              <legend>本地 CLI / MCP（可选）</legend>
              <div className="bridge-heading"><div><strong>Website as MCP</strong><p>在仓库运行 <code>npm run workbench:bridge</code>，再打开终端输出的一键连接链接；或在这里粘贴临时 Token。</p></div><span className={`bridge-status bridge-${bridgeStatus}`}>{bridgeStatus === "connected" ? "已连接" : bridgeStatus === "connecting" ? "连接中" : bridgeStatus === "error" ? "连接失败" : "未连接"}</span></div>
              <div className="settings-grid">
                <label>Bridge 地址<input type="url" value={bridgeUrl} onChange={(event) => setBridgeUrl(event.target.value)} spellCheck={false} /></label>
                <label>临时 Token<input type="password" value={bridgeToken} onChange={(event) => setBridgeToken(event.target.value)} autoComplete="off" spellCheck={false} placeholder="启动 Bridge 后生成" /></label>
              </div>
              <div className="bridge-actions">
                <button type="button" className="clear-button" onClick={() => void connectBridge()} disabled={bridgeStatus === "connecting"}>{bridgeStatus === "connecting" ? "正在连接…" : "连接本地能力"}</button>
                {bridgeStatus === "connected" && <button type="button" className="clear-button" onClick={() => { setBridgeStatus("disconnected"); setBridgeToken(""); setKnowledgeEntries(entries); }}>断开</button>}
              </div>
              <p className="field-note">Bridge 只监听 127.0.0.1，使用临时令牌和来源白名单，且仅开放设置、采集、审计、归档等固定能力，不接受任意 Shell 命令。</p>
            </fieldset>

            <fieldset className="settings-group">
              <legend>知识来源</legend>
              <div className="source-checks">
                {sourceTypes.map((source) => (
                  <label key={source.id} className={workspace.enabledSources.includes(source.id) ? "checked" : ""}>
                    <input type="checkbox" checked={workspace.enabledSources.includes(source.id)} onChange={() => toggleSource(source.id)} />
                    <span>{source.mark}</span>{source.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="settings-group">
              <legend>个人定时计划</legend>
              <div className="settings-grid three-columns">
                <label>每日雷达<input type="time" value={workspace.radarTime} onChange={(event) => setWorkspace((current) => ({ ...current, radarTime: event.target.value }))} /></label>
                <label>每周复核<select value={workspace.auditDay} onChange={(event) => setWorkspace((current) => ({ ...current, auditDay: event.target.value }))}>{Object.entries(dayLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label>复核时间<input type="time" value={workspace.auditTime} onChange={(event) => setWorkspace((current) => ({ ...current, auditTime: event.target.value }))} /></label>
                <label>每月归档日<input type="number" min="1" max="28" value={workspace.gcDay} onChange={(event) => setWorkspace((current) => ({ ...current, gcDay: clamp(event.target.value, 1, 28, current.gcDay) }))} /></label>
                <label>归档时间<input type="time" value={workspace.gcTime} onChange={(event) => setWorkspace((current) => ({ ...current, gcTime: event.target.value }))} /></label>
              </div>
              <p className="field-note">设备侧计划在本页打开时生效；关闭页面后的后台执行仍使用仓库管理员的 GitHub Actions 计划。</p>
            </fieldset>

            <fieldset className="settings-group">
              <legend>知识更新 / 过期策略</legend>
              <div className="settings-grid">
                <label>默认有效期（天）<input type="number" min="1" max="365" value={workspace.defaultTtlDays} onChange={(event) => setWorkspace((current) => ({ ...current, defaultTtlDays: clamp(event.target.value, 1, 365, current.defaultTtlDays) }))} /></label>
                <label>提前复核（天）<input type="number" min="1" max="90" value={workspace.reviewWindowDays} onChange={(event) => setWorkspace((current) => ({ ...current, reviewWindowDays: clamp(event.target.value, 1, 90, current.reviewWindowDays) }))} /></label>
                <label>过期后归档（天）<input type="number" min="1" max="365" value={workspace.archiveAfterDays} onChange={(event) => setWorkspace((current) => ({ ...current, archiveAfterDays: clamp(event.target.value, 1, 365, current.archiveAfterDays) }))} /></label>
              </div>
            </fieldset>

            <fieldset className="settings-group model-settings">
              <legend>AI 自动增强与桌宠（可选）</legend>
              <p className="settings-lede">保存 Key 后会自动为当前知识生成导读、类别和联网核验建议。密钥只保留在当前页面内存中，刷新即清除，不写入 GitHub、日志或浏览器持久存储。</p>
              <div className="settings-grid">
                <label>API Key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-…" autoComplete="off" spellCheck={false} /></label>
                <label>模型<select value={model} onChange={(event) => setModel(event.target.value)}><option value="gpt-5.6-sol">GPT-5.6 Sol · 高质量</option><option value="gpt-5.6-terra">GPT-5.6 Terra · 均衡</option><option value="gpt-5.6-luna">GPT-5.6 Luna · 高吞吐</option></select></label>
              </div>
              <label>Responses API 地址<input type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} spellCheck={false} /></label>
            </fieldset>

            <div className="security-note"><strong>安全提示</strong><p>静态网站没有服务端密钥保险箱。请使用限额明确的个人 Project Key；自定义接口会收到密钥、对话内容和当前工作台设置。</p></div>
            {notice && <p className="settings-notice" role="alert">{notice}</p>}
            <div className="settings-actions">
              <button type="button" className="clear-button" onClick={() => { setApiKey(""); setNotice(""); }}>清除密钥</button>
              <button type="button" className="primary-button" onClick={() => void saveSettings()}>{bridgeStatus === "connected" ? "保存到本地知识核心" : "保存到本设备"} <span>✓</span></button>
            </div>
          </section>
        </div>
      )}

      {(apiKey || bridgeStatus === "connected") && (
        <aside className={`pet-agent${petOpen ? " pet-open" : ""}`} aria-label="工作台桌宠 Agent">
          {petOpen && (
            <section className="pet-chat">
              <div className="pet-chat-header"><div><span className="pet-mini">•ᴗ•</span><strong>{bridgeStatus === "connected" ? "Local CLI Agent" : "Workbench Agent"}</strong></div><button type="button" onClick={() => setPetOpen(false)} aria-label="收起桌宠对话">×</button></div>
              <div className="pet-messages" aria-live="polite">
                {petMessages.map((message, index) => <p className={message.role} key={`${message.role}-${index}`}>{message.text}</p>)}
                {petLoading && <p className="agent">{bridgeStatus === "connected" ? "本地 Agent 正在思考并调整…" : "正在调整工作台…"}</p>}
              </div>
              <form onSubmit={sendPetMessage}>
                <input value={petInput} onChange={(event) => setPetInput(event.target.value)} placeholder="例如：只看 GitHub 和报告，每天 9 点更新" aria-label="向工作台 Agent 发送消息" />
                <button type="submit" disabled={petLoading || !petInput.trim()}>↑</button>
              </form>
            </section>
          )}
          <button type="button" className="pet-button" onClick={() => setPetOpen((open) => !open)} aria-expanded={petOpen}>
            <span className="pet-face"><i /><b>•ᴗ•</b></span>
            <small>{petOpen ? "收起" : "问问我"}</small>
          </button>
        </aside>
      )}
    </main>
  );
}
