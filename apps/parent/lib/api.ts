import type { SkillState, KidProfile } from "@numberverse/core";

// API base. Resolution order:
//  1. NEXT_PUBLIC_API_URL at build time (the demo/tunnel build sets "/api/v1" —
//     same origin, proxied by nginx through the Cloudflare tunnel).
//  2. HTTPS pages → same-origin "/api/v1" (tunnel / production).
//  3. Plain http → http://hostname:8000 (LAN dev — a phone on the Wi-Fi
//     calling 192.168.0.x:3000 talks to :8000 on the same machine).
const API =
  process.env.NEXT_PUBLIC_API_URL ??
  (typeof window !== "undefined"
    ? window.location.protocol === "https:"
      ? "/api/v1"
      : `http://${window.location.hostname}:8000/api/v1`
    : "http://127.0.0.1:8000/api/v1");

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  /** #1487 — how this account was created. "google" accounts have no known
   *  current password, so the portal shows a set-password flow instead of the
   *  change-password form. null/"local" accounts use the normal flow. */
  auth_provider?: string | null;
  /** Billing entitlement — "free" (Worlds 1–2) or "plus" (all worlds). The
   *  server is the source of truth; the portal shows it + an upgrade affordance. */
  plan?: string;
  plan_expires_at?: string | null;
}

export interface LoginResponse {
  token: string;
  profile: Profile;
}

export interface Kid {
  id: string;
  name: string;
  avatar: string;
  birth_year: number;
}

export interface MasteryRow {
  skill_id: string;
  mastery: number;
  correct: number;
  attempts: number;
  streak: number;
  /** #79 — when the skill FIRST crossed ≥80% (null for pre-#79 mastery). */
  mastered_at?: string | null;
  /** #1524 — last-practice / last-decay timestamps from the API MasteryOut,
   *  surfaced in the parent mastery table so regression can be flagged. */
  last_practice?: string | null;
  last_decay?: string | null;
}

/**
 * #2898 — wire→domain adapters. `api.ts` is the THIN wire contract and models
 * the API's snake_case JSON directly; `@numberverse/core` is the shared
 * camelCase domain. These converters are the single audited seam where the two
 * spellings meet, so a rename in either layer can only break in ONE place.
 *
 * NOTE the impedance: the core `SkillState`/`KidProfile` carry fields the
 * parent wire rows don't (kidId, createdAt) and use epoch-ms timestamps where
 * the API returns ISO strings, so the mapping is lossy by design — these are
 * for INTEROP, not the portal's own display (which keeps using `MasteryRow`).
 */
export function toSkillState(row: MasteryRow, kidId = ""): SkillState {
  return {
    kidId,
    skillId: row.skill_id,
    pMastered: row.mastery, // both 0..1
    correct: row.correct,
    attempts: row.attempts,
    streak: row.streak,
    // API timestamps are ISO strings → core wants epoch ms (null-safe).
    lastPractice: row.last_practice ? Date.parse(row.last_practice) : null,
    lastDecay: row.last_decay ? Date.parse(row.last_decay) : 0,
  };
}

export function toKidProfile(kid: Kid): KidProfile {
  return {
    id: kid.id,
    name: kid.name,
    avatar: kid.avatar,
    birthYear: kid.birth_year,
    // The parent `Kid` wire row has no created_at; the core domain field is
    // left empty at this seam (nothing in apps/parent consumes it yet).
    createdAt: "",
  };
}

/** #132 — a skill below mastery, with catalog titles for the worksheet. */
export interface WeakSkillRow {
  skill_id: string;
  band: number;
  subject: string;
  title: string;
  title_bn?: string | null;
  description?: string | null;
  mastery: number;
  attempts: number;
  correct: number;
}

