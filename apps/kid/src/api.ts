import { useKidStore, wipePersistedStore, STORY_QUEUE_CAP, type AccelEvent, type KothaStory, type RoundResult, type SyncChannel, type SyncEvent } from "./store";
import { hashParentSecret, verifyParentSecret, deriveDeviceSecret } from "./lib/pinHash";

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
  secret: "nv_device_secret", // #1775 — random SEED; the account credential is its PBKDF2 derivation (salt = deviceId), never this raw value
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

/** #818 — guarded localStorage reads: private-browsing / storage-denied
 *  contexts make a bare getItem throw, so every JSON.parse site goes through
 *  one safe read + a shape check (no unchecked `as` casts). */
function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseJsonArray(raw: string | null): unknown[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseJsonRecord(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function localKids(): Array<{ id: string; name: string; avatar?: string; birthYear: number }> {
  const parsed = parseJsonArray(readLS("nv_kids"));
  if (!parsed) return [];
  const out: Array<{ id: string; name: string; avatar?: string; birthYear: number }> = [];
  for (const item of parsed) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") continue;
    out.push({
      id: item.id,
      name: item.name,
      avatar: typeof item.avatar === "string" ? item.avatar : undefined,
      birthYear: typeof item.birthYear === "number" && item.birthYear > 0 ? item.birthYear : new Date().getFullYear(),
    });
  }
  return out;
}

function readKidMap(): Record<string, string> {
  const parsed = parseJsonRecord(readLS(LS.kidMap));
  const out: Record<string, string> = {};
  if (!parsed) return out;
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
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
  // #264 — no cached token + offline = never attempt auth (a failed signup
  // request would escape the SW cache). ensureIdentity treats the throw as
  // "offline — retry next tick".
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline: no cached device token");
  let secret = localStorage.getItem(LS.secret);
  if (!secret) {
    secret = genSecret();
    localStorage.setItem(LS.secret, secret);
  }
  const email = `kid-${deviceId.slice(0, 12)}@numberverse.dev`;
  // #1775 — the account password is the DETERMINISTIC PBKDF2 derivation of
  // the seed (salt = deviceId), NOT the raw localStorage seed. Copying a
  // localStorage blob from one phone no longer authenticates to someone
  // else's/another device's account.
  const derived = await deriveDeviceSecret(secret, deviceId);
  // signup; if the email already exists (retry after a failed persist),
  // fall back to login with the same derived credential.
  let res = await fetch(`${API}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: derived, display_name: "Kid Device" }),
  });
  if (res.status === 409) {
    res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: derived }),
    });
    // #1775 — legacy installs created the account with the RAW seed as its
    // password, so their derived login 401s. Retry ONCE with the raw seed so
    // existing devices keep syncing (their outbox must not wedge), and flag
    // the legacy credential for rotation. (The real fix — POST
    // /auth/change-password current=raw→next=derived — is owned by the API
    // wave; sibling tasks are not touched here.)
    if (res.status === 401) {
      res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: secret }),
      });
      // #1775 — no console log here (audit forbids console.* that ships to
      // kids); the legacy-credential path stays silent by design and the
      // change-password rotation is owned by the API wave.
    }
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
  // #264 — offline-first: if every local kid is already mapped, the `/kids`
  // fetch below is pure overhead (and an offline failure would escape the SW
  // cache). Short-circuit to zero network. The sync entry points also gate on
  // navigator.onLine, so this only matters for the mapped-roster fast path.
  if (localKids().every((k) => map[k.id])) return map;
  let changed = false;
  const existing = await fetch(`${API}/kids`, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
    r.ok ? r.json() : []
  );
  // #1809 — a server kid may be claimed by AT MOST ONE local kid. Track every
  // server id already mapped (persisted map + this pass) so a name/year that a
  // twin already claimed can't silently merge two local kids onto one server
  // kid (collapsing their separate progress). An AMBIGUOUS match (zero or
  // multiple unclaimed server kids with the same name/year) also creates fresh.
  const claimed = new Set<string>(Object.values(map));
  for (const k of localKids()) {
    if (map[k.id]) continue;
    const matches = (existing as Array<{ id: string; name: string; birth_year?: number | null }>).filter(
      (sk) => sk.name === k.name && String(sk.birth_year) === String(k.birthYear) && !claimed.has(sk.id)
    );
    if (matches.length === 1) {
      map[k.id] = matches[0].id;
      claimed.add(matches[0].id);
      changed = true;
      continue;
    }
    const created = await fetch(`${API}/kids`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: k.name, avatar: k.avatar, birth_year: k.birthYear }),
    });
    if (!created.ok) throw new Error(`kid create ${created.status}`);
    const srvId = (await created.json()).id as string;
    map[k.id] = srvId;
    claimed.add(srvId);
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
    // #3084 — read via readLS() so a storage-denied getItem never throws and
    // rejects this IIFE (the whole body must stay rejection-free).
    const parentToken = readLS(LS.parentToken);
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
      // #3084 — read via readLS() (storage-denied safe); the setItem is already
      // guarded by the surrounding try/catch, which returns null on throw.
      let deviceId = readLS(LS.deviceId);
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
  // #3084 — forget the cache once settled so a later failure retries fresh.
  // Guard the clear with an identity check (so a resetIdentity() that cached a
  // NEW promise before this stale .then runs doesn't get its fresh cache wiped)
  // and give the discarded chain a rejection handler so a storage-denied throw
  // can't become an unhandled rejection.
  void p.then(
    () => {
      if (identityPromise === p) identityPromise = null;
    },
    () => {
      if (identityPromise === p) identityPromise = null;
    }
  );
  return p;
}

/** #3085 — resolve the sync identity without ever rejecting. `ensureIdentity`
 *  is already written to be rejection-free, but the four drain/restore entry
 *  points call it OUTSIDE their try blocks, so a single unexpected throw (e.g. a
 *  storage-denied getItem upstream of the catch) would surface as an unhandled
 *  rejection on the heartbeat tick and silently stop draining. Folding the call
 *  through this helper treats any such rejection as the offline branch (null),
 *  exactly like the `if (!identity)` guards those functions already handle. */
async function resolveIdentity(): Promise<SyncIdentity | null> {
  try {
    return await ensureIdentity();
  } catch {
    return null;
  }
}

/* ── Parent sign-in / sign-up (the first-load gate) ────────────────────── */
export function hasParentSession(): boolean {
  return !!localStorage.getItem(LS.parentToken);
}

export function parentName(): string | null {
  return localStorage.getItem(LS.parentName);
}

/** #1773 — refresh the httpOnly cookie into a fresh short-lived access token
 *  (same-origin). Never lets the week-long credential touch JS/localStorage. */
async function tryRefreshParentSession(): Promise<string | null> {
  try {
    const res = await fetch(`${API}/auth/refresh`, { method: "POST", credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.access_token === "string") {
      localStorage.setItem(LS.parentToken, data.access_token);
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

/** Validate the stored parent token against /auth/me. Clears it when invalid. */
export async function validateParentSession(): Promise<boolean> {
  // #3089 — read via readLS() so a storage-denied getItem never throws and
  // rejects the caller (this function is fire-and-forgot with a .then handler).
  const token = readLS(LS.parentToken);
  if (!token) return false;
  try {
    const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return true;
    // #1234 — a 503 is the SW's "offline, answered from the boundary" envelope
    // (or any server-side hiccup): NOT proof the token is invalid, so keep the
    // parent session. Only a genuine 401/403 (rejected by the API) logs out.
    if (res.status === 401 || res.status === 403) {
      // #1773 — the stored access token is short-lived (≤15 min), so a genuine
      // 401/403 may just mean it expired while the httpOnly refresh cookie is
      // still valid. Try ONE refresh before clearing the parent session.
      const fresh = await tryRefreshParentSession();
      if (fresh) return true;
      // #1687 — the session is conclusively dead AND the refresh cookie couldn't
      // revive it (a deleted account's sessions are cascade-removed, so this is
      // also the account-gone signal). Wipe the persisted store + credentials +
      // PIN/QA keys and drop to the gate instead of only clearing the token.
      handleAccountGone();
      return false;
    }
    return true; // 5xx / offline envelope — keep the session, revalidate later
  } catch {
    return true; // offline — don't kick a valid parent out
  }
}

/** 30-day offline grace for a cached "plus" entitlement (freemium gate). */
const PLAN_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

/** Cache the entitlement the server reported for the signed-in parent. */
function cachePlan(profile: { plan?: string } | undefined): void {
  const plan = profile?.plan === "plus" ? ("plus" as const) : ("free" as const);
  useKidStore.getState().setPlan(plan, Date.now());
}

/** Refresh the cached billing entitlement. Trusts a cached "plus" within the
 *  30-day grace window (a paying family in airplane mode stays unlocked); a
 *  cached "free" always re-checks so an upgrade lands promptly. */
export async function refreshEntitlement(): Promise<void> {
  const { plan, planCheckedAt } = useKidStore.getState();
  const now = Date.now();
  if (plan === "plus" && planCheckedAt > 0 && now - planCheckedAt <= PLAN_GRACE_MS) return;
  let token: string | null = null;
  try {
    token = localStorage.getItem(LS.parentToken);
  } catch {
    /* storage denied */
  }
  if (!token) {
    useKidStore.getState().setPlan("free", now);
    return;
  }
  try {
    const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      cachePlan(data.profile);
    }
    // non-ok → keep the current cache (transient/offline); re-check later.
  } catch {
    // offline — keep the current cache.
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
  cachePlan(data.profile);
}

/** #1463 — Google sign-in failure modes. The gate needs to tell a parent WHY
 *  the Google path bailed: a flaky connection (network), a backend without
 *  NV_GOOGLE_CLIENT_ID (backend-disabled), or a token the API genuinely
 *  rejected (token-rejected). */
export type GoogleSignInErrorKind = "network" | "backend-disabled" | "token-rejected";

export class GoogleSignInError extends Error {
  kind: GoogleSignInErrorKind;
  constructor(kind: GoogleSignInErrorKind, message: string) {
    super(message);
    this.name = "GoogleSignInError";
    this.kind = kind;
  }
}

/** Google sign-in: send the client ID token to the API, which verifies it
 *  server-side against NV_GOOGLE_CLIENT_ID and issues our own JWT. */
export async function signinGoogle(idToken: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken }),
    });
  } catch {
    throw new GoogleSignInError("network", "google-signin-network");
  }
  if (res.status === 501) {
    throw new GoogleSignInError("backend-disabled", "google-signin-backend-disabled");
  }
  if (!res.ok) {
    throw new GoogleSignInError("token-rejected", "google-signin-failed");
  }
  const data = await res.json();
  localStorage.setItem(LS.parentToken, data.token as string);
  localStorage.setItem(LS.parentName, (data.profile?.display_name as string) ?? "Parent");
  resetIdentity();
  cachePlan(data.profile);
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
  cachePlan(data.profile);
}

export function clearParentSession(): void {
  localStorage.removeItem(LS.parentToken);
  localStorage.removeItem(LS.parentName);
  localStorage.removeItem(LS.parentAggregateOptIn);
  resetIdentity();
}

/** #1687 — the server reports the account is GONE (401/410 on /auth/me or a
 *  sync drain): the parent account and every server-side kid under it were
 *  deleted (right-to-erasure, #980). Wipe the device's persisted kid store,
 *  the parent credentials, the PIN/QA keys and the kid→server mapping so no
 *  stale progress or credential can linger, then emit a signal the app listens
 *  for to drop to the gate.
 *
 *  The anonymous DEVICE account (guest mode) is deliberately LEFT intact — it
 *  is a separate server account, untouched by the parent's deletion. */
export function handleAccountGone(): void {
  wipePersistedStore(); // #1687 — resets nv_store_v1 + the sync-signal mirror
  localStorage.removeItem(LS.parentToken);
  localStorage.removeItem(LS.parentName);
  localStorage.removeItem(LS.parentAggregateOptIn);
  localStorage.removeItem(LS.parentKid);
  localStorage.removeItem(LS.kidMap);
  clearParentPin(); // #86
  clearSecurityQA(); // #247
  resetIdentity();
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event("nv:account-gone"));
    } catch {
      /* non-browser / older webview — the cleared keys still protect reloads */
    }
  }
}

/* ── #86 Parent-area PIN lock ────────────────────────────────────────────
 * A 4-digit gate on the signed-in parent panel, so a kid who's handed a
 * signed-in device can't open parent territory. Only a PBKDF2-SHA-256 hash is
 * stored — never the raw PIN — which is brute-force resistant even if a kid
 * copies the localStorage blob. The PIN is per-device and never leaves the
 * device. (#819)
 */
export function hasParentPin(): boolean {
  return !!readLS(LS.parentPin);
}
export async function setParentPin(pin: string): Promise<void> {
  localStorage.setItem(LS.parentPin, await hashParentSecret(pin));
}
export async function verifyParentPin(pin: string): Promise<boolean> {
  const stored = readLS(LS.parentPin);
  if (!stored) return false;
  try {
    if (!(await verifyParentSecret(pin, stored))) return false;
  } catch {
    return false;
  }
  // #819 — legacy upgrade: a pre-PBKDF2 install stored a weak fixed-salt
  // `fnv1a$…` hash. It verified, so re-hash to the slow per-device KDF NOW so
  // the weak hash doesn't linger in localStorage for offline brute-forcing.
  if (stored.startsWith("fnv1a$")) {
    localStorage.setItem(LS.parentPin, await hashParentSecret(pin));
  }
  return true;
}
export function clearParentPin(): void {
  localStorage.removeItem(LS.parentPin);
}

/* ── #247 PIN recovery Q&A ────────────────────────────────────────────────
 * A per-device security question + answer so a parent who forgot the PIN (or
 * hit the 3-try pad lock) can reset it IN PLACE — offline, no sign-out, no
 * account lockout. Same trust model as the PIN itself: only the PBKDF2 hash of
 * the answer is stored; the question id is an index into the i18n list so a
 * locale change never corrupts the pairing. The answer is normalized (trim,
 * lower-case, collapse spaces) so "Blue " and "blue" both verify. (#819)
 */
function normalizeRecoveryAnswer(a: string): string {
  return a.trim().toLowerCase().replace(/\s+/g, " ");
}
export function hasSecurityQA(): boolean {
  return !!readLS(LS.parentSecQ) && !!readLS(LS.parentSecA);
}
/** The stored question id (index into SECURITY_QUESTIONS), or null if unset. */
export function securityQuestionId(): string | null {
  return readLS(LS.parentSecQ);
}
export async function setSecurityQA(qid: string, answer: string): Promise<void> {
  localStorage.setItem(LS.parentSecQ, qid);
  localStorage.setItem(LS.parentSecA, await hashParentSecret(normalizeRecoveryAnswer(answer)));
}
export async function verifySecurityQA(answer: string): Promise<boolean> {
  const stored = readLS(LS.parentSecA);
  if (!stored) return false;
  const normalized = normalizeRecoveryAnswer(answer);
  try {
    if (!(await verifyParentSecret(normalized, stored))) return false;
  } catch {
    return false;
  }
  // #819 — legacy upgrade (same as verifyParentPin): re-hash a verified legacy
  // `fnv1a$…` recovery answer to the slow KDF so it doesn't linger.
  if (stored.startsWith("fnv1a$")) {
    localStorage.setItem(LS.parentSecA, await hashParentSecret(normalized));
  }
  return true;
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
  // #3089 — read via readLS() so a storage-denied getItem never throws and
  // rejects the caller (this function is fire-and-forgot with a .then handler).
  const token = readLS(LS.parentToken);
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
  resetIdentity();
  // #3089 — the local clear above is the source of truth; wrap the storage-only
  // removeItems so a storage-denied context can't turn signout into a reject.
  try {
    localStorage.removeItem(LS.parentToken);
    localStorage.removeItem(LS.parentName);
    localStorage.removeItem(LS.parentKid);
    localStorage.removeItem(LS.kidMap);
  } catch {
    /* storage denied — resetIdentity() above still drops the in-memory session */
  }
}

/** #1810 — restore throttle is keyed to the identity AND per-kid. The old
 *  single global timestamp was stamped BEFORE the fetch loop, so one mid-loop
 *  failure (offline / 5xx) skipped EVERY kid for 5 minutes. Each kid now has
 *  its own timestamp, and only a SUCCESSFUL snapshot consumes it — a failed kid
 *  retries on the next heartbeat while the healthy kids stay quiet. */
const RESTORE_INTERVAL_MS = 5 * 60_000;
const lastRestoreAtPerKid: Record<string, number> = {};

/** Drop the cached sync identity so the NEXT call picks up a new parent token
 *  (or the device account) — call after sign-in / sign-out / validation. */
function resetIdentity(): void {
  identityPromise = null;
  // A fresh identity (sign-in / sign-out) must perform its own first restore,
  // even if the previous account restored moments ago. The heartbeat stays
  // throttled because it does NOT reset the per-kid timestamps.
  for (const k of Object.keys(lastRestoreAtPerKid)) delete lastRestoreAtPerKid[k];
}

let syncing = false;

/* ── #1031 — retry backoff for the always-sync heartbeat ────────────────
 * A flat 30s interval hammered a failing server (or burned battery offline).
 * On consecutive failures the gap grows exponentially to 5min with ±20%
 * jitter; ANY confirmed server interaction resets it. Reconnect/foreground
 * also reset (a fresh chance — no backoff). */
const SYNC_BASE_MS = 30_000;
const SYNC_MAX_MS = 300_000;
let syncFailStreak = 0;

function syncBackoffDelay(): number {
  if (syncFailStreak <= 0) return SYNC_BASE_MS;
  const exp = Math.min(SYNC_BASE_MS * 2 ** Math.min(syncFailStreak, 6), SYNC_MAX_MS);
  return exp * (0.8 + Math.random() * 0.4); // ±20% jitter
}

/** Report one channel's sync outcome to the shared backoff. `ok` = the server
 *  confirmed the POST (any success resets the streak — the network works). */
function reportSyncOutcome(ok: boolean): void {
  syncFailStreak = ok ? 0 : Math.min(syncFailStreak + 1, 8);
}

/** #1029 — the currently-active auth token (parent account takes precedence
 *  over the anonymous device account). Re-read at SEND time so a sign-out/in
 *  that raced the heartbeat can't post to the old account. */
function currentAuthToken(): string | null {
  return localStorage.getItem(LS.parentToken) ?? localStorage.getItem(LS.deviceToken);
}

/* ── #1615 — ONE shared wire-payload type per endpoint ──────────────────────
 * The sync functions used to hand-roll snake_case object literals next to the
 * camelCase SyncEvent/KothaStory/AccelEvent interfaces — a field rename on one
 * side could silently drift from the other. These typed mappers are the single
 * serialization seam: the payload shape cannot change without TS checking it
 * against the interface it serializes. */

export interface ProgressWireEvent {
  kid_id: string;
  skill_id: string;
  game_id: string;
  correct: boolean;
  response_ms: number;
  difficulty: number;
  uid: string | null; // #1023 — durable-outbox dedup key
  timestamp: number; // #1024 — client round timestamp (epoch ms)
  kind?: string; // #1616 — engagement/telemetry kind (round|wrong|coins|…)
  meta?: Record<string, unknown>; // #1616 — small engagement payload
}

export interface StoryWireEvent {
  kid_id: string;
  uid: string | null; // #331 — durable-outbox dedup key
  skill_id: string;
  game_id: string;
  outcome: boolean;
  error_kind: string | null;
  misconception_code: string | null;
  action: string | null;
  difficulty: number;
  response_ms: number;
  wrong_streak: number;
  context: Record<string, unknown>;
}

export interface AccelWireEvent {
  kid_id: string;
  uid: string | null; // #249 — durable-outbox dedup key
  skill_id: string;
  reason: string;
  band_from: number;
  band_to: number;
}

function toProgressWire(e: SyncEvent, serverKid: string): ProgressWireEvent {
  return {
    kid_id: serverKid,
    skill_id: e.skillId,
    game_id: e.gameId,
    correct: e.correct,
    response_ms: e.responseMs,
    difficulty: e.difficulty,
    uid: e.uid,
    timestamp: e.ts,
    ...(e.kind ? { kind: e.kind } : {}),
    ...(e.meta ? { meta: e.meta } : {}),
  };
}

function toStoryWire(st: KothaStory, serverKid: string): StoryWireEvent {
  return {
    kid_id: serverKid,
    uid: st.uid,
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
  };
}

function toAccelWire(a: AccelEvent, serverKid: string): AccelWireEvent {
  return {
    kid_id: serverKid,
    uid: a.uid,
    skill_id: a.skillId,
    reason: a.reason,
    band_from: a.bandFrom,
    band_to: a.bandTo,
  };
}

/** #1029 — the captured identity predates a sign-out/in; drop this drain and
 *  re-resolve fresh next heartbeat so the kid's progress lands on the CURRENT
 *  account (never silently on the old parent's profile). */
function dropStaleIdentity(channel: SyncChannel): void {
  resetIdentity();
  useKidStore.getState().setChannelSyncState(channel, "idle");
}

/** #1811 — a drain was rejected with 401/403: the credential is stale or
 *  revoked. The old code treated it as a permanent "error" (or — for 401 — as
 *  account-gone, wiping the store) and never re-authenticated, wedging the
 *  outbox on a dead token forever.
 *
 *  DEVICE account → clear the cached device token + the cached identity so the
 *  NEXT heartbeat re-auths fresh (deviceAuth signup→login, same deterministic
 *  device id) and drains the still-queued outbox. Surface a transient
 *  "reconnecting" state — better than a permanent "error".
 *
 *  PARENT account → the stored access token is short-lived (≤15 min), so a 401
 *  usually means it simply expired. Try ONE httpOnly-cookie refresh; if the
 *  refresh cookie is dead too, the account is conclusively gone (#1687) → wipe
 *  + drop to the gate (preserved account-erasure completeness). */
async function handleRejectedAuth(channel: SyncChannel): Promise<void> {
  let parentToken: string | null = null;
  try {
    parentToken = localStorage.getItem(LS.parentToken);
  } catch {
    parentToken = null;
  }
  if (parentToken) {
    const fresh = await tryRefreshParentSession();
    if (fresh) {
      // Access token refreshed — re-resolve identity next tick and keep the
      // queued outbox; this drain's batch was NOT posted, so stay transient.
      resetIdentity();
      useKidStore.getState().setChannelSyncState(channel, "reconnecting");
      useKidStore.getState().setSyncSignal({ lastError: "reconnecting" });
      reportSyncOutcome(false);
      return;
    }
    handleAccountGone();
    return;
  }
  try {
    localStorage.removeItem(LS.deviceToken);
  } catch {
    /* storage denied */
  }
  resetIdentity();
  useKidStore.getState().setChannelSyncState(channel, "reconnecting");
  useKidStore.getState().setSyncSignal({ lastError: "reconnecting" });
  reportSyncOutcome(false);
}

/** Drain the persisted outbox to the server (one batch per call, batching the
 *  rest). Safe to call from anywhere, any number of times — concurrent calls
 *  share the lock and never double-post. A successful batch instantly drains
 *  the remainder, so a kid banging through rounds syncs continuously — the 30s
 *  heartbeat is only the safety net for a failed/offline send. */
export async function syncProgress(): Promise<void> {
  if (syncing) return;
  // #3096 — acquire the drain lock BEFORE the first await (ensureIdentity).
  // Taking it late let two back-to-back calls both pass the `if (syncing)`
  // guard and both POST the same batch. Set it first, release it in `finally`,
  // so concurrent callers see the lock the moment they enter.
  syncing = true;
  const { pending, setChannelSyncState } = useKidStore.getState();
  if (pending.length === 0) {
    setChannelSyncState("progress", "idle");
    syncing = false;
    return;
  }
  // #264 — offline-first contract: never let the sync path fire network
  // requests that escape the service-worker cache (a failed fetch offline
  // breaks the "no network calls" guarantee). navigator.onLine is the browser's
  // offline flag; the 30s heartbeat / online + visibility listeners re-arm us.
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setChannelSyncState("progress", "offline");
    // #1556 — persist the parent-visible signal so the portal can see the
    // outbox is not draining (offline), not silently idle.
    useKidStore.getState().setSyncSignal({ lastError: "offline" });
    reportSyncOutcome(false);
    syncing = false;
    return;
  }
  const identity = await resolveIdentity();
  if (!identity) {
    setChannelSyncState("progress", "offline");
    useKidStore.getState().setSyncSignal({ lastError: "offline" });
    reportSyncOutcome(false);
    syncing = false;
    return;
  }
  // #1029 — a sign-out/in may have raced the heartbeat: the captured identity
  // still points at the OLD account. Never post to it; drop the drain and let
  // the next heartbeat re-resolve against the currently-active token.
  if (currentAuthToken() !== identity.token) {
    dropStaleIdentity("progress");
    syncing = false;
    return;
  }
  let drained = false;
  try {
    const batch = pending.slice(0, SYNC_LIMIT);
    const mapped = batch.filter((e) => identity.kidFor(e.kidId) !== null);
    if (mapped.length === 0) {
      // #1025 — NEVER destructively clear the batch on a mapping miss. `kidFor()`
      // returns null when the local roster (nv_kids) or the persisted kidMap
      // isn't hydrated/current yet — e.g. the roster read raced a kid-add, or
      // the parent just signed in and the map is being rebuilt. The old code
      // cleared the ENTIRE batch here (comment said "keep the rest", the code
      // dropped everything) — permanently losing real progress. There is NO
      // local kid-delete flow, so a miss is always transient. Keep the events
      // queued; the next heartbeat re-runs mapLocalKidsToServer (which re-maps
      // from localKids()) and drains. A genuinely-removed server kid surfaces
      // as a /progress 404 → error state, events stay queued (never silently
      // lost) — the safe failure mode.
      setChannelSyncState("progress", "idle");
      return; // drained stays false → heartbeat retries, no hot loop
    }
    setChannelSyncState("progress", "syncing");
    // #9 — carry each kid's current coin wallet with the batch so the server
    // keeps the max (newest-wins) and a second device can restore it.
    // #1804 — ALSO carry the monotonic wallet_seq so the server can do
    // last-write-wins (a spend lowers coins but bumps seq; the old max-of-coins
    // would resurrect the pre-spend balance).
    const coins: Record<string, number> = {};
    const walletSeq: Record<string, number> = {};
    for (const e of mapped) {
      const sid = identity.kidFor(e.kidId);
      if (sid && !(sid in coins)) coins[sid] = useKidStore.getState().nova[e.kidId]?.coins ?? 0;
      if (sid && !(sid in walletSeq)) walletSeq[sid] = useKidStore.getState().nova[e.kidId]?.walletSeq ?? 0;
    }
    const res = await fetch(`${API}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${identity.token}` },
      // #1615 — typed wire mapper (single serialization seam; see above).
      body: JSON.stringify({
        events: mapped.map((e) => toProgressWire(e, identity.kidFor(e.kidId) as string)),
        coins,
        wallet_seq: walletSeq, // #1804 — LWW wallet version per kid
      }),
    });
    if (res.ok) {
      // #1026 — the server band-locks stale-catalog / over-band events and
      // reports their uids. NEVER clear what wasn't recorded: keep the skipped
      // events queued so the parent sees a stuck outbox (and raising the band
      // lets them drain) instead of silently losing real progress. Only clear
      // exactly what the server persisted.
      const body = (await res.json().catch(() => null)) as { band_skipped_uids?: string[] } | null;
      const skipped = new Set(body?.band_skipped_uids ?? []);
      const recorded = mapped.filter((e) => !skipped.has(e.uid));
      const done = new Set(recorded.map((e) => e.uid));
      useKidStore.getState().clearPending(done);
      setChannelSyncState("progress", "ok");
      // #1556 — a confirmed server drain: clear the error and stamp success.
      useKidStore.getState().setSyncSignal({ lastSuccessAt: Date.now(), lastError: null });
      reportSyncOutcome(true);
      // Only a fully-recorded batch hot-loops; band-skipped events stay queued
      // and wait for the next heartbeat (no spin, no silent drop).
      drained = done.size === mapped.length;
    } else {
      // #1811 — 401/403 = stale/revoked credential: clear it + re-auth on the
      // next heartbeat (parent: refresh once, else account-gone #1687). The
      // outbox stays queued and the channel surfaces "reconnecting".
      // #1687 — 410 alone means the account is conclusively GONE (its tokens
      // died with it): wipe the persisted store + credentials + drop to the gate.
      // Any other failure keeps the outbox queued and parent-visible.
      if (res.status === 401 || res.status === 403) {
        await handleRejectedAuth("progress");
        return;
      }
      if (res.status === 410) {
        handleAccountGone();
        return;
      }
      setChannelSyncState("progress", "error");
      // #1556 — 429/5xx etc: the outbox is stuck; make it parent-visible.
      useKidStore.getState().setSyncSignal({ lastError: "error" });
      reportSyncOutcome(false);
    }
  } catch {
    setChannelSyncState("progress", "offline");
    useKidStore.getState().setSyncSignal({ lastError: "offline" });
    reportSyncOutcome(false);
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
  // #3096 — same early-lock fix as syncProgress: take the flag before the
  // first await so concurrent callers can't both drain the same batch.
  storySyncing = true;
  const { stories, setChannelSyncState } = useKidStore.getState();
  if (stories.length === 0) {
    // #1027 — empty channel: nothing in flight, never leave a stale 'syncing'.
    setChannelSyncState("stories", "idle");
    storySyncing = false;
    return;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setChannelSyncState("stories", "offline");
    // #1612 — a stuck /stories outbox is parent-visible too, not just a
    // channel state: the durable sync signal must reflect it.
    useKidStore.getState().setSyncSignal({ lastError: "offline" });
    reportSyncOutcome(false);
    storySyncing = false;
    return;
  }
  const identity = await resolveIdentity();
  if (!identity) {
    setChannelSyncState("stories", "offline");
    useKidStore.getState().setSyncSignal({ lastError: "offline" });
    reportSyncOutcome(false);
    storySyncing = false;
    return;
  }
  if (currentAuthToken() !== identity.token) {
    dropStaleIdentity("stories");
    storySyncing = false;
    return;
  }
  try {
    const batch = stories.slice(0, SYNC_LIMIT);
    const mapped = batch.filter((st) => identity.kidFor(st.kidId) !== null);
    if (mapped.length === 0) {
      // #1025/#1030 — never destructively clear on a mapping miss (same
      // reasoning as syncProgress). Keep the stories queued; the heartbeat
      // re-maps + retries. Surface idle so the indicator isn't stuck stale.
      setChannelSyncState("stories", "idle");
      return;
    }
    setChannelSyncState("stories", "syncing");
    const res = await fetch(`${API}/stories`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${identity.token}` },
      // #1615 — typed wire mapper (single serialization seam).
      body: JSON.stringify(
        mapped.map((st) => toStoryWire(st, identity.kidFor(st.kidId) as string)),
      ),
    });
    if (res.ok) {
      // #1026 — same rule as /progress: never clear band-skipped stories.
      const body = (await res.json().catch(() => null)) as { band_skipped_uids?: string[] } | null;
      const skipped = new Set(body?.band_skipped_uids ?? []);
      const done = new Set(mapped.filter((st) => !skipped.has(st.uid)).map((st) => st.uid));
      useKidStore.getState().clearStories(done);
      setChannelSyncState("stories", "ok");
      // #1612 — a confirmed /stories drain clears the parent-visible signal
      // exactly like syncProgress does.
      useKidStore.getState().setSyncSignal({ lastSuccessAt: Date.now(), lastError: null });
      reportSyncOutcome(true);
    } else {
      // #1811 — 401/403 = stale/revoked credential: re-auth on the next tick.
      // #1687 — 410 = account gone (see syncProgress): wipe + drop to gate.
      if (res.status === 401 || res.status === 403) {
        await handleRejectedAuth("stories");
        return;
      }
      if (res.status === 410) {
        handleAccountGone();
        return;
      }
      setChannelSyncState("stories", "error");
      useKidStore.getState().setSyncSignal({ lastError: "error" });
      reportSyncOutcome(false);
    }
  } catch {
    setChannelSyncState("stories", "offline");
    useKidStore.getState().setSyncSignal({ lastError: "offline" });
    reportSyncOutcome(false);
  } finally {
    storySyncing = false;
  }
}

