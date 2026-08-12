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
}

export interface KidSettings {
  enabled_subjects: string[] | null;
  max_band: number | null;
  daily_limit_min: number | null;
  tts_enabled: boolean;
  music_enabled: boolean;
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
  top_game: string | null;
}

export async function getWeekly(token: string, kidId: string): Promise<WeeklyReport> {
  const res = await authFetch(token, `${API}/kids/${kidId}/weekly`);
  if (!res.ok) throw new Error("Failed to load weekly report");
  return res.json();
}

export async function resetKidProgress(token: string, kidId: string): Promise<void> {
  const res = await authFetch(token, `${API}/kids/${kidId}/reset`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to reset progress");
}
