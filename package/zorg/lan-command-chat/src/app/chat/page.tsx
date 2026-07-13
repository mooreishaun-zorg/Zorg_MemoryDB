"use client";

import Image from "next/image";
import { DragEvent, KeyboardEvent, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import packageMetadata from "../../../package.json";

type Role = "assistant" | "user" | "system";

const LAN_CHAT_RELEASE_VERSION = packageMetadata.version;

type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  timestamp?: number;
  attachments?: ChatAttachment[];
};

type ChatAttachment = {
  name: string;
  type: string;
  size: number;
  url: string;
  path?: string;
  containerPath?: string;
};

type DialMetric = {
  value: number;
  min: number;
  max: number;
  unit: string;
  status: string;
};

type DbStatus = {
  sampledAt?: string;
  metrics?: Record<string, DialMetric>;
  details?: Record<string, number | string | undefined>;
  healthScore?: number;
  degraded?: boolean;
};

type QueryEntry = {
  id: string;
  kind?: string;
  title: string;
  query: string;
  result: string;
};

type DbQueries = {
  sampledAt?: string;
  entries?: QueryEntry[];
};

type ChatStatus = {
  sessionKey?: string;
  label?: string;
  model?: string;
  thinking?: string;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  tokensLimit?: number;
  tokensPercent?: number;
  agentId?: string;
  degraded?: boolean;
};

type ActivityEntry = {
  kind: "thinking" | "tool" | "result" | "assistant" | "user" | "status";
  label: string;
  detail?: string;
  timestamp?: number;
};

type ActivityPayload = {
  sampledAt?: string;
  active?: boolean;
  phase?: string;
  label?: string;
  events?: ActivityEntry[];
  degraded?: boolean;
};

type TuiPayload = {
  active?: boolean;
  session?: string;
  command?: string;
  sampledAt?: string;
  screen?: string;
  error?: string;
};

const androidInstallUrl = process.env.NEXT_PUBLIC_ANDROID_INSTALL_URL ||
  "https://github.com/StefRush2099/Zorg_MemoryDB/releases/latest/download/lan-command-chat-android.apk";

function pollIntervalFromEnv(value: string | undefined, fallback: number, min: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? Math.max(parsed, min) : fallback;
}

const CHAT_POLL_MS = pollIntervalFromEnv(process.env.NEXT_PUBLIC_CHAT_POLL_MS, 12_000, 5_000);
const DB_POLL_MS = pollIntervalFromEnv(process.env.NEXT_PUBLIC_DB_POLL_MS, 10_000, 5_000);
const MAX_DROP_FILES = 12;
const STORAGE_KEY = "lan-chat:v2:draft";
const GAUGE_VIEW_KEY = "lan-chat:gauge-view";
const DEFAULT_IDENTITY = "Zorg Rush";

const emptyStatus: ChatStatus = { label: "local", model: "unknown", thinking: "unknown" };

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function buildMemory3dFrameSrc(theme: "light" | "dark") {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams({ theme, embed: "lan-chat-gauges" });
  const { hostname, port } = window.location;
  if (port === "3001") {
    const direct = new URL(window.location.href);
    direct.protocol = "http:";
    direct.hostname = hostname || "127.0.0.1";
    direct.port = "8097";
    direct.pathname = "/";
    direct.search = params.toString();
    direct.hash = "";
    return direct.toString();
  }
  return `/memory-3d-proxy/?${params.toString()}`;
}

function formatBytes(value?: number) {
  if (!value || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}


function formatTuiTokenNumber(value?: number) {
  if (!value || value <= 0) return "0";
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}m`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}k`;
  return `${Math.round(value)}`;
}

function formatTokenCount(status?: ChatStatus) {
  const input = status?.inputTokens ?? 0;
  const output = status?.outputTokens ?? 0;
  if (input > 0 || output > 0) return `${formatTuiTokenNumber(input)} in / ${formatTuiTokenNumber(output)} out`;
  const total = status?.tokensUsed ?? 0;
  return total > 0 ? `${formatTuiTokenNumber(total)} total` : "0 in / 0 out";
}