export interface KidSettings {
  enabled_subjects: string[] | null;
  max_band: number | null;
  daily_limit_min: number | null;
  /** #6 — per-day-of-week caps "45,45,45,45,45,90,90" (Mon..Sun; 0 = off). */
  weekday_limits_min: string | null;
  tts_enabled: boolean;
  music_enabled: boolean;
  /** #243 — per-kid volume balance (0..1), voice / sfx / music layers. */
  voice_volume?: number;
  sfx_volume?: number;
  music_volume?: number;
  /** #248 — quiet hours: the app auto-lowers volume + gently dims during a
   *  per-day schedule, never hard-blocks. `quiet_windows` is 7 comma-joined
   *  "HH:MM-HH:MM" (Mon..Sun; "-" = off that day; start>end = overnight). */
  quiet_enabled?: boolean;
  quiet_windows?: string | null;
  quiet_dim?: boolean;
  quiet_volume?: number;
  /** #138 — kid voice dictation, parent-gated, on-device only. */
  voice_record_enabled: boolean;
  /** #256 — gentle daily playtime goal (minutes); Nova nudges toward it, never
   *  blocks. Clamped server-side to the day's cap. null/0 = no goal. */
  goal_min?: number | null;
  /** #257 — curriculum focus pin: subject + world band to prioritize in the
   *  journey. Both-or-neither; null/null = normal order. */
  focus_subject?: string | null;
  focus_band?: number | null;
  /** #258 — per-kid VOICE preference: stable tone handle ("female"|"kid"|
   *  "soft"|"warm") + Web-Speech rate multiplier (0.8/1.0/1.2; 1.0 = normal).
   *  null/null = the kid app's own default warm-female at normal speed. */
  voice_tone?: string | null;
  voice_speed?: number | null;
  /** #272 — SAFETY: parent kill-switch. True = all games paused for this kid
   *  (kid-safe "learning break" screen; survives reload) until a parent
   *  resumes. Off by default. */
  paused?: boolean;
  /** #1041/#1042 — MONI STRICTNESS: the adaptive tutor's difficulty knob.
   *  "gentle" | "steady" | "challenging" — how hard Moni pushes this kid.
   *  #1050 — null/undefined = no parent choice → Moni uses its own automatic
   *  tone (NOT pinned steady). Synced to the kid app. */
  moni_strictness?: "gentle" | "steady" | "challenging" | null;
  /** #1044 — per-subject difficulty deltas (subject id → signed level offset,
   *  clamped ±2) from the per-subject stepper. Layers on top of the global
   *  strictness so ONE area can be gentler/harder. Synced to the kid app. */
  moni_subject_deltas?: Record<string, number> | null;
  updated_at?: string | null;
}

export interface ActivityRow {
  id: number;
  game_id: string;
  skill_id: string;
  correct: boolean;
  response_ms: number | null;
  difficulty: number | null;
  created_at: string;
  /** #1611 — the client-observed occurred-at instant (the API returns this; null
   *  for legacy rows). Prefer it over `created_at` when bucketing a round to the
   *  local day/month it actually happened (offline-delayed syncs). */
  client_ts?: string | null;
  /** #1616 — event kind ("round" default; "coins"/"quest"/"garden"/"challenge"/
   *  "session-minutes"…). Engagement rows are activity but NOT a practice round. */
  kind?: string;
  /** #1616 — small engagement payload (e.g. {"minutes": 4} for session-minutes). */
  meta?: Record<string, unknown> | null;
}

/** 📖 KOTHA (#238) — one learning story emitted by the kid app's story outbox
 *  (a single round: what was tried, the outcome, and Moni's diagnosis of why). */
export interface LearningStoryRow {
  id: string;
  kid_id: string;
  skill_id: string;
  game_id: string;
  outcome: boolean;
  error_kind: string | null;
  misconception_code: string | null;
  action: string | null;
  difficulty: number | null;
  response_ms: number | null;
  wrong_streak: number | null;
  context: Record<string, unknown>;
  created_at: string;
}

/** 📖 KOTHA counts — totals grouped by skill / error kind / misconception. */
export interface StoryStats {
  total: number;
  by_skill: Record<string, number>;
  by_error_kind: Record<string, number>;
  by_misconception: Record<string, number>;
}

/** 🚀 #249 — one acceleration-plan entry: a skill the kid "skipped ahead" past
 *  (already knew it / too easy / moved on — or parent-driven) with the band jump. */
export interface AccelerationRow {
  id: string;
  kid_id: string;
  skill_id: string;
  reason: string; // easy | know | moving-on | parent
  band_from: number;
  band_to: number;
  created_at: string;
}

