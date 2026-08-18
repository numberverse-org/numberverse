/**
 * 🐛 Client error reporter (#1756).
 *
 * A tiny, dependency-free reporter that fires scrubbed, throttled client
 * errors at POST /api/v1/errors — the API re-scrubs and logs them locally.
 * Nothing here imports ./api or ./store (this module must stay importable by
 * the boot chunk and must never couple to the sync graph), so the API base is
 * resolved with the same rules api.ts uses, but inline.
 *
 * It reports two things:
 *   1. ErrorBoundary catches  — wired from main.tsx's boot onCatch via
 *      reportBoundaryError().
 *   2. Sustained outbox failure — the durable nv_sync_signal key is polled on
 *      the sync heartbeat cadence; when lastError stays set for
 *      SYNC_STUCK_TICKS consecutive ticks, one report fires per stuck episode
 *      (a success clears it). The request_id of the last failed sync is picked
 *      up by a passive fetch shadow that watches POSTs to the sync endpoints.
 *
 * Throttle: a per-kind:label cooldown (LABEL_COOLDOWN_MS) plus a hard per-
 * session cap (MAX_REPORTS_PER_SESSION). Reporting is best-effort — a failed
 * report never breaks the app.
 */
import { APP_VERSION } from "../version";

export const MAX_REPORTS_PER_SESSION = 20;
export const LABEL_COOLDOWN_MS = 5 * 60_000;
export const SYNC_STUCK_TICKS = 3;
export const SYNC_POLL_MS = 30_000;

export interface ClientErrorPayload {
  kind: "boundary" | "sync";
  version: string;
  label: string;
  message: string;
  context: Record<string, unknown>;
  request_id?: string | null;
  status?: number | null;
  language?: string | null;
}

/** The durable nv_sync_signal shape (mirrors store.ts's SyncSignal). */
export interface SyncSignalRead {
  lastSuccessAt: number | null;
  pendingCount: number;
  lastError: string | null;
}

/* ── API base (same rules as api.ts, kept local to stay boot-chunk-safe) ── */
function apiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined);
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") {
    return window.location.protocol === "https:"
      ? "/api/v1"
      : `http://${window.location.hostname}:8000/api/v1`;
  }
  return "http://127.0.0.1:8000/api/v1";
}

function detectLanguage(): string | null {
  try {
    return localStorage.getItem("nv_lang") === "bn" ? "bn" : "en";
  } catch {
    return "en";
  }
}

/* ── Client-side redaction (defense in depth — the API re-scrubs too) ──── */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const BD_PHONE_RE = /\b(?:\+?880|0)[\d\s-]{5,13}\d\b/g;
const LONG_DIGITS_RE = /\b\d{15,19}\b/g;
const CONN_URI_RE = /([a-z][a-z0-9+.-]*:\/\/[^/@\s:]+:)([^@\s]+)@/gi;
const BEARER_RE = /(\bauthorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi;

export function redactText(s: string): string {
  return s
    .replace(CONN_URI_RE, "$1[REDACTED]@")
    .replace(EMAIL_RE, "[REDACTED]")
    .replace(IPV4_RE, "[REDACTED]")
    .replace(BD_PHONE_RE, "[REDACTED]")
    .replace(LONG_DIGITS_RE, "[REDACTED]")
    .replace(BEARER_RE, "$1[REDACTED]");
}

const REDACT_DEPTH_CAP = 10;
const REDACT_TRUNCATED = "[TRUNCATED]";

/** Deep-redact a context envelope: walk nested dicts/lists and scrub every
 *  string leaf. Mirrors the API's redact_context (caps depth + size so a
 *  hostile error payload can't be turned into a CPU sink client-side). */
export function redactContext(ctx: unknown, depth = 0): unknown {
  if (depth >= REDACT_DEPTH_CAP) return REDACT_TRUNCATED;
  if (typeof ctx === "string") return redactText(ctx);
  if (Array.isArray(ctx)) return ctx.map((v) => redactContext(v, depth + 1));
  if (ctx !== null && typeof ctx === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ctx as Record<string, unknown>)) {
      out[k] = redactContext(v, depth + 1);
    }
    return out;
  }
  return ctx;
}

/* ── Throttle state ────────────────────────────────────────────────────── */
let reportsSent = 0;
let lastReportedAt: Record<string, number> = {};
let lastFailedSync: { requestId: string | null; status: number | null } | null = null;

/** Reset throttle/episode state — used by tests and hot-reload. */
export function resetErrorReporter(): void {
  reportsSent = 0;
  lastReportedAt = {};
  lastFailedSync = null;
  stuckTicks = 0;
  stuckReported = false;
}