/** 📚 KOTHA OFFLINE-QUOTA (#334) — when the local story queue hits its cap,
 *  eagerly drain it. Best-effort: if we're offline the heartbeat keeps retrying
 *  and the queue stays intact (never dropped before a confirmed send). */
export function drainStoriesIfFull(): void {
  // #1028 — guard on THIS channel's module lock, not the shared aggregate
  // syncState: syncProgress() setting 'syncing' must never block a stories
  // drain (and a stories 'syncing' must never spuriously block it either).
  const { stories } = useKidStore.getState();
  if (stories.length >= STORY_QUEUE_CAP && !storySyncing) {
    void syncStories();
  }
}

let accelSyncing = false;

/** 🚀 #249 — drain the acceleration outbox to POST /acceleration.
 *  Same durable-outbox contract as syncStories: maps local kid ids → server
 *  kids, posts one batch, clears exactly what posted, and lets the
 *  heartbeat/online/visibility events retry what was missed. */
export async function syncAccel(): Promise<void> {
  if (accelSyncing) return;
  // #3096 — same early-lock fix as syncProgress: take the flag before the
  // first await so concurrent callers can't both drain the same batch.
  accelSyncing = true;
  const { accel, setChannelSyncState } = useKidStore.getState();
  if (accel.length === 0) {
    // #1027 — empty channel: never leave a stale 'syncing'.
    setChannelSyncState("accel", "idle");
    accelSyncing = false;
    return;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setChannelSyncState("accel", "offline");
    // #1612 — a stuck /acceleration outbox is parent-visible too.
    useKidStore.getState().setSyncSignal({ lastError: "offline" });
    reportSyncOutcome(false);
    accelSyncing = false;
    return;
  }
  const identity = await resolveIdentity();
  if (!identity) {
    setChannelSyncState("accel", "offline");
    useKidStore.getState().setSyncSignal({ lastError: "offline" });
    reportSyncOutcome(false);
    accelSyncing = false;
    return;
  }
  if (currentAuthToken() !== identity.token) {
    dropStaleIdentity("accel");
    accelSyncing = false;
    return;
  }
  try {
    const batch = accel.slice(0, SYNC_LIMIT);
    const mapped = batch.filter((a) => identity.kidFor(a.kidId) !== null);
    if (mapped.length === 0) {
      // #1025/#1030 — never destructively clear on a mapping miss (same
      // reasoning as syncProgress). Keep the entries queued; the heartbeat
      // re-maps + retries. Surface idle so the indicator isn't stuck stale.
      setChannelSyncState("accel", "idle");
      return;
    }
    setChannelSyncState("accel", "syncing");
    const res = await fetch(`${API}/acceleration`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${identity.token}` },
      // #1615 — typed wire mapper (single serialization seam).
      body: JSON.stringify(
        mapped.map((a) => toAccelWire(a, identity.kidFor(a.kidId) as string)),
      ),
    });
    if (res.ok) {
      // The acceleration endpoint does no band-skipping; still parse the body
      // defensively so a future band_skipped_uids field never clears real rows.
      const body = (await res.json().catch(() => null)) as { band_skipped_uids?: string[] } | null;
      const skipped = new Set(body?.band_skipped_uids ?? []);
      const done = new Set(mapped.filter((a) => !skipped.has(a.uid)).map((a) => a.uid));
      useKidStore.getState().clearAccel(done);
      setChannelSyncState("accel", "ok");
      // #1612 — a confirmed /acceleration drain clears the parent-visible
      // signal exactly like syncProgress does.
      useKidStore.getState().setSyncSignal({ lastSuccessAt: Date.now(), lastError: null });
      reportSyncOutcome(true);
    } else {
      // #1811 — 401/403 = stale/revoked credential: re-auth on the next tick.
      // #1687 — 410 = account gone (see syncProgress): wipe + drop to gate.
      if (res.status === 401 || res.status === 403) {
        await handleRejectedAuth("accel");
        return;
      }
      if (res.status === 410) {
        handleAccountGone();
        return;
      }
      setChannelSyncState("accel", "error");
      useKidStore.getState().setSyncSignal({ lastError: "error" });
      reportSyncOutcome(false);
    }
  } catch {
    setChannelSyncState("accel", "offline");
    useKidStore.getState().setSyncSignal({ lastError: "offline" });
    reportSyncOutcome(false);
  } finally {
    accelSyncing = false;
  }
}

/** 🚀 #249 — eager drain when the acceleration queue hits its cap (same
 *  best-effort contract as drainStoriesIfFull — nothing dropped pre-confirm). */
export function drainAccelIfFull(): void {
  // #1028 — guard on THIS channel's module lock (same reasoning as
  // drainStoriesIfFull): the shared aggregate syncState is not this channel's
  // busy flag.
  const { accel } = useKidStore.getState();
  if (accel.length >= STORY_QUEUE_CAP && !accelSyncing) {
    void syncAccel();
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

/** Convert the server's ISO-datetime (or null) to epoch ms, or null. */
function toEpochMs(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** #9 — pull one kid's aggregate server profile (mastery + coins). Returns null
 *  when there's no mapping / offline / server error — restore is always best-effort.
 *  #1805/#1813 — the mastery rows carry the server's last_practice / last_decay
 *  (ISO datetimes) converted to epoch ms so restoreSnapshot can do genuine
 *  last-write-wins and preserve the decay stamp. */
async function fetchSnapshot(localKidId: string): Promise<{
  coins: number;
  walletSeq: number; // #1804 — monotonic wallet version (last-write-wins restore)
  mastery: Array<{
    skillId: string;
    mastery: number;
    correct: number;
    attempts: number;
    streak: number;
    lastPractice: number | null;
    lastDecay: number | null;
  }>;
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
    const mastery = Array.isArray(data.mastery)
      ? data.mastery.map((m: Record<string, unknown>) => ({
          skillId: m.skill_id as string,
          mastery: m.mastery as number,
          correct: m.correct as number,
          attempts: m.attempts as number,
          streak: m.streak as number,
          lastPractice: toEpochMs(m.last_practice),
          lastDecay: toEpochMs(m.last_decay),
        }))
      : [];
    return {
      coins: data.coins ?? 0,
      walletSeq: data.wallet_seq ?? 0,
      mastery,
    };
  } catch {
    return null; // offline — skip quietly, retry next tick
  }
}

/** #9 — multi-device sync, RESTORE side: on a second device after the parent
 *  signs in, merge every mapped kid's server profile into the local store
 *  (newest-wins). Offline-first unaffected — this never touches the outbox and
 *  never blocks gameplay. #1810 — throttled PER KID (5 min) and a kid's
 *  timestamp is stamped only after a SUCCESSFUL snapshot, so a partial failure
 *  (one kid's fetch hiccup) retries just that kid on the next heartbeat instead
 *  of stalling every kid for 5 minutes. The heartbeat stays quiet on the primary
 *  device (where the merge is a no-op / equal-values). */
export async function restoreServerState(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return; // #264 offline
  const identity = await resolveIdentity();
  if (!identity) return; // offline — don't consume the throttle; retry on the online event
  const now = Date.now();
  for (const k of localKids()) {
    if (now - (lastRestoreAtPerKid[k.id] ?? 0) < RESTORE_INTERVAL_MS) continue;
    const snap = await fetchSnapshot(k.id);
    if (snap) {
      useKidStore.getState().restoreSnapshot(k.id, snap);
      lastRestoreAtPerKid[k.id] = now; // #1810 — throttle consumed ONLY on success
    }
  }
}

/** #1621 — dedupe key for session-start events: { localKidId: localDayKey }.
 *  At most one app-open/session-start event per kid per LOCAL day, so the
 *  heartbeat re-firing (every 30s–5min) never spams the outbox. */
const LS_SESSION_START_DAY = "nv_session_start_day";

/** #1621 — emit a session-start / app-open SyncEvent per local kid, ONCE per
 *  local day. Called on boot and on foreground return; the localStorage dedupe
 *  keeps it to one event per kid per day while still capturing every day the
 *  device was actually used (active-days from the client's perspective). */
function emitSessionStart(): void {
  const today = localDayKey();
  let marks: Record<string, string> = {};
  try {
    const raw = localStorage.getItem(LS_SESSION_START_DAY);
    if (raw) marks = JSON.parse(raw) as Record<string, string>;
  } catch {
    marks = {};
  }
  let changed = false;
  for (const k of localKids()) {
    if (marks[k.id] === today) continue;
    marks[k.id] = today;
    changed = true;
    useKidStore.getState().queueSessionStart(k.id);
  }
  if (changed) {
    try {
      localStorage.setItem(LS_SESSION_START_DAY, JSON.stringify(marks));
    } catch {
      /* storage full — the in-memory store still holds the queued events */
    }
  }
}

/** #1618 — foreground-session boundary tracker for session-minutes events.
 *  Stamped on boot/foreground and read on hidden/pagehide; the elapsed
 *  wall-clock (thinking + between-round + idle) is the honest session time the
 *  old Σ response_ms proxy undercounted. */
let sessionActiveSince = Date.now();

/** Kick off always-sync: immediate drain (clears offline backlog on open),
 *  a self-arming heartbeat with exponential backoff + jitter on repeated
 *  failure (#1031 — a flat 30s interval hammered a failing server / burned
 *  battery while offline; the gap now grows to 5min and resets on any success
 *  or reconnect/foreground), plus instant retries on reconnect/foreground. */
export function startAutoSync(): () => void {
  let timer = 0;
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    timer = window.setTimeout(() => {
      scheduled = false;
      tick();
    }, syncBackoffDelay());
  };
  const tick = () => {
    // #1812 — serialize the three drains so their parent-visible signal writes
    // (lastError / lastSuccessAt / channel states) can't interleave into a
    // wrong final state. The per-channel composite (aggregateSyncState,
    // worst-wins) still reflects the worst unresolved channel. Each drain
    // hot-loops internally via its own lock, so serializing the first batch
    // costs nothing — the heartbeat re-arms every 30s–5min regardless.
    void (async () => {
      await syncProgress();
      await syncStories();
      await syncAccel(); // 🚀 #249 — acceleration outbox drains with the same heartbeat
    })().catch(() => {
      // #3085 — backstop: the drains are rejection-free by contract, but a
      // single unexpected throw must never become an unhandled rejection that
      // re-fires on every heartbeat tick. Treat it as a failed drain; the next
      // tick (online/visibility/30s) retries fresh.
    });
    // #1621 — app-open/session-start (deduped to once per kid per day).
    emitSessionStart();
    // #9 — second-device catch-up: throttled inside (#1810 per-kid).
    void restoreServerState().catch(() => {
      // #3085 — same backstop: restore is best-effort; an unexpected throw just
      // means this kid's snapshot retries on the next heartbeat.
    });
    schedule();
  };
  const onOnline = () => {
    syncFailStreak = 0; // a reconnect is a fresh chance — no backoff
    if (scheduled) {
      window.clearTimeout(timer);
      scheduled = false;
    }
    tick();
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      syncFailStreak = 0;
      sessionActiveSince = Date.now(); // a fresh foreground session boundary
      if (scheduled) {
        window.clearTimeout(timer);
        scheduled = false;
      }
      tick();
    } else if (document.visibilityState === "hidden") {
      onHidden();
    }
  };
  const onHidden = () => {
    // #1618 — the app left the foreground: report the elapsed session minutes
    // so the server's weekly minutes-played is session time, not a response_ms
    // proxy. Best-effort telemetry; a tiny session (<0.05 min) is noise.
    const mins = (Date.now() - sessionActiveSince) / 60_000;
    // Reset the boundary so a double-fire (pagehide + visibilitychange both
    // fire on close) can't emit the SAME session twice — the second call sees
    // ~0 minutes and is filtered by the 0.05 threshold.
    sessionActiveSince = Date.now();
    if (mins >= 0.05) {
      const rounded = Math.round(mins * 1000) / 1000;
      for (const k of localKids()) useKidStore.getState().queueSessionMinutes(k.id, rounded);
    }
  };
  tick();
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onHidden);
  return () => {
    window.clearTimeout(timer);
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onHidden);
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
  /** #248 — quiet hours: the app auto-lowers volume + gently dims during a
   *  per-day schedule, never hard-blocks. `quiet_windows` is 7 comma-joined
   *  "HH:MM-HH:MM" (Mon..Sun; "-" = off that day; start>end = overnight). */
  quiet_enabled?: boolean;
  quiet_windows?: string | null;
  quiet_dim?: boolean;
  quiet_volume?: number;
  /** #138 — kid records their own voice and replays. Parent-gated, OFF by
   *  default (privacy-first); when on, recordings stay ON-DEVICE only. */
  voice_record_enabled: boolean;
  /** #256 — gentle daily playtime GOAL (minutes) the parent sets. Nova nudges
   *  toward it without pressure (a once-per-day celebration); the server clamps
   *  it to the day's cap so it never exceeds the hard limit. null/0 = no goal. */
  goal_min?: number | null;
  /** #257 — curriculum focus pin: subject + world band the parent wants the
   *  journey to prioritize. Both-or-neither; null/null = normal order. */
  focus_subject?: string | null;
  focus_band?: number | null;
  /** #258 — per-kid VOICE preference from the parent portal: stable tone handle
   *  ("female"|"kid"|"soft"|"warm") + Web-Speech rate multiplier (1.0 = normal).
   *  null/null = this device's own warm-female voice at normal speed. */
  voice_tone?: string | null;
  voice_speed?: number | null;
  /** #272 — SAFETY: parent kill-switch. True = ALL games paused for this kid
   *  (kid-safe "learning break" screen, survives reload) until a parent
   *  resumes. Off by default. */
  paused: boolean;
  /** #1041/#1042 — MONI STRICTNESS: the adaptive tutor's difficulty knob.
   *  "gentle" | "steady" | "challenging" — how hard Moni pushes this kid
   *  (planner difficulty −1/0/+1 + tone). "steady" = Moni's own automatic
   *  read. Optional so older on-device caches (which predate the field) still
   *  pass the REQUIRED_SETTING_FIELDS shape-check; the read sites default to
   *  null (auto) and the next server fetch fills it in. #1050 — null/undefined
   *  = NO parent choice → Moni uses its own automatic tone (not pinned steady).
   *  Synced via KidSettings: the parent portal sets it and the kid app pulls
   *  it on every settings fetch (device-local was the #1043 bug). */
  moni_strictness?: "gentle" | "steady" | "challenging" | null;
  /** #1044 — per-subject difficulty deltas (subject id → signed level offset,
   *  clamped ±2) from the parent portal's per-subject stepper. Layers on top
   *  of the global strictness: one area can be gentler/harder without pushing
   *  the whole kid. The kid app expands each subject onto its skills and folds
   *  them into moni.plan()'s perSkillDeltas. null = no parent choice. */
  moni_subject_deltas?: Record<string, number> | null;
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
  quiet_enabled: false,
  quiet_windows: null,
  quiet_dim: true,
  quiet_volume: 0.15,
  voice_record_enabled: false,
  goal_min: null,
  focus_subject: null,
  focus_band: null,
  voice_tone: null,
  voice_speed: null,
  paused: false,
  moni_strictness: null, // #1050 — null = no parent choice → Moni auto tone
  moni_subject_deltas: null, // #1044 — null = no parent per-subject choice
};

/** Local YYYY-MM-DD for a date — daily counters must follow the kid's local
 *  midnight, never UTC midnight (#1366/#1451). toISOString().slice(0,10) is a
 *  UTC day and shifts a full day for kids playing in Bangla evening hours. */
function localDayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** #256 — "did we already celebrate today's goal?" flag (once per day, so the
 *  nudge stays gentle). Resets automatically when the local date rolls over. */
const LS_GOAL_NUDGE = "nv_goal_nudge_day";

export function goalNudgedToday(): boolean {
  try {
    return localStorage.getItem(LS_GOAL_NUDGE) === localDayKey();
  } catch {
    return false;
  }
}

export function markGoalNudgedToday(): void {
  try {
    localStorage.setItem(LS_GOAL_NUDGE, localDayKey());
  } catch {
    /* ignore */
  }
}

/** #248 — is "now" inside a quiet window for TODAY's weekday?
 *  `quiet_windows` is 7 comma-joined "HH:MM-HH:MM" (Mon..Sun; "-" = off that
 *  day). A window crosses midnight when start > end (e.g. "20:00-07:00"), so
 *  "in window" is (start <= now < end) for same-day, OR (now < end OR now >=
 *  start) for overnight. Pure + testable; matches the portal editor exactly. */
export function quietTimeNow(settings: KidSettings, now: Date = new Date()): boolean {
  if (!settings.quiet_enabled || !settings.quiet_windows) return false;
  const parts = settings.quiet_windows.split(",");
  const dow = (now.getDay() + 6) % 7; // 0=Mon..6=Sun
  const entry = parts[dow];
  if (!entry) return false;
  const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(entry.trim());
  if (!m) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const end = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
  if (start <= end) return cur >= start && cur < end;
  return cur >= start || cur < end; // overnight window
}

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

// #1230 — in-memory parsed cache. readSettingsCache feeds the FIRST-PAINT render
// path and used to JSON.parse(localStorage.getItem(...)) on EVERY call, blocking
// the main thread per render. Now the parse happens once; fetchKidSettings
// mutates + writes the same cached reference so it stays fresh on the explicit
// write path. (A multi-tab write won't be seen until reload — fine for a kid app.)
let settingsCache: Record<string, KidSettings> | null = null;

/** #818 — required switches a parsed setting must actually HAVE, WITH the
 *  right runtime type, before we trust it as a `KidSettings`; anything else
 *  is dropped so a corrupt entry (missing keys OR mistyped fields) can't ride
 *  into the runtime as a fresh object (the merge path fills missing optional
 *  fields with `KID_SETTINGS_DEFAULT`). */
const REQUIRED_SETTING_FIELDS: Record<string, (v: unknown) => boolean> = {
  enabled_subjects: (v) => v === null || Array.isArray(v),
  max_band: (v) => v === null || typeof v === "number",
  daily_limit_min: (v) => v === null || typeof v === "number",
  weekday_limits_min: (v) => v === null || typeof v === "string",
  tts_enabled: (v) => typeof v === "boolean",
  music_enabled: (v) => typeof v === "boolean",
  voice_record_enabled: (v) => typeof v === "boolean",
  paused: (v) => typeof v === "boolean",
};

function readSettingsCache(): Record<string, KidSettings> {
  if (settingsCache) return settingsCache;
  // #818 — parse once, shape-check the top level, and drop non-object entries
  // instead of trusting `JSON.parse(...) as Record<string, KidSettings>`.
  const parsed = parseJsonRecord(readLS(LS_SETTINGS));
  settingsCache = {};
  if (parsed) {
    for (const [k, v] of Object.entries(parsed)) {
      // Shape-check instead of an unsafe `as` cast: a record that isn't a
      // per-kid settings object (or is an older/corrupt one missing required
      // keys) is skipped so the default merge below fills the gaps.
      if (!isRecord(v)) continue;
      // #818 — presence AND type check: a settings entry missing a required
      // key (older/corrupt) or holding a mistyped value (e.g. tts_enabled as a
      // string) is skipped so the default merge fills the gaps safely.
      const invalid = Object.entries(REQUIRED_SETTING_FIELDS).some(
        ([field, check]) => !(field in v) || !check(v[field]),
      );
      if (invalid) continue;
      settingsCache[k] = v as unknown as KidSettings;
    }
  }
  return settingsCache;
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
    const prev = cache[kidId];
    cache[kidId] = s;
    // #1231 — skip the full-map serialization when the server returned the SAME
    // settings we already cached (the common re-fetch case). The write path only
    // pays when something actually changed.
    if (prev !== s && JSON.stringify(prev) !== JSON.stringify(s)) {
      try {
        localStorage.setItem(LS_SETTINGS, JSON.stringify(cache));
      } catch {
        /* storage full — ignore */
      }
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

/** #1043 — push a settings PATCH up to the server (the parent portal's GET was
 *  the only direction before; a device-side edit never left the box). The kid
 *  app's own parent area uses this so MoniStrictness changes reach the portal
 *  and every other device. Best-effort: a failure leaves the local cache as
 *  the source of truth and the next fetch re-syncs (offline-first). */
export async function updateKidSettings(
  kidId: string,
  patch: Partial<KidSettings>,
): Promise<KidSettings | null> {
  const identity = await ensureIdentity();
  if (!identity) return null;
  const serverKid = identity.kidFor(kidId);
  if (!serverKid) return null;
  try {
    const res = await fetch(`${API}/kids/${serverKid}/settings`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${identity.token}`,
      },
      body: JSON.stringify({ ...cachedKidSettings(kidId), ...patch }),
    });
    if (!res.ok) throw new Error(`settings PUT ${res.status}`);
    const s = (await res.json()) as KidSettings;
    const cache = readSettingsCache();
    cache[kidId] = s;
    try {
      localStorage.setItem(LS_SETTINGS, JSON.stringify(cache));
    } catch {
      /* storage full — ignore */
    }
    return s;
  } catch {
    return null;
  }
}

