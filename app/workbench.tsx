"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Guide, type WorkspacePatch } from "./ai-guide";

type KnowledgeStatus = "verified" | "candidate" | "review" | "stale" | "archived" | "quarantined";
type SourceType = "github" | "blog" | "report" | "news" | "web";

export type WorkspaceSettings = {
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
  settings: WorkspaceSettings;
  entries?: KnowledgeEntry[];
  sources?: WatchSource[];
  guides?: Record<string, Guide & { sourceVersion?: string }>;
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

export type WatchSource = {
  id: string;
  adapter: "github-releases" | "rss";
  sourceType: SourceType;
  category: string;
  ttlDays: number;
  repo?: string;
  name?: string;
  feedUrl?: string;
  keywords?: string[];
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
          {loading ? "正在提炼与核验…" : aiEnabled ? "运行本地 AI 增强" : "安装本地 MCP 获取 AI 导读"} <span>✦</span>
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

type WorkbenchView = "dashboard" | "knowledge" | "sources" | "automation";

export function Workbench({ entries, initialGuides, initialSettings = defaultWorkspaceSettings, initialSources, view = "dashboard" }: { entries: KnowledgeEntry[]; initialGuides: Record<string, Guide>; initialSettings?: WorkspaceSettings; initialSources: WatchSource[]; view?: WorkbenchView }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | KnowledgeStatus>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | SourceType>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspace, setWorkspace] = useState(initialSettings);
  const [knowledgeEntries, setKnowledgeEntries] = useState(entries);
  const [watchSources, setWatchSources] = useState(initialSources);
  const [guides, setGuides] = useState<Record<string, Guide>>(initialGuides);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [autoProgress, setAutoProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [petOpen, setPetOpen] = useState(false);
  const [petInput, setPetInput] = useState("");
  const [petLoading, setPetLoading] = useState(false);
  const [bridgeUrl, setBridgeUrl] = useState("http://127.0.0.1:4317");
  const [bridgeStatus, setBridgeStatus] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [bridgeUpdatedAt, setBridgeUpdatedAt] = useState("");
  const [bridgeRoutine, setBridgeRoutine] = useState<string | null>(null);
  const [petMessages, setPetMessages] = useState<Array<{ role: "agent" | "user"; text: string }>>([
    { role: "agent", text: "我是你的工作台 Agent。告诉我想关注哪些来源、几点更新，或知识多久复核一次。" },
  ]);
  const attemptedInitialConnection = useRef(false);
  const repositoryUrl = process.env.NEXT_PUBLIC_REPOSITORY_URL ?? "https://github.com";
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const aiEnabled = bridgeStatus === "connected";

  useEffect(() => {
    const requestedSource = new URLSearchParams(window.location.search).get("source");
    if (requestedSource && sourceTypes.some((source) => source.id === requestedSource)) setSourceFilter(requestedSource as SourceType);
  }, []);

  const bridgeRequest = useCallback(async (path: string, init?: RequestInit, connection?: { url: string }) => {
    const url = new URL(connection?.url ?? bridgeUrl);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      throw new Error("本地 Bridge 只允许 http://127.0.0.1 或 http://localhost");
    }
    const response = await fetch(new URL(path, `${url.origin}/`), {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(payload.error || `Bridge 返回 ${response.status}`);
    return payload;
  }, [bridgeUrl]);

  const applyBridgeSnapshot = useCallback((snapshot: BridgeSnapshot) => {
    if (snapshot.settings) setWorkspace((current) => applyWorkspacePatch(current, snapshot.settings));
    if (snapshot.entries) setKnowledgeEntries(snapshot.entries);
    if (snapshot.sources) setWatchSources(snapshot.sources);
    if (snapshot.guides) {
      const currentEntries = snapshot.entries ?? knowledgeEntries;
      const forkVersions = new Map(currentEntries.map((entry) => [entry.id, entry.sourceVersion]));
      const compatible = Object.fromEntries(Object.entries(snapshot.guides).filter(([id, guide]) => (
        forkVersions.has(id) && (!guide.sourceVersion || guide.sourceVersion === forkVersions.get(id))
      )));
      setGuides((current) => ({ ...current, ...compatible }));
    }
    setBridgeUpdatedAt(snapshot.updatedAt || new Date().toISOString());
  }, [knowledgeEntries]);

  const enhanceLocally = useCallback(async (targets: KnowledgeEntry[], connection?: { url: string }) => {
    if (!targets.length) return;
    setAutoProgress({ done: 0, total: targets.length });
    try {
      const result = await bridgeRequest("/enhance", {
        method: "POST",
        body: JSON.stringify({ entryIds: targets.map((entry) => entry.id) }),
      }, connection) as { guides?: Record<string, Guide>; snapshot?: BridgeSnapshot };
      if (result.guides) setGuides((current) => ({ ...current, ...result.guides }));
      if (result.snapshot) applyBridgeSnapshot(result.snapshot);
      setAutoProgress({ done: targets.length, total: targets.length });
      setNotice(`本地 CLI 已完成 ${Object.keys(result.guides ?? {}).length} 条导读、分类与证据核验。`);
    } finally {
      setAutoProgress(null);
    }
  }, [applyBridgeSnapshot, bridgeRequest]);

  const connectBridge = useCallback(async (connection?: { url: string }, quiet = false) => {
    const nextUrl = connection?.url ?? bridgeUrl;
    if (!quiet) setBridgeStatus("connecting");
    try {
      await bridgeRequest("/health", undefined, { url: nextUrl });
      const snapshot = await bridgeRequest("/snapshot", undefined, { url: nextUrl }) as BridgeSnapshot;
      setBridgeUrl(nextUrl);
      window.sessionStorage.setItem("agent-workbench-local-url", nextUrl);
      applyBridgeSnapshot(snapshot);
      setBridgeStatus("connected");
      if (!quiet) setNotice("本地 CLI 已连接。网站知识仍来自 GitHub，本地 CLI 正在提供 AI 增强与控制能力。");
      const cached = snapshot.guides ?? {};
      const currentEntries = snapshot.entries ?? [];
      const targets = currentEntries.filter((entry) => entry.status !== "archived" && !(
        cached[entry.id] && (!cached[entry.id].sourceVersion || cached[entry.id].sourceVersion === entry.sourceVersion)
      ));
      if (targets.length) void enhanceLocally(targets.slice(0, 20), { url: nextUrl }).catch((error) => {
        setNotice(error instanceof Error ? error.message : "本地 AI 自动增强失败");
      });
    } catch (error) {
      setBridgeStatus("error");
      if (!quiet) setNotice(error instanceof Error ? `${error.message}；若浏览器询问本地网络访问，请选择允许。` : "无法连接本地服务；若浏览器询问本地网络访问，请选择允许。");
    }
  }, [applyBridgeSnapshot, bridgeRequest, bridgeUrl, enhanceLocally]);

  useEffect(() => {
    if (attemptedInitialConnection.current) return;
    attemptedInitialConnection.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const url = params.get("bridge");
    if (url) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      void connectBridge({ url });
      return;
    }
    const savedUrl = window.sessionStorage.getItem("agent-workbench-local-url");
    if (savedUrl) void connectBridge({ url: savedUrl }, true);
  }, [connectBridge]);

  useEffect(() => {
    if (bridgeStatus !== "connected") return;
    const timer = window.setInterval(async () => {
      try {
        const snapshot = await bridgeRequest("/snapshot") as BridgeSnapshot;
        applyBridgeSnapshot(snapshot);
      } catch {
        setBridgeStatus("error");
        window.sessionStorage.removeItem("agent-workbench-local-url");
        setKnowledgeEntries(entries);
        setWatchSources(initialSources);
        setGuides(initialGuides);
      }
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [applyBridgeSnapshot, bridgeRequest, bridgeStatus, entries, initialGuides, initialSources]);

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
  const radar = activeEntries.slice(0, 3);

  const generateGuide = async (entry: KnowledgeEntry) => {
    if (bridgeStatus !== "connected") {
      setNotice("请先在快速开始页安装本地 MCP，再生成导读、分类和证据核验。");
      window.location.assign(`${basePath}/quickstart`);
      return;
    }
    setLoadingId(entry.id);
    setNotice("");
    try {
      await enhanceLocally([entry]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "知识增强失败");
    } finally {
      setLoadingId(null);
    }
  };

  const runAutoEnhance = async () => {
    if (bridgeStatus !== "connected" || autoProgress) return;
    const targets = activeEntries.filter((entry) => !guides[entry.id]);
    if (!targets.length) {
      setNotice("当前活跃知识都已完成 AI 增强。");
      return;
    }
    try {
      await enhanceLocally(targets.slice(0, 20));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "本地 AI 自动增强失败");
    }
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
    if (bridgeStatus !== "connected") setNotice("策略已应用到本次浏览。要长期保存，请在自己的 Fork 修改 workspace/settings.json，或连接 MCP 后提交并推送。");
    if (bridgeStatus === "connected") void runAutoEnhance();
  };

  const runBridgeRoutine = async (routine: "sync" | "audit" | "gc") => {
    if (bridgeStatus !== "connected" || bridgeRoutine) return;
    setBridgeRoutine(routine);
    setNotice("");
    try {
      const result = await bridgeRequest(`/actions/${routine}`, { method: "POST" }) as { snapshot?: BridgeSnapshot };
      if (result.snapshot) applyBridgeSnapshot(result.snapshot);
      setNotice(`${routine.toUpperCase()} 已由本地 CLI 执行完成。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "本地任务执行失败");
    } finally {
      setBridgeRoutine(null);
    }
  };

  const disconnectLocal = async () => {
    try {
      await bridgeRequest("/disconnect", { method: "POST" });
    } catch {
      // Clear the browser-side capability even if the local process already stopped.
    }
    setBridgeStatus("disconnected");
    window.sessionStorage.removeItem("agent-workbench-local-url");
    setBridgeUrl("http://127.0.0.1:4317");
    setKnowledgeEntries(entries);
    setWatchSources(initialSources);
    setGuides(initialGuides);
    setPetOpen(false);
    setNotice("本地连接已安全断开，本地服务已经停止。");
  };

  const chooseSource = (source: SourceType) => {
    window.location.assign(`${basePath}/knowledge?source=${source}`);
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
      const result = await bridgeRequest("/agent", { method: "POST", body: JSON.stringify({ message }) }) as { reply: string; snapshot?: BridgeSnapshot };
      if (result.snapshot) applyBridgeSnapshot(result.snapshot);
      setPetMessages((current) => [...current, { role: "agent", text: result.reply }]);
    } catch (error) {
      setPetMessages((current) => [...current, { role: "agent", text: error instanceof Error ? error.message : "我暂时没能完成设置。" }]);
    } finally {
      setPetLoading(false);
    }
  };

  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Agent Workbench Dashboard">
          <span className="brand-mark">AW</span>
          <span>Agent Workbench</span>
        </Link>
        <nav aria-label="主导航">
          <Link className={view === "dashboard" ? "active" : ""} href="/">Dashboard</Link>
          <Link className={view === "knowledge" ? "active" : ""} href="/knowledge">知识库</Link>
          <Link className={view === "sources" ? "active" : ""} href="/sources">来源</Link>
          <Link className={view === "automation" ? "active" : ""} href="/automation">自动化</Link>
          <Link href="/quickstart">快速开始</Link>
        </nav>
        <div className="header-actions">
          <button type="button" className={`ai-config-button${aiEnabled ? " configured" : ""}`} onClick={() => aiEnabled ? setSettingsOpen(true) : window.location.assign(`${basePath}/quickstart`)}>
            <span>{aiEnabled ? "●" : "○"}</span>{aiEnabled ? "Local CLI 已连接" : "连接本地 CLI"}
          </button>
          <div className={`sync-pill${bridgeStatus === "connected" ? " bridge-live" : ""}`}><span />{bridgeStatus === "connected" ? "LOCAL MCP · LIVE" : `个人雷达 ${workspace.radarTime}`}</div>
        </div>
      </header>

      <div className={`mode-strip ${aiEnabled ? "ai-mode" : "basic-mode"}`}>
        <strong>{aiEnabled ? "本地 CLI AI 模式" : "GitHub 基础模式"}</strong>
        <span>{aiEnabled ? "自动导读 · 自动分类 · 联网证据核验" : "当前 Fork 知识 · 过期规则 · 等待本地 CLI"}</span>
        {autoProgress && <span className="mode-progress">正在增强 {autoProgress.done}/{autoProgress.total}</span>}
        {bridgeStatus === "connected" && <span className="bridge-indicator">本地 CLI 正在驱动 · {bridgeUpdatedAt ? new Date(bridgeUpdatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "已连接"}</span>}
        {notice && !settingsOpen && <button type="button" onClick={() => setNotice("")} aria-label="关闭通知">{notice} ×</button>}
      </div>

      {view === "dashboard" && <>
      <section className="metrics dashboard-metrics" aria-label="知识指标">
        <article><span>01</span><strong>{verified}</strong><p>已验证知识</p></article>
        <article><span>02</span><strong>{review}</strong><p>即将到期</p></article>
        <article><span>03</span><strong>{stale}</strong><p>退出检索</p></article>
        <article><span>04</span><strong>5</strong><p>来源板块</p></article>
      </section>

      <section className="section" id="radar">
        <div className="section-heading">
          <div><p className="eyebrow">DAILY BRIEFING · 过去 24 小时</p><h2>今天值得你注意的变化</h2></div>
          <Link href="/knowledge">查看全部知识 <span>↗</span></Link>
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
              <GuidePanel entry={entry} guide={guides[entry.id]} loading={loadingId === entry.id} onGenerate={() => generateGuide(entry)} aiEnabled={aiEnabled} compact />
              <div className="card-footer">
                <span>{entry.source} · 有效至 {entry.validUntil}</span>
                <a href={entry.sourceUrl} target="_blank" rel="noreferrer" aria-label={`打开 ${entry.title} 的来源`}>核对原文 ↗</a>
              </div>
            </article>
          ))}
          {radar.length === 0 && <div className="empty-state dashboard-empty"><strong>你的知识库还是空的。</strong><p>先完成 Fork 和来源配置，再运行一次采集。</p><Link href="/quickstart">打开快速开始 →</Link></div>}
        </div>
      </section>
      </>}

      {view === "sources" && <><section className="source-section page-section" id="sources">
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
      <section className="source-registry" aria-labelledby="source-registry-title">
        <div className="section-heading">
          <div><p className="eyebrow">YOUR WATCHLIST · {watchSources.length} SOURCES</p><h2 id="source-registry-title">当前 Fork 的实际监测源</h2></div>
        </div>
        <div className="source-registry-grid">
          {watchSources.map((source) => {
            const href = source.adapter === "github-releases" ? `https://github.com/${source.repo}` : source.feedUrl;
            return <article key={source.id}>
              <div><span>{source.adapter === "github-releases" ? "GH" : "RSS"}</span><small>{source.sourceType} · {source.category}</small></div>
              <h3>{source.name ?? source.repo}</h3>
              <p>{source.adapter === "github-releases" ? source.repo : source.feedUrl}</p>
              <div className="source-registry-meta"><code>{source.id}</code><span>TTL {source.ttlDays}d</span>{href && <a href={href} target="_blank" rel="noreferrer">打开 ↗</a>}</div>
            </article>;
          })}
          {watchSources.length === 0 && <div className="empty-state">当前 Fork 还没有监测源。</div>}
        </div>
        <div className="cli-chat-callout"><span>CLI CHAT</span><div><strong>直接告诉 Codex 你想关注什么</strong><p>它会调用 MCP 更新当前 Fork 的来源文件，并展示 Git 差异。</p><code>“关注 anthropics/anthropic-sdk-python 的 Release，归为 SDK，14 天复核；再移除我不再看的来源。”</code></div></div>
      </section></>}

      {view === "automation" && <section className="freshness-section page-section" id="freshness">
        <div className="freshness-copy">
          <p className="eyebrow">KNOWLEDGE FRESHNESS</p>
          <h2>{aiEnabled ? "AI 自动增强，证据负责定级。" : "规则保持新鲜，人工决定采信。"}</h2>
          <p>{aiEnabled
            ? "AI 自动生成导读、知识分类并通过联网搜索交叉核验，但不会把候选内容自动升级为可信知识。来源核对、版本快照、复现实验和人工 PR 审核仍是验证门槛。"
            : "采集器持续抓取五类来源，不生成 AI 导读。知识只按有效期进入复核、过期和归档阶段，可信度由人工检查来源与实验结果后决定。"}</p>
          <div className="lifecycle" aria-label="知识生命周期">
            <span>发现</span><i>→</i><span>{aiEnabled ? "AI 增强" : "来源摘录"}</span><i>→</i><span>{aiEnabled ? "证据建议" : "人工核对"}</span><i>→</i><span>复核</span><i>→</i><span>归档</span>
          </div>
          <button type="button" className="primary-button policy-button" onClick={() => setSettingsOpen(true)}>配置来源、时间与过期策略 <span>→</span></button>
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
      </section>}

      {view === "knowledge" && <section className="section library page-section" id="knowledge">
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
              <GuidePanel entry={entry} guide={guides[entry.id]} loading={loadingId === entry.id} onGenerate={() => generateGuide(entry)} aiEnabled={aiEnabled} />
              <div className="knowledge-card-bottom">
                <span>版本 {entry.sourceVersion}</span><span>置信度 {entry.confidence}</span><span>验证 {entry.lastVerifiedAt || "待完成"}</span>
                <a href={entry.sourceUrl} target="_blank" rel="noreferrer">查看证据 ↗</a>
              </div>
            </article>
          ))}
          {filtered.length === 0 && <div className="empty-state">没有符合条件的知识条目。</div>}
        </div>
        <div className="cli-chat-callout knowledge-chat-callout"><span>CLI CHAT</span><div><strong>用聊天新增或修改知识</strong><p>Codex 会调用 MCP 写入当前 Fork；新增和修改后的内容一律回到待验证状态。</p><code>“把这篇报告加入知识库，摘要重点放在评测方法；再把条目 abc 的工程影响改成适用于多 Agent 路由。”</code></div></div>
      </section>}

      {view === "automation" && <section className="workflow-section" id="workflow">
        <div className="section-heading"><div><p className="eyebrow">AUTOMATED ROUTINES</p><h2>让知识自己保持清醒</h2></div></div>
        <div className="workflow-grid">
          <article><span>PERSONAL · {workspace.radarTime}</span><h3>Multi-source Radar</h3><p>按你的五类来源开关与默认 {workspace.defaultTtlDays} 天有效期整理个人知识视图。</p><code>{workspace.enabledSources.length} sources enabled</code>{bridgeStatus === "connected" && <button type="button" onClick={() => runBridgeRoutine("sync")} disabled={Boolean(bridgeRoutine)}>{bridgeRoutine === "sync" ? "正在采集…" : "由本地 CLI 立即采集"}</button>}</article>
          <article><span>{dayLabels[workspace.auditDay]} · {workspace.auditTime}</span><h3>Freshness Audit</h3><p>提前 {workspace.reviewWindowDays} 天进入复核，过期内容退出默认检索。</p><code>review_window={workspace.reviewWindowDays}d</code>{bridgeStatus === "connected" && <button type="button" onClick={() => runBridgeRoutine("audit")} disabled={Boolean(bridgeRoutine)}>{bridgeRoutine === "audit" ? "正在审计…" : "由本地 CLI 立即审计"}</button>}</article>
          <article><span>MONTHLY · {workspace.gcDay} 日 {workspace.gcTime}</span><h3>Knowledge GC</h3><p>过期超过 {workspace.archiveAfterDays} 天后归档，同时保留来源和审计记录。</p><code>archive_after={workspace.archiveAfterDays}d</code>{bridgeStatus === "connected" && <button type="button" onClick={() => runBridgeRoutine("gc")} disabled={Boolean(bridgeRoutine)}>{bridgeRoutine === "gc" ? "正在归档…" : "由本地 CLI 立即归档"}</button>}</article>
        </div>
        <p className="workflow-note">{bridgeStatus === "connected" ? "本地 CLI 已连接：你的 Fork 是知识事实源；本机负责 AI 导读、自动分类、证据核验和桌宠控制。检查本地差异后提交并推送，Pages 才会长期展示更新。" : "你的 Fork 中的 GitHub Actions 负责持续采集、复核与归档；打开快速开始页可复用本机 CLI 的完整 AI 能力。"}</p>
      </section>}

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
            <p className="settings-lede">来源、时间和过期策略可以手动设置。AI 导读、分类、联网核验与桌宠均复用本机 CLI 登录；长期数据始终以你自己的 GitHub Fork 为准。</p>

            <fieldset className="settings-group bridge-settings">
              <legend>本地 MCP 状态</legend>
              <div className="bridge-heading"><div><strong>{bridgeStatus === "connected" ? "本地 CLI 已接管 AI 能力" : "等待一键安装命令完成"}</strong><p>{bridgeStatus === "connected" ? "导读、分类、证据核验、桌宠和个人调度均由本机执行。" : "无需在网页填写地址、凭据或 API Key；安装器会完成注册、启动和连接。"}</p></div><span className={`bridge-status bridge-${bridgeStatus}`}>{bridgeStatus === "connected" ? "已连接" : bridgeStatus === "connecting" ? "连接中" : bridgeStatus === "error" ? "连接失败" : "未连接"}</span></div>
              {bridgeStatus === "connected" && <div className="bridge-actions"><button type="button" className="clear-button danger-button" onClick={() => void disconnectLocal()}>安全断开本地连接</button></div>}
              <p className="field-note">底层本地服务由安装器管理，只监听 127.0.0.1，使用随机端口和来源白名单，不接受任意 Shell 命令。</p>
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
              <p className="field-note">页面保持打开时，本地 CLI 会按个人时间运行；关闭页面后本地连接自动退出，你的 Fork 中的 GitHub Actions 继续维护知识。</p>
            </fieldset>

            <fieldset className="settings-group">
              <legend>知识更新 / 过期策略</legend>
              <div className="settings-grid">
                <label>默认有效期（天）<input type="number" min="1" max="365" value={workspace.defaultTtlDays} onChange={(event) => setWorkspace((current) => ({ ...current, defaultTtlDays: clamp(event.target.value, 1, 365, current.defaultTtlDays) }))} /></label>
                <label>提前复核（天）<input type="number" min="1" max="90" value={workspace.reviewWindowDays} onChange={(event) => setWorkspace((current) => ({ ...current, reviewWindowDays: clamp(event.target.value, 1, 90, current.reviewWindowDays) }))} /></label>
                <label>过期后归档（天）<input type="number" min="1" max="365" value={workspace.archiveAfterDays} onChange={(event) => setWorkspace((current) => ({ ...current, archiveAfterDays: clamp(event.target.value, 1, 365, current.archiveAfterDays) }))} /></label>
              </div>
            </fieldset>

            <div className="security-note"><strong>无浏览器密钥</strong><p>网站没有 API Key 或模型端点输入框，也不会保存模型凭据。本地地址仅在当前标签页会话中用于刷新重连；本地服务只监听 127.0.0.1，并在页面心跳停止后自动退出。</p></div>
            {notice && <p className="settings-notice" role="alert">{notice}</p>}
            <div className="settings-actions">
              <button type="button" className="primary-button" onClick={() => void saveSettings()}>{bridgeStatus === "connected" ? "写入工作副本并运行本地 AI" : "应用到本次浏览"} <span>✓</span></button>
            </div>
          </section>
        </div>
      )}

      {bridgeStatus === "connected" && (
        <aside className={`pet-agent${petOpen ? " pet-open" : ""}`} aria-label="工作台桌宠 Agent">
          {petOpen && (
            <section className="pet-chat">
              <div className="pet-chat-header"><div><span className="pet-mini">•ᴗ•</span><strong>Local CLI Agent</strong></div><button type="button" onClick={() => setPetOpen(false)} aria-label="收起桌宠对话">×</button></div>
              <div className="pet-messages" aria-live="polite">
                {petMessages.map((message, index) => <p className={message.role} key={`${message.role}-${index}`}>{message.text}</p>)}
                {petLoading && <p className="agent">本地 Agent 正在思考并调整…</p>}
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