/* ── Sync-stuck episode tracking (module state for the poller) ─────────── */
let stuckTicks = 0;
let stuckReported = false;

function readSyncSignal(): SyncSignalRead | null {
  try {
    const raw = localStorage.getItem("nv_sync_signal");
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const p = parsed as Record<string, unknown>;
    return {
      lastSuccessAt: typeof p.lastSuccessAt === "number" ? p.lastSuccessAt : null,
      pendingCount: typeof p.pendingCount === "number" ? p.pendingCount : 0,
      lastError: typeof p.lastError === "string" ? p.lastError : null,
    };
  } catch {
    return null;
  }
}

/** Judge one poll tick against the episode state. Returns the new state and
 *  whether THIS tick crosses the "stuck >N heartbeats" threshold (fires once
 *  per episode; a success — lastError cleared — resets the episode). */
export function judgeStuckSync(
  signal: SyncSignalRead | null,
  state: { stuckTicks: number; reported: boolean }
): { state: { stuckTicks: number; reported: boolean }; fire: boolean } {
  if (!signal || signal.lastError == null) {
    return { state: { stuckTicks: 0, reported: false }, fire: false };
  }
  const next = { ...state, stuckTicks: state.stuckTicks + 1 };
  if (!next.reported && next.stuckTicks >= SYNC_STUCK_TICKS) {
    next.reported = true;
    return { state: next, fire: true };
  }
  return { state: next, fire: false };
}

/* ── Passive fetch shadow: remember the last failed sync's request_id ───── */
const SYNC_PATHS = ["/progress", "/stories", "/acceleration"];
let fetchShadowInstalled = false;

function installFetchShadow(): void {
  if (fetchShadowInstalled || typeof window === "undefined" || typeof window.fetch !== "function") {
    return;
  }
  fetchShadowInstalled = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(input, init);
    try {
      const method = (
        init?.method ??
        (typeof input === "string" || input instanceof URL ? "GET" : input.method) ??
        "GET"
      ).toUpperCase();
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (method === "POST" && SYNC_PATHS.some((p) => url.endsWith(p))) {
        const requestId = response.headers?.get("x-request-id") ?? null;
        if (!response.ok) {
          lastFailedSync = { requestId, status: response.status };
        }
      }
    } catch {
      /* the shadow must never break the network path */
    }
    return response;
  };
}

/* ── Core report send ──────────────────────────────────────────────────── */
async function sendReport(payload: ClientErrorPayload): Promise<void> {
  if (reportsSent >= MAX_REPORTS_PER_SESSION) return;
  const key = `${payload.kind}:${payload.label}`;
  const now = Date.now();
  if (now - (lastReportedAt[key] ?? 0) < LABEL_COOLDOWN_MS) return;
  lastReportedAt[key] = now;
  reportsSent += 1;
  try {
    await fetch(`${apiBase()}/errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* best-effort — a failed report must never break the app */
  }
}

/** Fire one boundary-error report (called from ErrorBoundary onCatch hooks). */
export function reportBoundaryError(
  label: string,
  error: unknown,
  componentStack?: string | null
): void {
  const summary = error instanceof Error ? error.message : String(error ?? "unknown error");
  const context: Record<string, unknown> = {};
  if (componentStack) context.componentStack = componentStack;
  void sendReport({
    kind: "boundary",
    version: APP_VERSION,
    label,
    message: redactText(summary),
    context: redactContext(context) as Record<string, unknown>,
    request_id: lastFailedSync?.requestId ?? null,
    status: lastFailedSync?.status ?? null,
    language: detectLanguage(),
  });
}

/** Install the reporter: the fetch shadow + the sync-stuck poller.
 *  Returns a cleanup function. Safe to call more than once. */
export function initErrorReporter(): () => void {
  installFetchShadow();
  if (typeof window === "undefined") return () => {};
  const timer = window.setInterval(() => {
    const signal = readSyncSignal();
    const judged = judgeStuckSync(signal, { stuckTicks, reported: stuckReported });
    stuckTicks = judged.state.stuckTicks;
    stuckReported = judged.state.reported;
    if (judged.fire && signal) {
      void sendReport({
        kind: "sync",
        version: APP_VERSION,
        label: "sync",
        message: redactText(signal.lastError ?? "unknown"),
        context: redactContext({
          pendingCount: signal.pendingCount,
          lastError: signal.lastError,
        }) as Record<string, unknown>,
        request_id: lastFailedSync?.requestId ?? null,
        status: lastFailedSync?.status ?? null,
        language: detectLanguage(),
      });
    }
  }, SYNC_POLL_MS);
  return () => window.clearInterval(timer);
}