/** Start-of-day playtime tracker for the daily-limit gate. Stores minutes
 *  played per date (rolling 7 days) so the parent's limit resets each day. */
const LS_PLAYTIME = "nv_play_minutes";

// #1230 — same memoization as settingsCache: todayMinutes() ran a synchronous
// JSON.parse(localStorage) on EVERY call (daily-limit gate, per-render). The
// parsed map now lives in memory; addTodayMinutes mutates the same reference and
// writes it back, keeping the cache in sync on the explicit write path.
let playtimeCache: Record<string, number> | null = null;

function readPlaytimeCache(): Record<string, number> {
  if (playtimeCache) return playtimeCache;
  // #818 — only finite numbers survive; anything else falls back to zero.
  const parsed = parseJsonRecord(readLS(LS_PLAYTIME));
  playtimeCache = {};
  if (parsed) {
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v)) playtimeCache[k] = v;
    }
  }
  return playtimeCache;
}

export function todayMinutes(): number {
  return readPlaytimeCache()[localDayKey()] ?? 0;
}

export function addTodayMinutes(mins: number): number {
  const today = localDayKey();
  // #1367 — partial credit: accept fractional minutes (e.g. a 40-second game is
  // 0.67 min). Round to 3 decimals so JSON doesn't fill with float noise.
  const safe = Number.isFinite(mins) ? Math.max(0, Math.round(mins * 1000) / 1000) : 0;
  try {
    const raw = readPlaytimeCache();
    const cur = typeof raw[today] === "number" ? raw[today] : 0;
    raw[today] = Math.round((cur + safe) * 1000) / 1000;
    // prune anything older than a week (local day key, same clock as `today`)
    const cutoff = localDayKey(new Date(Date.now() - 7 * 86_400_000));
    for (const d of Object.keys(raw)) if (d < cutoff) delete raw[d];
    localStorage.setItem(LS_PLAYTIME, JSON.stringify(raw));
    return raw[today];
  } catch {
    return todayMinutes();
  }
}

export type { RoundResult, SyncEvent };
export { useKidStore };