export interface NewKid {
  name: string;
  avatar?: string | null;
  birth_year?: number | null;
}

/** One active login on the account (from GET /auth/sessions). */
export interface SessionRow {
  id: string;
  created_at: string;
  /** #1547 — null until the API first touches the session after auth. */
  last_seen_at: string | null;
  user_agent: string | null;
  ip: string | null;
  current: boolean;
}

async function authFetch(token: string, url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

/** #1507 — throw a status-tagged error from a non-OK response. Reads the JSON
 *  body's `detail`/`message` when present (falling back to a caller-supplied
 *  message) and attaches `status` so catch sites can tell an expired session
 *  (401/403) apart from a transient server/network failure. */
export async function throwApiError(res: Response, fallback: string): Promise<never> {
  let msg = fallback;
  try {
    const data = (await res.json().catch(() => null)) as { detail?: unknown; message?: unknown } | null;
    if (typeof data?.detail === "string" && data.detail) msg = data.detail;
    else if (typeof data?.message === "string" && data.message) msg = data.message;
  } catch {
    /* no JSON body — keep the fallback */
  }
  throw Object.assign(new Error(msg), { status: res.status });
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    // #1773 — accept/store the httpOnly refresh cookie the API sets (cross-origin
    // LAN dev via CORS credentials; same-origin prod).
    credentials: "include",
  });
  if (!res.ok) await throwApiError(res, "Invalid email or password");
  return res.json();
}

/** #1537 — create a parent account. Mirrors login() but POSTs the signup
 *  shape (email + password min 8 + display_name) to /auth/signup. */
export async function signup(email: string, password: string, displayName: string): Promise<LoginResponse> {
  const res = await fetch(`${API}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name: displayName }),
    // #1773 — accept/store the httpOnly refresh cookie the API sets.
    credentials: "include",
  });
  if (!res.ok) await throwApiError(res, "Signup failed");
  return res.json();
}

/** Revoke the current session server-side (real logout — the token dies on
 *  the API, not just in this browser). Best-effort: fine if the network fails,
 *  the local clear below still ends the session here. #1773 — credentials:
 *  "include" so the API logout clears the httpOnly refresh cookie. */
export async function signout(token: string): Promise<void> {
  try {
    await authFetch(token, `${API}/auth/logout`, { method: "POST", credentials: "include" });
  } catch {
    /* offline — local clear still wins */
  }
}

/** Sign out on every device — revokes ALL sessions on the account. */
export async function signoutAll(token: string): Promise<void> {
  const res = await authFetch(token, `${API}/auth/logout-all`, { method: "POST" });
  if (!res.ok) await throwApiError(res, "Failed to sign out all devices");
}

export async function getSessions(token: string): Promise<SessionRow[]> {
  const res = await authFetch(token, `${API}/auth/sessions`);
  if (!res.ok) await throwApiError(res, "Failed to load sessions");
  return res.json();
}

export async function revokeSession(token: string, sessionId: string): Promise<void> {
  const res = await authFetch(token, `${API}/auth/sessions/${sessionId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to revoke session");
}

/** #1490 — bcrypt only uses the first 72 bytes, so reject over-long passwords
 *  client-side too (the API independently returns 422 for the same input). */
export const MAX_PASSWORD_CHARS = 72;

export async function changePassword(token: string, current: string, next: string): Promise<void> {
  if (next.length > MAX_PASSWORD_CHARS) throw new Error("Password too long");
  const res = await authFetch(token, `${API}/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: current, new_password: next }),
  });
  if (!res.ok) throw new Error("Password change failed");
}

/** #1487 — Google-created accounts have no current password to verify, so they
 *  set one directly. Mirrors changePassword but omits `current_password`. */
export async function setPassword(token: string, newPassword: string): Promise<void> {
  if (newPassword.length > MAX_PASSWORD_CHARS) throw new Error("Password too long");
  const res = await authFetch(token, `${API}/auth/set-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_password: newPassword }),
  });
  if (!res.ok) throw new Error("Failed to set password");
}