function displayThinking(value?: string) {
  const cleaned = value?.trim();
  if (!cleaned || cleaned.toLowerCase() === "default") return "unknown";
  return cleaned;
}

function formatMemoryUsage(usedBytes?: number, totalBytes?: number, usedPercent?: number) {
  const percent = typeof usedPercent === "number" && Number.isFinite(usedPercent) ? usedPercent : 0;
  if (!usedBytes || !totalBytes) return percent > 0 ? `${percent.toFixed(1)}% used` : "memory n/a";
  return `${formatBytes(usedBytes)} / ${formatBytes(totalBytes)} · ${percent.toFixed(1)}%`;
}

function formatTime(value?: number | string) {
  if (!value) return "never";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatGHz(value: unknown) {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(numeric) && numeric > 0 ? `${numeric.toFixed(2)} GHz` : "GHz n/a";
}

function roleLabel(role: Role, identity: string) {
  if (role === "assistant") return identity || DEFAULT_IDENTITY;
  if (role === "system") return "System";
  return "You";
}

function redactSensitiveText(text: string) {
  return text
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-••••REDACTED••••")
    .replace(/(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*[^\s`'\"]+/gi, (match) => {
      const separator = match.includes("=") ? "=" : ":";
      return `${match.split(separator)[0]}${separator}••••REDACTED••••`;
    });
}

function isImageAttachment(file: Pick<ChatAttachment, "type" | "url" | "name">) {
  return file.type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name || file.url || "");
}

function safeAttachmentUrl(url: string) {
  if (!url) return "";
  if (url.startsWith("/uploads/")) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin ? parsed.pathname + parsed.search : "";
  } catch {
    return "";
  }
}

function pickAudioMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) || "";
}

function secureMicUrl() {
  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return window.location.href;
  return `https://${host}${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function micUnavailableReason() {
  if (typeof window === "undefined") return "Microphone is unavailable in this browser.";
  if (!window.isSecureContext) return `Microphone requires the secure HTTPS console: ${secureMicUrl()}`;
  if (!navigator.mediaDevices?.getUserMedia) return "This browser does not expose microphone recording APIs.";
  if (typeof MediaRecorder === "undefined") return "This browser does not expose the MediaRecorder API.";
  return "";
}

function metricLabel(key: string) {
  const labels: Record<string, string> = {
    queriesPerSecond: "Queries / sec",
    cacheHitRatio: "Cache hit",
    contextWindow: "Context window",
    dbSize: "Storage used",
  };
  return labels[key] || key.replace(/[A-Z]/g, (m) => ` ${m}`).trim();
}

function normalizeMetric(metric?: DialMetric): DialMetric {
  if (!metric) return { value: 0, min: 0, max: 100, unit: "", status: "unknown" };
  const min = Number.isFinite(metric.min) ? metric.min : 0;
  const max = Number.isFinite(metric.max) && metric.max !== min ? metric.max : 100;
  const value = Number.isFinite(metric.value) ? metric.value : 0;
  return { ...metric, min, max, value };
}

function Gauge({ label, metric }: { label: string; metric?: DialMetric }) {
  const safe = normalizeMetric(metric);
  const span = safe.max - safe.min || 1;
  const ratio = Math.min(1, Math.max(0, (safe.value - safe.min) / span));
  const angle = -122 + ratio * 244;
  const status = safe.status || "steady";
  return (
    <div className="gauge-card">
      <div className="gauge-meta">
        <span>{label}</span>
        <b className={`pill status-${status}`}>{status}</b>
      </div>
      <div className="gauge-face" style={{ ["--gauge-angle" as string]: `${angle}deg` }}>
        <div className="gauge-arc" />
        <div className="gauge-needle" />
        <div className="gauge-hub" />
        <div className="gauge-value">
          <strong>{Math.round(safe.value * 10) / 10}</strong>
          <span>{safe.unit}</span>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, identity }: { message: ChatMessage; identity: string }) {
  const chunks = redactSensitiveText(message.text).split("\n");
  const attachments = message.attachments ?? [];
  return (
    <article className={cx("message", `message-${message.role}`)}>
      <header>
        <span>{roleLabel(message.role, identity)}</span>
        <time>{formatTime(message.timestamp)}</time>
      </header>
      <div className="message-body">
        {chunks.map((line, index) => (
          <p key={`${message.id}-${index}`}>{line || "\u00a0"}</p>
        ))}
      </div>
      {attachments.length ? (
        <div className="message-attachments">
          {attachments.map((file, index) => {
            const href = safeAttachmentUrl(file.url);
            const label = `${file.name} · ${formatBytes(file.size)}`;
            return (
              <a className={cx("message-attachment", isImageAttachment(file) && "image")} href={href || undefined} target="_blank" rel="noreferrer" key={`${file.url || file.name}-${index}`}>
                {href && isImageAttachment(file) ? (
                  <Image src={href} alt={file.name} width={160} height={120} unoptimized />
                ) : (
                  <span className="file-icon">📎</span>
                )}
                <span>{label}</span>
              </a>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

function QueryReadout({ payload, error }: { payload: DbQueries | null; error: string | null }) {
  const entries = payload?.entries ?? [];
  return (
    <section className="query-panel panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">PostgreSQL live readout</p>
        </div>
        <span className="mini">{payload?.sampledAt ? formatTime(payload.sampledAt) : "warming"}</span>
      </div>
      <div className="query-log">
        {error ? <div className="query-error">{error}</div> : null}
        {!error && entries.length === 0 ? <div className="query-empty">No active query pressure. Listening…</div> : null}
        {entries.map((entry) => (
          <div className="query-entry" key={entry.id}>
            <div className="query-title">{entry.title}</div>
            <code>{entry.query || "—"}</code>
            <span>{entry.result}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TuiConsole({
  payload,
  input,
  busy,
  onInput,
  onSend,
  onStart,
  onRestart,
  onKey,
  inputRef,
  scrollRequestId,
}: {
  payload: TuiPayload | null;
  input: string;
  busy: boolean;
  onInput: (value: string) => void;
  onSend: () => void;
  onStart: () => void;
  onRestart: () => void;
  onKey: (key: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  scrollRequestId: number;
}) {
  const screen = payload?.screen || (payload?.error ? `TUI unavailable: ${payload.error}` : "Opening openclaw tui…");
  const screenRef = useRef<HTMLPreElement | null>(null);
  const didInitialScrollRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    window.requestAnimationFrame(() => {
      const el = screenRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  useEffect(() => {
    if (!payload?.screen || didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;
    scrollToBottom();
  }, [payload?.screen, scrollToBottom]);

  useEffect(() => {
    if (scrollRequestId <= 0) return;
    scrollToBottom();
  }, [scrollRequestId, scrollToBottom]);

  return (
    <section className="tui-panel">
      <div className="tui-toolbar">
        <div className="tui-actions">
          <button className="ghost" onClick={onStart} disabled={busy}>Open</button>
          <button className="ghost" onClick={() => onKey("ctrlc")} disabled={busy}>Ctrl-C</button>
          <button className="ghost" onClick={onRestart} disabled={busy}>Restart</button>
        </div>
      </div>
      <pre ref={screenRef} className="tui-screen" aria-label="openclaw tui screen output">{screen}</pre>
      <div className="tui-command-row">
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => onInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder="Type into openclaw tui and press Enter"
          spellCheck={false}
        />
        <button className="primary" onClick={onSend} disabled={busy || !input.trim()}>Send</button>
      </div>
      <div className="tui-key-row">
        {["up", "down", "left", "right", "tab", "escape", "enter"].map((key) => (
          <button className="ghost" key={key} onClick={() => onKey(key)} disabled={busy}>{key}</button>
        ))}
        <span className="mini">{payload?.active ? `session ${payload.session || "open"}` : "session warming"} · {payload?.sampledAt ? formatTime(payload.sampledAt) : "not sampled"}</span>
      </div>
    </section>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>(emptyStatus);
  const [activity, setActivity] = useState<ActivityPayload | null>(null);
  const [tui, setTui] = useState<TuiPayload | null>(null);
  const [tuiInput, setTuiInput] = useState("");
  const [tuiBusy, setTuiBusy] = useState(false);
  const [tuiScrollRequestId, setTuiScrollRequestId] = useState(0);
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [dbQueries, setDbQueries] = useState<DbQueries | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [identity, setIdentity] = useState(DEFAULT_IDENTITY);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [gaugeView, setGaugeView] = useState<"gauges" | "memory3d">("gauges");

  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const tuiInputRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const metrics = dbStatus?.metrics ?? {};
  const contextWindowMetric: DialMetric = {
    value: Number.isFinite(status.tokensUsed) ? Math.max(0, status.tokensUsed ?? 0) : 0,
    min: 0,
    max: status.tokensLimit && status.tokensLimit > 0 ? status.tokensLimit : 1,
    unit: "tokens",
    status: status.tokensLimit && status.tokensLimit > 0 ? "live" : "unavailable",
  };
  const rawCpuGHz = Number(dbStatus?.details?.cpuGHz ?? 0);
  const cpuCapacityGHz = Number(dbStatus?.details?.cpuCapacityGHz ?? 0);
  const cpuGHz = formatGHz(rawCpuGHz);
  const cpuRatio = Math.min(1, Math.max(0, rawCpuGHz / Math.max(cpuCapacityGHz, 1)));
  const memoryUsedBytes = Number(dbStatus?.details?.memoryUsedBytes ?? 0);
  const memoryTotalBytes = Number(dbStatus?.details?.memoryTotalBytes ?? 0);
  const memoryUsedPercent = Number(dbStatus?.details?.memoryUsedPercent ?? 0);
  const memoryRatio = Math.min(1, Math.max(0, memoryUsedPercent / 100));
  const dragActive = dragDepth > 0;
  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !sending && !uploading;

  const memory3dFrameSrc = useMemo(() => buildMemory3dFrameSrc(theme), [theme]);

  const showNotice = useCallback((message: string | null, durationMs = 0) => {
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setNotice(message);
    if (message && durationMs > 0) {
      noticeTimerRef.current = window.setTimeout(() => {
        setNotice((current) => (current === message ? null : current));
        noticeTimerRef.current = null;
      }, durationMs);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/chat/history", { cache: "no-store" });
    if (!res.ok) throw new Error("chat history unavailable");
    const data = await res.json();
    setMessages(Array.isArray(data?.messages) ? data.messages : []);
    setLastSync(new Date().toISOString());
  }, []);

  const loadStatus = useCallback(async () => {
    const [chatRes, identityRes] = await Promise.allSettled([
      fetch("/api/chat/status", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("status unavailable")))),
      fetch("/api/chat/identity", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("identity unavailable")))),
    ]);
    if (chatRes.status === "fulfilled") setStatus(chatRes.value || emptyStatus);
    if (identityRes.status === "fulfilled" && typeof identityRes.value?.name === "string") setIdentity(identityRes.value.name);
  }, []);

  const loadActivity = useCallback(async () => {
    const res = await fetch("/api/chat/activity", { cache: "no-store" });
    if (!res.ok) throw new Error("activity unavailable");
    const data = await res.json();
    setActivity(data || null);
  }, []);

  const loadTui = useCallback(async () => {
    const res = await fetch("/api/tui", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "TUI unavailable");
    setTui(data || null);
  }, []);

  const postTui = useCallback(async (body: Record<string, string>, options?: { scrollAfter?: boolean }) => {
    setTuiBusy(true);
    try {
      const res = await fetch("/api/tui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "TUI command failed");
      setTui(data || null);
      if (options?.scrollAfter) setTuiScrollRequestId((value) => value + 1);
    } catch (error) {
      setTui((current) => ({ ...(current || {}), error: error instanceof Error ? error.message : "TUI command failed" }));
    } finally {
      setTuiBusy(false);
    }
  }, []);

  const loadDb = useCallback(async () => {
    const [statusRes, queriesRes] = await Promise.allSettled([
      fetch("/api/db/status", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("DB gauges unavailable")))),
      fetch("/api/db/queries", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("Query readout unavailable")))),
    ]);
    if (statusRes.status === "fulfilled") {
      setDbStatus(statusRes.value);
      setDbError(null);
    } else setDbError(statusRes.reason instanceof Error ? statusRes.reason.message : "DB gauges unavailable");
    if (queriesRes.status === "fulfilled") {
      setDbQueries(queriesRes.value);
      setQueryError(null);
    } else setQueryError(queriesRes.reason instanceof Error ? queriesRes.reason.message : "Query readout unavailable");
  }, []);

  useEffect(() => {
    const systemTheme = new URLSearchParams(window.location.search).get("theme") === "system";
    if (systemTheme) {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const applySystemTheme = () => setTheme(media.matches ? "dark" : "light");
      applySystemTheme();
      media.addEventListener("change", applySystemTheme);
      return () => media.removeEventListener("change", applySystemTheme);
    }
    const savedTheme = localStorage.getItem("lan-chat:theme");
    setTheme(savedTheme === "dark" ? "dark" : "light");
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setDraft(saved);
    const savedGaugeView = localStorage.getItem(GAUGE_VIEW_KEY);
    setGaugeView(savedGaugeView === "memory3d" ? "memory3d" : "gauges");
    loadHistory().catch((err) => setNotice(err.message));
    loadStatus().catch(() => undefined);
    loadActivity().catch(() => undefined);
    loadTui().catch((err) => setTui({ error: err instanceof Error ? err.message : "TUI unavailable" }));
    loadDb().catch(() => undefined);
    const refreshWhenVisible = () => {
      if (document.hidden) return;
      loadHistory().catch(() => undefined);
      loadStatus().catch(() => undefined);
      loadActivity().catch(() => undefined);
      loadTui().catch(() => undefined);
    };
    const refreshDbWhenVisible = () => {
      if (document.hidden) return;
      loadDb().catch(() => undefined);
    };
    const onVisibilityChange = () => {
      if (document.hidden) return;
      refreshWhenVisible();
      refreshDbWhenVisible();
    };
    const chatTimer = window.setInterval(refreshWhenVisible, CHAT_POLL_MS);
    const dbTimer = window.setInterval(refreshDbWhenVisible, DB_POLL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(chatTimer);
      window.clearInterval(dbTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [loadActivity, loadDb, loadHistory, loadStatus, loadTui]);

  function sendTuiInput() {
    const input = tuiInput.trimEnd();
    if (!input) return;
    setTuiInput("");
    void postTui({ action: "send", input }, { scrollAfter: true });
  }

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, draft);
  }, [draft]);

  useEffect(() => {
    localStorage.setItem(GAUGE_VIEW_KEY, gaugeView);
  }, [gaugeView]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!textRef.current) return;
    textRef.current.style.height = "0px";
    textRef.current.style.height = `${Math.min(220, Math.max(88, textRef.current.scrollHeight))}px`;
  }, [draft]);

  async function uploadFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.size > 0).slice(0, MAX_DROP_FILES);
    if (!files.length) return;
    setUploading(true);
    setNotice(`Uploading ${files.length} file${files.length === 1 ? "" : "s"}…`);
    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      const res = await fetch("/api/chat/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "upload failed");
      const next = Array.isArray(data?.files) ? data.files : [];
      setAttachments((current) => [...current, ...next]);
      setNotice(`${next.length} file${next.length === 1 ? "" : "s"} attached. Drop more or send.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function sendMessage() {
    const message = draft.trim();
    if (!message && attachments.length === 0) return;
    setSending(true);
    showNotice("Dispatching to local OpenClaw session…");
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      text: message || (attachments.length ? "Attached files" : ""),
      attachments,
      timestamp: Date.now(),
    };
    setMessages((current) => [...current, optimistic]);
    setDraft("");
    localStorage.removeItem(STORAGE_KEY);
    const outgoing = attachments;
    setAttachments([]);
    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, attachments: outgoing, mode: "chat" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "send failed");
      showNotice(`Sent · ${data?.status || "started"}`, 1600);
      loadActivity().catch(() => undefined);
      window.setTimeout(() => {
        loadHistory().catch(() => undefined);
        loadActivity().catch(() => undefined);
      }, 1400);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Send failed");
      setAttachments(outgoing);
      setDraft(message);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function onDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragDepth((value) => value + 1);
  }

  function onDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragDepth((value) => Math.max(0, value - 1));
  }

  function onDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragDepth(0);
    if (event.dataTransfer.files?.length) void uploadFiles(event.dataTransfer.files);
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const unavailable = micUnavailableReason();
      if (unavailable) {
        throw new Error(unavailable);
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = pickAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = (event) => {
        setNotice(`Microphone recorder error: ${event.error?.message || "unknown recorder error"}`);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setTranscribing(true);
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          if (!blob.size) throw new Error("No microphone audio was recorded.");
          const form = new FormData();
          const ext = recorder.mimeType.includes("mp4") ? "m4a" : recorder.mimeType.includes("ogg") ? "ogg" : "webm";
          form.append("audio", blob, `lan-chat-voice.${ext}`);
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || "transcription failed");
          setDraft((current) => `${current}${current ? "\n" : ""}${data.text || ""}`);
          setNotice("Voice transcribed into the composer.");
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Voice transcription failed");
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start(1000);
      setRecording(true);
      setNotice("Recording voice note… tap again to stop.");
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setNotice(error instanceof Error ? error.message : "Microphone unavailable");
    }
  }

  return (
    <main
      className={cx("console-shell", `theme-${theme}`, dragActive && "drag-hot")}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      {dragActive ? (
        <div className="drop-shield">
          <div>
            <span>DROP FILES</span>
            <strong>Attach directly to chat</strong>
            <p>No upload button required.</p>
          </div>
        </div>
      ) : null}

      <header className="topbar panel">
        <div>
          <p className="eyebrow">LAN Command Chat</p>
          <h1>{identity}</h1>
          <p className="subtle">Local-first back channel for the operator, this agent, and authorized LAN agents.</p>
        </div>
        <div className="top-actions">
          <button className="ghost" onClick={() => setTheme((value) => (value === "light" ? "dark" : "light"))}>{theme === "light" ? "Dark" : "Light"} mode</button>
          <a className="ghost" href={androidInstallUrl} download="lan-command-chat-android.apk">Android app</a>
          <button className="ghost" onClick={() => { void loadHistory(); void loadStatus(); void loadActivity(); void loadTui(); void loadDb(); }}>Refresh</button>
          <button className="primary" onClick={() => tuiInputRef.current?.focus()}>Command</button>
        </div>
      </header>

      <section className="status-strip">
        <div className="chip"><span>Model</span><b>{status.model || "unavailable"}</b></div>
        <div className="chip"><span>Thinking</span><b>{displayThinking(status.thinking)}</b></div>
        <div className="chip wide"><span>Tokens transmitted</span><b>{formatTokenCount(status)}</b></div>
        <div className="chip memory-chip">
          <span>Memory</span>
          <b>{formatMemoryUsage(memoryUsedBytes, memoryTotalBytes, memoryUsedPercent)}</b>
          <div className="cpu-spike memory-spike" aria-label="Local memory usage live level">
            <span style={{ ["--cpu-ratio" as string]: memoryRatio }} />
          </div>
        </div>
        <div className="chip"><span>Sync</span><b>{formatTime(lastSync || undefined)}</b></div>
      </section>

      <div className="workspace-grid">
        <aside className="left-rail">
          <section className={cx("panel gauge-panel", gaugeView === "memory3d" && "memory3d-panel")}>
            <div className="panel-title-row gauge-title-row">
              {gaugeView === "gauges" ? (
                <>
                  <span className={cx("health cpu-ghz", dbStatus?.degraded && "warn")}>{dbError || cpuGHz}</span>
                  <div className="cpu-spike" aria-label="CPU GHz live level">
                    <span style={{ ["--cpu-ratio" as string]: cpuRatio }} />
                  </div>
                </>
              ) : (
                <span className="health memory3d-health">Zorg Memory DB 3D</span>
              )}
              <button className="ghost gauge-switch" onClick={() => setGaugeView((value) => (value === "gauges" ? "memory3d" : "gauges"))}>
                {gaugeView === "gauges" ? "Memory 3D" : "Gauges"}
              </button>
            </div>
            {gaugeView === "memory3d" ? (
              <div className="memory3d-frame-wrap">
                {memory3dFrameSrc ? (
                  <iframe
                    key={memory3dFrameSrc}
                    className="memory3d-frame"
                    src={memory3dFrameSrc}
                    title="Zorg Memory DB 3D"
                    loading="eager"
                    allow="fullscreen"
                  />
                ) : null}
              </div>
            ) : (
              <>
                <div className="gauges">
                  <Gauge label={metricLabel("queriesPerSecond")} metric={metrics.queriesPerSecond} />
                  <Gauge label={metricLabel("cacheHitRatio")} metric={metrics.cacheHitRatio} />
                  <Gauge label={metricLabel("contextWindow")} metric={contextWindowMetric} />
                  <Gauge label={metricLabel("dbSize")} metric={metrics.dbSize} />
                </div>
                <div className="db-detail-grid">
                  <span className="health">v{LAN_CHAT_RELEASE_VERSION}</span>
                  <span>DB size <b>{formatBytes(Number(dbStatus?.details?.dbSizeBytes ?? 0))}</b></span>
                  <span>Free space <b>{formatBytes(Number(dbStatus?.details?.storageFreeBytes ?? 0))}</b></span>
                </div>
              </>
            )}
          </section>
          <QueryReadout payload={dbQueries} error={queryError} />
        </aside>

        <section className="chat-panel panel">
          <section className={cx("activity-card", activity?.active && "active", activity?.label === "Reply ready" && "ready", activity?.degraded && "unavailable")}>
            <div className="activity-head">
              <span className="activity-dot" />
              <div>
                <strong>{activity?.label || "Idle"}</strong>
                <small>{activity?.sampledAt ? `updated ${formatTime(activity.sampledAt)}` : "watching OpenClaw activity"}</small>
              </div>
            </div>
            <div className="activity-events">
              {(activity?.events ?? []).slice(-4).map((event, index) => (
                <div className={`activity-event kind-${event.kind}`} key={`${event.kind}-${event.timestamp ?? index}-${index}`}>
                  <b>{event.label}</b>
                  {event.detail ? <span>{event.detail}</span> : null}
                </div>
              ))}
              {(!activity?.events || activity.events.length === 0) ? <div className="activity-event"><b>No current run</b><span>Messages will show thinking/tools here while this agent works.</span></div> : null}
            </div>
          </section>
          <TuiConsole
            payload={tui}
            input={tuiInput}
            busy={tuiBusy}
            onInput={setTuiInput}
            onSend={sendTuiInput}
            onStart={() => void postTui({ action: "start" })}
            onRestart={() => void postTui({ action: "restart" })}
            onKey={(key) => void postTui({ action: "key", key })}
            inputRef={tuiInputRef}
            scrollRequestId={tuiScrollRequestId}
          />
          {notice ? <div className="notice command-notice" onClick={() => showNotice(null)}>{notice}</div> : null}
        </section>
      </div>

      <div className="signature">{identity} LAN Console · scratch rebuilt UI</div>
    </main>
  );
}
