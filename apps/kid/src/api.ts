import { useKidStore, STORY_QUEUE_CAP, type KothaStory, type RoundResult, type SyncEvent } from "./store";

/**
 * API base. Resolution order:
 *  1. VITE_API_URL at build time (the demo/tunnel build sets "/api/v1" —
 *     same origin, proxied by nginx through the Cloudflare tunnel).
 *  2. HTTPS pages → same-origin "/api/v1" (tunnel / production).
 *  3. Plain http → http://hostname:8000 (LAN dev — a phone on the Wi-Fi
 *     calling 192.168.0.x:5173 talks to :8000 on the same machine).
 */
export const API =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  (typeof window !== "undefined"
    ? window.location.protocol === "https:"
      ? "/api/v1"
      : `http://${window.location.hostname}:8000/api/v1`
    : "http://127.0.0.1:8000/api/v1");

/**
 * ALWAYS-SYNC — the kid app pushes every round to the server whenever it's
 * online, and queues whatever it misses while offline.
 *
 * Identity resolution (in order):
 *  1. PARENT-LINKED (existing): if a parent portal session picked a server kid
 *     (`nv_parent_token` + `nv_kid_id` in localStorage), all events go to that
 *     kid. Kept for the same-origin production flow.
 *  2. DEVICE ACCOUNT (new): at a standalone kid URL (e.g. kids.munna-khan.xyz)
 *     there is no parent session — so the FIRST time we have anything to sync
 *     we silently sign up an anonymous device profile, create the matching
 *     server-side kids for each local kid, and remember the mapping. Every
 *     device stays its own isolated family account; nothing is ever shared or
 *     mixed between visitors.
 *
 * The outbox is the store's persisted `pending` array, so a kid who plays in
 * airplane mode keeps every round and the sync drains it the moment they're
 * back online (timer + online/visibility events).
 */

const SYNC_LIMIT = 40; // max events per POST
const LS = {
  parentToken: "nv_parent_token", // parent-gated session (first-load gate)
  parentName: "nv_parent_name", // display name shown on the gate + syllabus
  parentKid: "nv_kid_id", // parent-linked (existing, kept for compatibility)
  deviceId: "nv_device_id",
  secret: "nv_device_secret",
  deviceToken: "nv_device_token",
  deviceProfileId: "nv_device_profile_id",
  kidMap: "nv_kid_map", // { localKidId: serverKidId }
  parentAggregateOptIn: "nv_parent_aggregate_opt_in", // #330 privacy opt-in ("1"/"0")
  parentPin: "nv_parent_pin", // #86 — salted hash of the parent-area PIN (never the raw PIN)
  parentSecQ: "nv_parent_sec_q", // #247 — PIN-recovery security question id (index into the i18n list)
  parentSecA: "nv_parent_sec_a", // #247 — salted hash of the recovery answer (never the raw answer)
} as const;

function genId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* older webviews */
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function genSecret(): string {
  return `nv-${genId().replace(/-/g, "")}${Math.random().toString(36).slice(2, 12)}`;
}

function localKids(): Array<{ id: string; name: string; avatar?: string; birthYear: number }> {
  try {
    const raw = localStorage.getItem("nv_kids");
    if (raw) return JSON.parse(raw) as Array<{ id: string; name: string; avatar?: string; birthYear: number }>;
  } catch {
    /* ignore */
  }
  return [];
}

function readKidMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LS.kidMap) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function writeKidMap(map: Record<string, string>) {
  try {
    localStorage.setItem(LS.kidMap, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

interface SyncIdentity {
  token: string;
  /** Resolve a local kid id → its server-side kid id (null if unmapped). */
  kidFor: (localId: string) => string | null;
}

let identityPromise: Promise<SyncIdentity | null> | null = null;

/** Sign in / create the anonymous device account. Deterministic email from the
 *  stable device id → survives reinstalls of the PWA. Returns the fresh token. */
async function deviceAuth(deviceId: string): Promise<string> {
  const cached = localStorage.getItem(LS.deviceToken);
  if (cached) return cached;
  let secret = localStorage.getItem(LS.secret);
  if (!secret) {
    secret = genSecret();
    localStorage.setItem(LS.secret, secret);
  }
  const email = `kid-${deviceId.slice(0, 12)}@numberverse.dev`;
  // signup; if the email already exists (retry after a failed persist),
  // fall back to login with the same deterministic secret.
  let res = await fetch(`${API}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: secret, display_name: "Kid Device" }),
  });
  if (res.status === 409) {
    res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: secret }),
    });
  }
  if (!res.ok) throw new Error(`device auth ${res.status}`);
  const data = await res.json();
  const token = data.token as string;
  localStorage.setItem(LS.deviceToken, token);
  localStorage.setItem(LS.deviceProfileId, data.profile.id);
  return token;
}

/** Resolve (and cache) the sync identity. Returns null when offline so callers
 *  simply keep the outbox queued and retry later. */
/** Map every LOCAL kid to a server kid under `token`'s account (create missing
 *  ones on first sight). Used by BOTH the parent-gated path and the anonymous
 *  device-account fallback, so the parent sees real per-kid progress in the
 *  portal and a guest still gets an isolated private family account. */
async function mapLocalKidsToServer(token: string): Promise<Record<string, string>> {
  const map = readKidMap();
  let changed = false;
  const existing = await fetch(`${API}/kids`, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
    r.ok ? r.json() : []
  );
  for (const k of localKids()) {
    if (map[k.id]) continue;
    const match = (existing as Array<{ id: string; name: string; birth_year?: number | null }>).find(
      (sk) => sk.name === k.name && String(sk.birth_year) === String(k.birthYear)
    );
    if (match) {
      map[k.id] = match.id;
      changed = true;
      continue;
    }
    const created = await fetch(`${API}/kids`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: k.name, avatar: k.avatar, birth_year: k.birthYear }),
    });
    if (!created.ok) throw new Error(`kid create ${created.status}`);
    map[k.id] = (await created.json()).id;
    changed = true;
  }
  if (changed) writeKidMap(map);
  return map;
}

function ensureIdentity(): Promise<SyncIdentity | null> {
  if (identityPromise) return identityPromise;
  const p = (async (): Promise<SyncIdentity | null> => {
    // 1. PARENT-GATED (the parent signed in on first load) — every local kid
    //    syncs to the parent's portal account.
    const parentToken = localStorage.getItem(LS.parentToken);
    if (parentToken) {
      try {
        const map = await mapLocalKidsToServer(parentToken);
        return { token: parentToken, kidFor: (localId) => map[localId] ?? null };
      } catch {
        return null; // offline — keep the outbox queued, retry next tick
      }
    }

    // 2. Device account (standalone guest / kid URL).
    try {
      let deviceId = localStorage.getItem(LS.deviceId);
      if (!deviceId) {
        deviceId = genId();
        localStorage.setItem(LS.deviceId, deviceId);
      }
      const token = await deviceAuth(deviceId);
      const map = await mapLocalKidsToServer(token);
      return { token, kidFor: (localId) => map[localId] ?? null };
    } catch {
      return null; // offline — try again next tick
    }
  })();
  identityPromise = p;
  // Forget the cache once settled so a later failure retries fresh.
  void p.then(() => {
    identityPromise = null;
  });
  return p;
}

/* ── Parent sign-in / sign-up (the first-load gate) ────────────────────── */
export function hasParentSession(): boolean {
  return !!localStorage.getItem(LS.parentToken);
}

export function parentName(): string | null {
  return localStorage.getItem(LS.parentName);
}

/** Validate the stored parent token against /auth/me. Clears it when invalid. */
export async function validateParentSession(): Promise<boolean> {
  const token = localStorage.getItem(LS.parentToken);
  if (!token) return false;
  try {
    const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return true;
    clearParentSession();
    return false;
  } catch {
    return true; // offline — don't kick a valid parent out
  }
}

export async function signinParent(email: string, password: string): Promise<void> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("invalid-credentials");
  const data = await res.json();
  localStorage.setItem(LS.parentToken, data.token as string);
  localStorage.setItem(LS.parentName, (data.profile?.display_name as string) ?? "Parent");
  resetIdentity();
}

/** Google sign-in: send the client ID token to the API, which verifies it
 *  server-side against NV_GOOGLE_CLIENT_ID and issues our own JWT. */
export async function signinGoogle(idToken: string): Promise<void> {
  const res = await fetch(`${API}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });
  if (!res.ok) throw new Error("google-signin-failed");
  const data = await res.json();
  localStorage.setItem(LS.parentToken, data.token as string);
  localStorage.setItem(LS.parentName, (data.profile?.display_name as string) ?? "Parent");
  resetIdentity();
}

export async function signupParent(email: string, password: string, displayName: string): Promise<void> {
  const res = await fetch(`${API}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name: displayName || "Parent" }),
  });
  if (!res.ok) throw new Error("signup-failed");
  const data = await res.json();
  localStorage.setItem(LS.parentToken, data.token as string);
  localStorage.setItem(LS.parentName, (data.profile?.display_name as string) ?? (displayName || "Parent"));
  resetIdentity();
}

export function clearParentSession(): void {
  localStorage.removeItem(LS.parentToken);
  localStorage.removeItem(LS.parentName);
  localStorage.removeItem(LS.parentAggregateOptIn);
  resetIdentity();
}

/* ── #86 Parent-area PIN lock ────────────────────────────────────────────
 * A 4-digit gate on the signed-in parent panel, so a kid who's handed a
 * signed-in device can't open parent territory. Only a salted FNV-1a hash is
 * stored — never the raw PIN — which is proportionate for a curious-kid threat
 * model (a determined child with DevTools could equally just clear
 * localStorage, which wipes the gate anyway). The PIN is per-device and never
 * leaves the device.
 */
const PIN_SALT = "numberverse-parent-pin-v1"; // fixed per-app salt (obfuscation, not a secret)
function pinHash(pin: string): string {
  let h = 0x811c9dc5; // FNV-1a 32-bit offset basis
  const s = `${PIN_SALT}:${pin}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `fnv1a$${(h >>> 0).toString(16).padStart(8, "0")}`;
}
export function hasParentPin(): boolean {
  return !!localStorage.getItem(LS.parentPin);
}
export function setParentPin(pin: string): void {
  localStorage.setItem(LS.parentPin, pinHash(pin));
}
export function verifyParentPin(pin: string): boolean {
  const stored = localStorage.getItem(LS.parentPin);
  return !!stored && stored === pinHash(pin);
}
export function clearParentPin(): void {
  localStorage.removeItem(LS.parentPin);
}

/* ── #247 PIN recovery Q&A ────────────────────────────────────────────────
 * A per-device security question + answer so a parent who forgot the PIN (or
 * hit the 3-try pad lock) can reset it IN PLACE — offline, no sign-out, no
 * account lockout. Same trust model as the PIN itself: only the salted hash of
 * the answer is stored; the question id is an index into the i18n list so a
 * locale change never corrupts the pairing. The answer is normalized (trim,
 * lower-case, collapse spaces) so "Blue " and "blue" both verify.
 */
function normalizeRecoveryAnswer(a: string): string {
  return a.trim().toLowerCase().replace(/\s+/g, " ");
}
export function hasSecurityQA(): boolean {
  return !!localStorage.getItem(LS.parentSecQ) && !!localStorage.getItem(LS.parentSecA);
}
/** The stored question id (index into SECURITY_QUESTIONS), or null if unset. */
export function securityQuestionId(): string | null {
  return localStorage.getItem(LS.parentSecQ);
}
export function setSecurityQA(qid: string, answer: string): void {
  localStorage.setItem(LS.parentSecQ, qid);
  localStorage.setItem(LS.parentSecA, pinHash(normalizeRecoveryAnswer(answer)));
}
export function verifySecurityQA(answer: string): boolean {
  const stored = localStorage.getItem(LS.parentSecA);
  return !!stored && stored === pinHash(normalizeRecoveryAnswer(answer));
}
export function clearSecurityQA(): void {
  localStorage.removeItem(LS.parentSecQ);
  localStorage.removeItem(LS.parentSecA);
}

/* ── #330 Kotha: privacy-scrubbed cross-kid aggregates ─────────────────── */

/** Cached parent privacy opt-in ("1" / "0" / null when signed out). */
export function aggregateOptIn(): boolean {
  return localStorage.getItem(LS.parentAggregateOptIn) === "1";
}

/** Flip the parent's aggregate-sharing opt-in via PATCH /auth/me. Returns
 *  true when the server accepted it (offline → false, UI keeps the old state). */
export async function setAggregateOptIn(on: boolean): Promise<boolean> {
  const token = localStorage.getItem(LS.parentToken);
  if (!token) return false;
  try {
    const res = await fetch(`${API}/auth/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ aggregate_opt_in: on }),
    });
    if (res.ok) {
      localStorage.setItem(LS.parentAggregateOptIn, on ? "1" : "0");
      return true;
    }
  } catch {
    /* offline — leave the stored state untouched */
  }
  return false;
}

/** Cross-kid Kotha aggregates (opted-in families only, zero kid identity).
 *  Returns null when not opted in / signed out / offline. */
export async function fetchAggregates(): Promise<KothaAggregates | null> {
  const token = localStorage.getItem(LS.parentToken);
  if (!token) return null;
  try {
    const res = await fetch(`${API}/stories/aggregates`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as KothaAggregates;
  } catch {
    return null;
  }
}

/** Shape of the cross-kid aggregates response — no kid identity anywhere. */
export interface KothaAggregates {
  contributing_kids: number;
  total_stories: number;
  success_rate: number;
  top_misconceptions: { code: string; count: number }[];
  error_kind_distribution: { error_kind: string; count: number }[];
  top_struggle_skills: { skill_id: string; count: number }[];
}

/** Full sign-out: revoke the session server-side (so the token dies on the
 *  API too, not just on this device), then clear the local parent session and
 *  the kid→server mapping. Offline-safe — local clear always wins. After this
 *  the app falls back to the guest/device account (progress stays local). */
export async function signoutParent(): Promise<void> {
  const token = localStorage.getItem(LS.parentToken);
  if (token) {
    try {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      /* offline — the local clear below still ends the session here */
    }
  }
  localStorage.removeItem(LS.parentToken);
  localStorage.removeItem(LS.parentName);
  localStorage.removeItem(LS.parentKid);
  localStorage.removeItem(LS.kidMap);
  resetIdentity();
}

/** Drop the cached sync identity so the NEXT call picks up a new parent token
 *  (or the device account) — call after sign-in / sign-out / validation. */
function resetIdentity(): void {
  identityPromise = null;
}

let syncing = false;

/** Drain the persisted outbox to the server (one batch per call, batching the
 *  rest). Safe to call from anywhere, any number of times — concurrent calls
 *  share the lock and never double-post. A successful batch instantly drains
 *  the remainder, so a kid banging through rounds syncs continuously — the 30s
 *  heartbeat is only the safety net for a failed/offline send. */
export async function syncProgress(): Promise<void> {
  if (syncing) return;
  const { pending, setSyncState } = useKidStore.getState();
  if (pending.length === 0) {
    setSyncState("idle");
    return;
  }
  const identity = await ensureIdentity();
  if (!identity) {
    setSyncState("offline");
    return;
  }
  syncing = true;
  let drained = false;
  try {
    const batch = pending.slice(0, SYNC_LIMIT);
    const mapped = batch.filter((e) => identity.kidFor(e.kidId) !== null);
    const orphaned = batch.filter((e) => identity.kidFor(e.kidId) === null);
    if (mapped.length === 0) {
      // local kids were deleted — drop their orphaned events, keep the rest
      useKidStore.getState().clearPending(new Set([...orphaned.map((e) => e.uid), ...batch.map((e) => e.uid)]));
      setSyncState("idle");
      drained = true;
      return;
    }
    setSyncState("syncing");
    // #9 — carry each kid's current coin wallet with the batch so the server
    // keeps the max (newest-wins) and a second device can restore it.
    const coins: Record<string, number> = {};
    for (const e of mapped) {
      const sid = identity.kidFor(e.kidId);
      if (sid && !(sid in coins)) coins[sid] = useKidStore.getState().nova[e.kidId]?.coins ?? 0;
    }
    const res = await fetch(`${API}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${identity.token}` },
      body: JSON.stringify({
        events: mapped.map((e) => ({
          kid_id: identity.kidFor(e.kidId),
          skill_id: e.skillId,
          game_id: e.gameId,
          correct: e.correct,
          response_ms: e.responseMs,
          difficulty: e.difficulty,
          timestamp: e.ts,
        })),
        coins,
      }),
    });
    if (res.ok) {
      const done = new Set([...orphaned.map((e) => e.uid), ...mapped.map((e) => e.uid)]);
      useKidStore.getState().clearPending(done);
      setSyncState("ok");
      drained = true;
    } else {
      setSyncState("error");
    }
  } catch {
    setSyncState("offline");
  } finally {
    syncing = false;
  }
  // More queued and the last send made progress → keep draining right away.
  // (On failure we stop here; the heartbeat + online/visibility retry instead.)
  if (drained && useKidStore.getState().pending.length > 0) {
    window.setTimeout(() => void syncProgress(), 0);
  }
}

let storySyncing = false;

/** 📚 KOTHA — drain the learning-story outbox to POST /stories.
 *  Same durable-outbox contract as syncProgress: shares the lock, maps local
 *  kid ids → server kids, posts one batch, clears exactly what posted, and
 *  lets the heartbeat/online/visibility events retry what was missed. */
export async function syncStories(): Promise<void> {
  if (storySyncing) return;
  const { stories } = useKidStore.getState();
  if (stories.length === 0) return;
  const identity = await ensureIdentity();
  if (!identity) {
    useKidStore.getState().setSyncState("offline");
    return;
  }
  storySyncing = true;
  try {
    const batch = stories.slice(0, SYNC_LIMIT);
    const mapped = batch.filter((st) => identity.kidFor(st.kidId) !== null);
    const orphaned = batch.filter((st) => identity.kidFor(st.kidId) === null);
    if (mapped.length === 0) {
      // local kids were deleted — drop their orphaned stories
      useKidStore.getState().clearStories(new Set([...orphaned.map((st) => st.uid), ...batch.map((st) => st.uid)]));
      return;
    }
    useKidStore.getState().setSyncState("syncing");
    const res = await fetch(`${API}/stories`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${identity.token}` },
      body: JSON.stringify(
        mapped.map((st) => ({
          kid_id: identity.kidFor(st.kidId),
          uid: st.uid, // dedup key — replayed batches are no-ops server-side (#331)
          skill_id: st.skillId,
          game_id: st.gameId,
          outcome: st.outcome,
          error_kind: st.errorKind,
          misconception_code: st.misconceptionCode,
          action: st.action,
          difficulty: st.difficulty,
          response_ms: st.responseMs,
          wrong_streak: st.wrongStreak,
          context: st.context,
        })),
      ),
    });
    if (res.ok) {
      const done = new Set([...orphaned.map((st) => st.uid), ...mapped.map((st) => st.uid)]);
      useKidStore.getState().clearStories(done);
      useKidStore.getState().setSyncState("ok");
    } else {
      useKidStore.getState().setSyncState("error");
    }
  } catch {
    useKidStore.getState().setSyncState("offline");
  } finally {
    storySyncing = false;
  }
}

/** 📚 KOTHA OFFLINE-QUOTA (#334) — when the local story queue hits its cap,
 *  eagerly drain it. Best-effort: if we're offline the heartbeat keeps retrying
 *  and the queue stays intact (never dropped before a confirmed send). */
export function drainStoriesIfFull(): void {
  const { stories, syncState } = useKidStore.getState();
  if (stories.length >= STORY_QUEUE_CAP && syncState !== "syncing") {
    void syncStories();
  }
}

/** 🔍 KOTHA SEARCH — filter a kid's stories by skill / error kind / action /
 *  misconception code. `filters` is a partial object; empty filters return
 *  everything (newest first). Works online (server filter) — the store's local
 *  copy is the offline mirror via filterLocalStories(). */
export interface LearningStoryRow {
  id: string;
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

export interface StoryStats {
  total: number;
  by_skill: Record<string, number>;
  by_error_kind: Record<string, number>;
  by_misconception: Record<string, number>;
}

/** 🔍 KOTHA SEARCH — filter a kid's stories by skill / error kind / action /
 *  misconception code. `filters` is a partial object; empty filters return
 *  everything (newest first). Works online (server filter) — the store's local
 *  copy is the offline mirror via filterLocalStories(). */
export async function fetchStories(
  kidId: string,
  filters: { skillId?: string; errorKind?: string; action?: string; misconceptionCode?: string } = {},
  limit = 100,
): Promise<LearningStoryRow[]> {
  const identity = await ensureIdentity();
  const serverKid = identity?.kidFor(kidId);
  if (!identity || !serverKid) return [];
  const q = new URLSearchParams({ limit: String(limit) });
  if (filters.skillId) q.set("skill_id", filters.skillId);
  if (filters.errorKind) q.set("error_kind", filters.errorKind);
  if (filters.action) q.set("action", filters.action);
  if (filters.misconceptionCode) q.set("misconception_code", filters.misconceptionCode);
  const res = await fetch(`${API}/kids/${serverKid}/stories?${q}`, {
    headers: { Authorization: `Bearer ${identity.token}` },
  });
  if (!res.ok) return [];
  return res.json();
}

/** 📊 KOTHA COUNTS — totals grouped by skill / error kind / misconception, so a
 *  parent or Moni can surface recurring trouble without paging through rows. */
export async function fetchStoryStats(kidId: string): Promise<StoryStats | null> {
  const identity = await ensureIdentity();
  const serverKid = identity?.kidFor(kidId);
  if (!identity || !serverKid) return null;
  const res = await fetch(`${API}/kids/${serverKid}/stories/stats`, {
    headers: { Authorization: `Bearer ${identity.token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/** 🛜 OFFLINE KOTHA SEARCH — same filters, applied to the store's local stories
 *  (the durable outbox + last-synced mirror). Works with no network at all. */
export function filterLocalStories(
  filters: { skillId?: string; errorKind?: string; action?: string; misconceptionCode?: string },
  limit = 100,
): KothaStory[] {
  const { stories } = useKidStore.getState();
  return stories
    .filter((s) => {
      if (filters.skillId && s.skillId !== filters.skillId) return false;
      if (filters.errorKind && s.errorKind !== filters.errorKind) return false;
      if (filters.action && s.action !== filters.action) return false;
      if (filters.misconceptionCode && s.misconceptionCode !== filters.misconceptionCode) return false;
      return true;
    })
    .slice(0, limit);
}

/** #9 — pull one kid's aggregate server profile (mastery + coins). Returns null
 *  when there's no mapping / offline / server error — restore is always best-effort. */
async function fetchSnapshot(localKidId: string): Promise<{
  coins: number;
  mastery: Array<{ skillId: string; mastery: number; correct: number; attempts: number; streak: number }>;
} | null> {
  const identity = await ensureIdentity();
  const sid = identity?.kidFor(localKidId);
  if (!identity || !sid) return null;
  try {
    const res = await fetch(`${API}/kids/${sid}/snapshot`, {
      headers: { Authorization: `Bearer ${identity.token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { coins: data.coins ?? 0, mastery: data.mastery ?? [] };
  } catch {
    return null; // offline — skip quietly, retry next tick
  }
}

let lastRestoreAt = 0;

/** #9 — multi-device sync, RESTORE side: on a second device after the parent
 *  signs in, merge every mapped kid's server profile into the local store
 *  (newest-wins). Offline-first unaffected — this never touches the outbox and
 *  never blocks gameplay. Throttled to once per 5 min so the heartbeat stays
 *  quiet on the primary device (where the merge is a no-op / equal-values). */
export async function restoreServerState(): Promise<void> {
  const now = Date.now();
  if (now - lastRestoreAt < 5 * 60_000) return;
  const identity = await ensureIdentity();
  if (!identity) return; // offline — don't consume the throttle; retry on the online event
  lastRestoreAt = now;
  for (const k of localKids()) {
    const snap = await fetchSnapshot(k.id);
    if (snap) useKidStore.getState().restoreSnapshot(k.id, snap);
  }
}

/** Kick off always-sync: immediate drain (clears offline backlog on open),
 *  a 30s heartbeat, plus instant retries on reconnect / app-foreground. */
export function startAutoSync(): () => void {
  const tick = () => {
    void syncProgress();
    void syncStories();
    // #9 — second-device catch-up: throttled inside.
    void restoreServerState();
  };
  tick();
  const iv = window.setInterval(tick, 30_000);
  const onOnline = () => tick();
  const onVisible = () => {
    if (document.visibilityState === "visible") tick();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(iv);
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/* ── Parent controls: per-kid settings the parent portal sets ──────────── */

export interface KidSettings {
  enabled_subjects: string[] | null; // null = all
  max_band: number | null; // null = no cap
  daily_limit_min: number | null; // null = unlimited
  /** #6 — per-day-of-week caps: "45,45,45,45,45,90,90" (Mon..Sun; 0 = unlimited
   *  that day). null = fall back to daily_limit_min, then the built-in defaults. */
  weekday_limits_min: string | null;
  tts_enabled: boolean;
  music_enabled: boolean;
  /** #243 — per-kid volume balance (0..1). Undefined = full (1.0). */
  voice_volume?: number;
  sfx_volume?: number;
  music_volume?: number;
  /** #138 — kid records their own voice and replays. Parent-gated, OFF by
   *  default (privacy-first); when on, recordings stay ON-DEVICE only. */
  voice_record_enabled: boolean;
}

export const KID_SETTINGS_DEFAULT: KidSettings = {
  enabled_subjects: null,
  max_band: null,
  daily_limit_min: null,
  weekday_limits_min: null,
  tts_enabled: true,
  music_enabled: true,
  voice_volume: 1,
  sfx_volume: 1,
  music_volume: 1,
  voice_record_enabled: false,
};

/** #6 — the effective daily playtime cap (minutes) for the CURRENT weekday.
 *  Precedence: per-weekday caps (0 = unlimited that day) → the flat
 *  daily_limit_min → the built-in defaults (45 min school Mon–Fri, 90 weekend).
 *  Returns null when the day is unlimited. */
export function todayLimitMin(settings: KidSettings): number | null {
  // today → 0=Mon..6=Sun (getDay() is 0=Sun..6=Sat)
  const dow = (new Date().getDay() + 6) % 7;
  if (settings.weekday_limits_min) {
    const parts = settings.weekday_limits_min.split(",").map((x) => parseInt(x, 10));
    const v = parts[dow];
    if (Number.isFinite(v)) return v > 0 ? v : null;
  }
  if (settings.daily_limit_min && settings.daily_limit_min > 0) return settings.daily_limit_min;
  return dow < 5 ? 45 : 90; // Mon–Fri 45, Sat–Sun 90
}

const LS_SETTINGS = "nv_kid_settings"; // { localKidId: KidSettings }

function readSettingsCache(): Record<string, KidSettings> {
  try {
    return JSON.parse(localStorage.getItem(LS_SETTINGS) ?? "{}") as Record<string, KidSettings>;
  } catch {
    return {};
  }
}

/** Per-kid parent controls, cached locally so offline play still respects the
 *  parent's rules. Pulls fresh from the server (matching the kid's identity)
 *  each call; falls back to cache on failure. */
export async function fetchKidSettings(kidId: string): Promise<KidSettings> {
  const cache = readSettingsCache();
  const identity = await ensureIdentity();
  if (!identity) return cache[kidId] ?? KID_SETTINGS_DEFAULT;
  const serverKid = identity.kidFor(kidId);
  if (!serverKid) return cache[kidId] ?? KID_SETTINGS_DEFAULT;
  try {
    const res = await fetch(`${API}/kids/${serverKid}/settings`, {
      headers: { Authorization: `Bearer ${identity.token}` },
    });
    if (!res.ok) throw new Error(`settings ${res.status}`);
    const s = (await res.json()) as KidSettings;
    cache[kidId] = s;
    try {
      localStorage.setItem(LS_SETTINGS, JSON.stringify(cache));
    } catch {
      /* storage full — ignore */
    }
    return s;
  } catch {
    return cache[kidId] ?? KID_SETTINGS_DEFAULT;
  }
}

/** The most recent cached settings for a kid (synchronous, for first paint). */
export function cachedKidSettings(kidId: string): KidSettings {
  return readSettingsCache()[kidId] ?? KID_SETTINGS_DEFAULT;
}

/** Start-of-day playtime tracker for the daily-limit gate. Stores minutes
 *  played per date (rolling 7 days) so the parent's limit resets each day. */
const LS_PLAYTIME = "nv_play_minutes";

export function todayMinutes(): number {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_PLAYTIME) ?? "{}") as Record<string, number>;
    return raw[new Date().toISOString().slice(0, 10)] ?? 0;
  } catch {
    return 0;
  }
}

export function addTodayMinutes(mins: number): number {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = JSON.parse(localStorage.getItem(LS_PLAYTIME) ?? "{}") as Record<string, number>;
    raw[today] = (raw[today] ?? 0) + mins;
    // prune anything older than a week
    const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    for (const d of Object.keys(raw)) if (d < cutoff) delete raw[d];
    localStorage.setItem(LS_PLAYTIME, JSON.stringify(raw));
    return raw[today];
  } catch {
    return todayMinutes();
  }
}

export type { RoundResult, SyncEvent };
export { useKidStore };