export async function updateProfile(token: string, displayName: string): Promise<Profile> {
  const res = await authFetch(token, `${API}/auth/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ display_name: displayName }),
  });
  if (!res.ok) throw new Error("Failed to update profile");
  return res.json();
}

/** #980/#1679 — right-to-erasure: DELETE /api/v1/auth/me permanently removes
 *  the account and ALL associated data (kids, mastery, sessions, stories,
 *  acceleration, settings) via the DB's cascade FKs. Local accounts confirm by
 *  re-entering their password (bcrypt-checked server-side); the `confirmation`
 *  phrase must match the server's literal "delete my account". Google-only
 *  accounts send a fresh X-Google-ID-Token header instead (password unused). */
export interface DeleteAccountResult {
  deleted: boolean;
  profile_id: string;
  kids_removed: number;
}

export async function deleteAccount(
  token: string,
  payload: { confirmation: string; password: string },
): Promise<DeleteAccountResult> {
  const res = await authFetch(token, `${API}/auth/me`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res, "Failed to delete account");
  return res.json();
}

export async function getProfile(token: string): Promise<Profile> {
  const res = await authFetch(token, `${API}/auth/me`);
  if (!res.ok) await throwApiError(res, "Failed to load profile");
  return res.json();
}

/* ─── Parent Plus billing (bKash Tokenized Checkout) ─────────────────────────
 * The kid app only ever reads `plan` from /auth/me; payment is a parent-portal
 * concern. When bKash is unconfigured the routes return 501 — the portal hides
 * the upgrade button and shows a "coming soon" line instead. */

/** GET /billing/bkash/status — whether bKash is configured on THIS server, and
 *  the annual price. The portal gates the upgrade button on `enabled`. */
export interface BillingStatus {
  enabled: boolean;
  annual_bdt: number;
}

export async function getBillingStatus(token: string): Promise<BillingStatus> {
  const res = await authFetch(token, `${API}/billing/bkash/status`);
  if (!res.ok) await throwApiError(res, "Failed to load billing status");
  return res.json();
}

/** POST /billing/bkash/create — mint a bKash payment; the parent is redirected
 *  to `bkashURL` to authorize, then bKash returns to `callback_url`. */
export interface BkashCreateResult {
  paymentID: string;
  bkashURL: string;
  amount: number;
  currency: string;
}

export async function createBkashPayment(
  token: string,
  callback_url: string,
): Promise<BkashCreateResult> {
  const res = await authFetch(token, `${API}/billing/bkash/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_url, payer_reference: "{}" }),
  });
  if (!res.ok) await throwApiError(res, "Failed to start payment");
  return res.json();
}

/** POST /billing/bkash/execute — complete an authorized bKash payment. On
 *  success the server activates the subscription and returns plan="plus". */
export interface BkashExecuteResult {
  status: string;
  plan: string | null;
}

