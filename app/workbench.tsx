"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Guide, type WorkspacePatch } from "./ai-guide";

type KnowledgeStatus = "active" | "cleanup" | "archived" | "verified" | "candidate" | "review" | "stale" | "quarantined";
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
  lastVerifiedAt?: string;
  lastSummarizedAt?: string;
  validUntil: string;
  imageUrl?: string;
  cleanupReason?: string;
  cleanupProposedAt?: string;
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
          <span>{aiEnabled ? "AI 中文摘要生成中" : "来源摘录"}</span>
          <small>AUTO CRAWLER</small>
        </div>
        <p>{entry.summary}</p>
        <div className="non-ai-note">{aiEnabled ? "本地 Codex 会自动完成中文摘要、重点提炼与工程影响整理。" : "连接本地 CLI 后，采集流程会自动补齐中文 AI 摘要。"}</div>
        <button type="button" className="guide-button" onClick={onGenerate} disabled={loading}>
          {loading ? "正在生成中文摘要…" : aiEnabled ? "立即生成摘要" : "安装本地 MCP"} <span>✦</span>
        </button>
      </div>
    );
  }
  return (
    <div className={`guide-panel${compact ? " guide-compact" : ""}`}>
      <div className="guide-heading">
        <span>AI 中文导读</span>
        <small>{guide.model}</small>
      </div>
      <div className="guide-badges"><span>{guide.category}</span><span>RAG READY</span></div>
      <p>{guide.summary}</p>
      {!compact && guide.highlights?.length > 0 && <ul className="guide-highlights">{guide.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>}
      <dl>
        <div><dt>工程影响</dt><dd>{guide.impact}</dd></div>
        <div><dt>建议动作</dt><dd>{guide.action}</dd></div>
      </dl>
      <button type="button" className="guide-button" onClick={onGenerate} disabled={loading}>
        {loading ? "正在更新摘要…" : "更新 AI 摘要"} <span>✦</span>
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

type WorkbenchView = "dashboard" | "knowledge" | "sources" | "automation" | "article" | "cleanup";
type PetActivity = "running" | "needs-input" | "ready" | "blocked";

const petActivityLabel: Record<PetActivity, string> = {
  running: "正在工作",
  "needs-input": "等你指令",
  ready: "有空来聊",
  blocked: "需要检查",
};

function PixelPet({ status, compact = false }: { status: PetActivity; compact?: boolean }) {
  return (
    <span className={`pixel-pet pixel-pet-${status}${compact ? " pixel-pet-compact" : ""}`} aria-hidden="true">
      <i className="pixel-ear pixel-ear-left" />
      <i className="pixel-ear pixel-ear-right" />
      <i className="pixel-tail" />
      <span className="pixel-pet-body">
        <i className="pixel-eye pixel-eye-left" />
        <i className="pixel-eye pixel-eye-right" />
        <i className="pixel-muzzle" />
        <i className="pixel-mouth" />
      </span>
      <i className="pixel-status-light" />
    </span>
  );
}

export function Workbench({ entries, initialGuides, initialSettings = defaultWorkspaceSettings, initialSources, view = "dashboard" }: { entries: KnowledgeEntry[]; initialGuides: Record<string, Guide>; initialSettings?: WorkspaceSettings; initialSources: WatchSource[]; view?: WorkbenchView }) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | SourceType>("all");
  const [ragIds, setRagIds] = useState<string[] | null>(null);
  const [ragSearching, setRagSearching] = useState(false);
  const [selectedId, setSelectedId] = useState("");
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
  const [petBlocked, setPetBlocked] = useState(false);
  const [bridgeUrl, setBridgeUrl] = useState("http://127.0.0.1:4317");
  const [bridgeStatus, setBridgeStatus] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [bridgeUpdatedAt, setBridgeUpdatedAt] = useState("");
  const [bridgeRoutine, setBridgeRoutine] = useState<string | null>(null);
  const [petMessages, setPetMessages] = useState<Array<{ role: "agent" | "user"; text: string }>>([
    { role: "agent", text: "我是你的工作台 Agent。告诉我想关注哪些来源、几点更新，或知识多久复核一次。" },
  ]);
  const attemptedInitialConnection = useRef(false);
  const recordedArticleAccess = useRef("");
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const aiEnabled = bridgeStatus === "connected";
  const petActivity: PetActivity = petBlocked ? "blocked" : petLoading ? "running" : petOpen ? "needs-input" : "ready";

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
    const payload = await response.json().catch(() => ({})) as { error?: string; code?: string };
    if (!response.ok) {
      const safeMessages: Record<string, string> = {
        LOCAL_AI_FAILED: "本地 AI 暂时没有完成这次处理，请稍后重试。",
        ROUTINE_FAILED: "本地知识任务没有完成，请稍后重试。",
        KNOWLEDGE_ACTION_FAILED: "知识操作没有完成，请刷新后重试。",
        SEARCH_FAILED: "个人知识检索暂时不可用，请稍后重试。",
        LOCAL_SERVICE_FAILED: "本地能力暂时不可用，请稍后重试。",
      };
      throw new Error(safeMessages[payload.code ?? ""] ?? "本地能力暂时不可用；详细原因仅记录在本机日志中。");
    }
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
      let completed = 0;
      for (let index = 0; index < targets.length; index += 4) {
        const batch = targets.slice(index, index + 4);
        const result = await bridgeRequest("/enhance", {
          method: "POST",
          body: JSON.stringify({ entryIds: batch.map((entry) => entry.id) }),
        }, connection) as { guides?: Record<string, Guide>; snapshot?: BridgeSnapshot };
        if (result.guides) setGuides((current) => ({ ...current, ...result.guides }));
        if (result.snapshot) applyBridgeSnapshot(result.snapshot);
        completed += Object.keys(result.guides ?? {}).length;
        setAutoProgress({ done: Math.min(index + batch.length, targets.length), total: targets.length });
      }
      setNotice(`本地 CLI 已自动完成 ${completed} 条中文摘要并更新 RAG 索引。`);
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
      const targets = currentEntries.filter((entry) => !["cleanup", "archived"].includes(entry.status) && !(
        cached[entry.id] && (!cached[entry.id].sourceVersion || cached[entry.id].sourceVersion === entry.sourceVersion)
      ));
      if (targets.length) void enhanceLocally(targets, { url: nextUrl }).catch(() => {
        setNotice("部分中文摘要尚未生成；详细原因只记录在本机日志中，可稍后重试。");
      });
    } catch {
      setBridgeStatus("error");
      if (!quiet) setNotice("无法连接本地服务；若浏览器询问本地网络访问，请选择允许。详细原因不会显示在网页上。");
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
    setSelectedId(new URLSearchParams(window.location.search).get("entry") ?? "");
  }, []);

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

  const policyEntries = knowledgeEntries;
  const cleanupEntries = policyEntries.filter((entry) => entry.status === "cleanup");
  const activeEntries = policyEntries.filter((entry) => !["cleanup", "archived"].includes(entry.status) && workspace.enabledSources.includes(entry.sourceType));
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = activeEntries.filter((entry) => {
      const matchesSource = sourceFilter === "all" || entry.sourceType === sourceFilter;
      const haystack = [entry.title, entry.summary, entry.impact, entry.action, entry.category, entry.source, ...entry.tags]
        .join(" ")
        .toLowerCase();
      const matchesQuery = !needle || (ragIds ? ragIds.includes(entry.id) : haystack.includes(needle));
      return matchesSource && matchesQuery;
    });
    if (!ragIds) return matched;
    const rank = new Map(ragIds.map((id, index) => [id, index]));
    return matched.sort((left, right) => (rank.get(left.id) ?? 999) - (rank.get(right.id) ?? 999));
  }, [activeEntries, query, ragIds, sourceFilter]);

  const summarized = activeEntries.filter((entry) => Boolean(guides[entry.id])).length;
  const illustrated = activeEntries.filter((entry) => Boolean(entry.imageUrl)).length;
  const radar = activeEntries.slice(0, 3);
  const selectedEntry = activeEntries.find((entry) => entry.id === selectedId) ?? cleanupEntries.find((entry) => entry.id === selectedId);

  useEffect(() => {
    if (view !== "knowledge" || bridgeStatus !== "connected" || !query.trim()) {
      setRagIds(null);
      setRagSearching(false);
      return;
    }
    let cancelled = false;
    setRagSearching(true);
    const timer = window.setTimeout(() => {
      void bridgeRequest("/search", { method: "POST", body: JSON.stringify({ query, topK: 50 }) })
        .then((payload) => {
          if (cancelled) return;
          const results = (payload as { results?: Array<{ id: string }> }).results ?? [];
          setRagIds(results.map((result) => result.id));
        })
        .catch(() => { if (!cancelled) setRagIds(null); })
        .finally(() => { if (!cancelled) setRagSearching(false); });
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [bridgeRequest, bridgeStatus, query, view]);

  useEffect(() => {
    if (view !== "article" || bridgeStatus !== "connected" || !selectedEntry || recordedArticleAccess.current === selectedEntry.id) return;
    recordedArticleAccess.current = selectedEntry.id;
    void bridgeRequest("/knowledge/access", { method: "POST", body: JSON.stringify({ id: selectedEntry.id }) }).catch(() => {});
  }, [bridgeRequest, bridgeStatus, selectedEntry, view]);

  const generateGuide = async (entry: KnowledgeEntry) => {
    if (bridgeStatus !== "connected") {
      setNotice("请先在快速开始页安装本地 MCP，再生成中文摘要。");
      window.location.assign(`${basePath}/quickstart`);
      return;
    }
    setLoadingId(entry.id);
    setNotice("");
    try {
      await enhanceLocally([entry]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "中文摘要暂时没有生成，请稍后重试。");
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
      await enhanceLocally(targets);
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
      setNotice(routine === "sync" ? "采集、中文摘要和 RAG 索引已由本地 CLI 自动完成。" : "知识清洗已完成；需要决定去留的内容已移入待清理区。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "本地任务执行失败");
    } finally {
      setBridgeRoutine(null);
    }
  };

  const resolveCleanup = async (entry: KnowledgeEntry, decision: "keep" | "archive") => {
    if (bridgeStatus !== "connected") {
      setNotice("连接本地 CLI 后才能保存清理决定。");
      return;
    }
    try {
      const result = await bridgeRequest("/knowledge/cleanup", { method: "POST", body: JSON.stringify({ id: entry.id, decision }) }) as { snapshot?: BridgeSnapshot };
      if (result.snapshot) applyBridgeSnapshot(result.snapshot);
      setNotice(decision === "keep" ? "已保留这条知识，并延长其保留时间。" : "已将这条知识移入可恢复归档。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "清理决定没有保存，请稍后重试。");
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
    setPetBlocked(false);
    try {
      const result = await bridgeRequest("/agent", { method: "POST", body: JSON.stringify({ message }) }) as { reply: string; snapshot?: BridgeSnapshot };
      if (result.snapshot) applyBridgeSnapshot(result.snapshot);
      setPetMessages((current) => [...current, { role: "agent", text: result.reply }]);
    } catch (error) {
      setPetBlocked(true);
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
          <Link className={view === "knowledge" || view === "article" ? "active" : ""} href="/knowledge">知识库</Link>
          <Link className={view === "sources" ? "active" : ""} href="/sources">来源</Link>
          <Link className={view === "automation" ? "active" : ""} href="/automation">自动化</Link>
          <Link className={view === "cleanup" ? "active" : ""} href="/cleanup">待清理{cleanupEntries.length ? ` · ${cleanupEntries.length}` : ""}</Link>
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
        <span>{aiEnabled ? "自动中文摘要 · RAG 召回 · GC 清洗" : "当前 Fork 知识 · 等待本地 CLI"}</span>
        {autoProgress && <span className="mode-progress">正在增强 {autoProgress.done}/{autoProgress.total}</span>}
        {bridgeStatus === "connected" && <span className="bridge-indicator">本地 CLI 正在驱动 · {bridgeUpdatedAt ? new Date(bridgeUpdatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "已连接"}</span>}
        {cleanupEntries.length > 0 && <Link className="cleanup-reminder" href="/cleanup">{cleanupEntries.length} 条知识等待决定去留 →</Link>}
        {notice && !settingsOpen && <button type="button" onClick={() => setNotice("")} aria-label="关闭通知">{notice} ×</button>}
      </div>

      {view === "dashboard" && <>
      <section className="metrics dashboard-metrics" aria-label="知识指标">
        <article><span>01</span><strong>{activeEntries.length}</strong><p>活跃知识</p></article>
        <article><span>02</span><strong>{summarized}</strong><p>AI 中文摘要</p></article>
        <article><span>03</span><strong>{illustrated}</strong><p>来源配图</p></article>
        <article><span>04</span><strong>{watchSources.length}</strong><p>个人来源</p></article>
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
              </div>
              {entry.imageUrl && <img className="radar-card-image" src={entry.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}
              <h3><Link className="article-title-link" href={`/article?entry=${encodeURIComponent(entry.id)}`}>{entry.title}</Link></h3>
              <GuidePanel entry={entry} guide={guides[entry.id]} loading={loadingId === entry.id} onGenerate={() => generateGuide(entry)} aiEnabled={aiEnabled} compact />
              <div className="card-footer">
                <span>{entry.source} · 有效至 {entry.validUntil}</span>
                <a href={entry.sourceUrl} target="_blank" rel="noreferrer" aria-label={`打开 ${entry.title} 的来源`}>直达原文 ↗</a>
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
          <p>五类来源只定义验证方法；SDK、MCP、评测等具体类目，以及每一个 GitHub / RSS 监测源，都由用户通过 Agent 工具创建和修改。</p>
        </div>
        <div className="source-grid">
          {sourceTypes.map((source) => {
            const enabled = workspace.enabledSources.includes(source.id);
            const count = policyEntries.filter((entry) => !["cleanup", "archived"].includes(entry.status) && entry.sourceType === source.id).length;
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
          {watchSources.length === 0 && <div className="empty-state"><strong>这是一个空框架。</strong><p>连接本地 CLI 后，让 Agent 创建你的第一个类目和监测源。</p></div>}
        </div>
        <div className="cli-chat-callout"><span>MCP CONTROL</span><div><strong>直接告诉 Codex 或像素桌宠你想关注什么</strong><p>Agent 会读取工作台资源，调用 MCP 创建类目、增改监测源，并展示 Git 差异。</p><code>“新建 SDK 类目，关注 owner/repo 的 Release，14 天复核；再把 SDK 类目改名为 Agent SDK。”</code></div></div>
      </section></>}

      {view === "automation" && <section className="freshness-section page-section" id="freshness">
        <div className="freshness-copy">
          <p className="eyebrow">KNOWLEDGE FRESHNESS</p>
          <h2>采集即整理，GC 负责清洗。</h2>
          <p>{aiEnabled
            ? "每次采集都会自动生成中文摘要、重点与工程影响，并重建个人 RAG 索引。定时 GC 只把低使用、重复或长期失效的内容移入待清理区，不会直接删除。"
            : "连接本地 CLI 后，采集、中文摘要、RAG 索引和知识清洗会组成一条自动流水线。网页无需保存任何模型密钥。"}</p>
          <div className="lifecycle" aria-label="知识生命周期">
            <span>多源采集</span><i>→</i><span>中文摘要</span><i>→</i><span>RAG 索引</span><i>→</i><span>定时清洗</span>
          </div>
          <button type="button" className="primary-button policy-button" onClick={() => setSettingsOpen(true)}>配置来源、时间与过期策略 <span>→</span></button>
        </div>
        <div className="expiry-panel">
          <div className="expiry-header"><span>待清理区</span><strong>{cleanupEntries.length}</strong></div>
          <p className="gc-panel-copy">GC 只提出清理建议。最终保留或归档由你在独立页面决定。</p>
          <div className="gc-panel-stats"><span>活跃知识 <b>{activeEntries.length}</b></span><span>AI 摘要 <b>{summarized}</b></span><span>索引可召回 <b>{activeEntries.length}</b></span></div>
          <Link className="audit-link" href="/cleanup">打开待清理区 <span>↗</span></Link>
        </div>
      </section>}

      {view === "knowledge" && <section className="section library page-section" id="knowledge">
        <div className="section-heading library-heading">
          <div><p className="eyebrow">GUIDED LIBRARY</p><h2>知识库与导读</h2></div>
          <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="用自然语言搜索个人知识…" aria-label="搜索知识库" /><small>{ragSearching ? "RAG 召回中" : bridgeStatus === "connected" && query ? "RAG 结果" : "本地筛选"}</small></label>
        </div>
        <div className="filter-groups">
          <div className="filter-row" role="group" aria-label="来源筛选">
            <span className="filter-label">来源</span>
            <button className={sourceFilter === "all" ? "active" : ""} onClick={() => setSourceFilter("all")}>全部</button>
            {sourceTypes.map((source) => <button key={source.id} className={sourceFilter === source.id ? "active" : ""} onClick={() => setSourceFilter(source.id)}>{source.label}</button>)}
          </div>
          <div className="filter-row"><span className="filter-label">召回</span><span className="result-count">{filtered.length} 个结果 · {bridgeStatus === "connected" ? "个人 RAG 索引" : "当前页面索引"}</span></div>
        </div>
        <div className="knowledge-grid">
          {filtered.map((entry) => (
            <article className="knowledge-card" key={entry.id}>
              <div className="knowledge-card-top">
                <span className="knowledge-icon">{categoryMark[entry.category] ?? "KN"}</span>
                <div><span>{sourceLabel[entry.sourceType]} · {entry.source}</span><h3><Link className="article-title-link" href={`/article?entry=${encodeURIComponent(entry.id)}`}>{entry.title}</Link></h3></div>
              </div>
              {entry.imageUrl && <img className="knowledge-card-image" src={entry.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}
              <GuidePanel entry={entry} guide={guides[entry.id]} loading={loadingId === entry.id} onGenerate={() => generateGuide(entry)} aiEnabled={aiEnabled} />
              <div className="knowledge-card-bottom">
                <span>{entry.sourceVersion}</span><span>收录 {entry.observedAt.slice(0, 10)}</span>
                <a href={entry.sourceUrl} target="_blank" rel="noreferrer">直达原文 ↗</a>
              </div>
            </article>
          ))}
          {filtered.length === 0 && <div className="empty-state">没有符合条件的知识条目。</div>}
        </div>
        <div className="cli-chat-callout knowledge-chat-callout"><span>CLI CHAT</span><div><strong>用聊天检索、新增或修改知识</strong><p>Codex 会先通过个人 RAG 索引召回相关内容，再调用 MCP 更新当前 Fork。</p><code>“从我的知识库召回与多 Agent 评测有关的内容，总结可以直接复用的工程方法。”</code></div></div>
      </section>}

      {view === "article" && <section className="article-page page-section">
        <Link className="article-back" href="/knowledge">← 返回知识库</Link>
        {selectedEntry ? <article className="article-detail">
          <header className="article-detail-header">
            <div className="article-kicker"><span>{sourceLabel[selectedEntry.sourceType]}</span><i />{selectedEntry.source}<i />{selectedEntry.observedAt.slice(0, 10)}</div>
            <h1>{selectedEntry.title}</h1>
            <p>{guides[selectedEntry.id]?.summary ?? selectedEntry.summary}</p>
            <div className="article-actions"><a className="primary-button" href={selectedEntry.sourceUrl} target="_blank" rel="noreferrer">直达原文 <span>↗</span></a><span>由本地 Codex 自动生成中文摘要</span></div>
          </header>
          <figure className={`article-visual${selectedEntry.imageUrl ? " has-image" : " article-visual-fallback"}`}>
            {selectedEntry.imageUrl ? <img src={selectedEntry.imageUrl} alt={`${selectedEntry.title} 的来源配图`} referrerPolicy="no-referrer" /> : <div><span>{categoryMark[selectedEntry.category] ?? "KN"}</span><strong>{selectedEntry.category}</strong><small>{selectedEntry.source}</small></div>}
            <figcaption>来源配图 · 图片版权归原发布者所有</figcaption>
          </figure>
          <div className="article-content-grid">
            <div className="article-main-copy">
              <section><p className="eyebrow">AI SUMMARY</p><h2>这篇内容讲了什么</h2><p>{guides[selectedEntry.id]?.summary ?? selectedEntry.summary}</p></section>
              {guides[selectedEntry.id]?.highlights?.length ? <section><p className="eyebrow">KEY POINTS</p><h2>核心要点</h2><ol>{guides[selectedEntry.id].highlights.map((highlight, index) => <li key={highlight}><span>{String(index + 1).padStart(2, "0")}</span><p>{highlight}</p></li>)}</ol></section> : <section className="article-summary-pending"><p>中文重点正在由本地 Codex 自动生成。</p><button type="button" onClick={() => void generateGuide(selectedEntry)} disabled={loadingId === selectedEntry.id}>{loadingId === selectedEntry.id ? "正在生成…" : "立即生成摘要"}</button></section>}
            </div>
            <aside className="article-insights">
              <div><span>ENGINEERING IMPACT</span><p>{guides[selectedEntry.id]?.impact ?? selectedEntry.impact}</p></div>
              <div><span>NEXT ACTION</span><p>{guides[selectedEntry.id]?.action ?? selectedEntry.action}</p></div>
              <div><span>SOURCE</span><p>{selectedEntry.source}</p><a href={selectedEntry.sourceUrl} target="_blank" rel="noreferrer">打开原始文章 ↗</a></div>
            </aside>
          </div>
        </article> : <div className="empty-state article-empty"><strong>没有找到这篇知识。</strong><p>它可能尚未从私人仓库载入，或已经被移入归档。</p><Link href="/knowledge">返回知识库 →</Link></div>}
      </section>}

      {view === "cleanup" && <section className="section cleanup-page page-section">
        <div className="section-heading"><div><p className="eyebrow">CLEANUP REVIEW</p><h2>决定知识的最终去留</h2><p className="section-lede">GC 只把可能失效、重复或长期未使用的内容移到这里，不会自动删除。保留会延长生命周期；归档仍可从 Git 历史恢复。</p></div></div>
        <div className="cleanup-grid">
          {cleanupEntries.map((entry) => <article className="cleanup-card" key={entry.id}>
            <div><span>{sourceLabel[entry.sourceType]}</span><small>{entry.source}</small></div>
            <h3><Link className="article-title-link" href={`/article?entry=${encodeURIComponent(entry.id)}`}>{entry.title}</Link></h3>
            <p>{entry.cleanupReason || "GC 建议清理这条知识。"}</p>
            <div className="cleanup-card-actions"><button type="button" onClick={() => void resolveCleanup(entry, "keep")} disabled={bridgeStatus !== "connected"}>保留知识</button><button type="button" className="archive-button" onClick={() => void resolveCleanup(entry, "archive")} disabled={bridgeStatus !== "connected"}>移入归档</button></div>
          </article>)}
          {cleanupEntries.length === 0 && <div className="empty-state"><strong>待清理区是空的。</strong><p>GC 当前没有提出需要你决定去留的知识。</p><Link href="/knowledge">返回知识库 →</Link></div>}
        </div>
      </section>}

      {view === "automation" && <section className="workflow-section" id="workflow">
        <div className="section-heading"><div><p className="eyebrow">AUTOMATED ROUTINES</p><h2>让知识自己保持清醒</h2></div></div>
        <div className="workflow-grid">
          <article><span>PERSONAL · {workspace.radarTime}</span><h3>Multi-source Radar</h3><p>按你的五类来源开关与默认 {workspace.defaultTtlDays} 天有效期整理个人知识视图。</p><code>{workspace.enabledSources.length} sources enabled</code>{bridgeStatus === "connected" && <button type="button" onClick={() => runBridgeRoutine("sync")} disabled={Boolean(bridgeRoutine)}>{bridgeRoutine === "sync" ? "正在采集…" : "由本地 CLI 立即采集"}</button>}</article>
          <article><span>{dayLabels[workspace.auditDay]} · {workspace.auditTime}</span><h3>轻量知识清洗</h3><p>定期清理短期噪声；高频使用的知识会获得更长保留时间。</p><code>cleanup_buffer={workspace.reviewWindowDays}d</code>{bridgeStatus === "connected" && <button type="button" onClick={() => runBridgeRoutine("audit")} disabled={Boolean(bridgeRoutine)}>{bridgeRoutine === "audit" ? "正在清洗…" : "立即轻量清洗"}</button>}</article>
          <article><span>MONTHLY · {workspace.gcDay} 日 {workspace.gcTime}</span><h3>深度 Knowledge GC</h3><p>识别重复、失效和长期未使用内容，只移入待清理区，不直接删除。</p><code>retention_buffer={workspace.archiveAfterDays}d</code>{bridgeStatus === "connected" && <button type="button" onClick={() => runBridgeRoutine("gc")} disabled={Boolean(bridgeRoutine)}>{bridgeRoutine === "gc" ? "正在清洗…" : "立即深度清洗"}</button>}</article>
        </div>
        <p className="workflow-note">{bridgeStatus === "connected" ? "本地 CLI 已连接：采集会自动生成中文摘要并重建 RAG 索引；GC 只提出清理建议，最终去留由你决定。" : "连接本地 CLI 后可运行完整的采集、摘要、RAG 索引与知识清洗流水线。"}</p>
      </section>}

      <footer>
        <div><span className="brand-mark">AW</span><strong>Agent Workbench</strong></div>
        <p>AI summarizes. RAG recalls. GC cleans.</p>
        <span>Git-backed · Private-by-design · Agent-ready</span>
      </footer>

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="settings-topline"><span>PERSONAL WORKBENCH</span><button type="button" onClick={() => setSettingsOpen(false)} aria-label="关闭工作台设置">×</button></div>
            <h2 id="settings-title">配置你的工作台</h2>
            <p className="settings-lede">来源、时间和清洗策略可以手动设置。中文摘要、RAG 索引、知识清洗与桌宠均复用本机 CLI；长期数据始终以你自己的 GitHub Fork 为准。</p>

            <fieldset className="settings-group bridge-settings">
              <legend>本地 MCP 状态</legend>
              <div className="bridge-heading"><div><strong>{bridgeStatus === "connected" ? "本地 CLI 已接管 AI 能力" : "等待一键安装命令完成"}</strong><p>{bridgeStatus === "connected" ? "中文摘要、RAG 召回、GC 清洗、桌宠和个人调度均由本机执行。" : "无需在网页填写地址、凭据或 API Key；安装器会完成注册、启动和连接。"}</p></div><span className={`bridge-status bridge-${bridgeStatus}`}>{bridgeStatus === "connected" ? "已连接" : bridgeStatus === "connecting" ? "连接中" : bridgeStatus === "error" ? "连接失败" : "未连接"}</span></div>
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
                <label>每周轻量清洗<select value={workspace.auditDay} onChange={(event) => setWorkspace((current) => ({ ...current, auditDay: event.target.value }))}>{Object.entries(dayLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label>轻量清洗时间<input type="time" value={workspace.auditTime} onChange={(event) => setWorkspace((current) => ({ ...current, auditTime: event.target.value }))} /></label>
                <label>每月深度清洗日<input type="number" min="1" max="28" value={workspace.gcDay} onChange={(event) => setWorkspace((current) => ({ ...current, gcDay: clamp(event.target.value, 1, 28, current.gcDay) }))} /></label>
                <label>深度清洗时间<input type="time" value={workspace.gcTime} onChange={(event) => setWorkspace((current) => ({ ...current, gcTime: event.target.value }))} /></label>
              </div>
              <p className="field-note">页面保持打开时，本地 CLI 会按个人时间运行；关闭页面后本地连接自动退出，你的 Fork 中的 GitHub Actions 继续维护知识。</p>
            </fieldset>

            <fieldset className="settings-group">
              <legend>知识更新 / 清洗策略</legend>
              <div className="settings-grid">
                <label>默认有效期（天）<input type="number" min="1" max="365" value={workspace.defaultTtlDays} onChange={(event) => setWorkspace((current) => ({ ...current, defaultTtlDays: clamp(event.target.value, 1, 365, current.defaultTtlDays) }))} /></label>
                <label>轻量清洗缓冲（天）<input type="number" min="1" max="90" value={workspace.reviewWindowDays} onChange={(event) => setWorkspace((current) => ({ ...current, reviewWindowDays: clamp(event.target.value, 1, 90, current.reviewWindowDays) }))} /></label>
                <label>高龄知识保留缓冲（天）<input type="number" min="1" max="365" value={workspace.archiveAfterDays} onChange={(event) => setWorkspace((current) => ({ ...current, archiveAfterDays: clamp(event.target.value, 1, 365, current.archiveAfterDays) }))} /></label>
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
              <div className="pet-chat-header"><div><PixelPet status={petActivity} compact /><span><strong>Workbench Agent</strong><small>{petActivityLabel[petActivity]} · LOCAL MCP</small></span></div><button type="button" onClick={() => setPetOpen(false)} aria-label="收起桌宠对话">×</button></div>
              <div className="pet-messages" aria-live="polite">
                {petMessages.map((message, index) => <p className={message.role} key={`${message.role}-${index}`}>{message.text}</p>)}
                {petLoading && <p className="agent">本地 Agent 正在读取 MCP 状态并执行工具…</p>}
              </div>
              <form onSubmit={sendPetMessage}>
                <input value={petInput} onChange={(event) => setPetInput(event.target.value)} placeholder="例如：新增一个监测源，把 SDK 类目改名" aria-label="向工作台 Agent 发送消息" />
                <button type="submit" disabled={petLoading || !petInput.trim()}>↑</button>
              </form>
            </section>
          )}
          <button type="button" className="pet-button" onClick={() => setPetOpen((open) => !open)} aria-expanded={petOpen}>
            <PixelPet status={petActivity} />
            <small><i />{petOpen ? "收起面板" : petActivityLabel[petActivity]}</small>
          </button>
        </aside>
      )}
    </main>
  );
}
