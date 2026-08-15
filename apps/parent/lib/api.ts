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
  last_seen_at: string;
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

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("Invalid credentials");
  return res.json();
}

/** #1537 — create a parent account. Mirrors login() but POSTs the signup
 *  shape (email + password min 8 + display_name) to /auth/signup. */
export async function signup(email: string, password: string, displayName: string): Promise<LoginResponse> {
  const res = await fetch(`${API}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name: displayName }),
  });
  if (!res.ok) throw new Error("Signup failed");
  return res.json();
}

/** Revoke the current session server-side (real logout — the token dies on
 *  the API, not just in this browser). Best-effort: fine if the network fails,
 *  the local clear below still ends the session here. */
export async function signout(token: string): Promise<void> {
  try {
    await authFetch(token, `${API}/auth/logout`, { method: "POST" });
  } catch {
    /* offline — local clear still wins */
  }
}

/** Sign out on every device — revokes ALL sessions on the account. */
export async function signoutAll(token: string): Promise<void> {
  const res = await authFetch(token, `${API}/auth/logout-all`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to sign out all devices");
}

export async function getSessions(token: string): Promise<SessionRow[]> {
  const res = await authFetch(token, `${API}/auth/sessions`);
  if (!res.ok) throw new Error("Failed to load sessions");
  return res.json();
}

export async function revokeSession(token: string, sessionId: string): Promise<void> {
  const res = await authFetch(token, `${API}/auth/sessions/${sessionId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to revoke session");
}

export async function changePassword(token: string, current: string, next: string): Promise<void> {
  const res = await authFetch(token, `${API}/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: current, new_password: next }),
  });
  if (!res.ok) throw new Error("Password change failed");
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

export async function getProfile(token: string): Promise<Profile> {
  const res = await authFetch(token, `${API}/auth/me`);
  if (!res.ok) throw new Error("Failed to load profile");
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

export async function getKids(token: string): Promise<Kid[]> {
  const res = await fetch(`${API}/kids`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Failed to load kids");
  return res.json();
}

export async function getMastery(token: string, kidId: string): Promise<MasteryRow[]> {
  const res = await authFetch(token, `${API}/kids/${kidId}/mastery`);
  if (!res.ok) throw new Error("Failed to load mastery");
  return res.json();
}

/** #132 — skills below mastery, with catalog titles, weakest first. */
export async function getWeakSkills(token: string, kidId: string): Promise<WeakSkillRow[]> {
  const res = await authFetch(token, `${API}/kids/${kidId}/weak-skills`);
  if (!res.ok) throw new Error("Failed to load weak skills");
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
  if (!res.ok) throw new Error("Failed to load settings");
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
  if (!res.ok) throw new Error("Failed to load activity");
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
  if (!res.ok) throw new Error("Failed to load weekly report");
  return res.json();
}

/** #245 — the anonymized weekly snapshot a share-card link opens. Deliberately
 *  carries NO identity: rounds/minutes/accuracy/days, mastered count, top game.
 *  `coins` is the wallet balance (no history) and `minutes_by_day` is a 7-float
 *  minute curve (no dates) — both aggregate-only. */
export interface ShareSnapshot {
  rounds: number;
  minutes: number;
  correct_pct: number;
  active_days: number;
  mastered_count: number;
  top_game: string | null;
  week_of: string;
  /** #8 — current Nova wallet balance. */
  coins?: number;
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

/** #245 — PUBLIC read of a share snapshot (no auth — the token IS the key).
 *  Returns null for unknown links / offline, so the share page can degrade
 *  gracefully. No tracking: this page makes exactly this one fetch. */
export async function fetchShareSnapshot(shareToken: string): Promise<ShareSnapshot | null> {
  try {
    const res = await fetch(`${API}/share/${encodeURIComponent(shareToken)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** #238 — a kid's Kotha learning stories (newest first). The weekly narrative
 *  card reads these and summarizes client-side, so no story data is re-sent
 *  anywhere (edit-safe: the parent's edits never leave the browser). */
export async function getStories(token: string, kidId: string, limit = 500): Promise<LearningStoryRow[]> {
  const res = await authFetch(token, `${API}/kids/${kidId}/stories?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to load learning stories");
  return res.json();
}

/** #238 — Kotha story counts grouped by skill / error kind / misconception. */
export async function getStoryStats(token: string, kidId: string): Promise<StoryStats | null> {
  const res = await authFetch(token, `${API}/kids/${kidId}/stories/stats`);
  if (!res.ok) return null;
  return res.json();
}

/** 🚀 #249 — a kid's acceleration plan (every "skipped ahead" entry, newest
 *  first). The parent portal card reads these to show how far ahead the kid
 *  jumped and why — nothing extra is sent anywhere beyond this read. */
export async function getAcceleration(token: string, kidId: string): Promise<AccelerationRow[]> {
  const res = await authFetch(token, `${API}/kids/${kidId}/acceleration`);
  if (!res.ok) throw new Error("Failed to load acceleration plan");
  return res.json();
}

export async function resetKidProgress(token: string, kidId: string): Promise<void> {
  const res = await authFetch(token, `${API}/kids/${kidId}/reset`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to reset progress");
}