export async function executeBkashPayment(
  token: string,
  payment_id: string,
): Promise<BkashExecuteResult> {
  const res = await authFetch(token, `${API}/billing/bkash/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payment_id }),
  });
  if (!res.ok) await throwApiError(res, "Failed to complete payment");
  return res.json();
}

/** Three-way session check for the portal gate. Distinguishes a genuinely dead
 *  session (401/403 → bounce to login and clear the stored token) from a
 *  transient network failure (→ "offline" — keep the token for a later retry,
 *  but NEVER render the dashboard with an unvalidated token). A kid who stumbles
 *  onto /parent/ with a stale, forged, or shared token therefore always lands on
 *  the login page, never on the dashboard. */
export async function validateToken(token: string): Promise<"ok" | "invalid" | "offline"> {
  try {
    const res = await authFetch(token, `${API}/auth/me`);
    if (res.ok) return "ok";
    if (res.status === 401 || res.status === 403) return "invalid";
    return "offline";
  } catch {
    return "offline";
  }
}

/** #1773 — rotate the httpOnly refresh cookie into a fresh short-lived access
 *  token. Returns null when there's no cookie / it's invalid / offline — the
 *  caller then falls back to the stored (≤15-min) access token path. */
export async function refreshSession(): Promise<string | null> {
  try {
    const res = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.access_token === "string" ? data.access_token : null;
  } catch {
    return null; // offline — caller falls back to the stored token
  }
}

export async function getKids(token: string): Promise<Kid[]> {
  const res = await fetch(`${API}/kids`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) await throwApiError(res, "Failed to load kids");
  return res.json();
}

export async function getMastery(token: string, kidId: string): Promise<MasteryRow[]> {
  const res = await authFetch(token, `${API}/kids/${kidId}/mastery`);
  if (!res.ok) await throwApiError(res, "Failed to load mastery");
  return res.json();
}

/** #132 — skills below mastery, with catalog titles, weakest first. */
export async function getWeakSkills(token: string, kidId: string): Promise<WeakSkillRow[]> {
  const res = await authFetch(token, `${API}/kids/${kidId}/weak-skills`);
  if (!res.ok) await throwApiError(res, "Failed to load weak skills");
  return res.json();
}

export async function createKid(token: string, body: NewKid): Promise<Kid> {
  const res = await authFetch(token, `${API}/kids`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to create kid");
  return res.json();
}

export async function updateKid(token: string, kidId: string, body: NewKid): Promise<Kid> {
  const res = await authFetch(token, `${API}/kids/${kidId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to update kid");
  return res.json();
}

export async function deleteKid(token: string, kidId: string): Promise<void> {
  const res = await authFetch(token, `${API}/kids/${kidId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete kid");
}

export async function getKidSettings(token: string, kidId: string): Promise<KidSettings> {
  const res = await authFetch(token, `${API}/kids/${kidId}/settings`);
  if (!res.ok) await throwApiError(res, "Failed to load settings");
  return res.json();
}

export async function saveKidSettings(token: string, kidId: string, body: KidSettings): Promise<KidSettings> {
  const res = await authFetch(token, `${API}/kids/${kidId}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to save settings");
  return res.json();
}

export async function getActivity(token: string, kidId: string, limit = 40): Promise<ActivityRow[]> {
  const res = await authFetch(token, `${API}/kids/${kidId}/activity?limit=${limit}`);
  if (!res.ok) await throwApiError(res, "Failed to load activity");
  return res.json();
}

export interface WeeklyDay {
  date: string; // YYYY-MM-DD
  rounds: number;
  minutes: number;
}

export interface WeeklyReport {
  days: WeeklyDay[];
  rounds: number;
  correct_pct: number;
  minutes: number;
  active_days: number;
  mastered_this_week: string[];
  /** #244 — skill ids mastered today (≥80% + last practiced today). */
  mastered_today: string[];
  top_game: string | null;
  /** #4 — 🔥 current streak: consecutive active days (ending today/yesterday). */
  streak?: number;
  /** #8 — current Nova wallet balance (single number; share caption). */
  coins?: number;
}

export async function getWeekly(token: string, kidId: string): Promise<WeeklyReport> {
  const res = await authFetch(token, `${API}/kids/${kidId}/weekly`);
  if (!res.ok) await throwApiError(res, "Failed to load weekly report");
  return res.json();
}

/** #245 — the anonymized weekly snapshot a share-card link opens. Deliberately
 *  carries NO identity: rounds/minutes/accuracy/days, mastered count, top game.
 *  `minutes_by_day` is a 7-float minute curve (no dates), aggregate-only.
 *  #3063 — no `coins`: ShareSnapshotOut (#867) omits it by design. */
export interface ShareSnapshot {
  rounds: number;
  minutes: number;
  correct_pct: number;
  active_days: number;
  mastered_count: number;
  top_game: string | null;
  week_of: string;
  /** #3063 — ShareSnapshotOut (shares.py #867) deliberately carries NO coins
   *  field, so a coins tile on the public share page could never render. The
   *  field is removed so the caption and payload can't drift out of sync. */
  /** #8 — 7-day minute curve (oldest → newest, zero-filled). */
  minutes_by_day?: number[];
}

/** #245 — mint (or return) the kid's opaque share token. Auth-protected; only
 *  the parent can request it. The token is unguessable (24-byte URL-safe). */
export async function getShareToken(token: string, kidId: string): Promise<string> {
  const res = await authFetch(token, `${API}/kids/${kidId}/share-token`);
  if (!res.ok) throw new Error("Failed to create share link");
  const data = (await res.json()) as { token: string };
  return data.token;
}

/** #866 — revoke the kid's share link. The server nulls the opaque token so
 *  the public snapshot stops resolving immediately; the next share mints a
 *  fresh token. Gives the parent the "stop sharing" flip side of minting. */
export async function revokeShareToken(token: string, kidId: string): Promise<void> {
  const res = await authFetch(token, `${API}/kids/${kidId}/share-token`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to stop sharing");
}

/** #245 — PUBLIC read of a share snapshot (no auth — the token IS the key).
 *  No tracking: this page makes exactly this one fetch. */
export interface ShareFetchResult {
  ok: true;
  data: ShareSnapshot;
}

export interface ShareFetchFailure {
  ok: false;
  /** #1597 — 401/404 means the token died (expired/invalid); anything else
   *  (5xx, offline) is a transient "try again later". The share page renders a
   *  different line for each instead of one generic failure. */
  reason: "expired" | "unavailable";
}

/** #245 + #1597 — fetch a share snapshot and classify the failure so the page
 *  can tell an expired/invalid link from a network/server outage. */
export async function fetchShareSnapshot(
  shareToken: string
): Promise<ShareFetchResult | ShareFetchFailure> {
  try {
    const res = await fetch(`${API}/share/${encodeURIComponent(shareToken)}`);
    if (!res.ok) {
      return { ok: false, reason: res.status === 401 || res.status === 404 ? "expired" : "unavailable" };
    }
    return { ok: true, data: (await res.json()) as ShareSnapshot };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** #238 — a kid's Kotha learning stories (newest first). The weekly narrative
 *  card reads these and summarizes client-side, so no story data is re-sent
 *  anywhere (edit-safe: the parent's edits never leave the browser). */
export async function getStories(token: string, kidId: string, limit = 500): Promise<LearningStoryRow[]> {
  const res = await authFetch(token, `${API}/kids/${kidId}/stories?limit=${limit}`);
  if (!res.ok) await throwApiError(res, "Failed to load learning stories");
  return res.json();
}

/** #238 — Kotha story counts grouped by skill / error kind / misconception. */
export async function getStoryStats(token: string, kidId: string): Promise<StoryStats | null> {
  const res = await authFetch(token, `${API}/kids/${kidId}/stories/stats`);
  if (!res.ok) await throwApiError(res, "Failed to load story stats");
  return res.json();
}

/** 🚀 #249 — a kid's acceleration plan (every "skipped ahead" entry, newest
 *  first). The parent portal card reads these to show how far ahead the kid
 *  jumped and why — nothing extra is sent anywhere beyond this read. */
export async function getAcceleration(token: string, kidId: string): Promise<AccelerationRow[]> {
  const res = await authFetch(token, `${API}/kids/${kidId}/acceleration`);
  if (!res.ok) await throwApiError(res, "Failed to load acceleration plan");
  return res.json();
}

export async function resetKidProgress(token: string, kidId: string): Promise<void> {
  const res = await authFetch(token, `${API}/kids/${kidId}/reset`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to reset progress");
}

/** #1535 — Web Push subscription as stored by the API. */
export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at?: string | null;
}

/** #1535 — the browser-side subscription payload POSTed to the API. */
export interface PushSubscribeBody {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** #1535 — list the current account's Web Push endpoints (GET /push/subscriptions). */
export async function listPushSubscriptions(token: string): Promise<PushSubscriptionRecord[]> {
  const res = await authFetch(token, `${API}/push/subscriptions`);
  if (!res.ok) throw new Error("Failed to load notification subscriptions");
  return res.json();
}

/** #1535 — save a Web Push endpoint (POST /push/subscribe). The API requires a
 *  valid session token; the portal treats a successful call as the parent-gate
 *  reauth because no dedicated /auth/verify endpoint exists yet. */
export async function subscribePush(token: string, body: PushSubscribeBody): Promise<PushSubscriptionRecord> {
  const res = await authFetch(token, `${API}/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to enable notifications");
  if (res.status === 204) return { ...body };
  return res.json();
}

/** #1535 — remove a Web Push endpoint (POST /push/unsubscribe). */
export async function unsubscribePush(token: string, endpoint: string): Promise<void> {
  const res = await authFetch(token, `${API}/push/unsubscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) throw new Error("Failed to disable notifications");
}
