"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { isAllowedExternalUrl } from "@numberverse/core";
import OnDeviceData from "./OnDeviceData";
import {
  getProfile,
  getKids,
  getMastery,
  getKidSettings,
  saveKidSettings,
  getActivity,
  getWeekly,
  resetKidProgress,
  createKid,
  updateKid,
  deleteKid,
  signout,
  signoutAll,
  getSessions,
  revokeSession,
  changePassword,
  updateProfile,
  validateToken,
  type Profile,
  type Kid,
  type MasteryRow,
  type KidSettings as KidSettingsT,
  type ActivityRow,
  type WeeklyReport,
  type NewKid,
  type SessionRow,
} from "../lib/api";

const AVATARS = ["🛡️", "🔮", "🗡️", "🪓", "🏹", "🦊", "🐱", "🐼", "🐸", "🦄", "🐯", "🐰", "🐨", "🐹", "🦁"];
const SUBJECTS = [
  { id: "math", label: "Math", emoji: "🔢" },
  { id: "bangla", label: "Bangla", emoji: "অ" },
  { id: "english", label: "English", emoji: "🔤" },
  { id: "science", label: "Science", emoji: "🔬" },
  { id: "bgs", label: "BGS", emoji: "🌏" },
] as const;

const GAME_LABELS: Record<string, string> = {
  "game-countpop": "Count & Pop",
  "game-countpop20": "Count & Pop to 20",
  "game-growcount": "Plant & Count",
  "game-shapecatcher": "Shape Catcher",
  "game-bnletters": "Bangla Letters",
  "game-enletters": "ABCs",
  "game-fruitadd-10": "Fruit Addition (to 10)",
  "game-fruitsub-10": "Fruit Subtraction (to 10)",
  "game-fruitadd-20": "Fruit Addition (to 20)",
  "game-fruitsub-20": "Fruit Subtraction (to 20)",
  "game-fruittree": "Fruit Tree",
  "game-bnbonds": "Number Bonds",
  "game-bncolors": "Bangla Colors",
  "game-enphonics": "Letter Sounds",
  "game-rocketmult": "Rocket Multiplication",
  "game-pizzafrac": "Pizza Fractions",
  "game-addsub100": "Add & Subtract 100",
  "game-bnwords": "Bangla Words",
  "game-cvc": "CVC Words",
  "game-div-23": "Divide by 2 & 3",
  "game-division": "Division Facts",
  "game-fracmatch": "Fraction Match",
  "game-placevalue": "Place Value",
  "game-bnmatras": "Bangla Matras",
  "game-sightwords": "Sight Words",
  "game-animalhome": "Animal Homes",
  "game-decimals": "Decimals",
  "game-percent": "Percent",
  "game-area": "Area & Perimeter",
  "game-bnsentence": "Bangla Sentences",
  "game-grammar": "Nouns & Verbs",
  "game-bgs": "Bangladesh Facts",
};

function gameLabel(id: string): string {
  return GAME_LABELS[id] ?? id.replace("game-", "").replace(/-/g, " ");
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/** Turn a user-agent string into a short, human-friendly device label. */
function friendlyDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  const s = ua.toLowerCase();
  if (s.includes("iphone")) return "iPhone";
  if (s.includes("ipad")) return "iPad";
  if (s.includes("android")) return "Android phone";
  if (s.includes("mac os") || s.includes("macintosh")) return "Mac";
  if (s.includes("windows")) return "Windows PC";
  if (s.includes("linux")) return "Linux";
  if (s.includes("samsung")) return "Samsung";
  return ua.split(" ")[0].slice(0, 30) || "Device";
}

function weekdayShort(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleString(undefined, { weekday: "short" });
  } catch {
    return iso;
  }
}

/** Privacy-safe share blurb — only aggregates, never a kid's name/device data
 *  unless the parent types the name into the share line themselves. */
function weeklyShareText(kidName: string, w: WeeklyReport): string {
  const n = w.mastered_this_week.length;
  const mastered = n
    ? `🏆 Mastered ${n} skill${n > 1 ? "s" : ""}: ${n <= 4 ? w.mastered_this_week.map((s) => s.replace(/-/g, " ")).join(", ") : `${n} total`}`
    : "🌱 Still growing — we keep playing every day!";
  return [
    `📊 ${kidName}’s learning week on Numberverse`,
    `🎮 ${w.rounds} rounds · ${w.minutes} min · ${w.active_days} day${w.active_days === 1 ? "" : "s"} active`,
    `🎯 ${w.correct_pct}% correct`,
    mastered,
  ].join("\n");
}

function waShare(kidName: string, w: WeeklyReport): string {
  return `https://wa.me/?text=${encodeURIComponent(weeklyShareText(kidName, w))}`;
}

const DEFAULT_SETTINGS: KidSettingsT = {
  enabled_subjects: null,
  max_band: null,
  daily_limit_min: null,
  weekday_limits_min: null,
  tts_enabled: true,
  music_enabled: true,
  voice_record_enabled: false,
};

/** #6 — day names for the per-weekday playtime editor (Mon..Sun). */
const WEEKDAYS = [
  { key: "mon", short: "Mon", full: "Monday" },
  { key: "tue", short: "Tue", full: "Tuesday" },
  { key: "wed", short: "Wed", full: "Wednesday" },
  { key: "thu", short: "Thu", full: "Thursday" },
  { key: "fri", short: "Fri", full: "Friday" },
  { key: "sat", short: "Sat", full: "Saturday" },
  { key: "sun", short: "Sun", full: "Sunday" },
] as const;
const LIMIT_CHOICES = [0, 30, 45, 60, 90] as const;
const WEEKDAY_DEFAULTS = [45, 45, 45, 45, 45, 90, 90]; // school vs weekend

/** #6 — read the current per-day array from settings (Mon..Sun). A legacy flat
 *  `daily_limit_min` shows as the same value every day; nothing set → the
 *  built-in defaults (45 school / 90 weekend). Mirrors todayLimitMin() in the
 *  kid app, so the portal display always matches what the kid app enforces. */
function weekdayLimits(s: KidSettingsT): number[] {
  if (s.weekday_limits_min) {
    const parts = s.weekday_limits_min.split(",").map((x) => parseInt(x, 10));
    if (parts.length === 7 && parts.every((n) => Number.isFinite(n))) return parts;
  }
  if (s.daily_limit_min && s.daily_limit_min > 0) {
    return Array(7).fill(s.daily_limit_min); // legacy flat cap → same every day
  }
  return [...WEEKDAY_DEFAULTS];
}
function writeWeekdayLimits(s: KidSettingsT, arr: number[]): KidSettingsT {
  return { ...s, weekday_limits_min: arr.join(",") };
}

function masteryPct(m: MasteryRow): number {
  return Math.min(100, Math.round(m.mastery * 100));
}

export default function ParentDashboard() {
  const [token, setToken] = useState<string | null>(null);
  /** Gate: "checking" → validating the stored token server-side,
   *  "ok" → token proved valid, "anon" → no usable session (login gate). */
  const [authState, setAuthState] = useState<"checking" | "ok" | "anon">("checking");
  const [authNote, setAuthNote] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [kids, setKids] = useState<Kid[]>([]);
  const [mastery, setMastery] = useState<Record<string, MasteryRow[]>>({});
  const [settings, setSettings] = useState<Record<string, KidSettingsT>>({});
  const [activity, setActivity] = useState<Record<string, ActivityRow[]>>({});
  const [weekly, setWeekly] = useState<Record<string, WeeklyReport>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedTick, setSavedTick] = useState(0);
  const [showAdd, setShowAdd] = useState(false);

  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState("🦊");
  const [editBirthYear, setEditBirthYear] = useState(2021);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── account & security ──
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [acctMsg, setAcctMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [acctBusy, setAcctBusy] = useState(false);

  /** End the session on this browser AND revoke it server-side, then land on
   *  the login page. Everything in localStorage with a parent-session key dies
   *  so no stale token can silently re-auth on a reload. */
  const doSignout = useCallback(async (tok: string) => {
    await signout(tok).catch(() => undefined);
    localStorage.removeItem("nv_parent_token");
    localStorage.removeItem("nv_parent_name");
    localStorage.removeItem("nv_kid_id");
    localStorage.removeItem("nv_kid_map");
    setToken(null);
    setProfile(null);
    setAuthState("anon");
    setAuthNote(null);
  }, []);

  const refreshAll = useCallback(
    async (tok: string) => {
      const k = await getKids(tok);
      setKids(k);
      setActiveId((prev) => (prev && k.some((x) => x.id === prev) ? prev : (k[0]?.id ?? null)));
      if (k.length === 0) return;
      // Load every kid up-front so the family overview + switcher are instant.
      const entries = await Promise.all(
        k.map(async (kid) => {
          const [m, s, a, w] = await Promise.all([
            getMastery(tok, kid.id),
            getKidSettings(tok, kid.id).catch(() => DEFAULT_SETTINGS),
            getActivity(tok, kid.id).catch(() => []),
            getWeekly(tok, kid.id).catch(() => null),
          ]);
          return [kid.id, { m, s, a, w }] as const;
        })
      );
      const mm: Record<string, MasteryRow[]> = {};
      const ss: Record<string, KidSettingsT> = {};
      const aa: Record<string, ActivityRow[]> = {};
      const ww: Record<string, WeeklyReport> = {};
      for (const [id, { m, s, a, w }] of entries) {
        mm[id] = m;
        ss[id] = s;
        aa[id] = a;
        if (w) ww[id] = w;
      }
      setMastery(mm);
      setSettings(ss);
      setActivity(aa);
      setWeekly(ww);
    },
    []
  );

  const reloadAccount = useCallback(async (tok: string) => {
    const [p, s] = await Promise.all([getProfile(tok), getSessions(tok)]);
    setProfile(p);
    setDisplayName(p.display_name ?? "");
    setSessions(s);
  }, []);

  useEffect(() => {
    const tok = localStorage.getItem("nv_parent_token");
    if (!tok) {
      setToken(null);
      setAuthState("anon");
      return;
    }
    setAuthState("checking");
    validateToken(tok).then((verdict) => {
      if (verdict === "ok") {
        // Only a token the API accepts unlocks the dashboard. This is the real
        // gate: presence of ANY string in nv_parent_token (shared, stale, or
        // forged — the kid app writes the same key) no longer grants access.
        setToken(tok);
        setAuthState("ok");
        refreshAll(tok).catch(() => setError("Could not load progress. Is the API running?"));
        reloadAccount(tok).catch(() => setError("Could not load account details."));
      } else if (verdict === "invalid") {
        localStorage.removeItem("nv_parent_token");
        localStorage.removeItem("nv_parent_name");
        localStorage.removeItem("nv_kid_id");
        localStorage.removeItem("nv_kid_map");
        setToken(null);
        setAuthState("anon");
        setAuthNote("Your session ended. Sign in again to view the portal.");
      } else {
        // Offline / API down — we cannot PROVE the session, so we never render
        // the dashboard with an unvalidated token. The stored token survives so
        // a reload (when back online) re-validates and re-enters.
        setToken(null);
        setAuthState("anon");
        setAuthNote("Can't check your session right now — make sure you're online, then sign in.");
      }
    });
  }, [refreshAll, reloadAccount]);

  const switchKid = useCallback(
    async (id: string) => {
      if (!token) return;
      setActiveId(id);
      if (mastery[id]) return; // already loaded (refreshAll fetches every kid)
      try {
        const [m, s, a, w] = await Promise.all([
          getMastery(token, id),
          getKidSettings(token, id).catch(() => DEFAULT_SETTINGS),
          getActivity(token, id).catch(() => []),
          getWeekly(token, id).catch(() => null),
        ]);
        setMastery((prev) => ({ ...prev, [id]: m }));
        setSettings((prev) => ({ ...prev, [id]: s }));
        setActivity((prev) => ({ ...prev, [id]: a }));
        if (w) setWeekly((prev) => ({ ...prev, [id]: w }));
      } catch {
        setError("Failed to load that kid.");
      }
    },
    [token, mastery]
  );

  async function handleSaveSettings() {
    if (!token || !activeId) return;
    setBusy(true);
    setError(null);
    try {
      const s = settings[activeId] ?? DEFAULT_SETTINGS;
      await saveKidSettings(token, activeId, s);
      setSavedTick((t) => t + 1);
    } catch {
      setError("Failed to save settings.");
    } finally {
      setBusy(false);
    }
  }

  function patchSettings(patch: Partial<KidSettingsT>) {
    if (!activeId) return;
    setSettings((prev) => ({
      ...prev,
      [activeId]: { ...(prev[activeId] ?? DEFAULT_SETTINGS), ...patch },
    }));
  }

  async function handleReset() {
    if (!token || !activeId || !confirmReset) return;
    setBusy(true);
    setError(null);
    try {
      await resetKidProgress(token, activeId);
      setConfirmReset(false);
      await refreshAll(token);
      setSavedTick((t) => t + 1);
    } catch {
      setError("Failed to reset progress.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!token || !activeId || !confirmDelete) return;
    setBusy(true);
    setError(null);
    try {
      await deleteKid(token, activeId);
      setConfirmDelete(false);
      setShowAdd(false);
      await refreshAll(token);
    } catch {
      setError("Failed to delete kid.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!token || !editName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const kid = await createKid(token, {
        name: editName.trim(),
        avatar: editAvatar,
        birth_year: editBirthYear,
      } satisfies NewKid);
      setShowAdd(false);
      setEditName("");
      setEditAvatar("🦊");
      await refreshAll(token);
      setSavedTick((t) => t + 1);
    } catch {
      setError("Failed to add kid.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRename() {
    if (!token || !activeId || !editName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await updateKid(token, activeId, {
        name: editName.trim(),
        avatar: editAvatar,
        birth_year: editBirthYear,
      } satisfies NewKid);
      setEditName("");
      await refreshAll(token);
      setSavedTick((t) => t + 1);
    } catch {
      setError("Failed to save changes.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveName() {
    if (!token || !displayName.trim()) return;
    setAcctBusy(true);
    setAcctMsg(null);
    try {
      const p = await updateProfile(token, displayName.trim());
      setProfile(p);
      localStorage.setItem("nv_parent_name", p.display_name ?? "Parent");
      setAcctMsg({ kind: "ok", text: "Display name saved." });
    } catch {
      setAcctMsg({ kind: "err", text: "Could not save display name." });
    } finally {
      setAcctBusy(false);
    }
  }

  async function handleChangePw() {
    if (!token) return;
    if (pwNew.length < 8) {
      setAcctMsg({ kind: "err", text: "New password must be at least 8 characters." });
      return;
    }
    if (pwNew !== pwConfirm) {
      setAcctMsg({ kind: "err", text: "New passwords don't match." });
      return;
    }
    setAcctBusy(true);
    setAcctMsg(null);
    try {
      await changePassword(token, pwCurrent, pwNew);
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      setAcctMsg({ kind: "ok", text: "Password changed — every other device was signed out." });
      await reloadAccount(token);
    } catch {
      setAcctMsg({ kind: "err", text: "Password change failed — check your current password." });
    } finally {
      setAcctBusy(false);
    }
  }

  async function handleRevoke(sessionId: string, isCurrent: boolean) {
    if (!token) return;
    setAcctBusy(true);
    setAcctMsg(null);
    try {
      await revokeSession(token, sessionId);
      if (isCurrent) {
        await doSignout(token); // revoked our own token → end the session here too
        return;
      }
      await reloadAccount(token);
      setAcctMsg({ kind: "ok", text: "That device was signed out." });
    } catch {
      setAcctMsg({ kind: "err", text: "Could not revoke that session." });
    } finally {
      setAcctBusy(false);
    }
  }

  async function handleSignoutAll() {
    if (!token) return;
    setAcctBusy(true);
    setAcctMsg(null);
    try {
      await signoutAll(token);
    } catch {
      /* even if the network call fails, the local sign-out below protects THIS
         device — other sessions can be reset from any still-logged-in device */
    }
    await doSignout(token);
  }

  const active = kids.find((k) => k.id === activeId);
  const activeMastery = activeId ? mastery[activeId] ?? [] : [];
  const masteredCount = activeMastery.filter((m) => m.mastery >= 0.8).length;
  const activeSettings = activeId ? settings[activeId] ?? DEFAULT_SETTINGS : DEFAULT_SETTINGS;
  const EMPTY_WEEKLY: WeeklyReport = { days: [], rounds: 0, correct_pct: 0, minutes: 0, active_days: 0, mastered_this_week: [], top_game: null };
  const activeWeekly = activeId ? weekly[activeId] ?? EMPTY_WEEKLY : EMPTY_WEEKLY;

  // Family overview (aggregates every kid, not just the active one).
  const famMastered = kids.reduce(
    (sum, k) => sum + (mastery[k.id] ?? []).filter((m) => m.mastery >= 0.8).length,
    0
  );
  const famRounds = kids.reduce((sum, k) => sum + ((weekly[k.id]?.rounds as number) ?? 0), 0);
  const famMinutes = kids.reduce((sum, k) => sum + ((weekly[k.id]?.minutes as number) ?? 0), 0);
  const famActive = kids.filter((k) => ((weekly[k.id]?.active_days as number) ?? 0) > 0).length;

  // The dashboard renders ONLY after the server validates the token. While the
  // session is being checked we show a neutral shell, and any failure (invalid
  // OR unverifiable) lands on the login gate — never on parent data.
  if (authState !== "ok") {
    return (
      <main className="shell">
        <div className="logo">🔢</div>
        <h1>Parent Portal</h1>
        {authState === "checking" ? (
          <p className="center muted"><span className="spinner" aria-hidden />Checking your session…</p>
        ) : (
          <>
            <p className="center muted">Sign in to manage your children’s learning.</p>
            {authNote && <p className="center err" style={{ marginTop: 8 }}>{authNote}</p>}
          </>
        )}
        <div className="center" style={{ marginTop: 24 }}>
          {authState === "checking" ? (
            <Link className="btn btn-small ghost" href="/login">Sign in instead →</Link>
          ) : (
            <Link className="btn" href="/login">Go to login →</Link>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <span className="brand">🔢 <b>Numberverse</b> <span className="muted">Parent Portal</span></span>
        <span className="topbar-user" title={profile?.email ?? "signed in"}>
          {profile?.display_name ?? "Parent"} 👨‍👩‍👧
        </span>
        <button className="btn btn-small ghost" onClick={() => token && doSignout(token)}>
          Sign out
        </button>
      </header>

      {error && <p className="err banner">{error}</p>}

      {/* ── family overview ── */}
      {kids.length > 0 && (
        <section className="card overview">
          <h2>👨‍👩‍👧 Family overview</h2>
          <div className="stat-tiles">
            <div className="tile">
              <span className="tile-num">{kids.length}</span>
              <span className="tile-label">kids</span>
            </div>
            <div className="tile">
              <span className="tile-num">{famMastered}</span>
              <span className="tile-label">skills mastered</span>
            </div>
            <div className="tile">
              <span className="tile-num">{famRounds}</span>
              <span className="tile-label">rounds this week</span>
            </div>
            <div className="tile">
              <span className="tile-num">{famMinutes}</span>
              <span className="tile-label">min this week</span>
            </div>
            <div className="tile">
              <span className="tile-num">{famActive}</span>
              <span className="tile-label">active this week</span>
            </div>
          </div>
        </section>
      )}

      {/* ── kid switcher ── */}
      <section className="kids-row">
        {kids.map((k) => {
          const isActive = k.id === activeId;
          return (
            <button
              key={k.id}
              className={`kid-chip${isActive ? " on" : ""}`}
              onClick={() => switchKid(k.id)}
            >
              <span className="kid-avatar">{k.avatar ?? "🧒"}</span>
              <span className="kid-name">{k.name}</span>
              <span className="kid-year">{k.birth_year ?? "—"}</span>
            </button>
          );
        })}
        <button className="kid-chip add" onClick={() => { setShowAdd((s) => !s); setConfirmReset(false); setConfirmDelete(false); }}>
          <span className="kid-avatar">＋</span>
          <span className="kid-name">Add kid</span>
        </button>
      </section>

      {/* ── add-kid form ── */}
      {showAdd && (
        <section className="card add-kid">
          <h2>Add a new kid</h2>
          <div className="avatar-row">
            {AVATARS.map((a) => (
              <button key={a} className={`avatar-pick${editAvatar === a ? " on" : ""}`} onClick={() => setEditAvatar(a)}>
                {a}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <label>
              Name
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="e.g. Aria" />
            </label>
            <label>
              Birth year
              <input
                type="number"
                min={2010}
                max={2030}
                value={editBirthYear}
                onChange={(e) => setEditBirthYear(Number(e.target.value) || 2021)}
              />
            </label>
          </div>
          <div className="row-buttons">
            <button className="btn primary" disabled={busy || !editName.trim()} onClick={handleCreate}>
              {busy ? "Adding…" : "Add kid"}
            </button>
            <button className="btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </section>
      )}

      {active && (
        <>
          {/* ── progress summary ── */}
          <section className="card summary">
            <div className="summary-head">
              <span className="big-avatar">{active.avatar ?? "🧒"}</span>
              <div className="summary-meta">
                <h2>{active.name} <small>(born {active.birth_year ?? "—"})</small></h2>
                <p className="muted">
                  {masteredCount} mastered · {activeMastery.length} skills in progress
                </p>
              </div>
            </div>
            <div className="overall-bar">
              <div className="overall-fill" style={{ width: `${activeMastery.length ? Math.round((masteredCount / activeMastery.length) * 100) : 0}%` }} />
            </div>
          </section>

          {/* ── this week (the "show me my kid learned" card) ── */}
          <section className="card weekly">
            <div className="weekly-head">
              <h2>📊 This week</h2>
              {activeWeekly.rounds > 0 && (
                <a
                  className="share-btn"
                  href={waShare(active.name, activeWeekly)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    // #267 — never launch an app outside the scheme allowlist.
                    if (!isAllowedExternalUrl(waShare(active.name, activeWeekly))) e.preventDefault();
                  }}
                >
                  Share on WhatsApp
                </a>
              )}
            </div>
            {activeWeekly.rounds === 0 ? (
              <p className="muted">No rounds this week yet — have {active.name} play a game and this report comes alive.</p>
            ) : (
              <>
                <div className="stat-tiles">
                  <div className="tile">
                    <span className="tile-num">{activeWeekly.rounds}</span>
                    <span className="tile-label">rounds</span>
                  </div>
                  <div className="tile">
                    <span className="tile-num">{activeWeekly.correct_pct}%</span>
                    <span className="tile-label">correct</span>
                  </div>
                  <div className="tile">
                    <span className="tile-num">{activeWeekly.minutes}</span>
                    <span className="tile-label">min played</span>
                  </div>
                  <div className="tile">
                    <span className="tile-num">{activeWeekly.active_days}</span>
                    <span className="tile-label">days active</span>
                  </div>
                </div>
                <div className="week-bars">
                  {activeWeekly.days.map((d) => (
                    <div key={d.date} className="week-col" title={`${weekdayShort(d.date)}: ${d.rounds} rounds`}>
                      <div className="week-bar" style={{ height: `${activeWeekly.days.length ? Math.max(4, Math.round((d.rounds / Math.max(1, ...activeWeekly.days.map((x) => x.rounds))) * 60)) : 0}px` }} />
                      <span className="week-day">{weekdayShort(d.date)}</span>
                    </div>
                  ))}
                </div>
                {activeWeekly.mastered_this_week.length > 0 && (
                  <p className="muted small" style={{ marginTop: "10px" }}>
                    🏆 Mastered this week:{" "}
                    <strong>{activeWeekly.mastered_this_week.map((s) => s.replace(/-/g, " ")).join(", ")}</strong>
                  </p>
                )}
              </>
            )}
          </section>

          {/* ── controls ── */}
          <section className="card controls">
            <h2>🎛️ Learning controls</h2>

            <div className="ctrl-block">
              <h3>Subjects</h3>
              <p className="muted small">Turn a subject off to hide those games from {active.name}.</p>
              <div className="toggle-grid">
                {SUBJECTS.map((s) => {
                  const list = activeSettings.enabled_subjects;
                  const on = list === null || list.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      className={`toggle-chip${on ? " on" : ""}`}
                      onClick={() => {
                        const list = activeSettings.enabled_subjects;
                        const next = list === null ? SUBJECTS.map((x) => x.id) : [...list];
                        if (on) next.splice(next.indexOf(s.id), 1);
                        else next.push(s.id);
                        if (next.length === SUBJECTS.length) patchSettings({ enabled_subjects: null });
                        else patchSettings({ enabled_subjects: next });
                      }}
                    >
                      <span className="toggle-emoji">{s.emoji}</span>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ctrl-block">
              <h3>Difficulty cap</h3>
              <p className="muted small">The hardest world {active.name} can reach (1 = easiest, 5 = hardest).</p>
              <div className="toggle-grid bands">
                <button
                  className={`toggle-chip${activeSettings.max_band === null ? " on" : ""}`}
                  onClick={() => patchSettings({ max_band: null })}
                >
                  All worlds
                </button>
                {[1, 2, 3, 4, 5].map((b) => (
                  <button
                    key={b}
                    className={`toggle-chip${activeSettings.max_band === b ? " on" : ""}`}
                    onClick={() => patchSettings({ max_band: b })}
                  >
                    World {b}
                  </button>
                ))}
              </div>
            </div>

            <div className="ctrl-block">
              <h3>Playtime per day</h3>
              <p className="muted small">
                A soft limit per day of the week — the app gently stops play when {active.name} reaches it. Default: 45 min school days, 90 weekend.
              </p>
              <div className="weekday-limits">
                {WEEKDAYS.map((d, i) => {
                  const cur = weekdayLimits(activeSettings)[i];
                  return (
                    <div key={d.key} className="weekday-row">
                      <span className="weekday-name" title={d.full}>{d.short}</span>
                      <div className="weekday-chips" role="group" aria-label={`${d.full} playtime`}>
                        {LIMIT_CHOICES.map((m) => (
                          <button
                            key={m}
                            className={`toggle-chip${cur === m ? " on" : ""}`}
                            onClick={() => {
                              const arr = [...weekdayLimits(activeSettings)];
                              arr[i] = m;
                              patchSettings(writeWeekdayLimits(activeSettings, arr));
                            }}
                          >
                            {m === 0 ? "Off" : `${m}m`}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="weekday-presets">
                <button
                  className="ghost-btn small"
                  onClick={() => patchSettings(writeWeekdayLimits(activeSettings, WEEKDAY_DEFAULTS))}
                >
                  ↺ Default (45/90)
                </button>
                <button
                  className="ghost-btn small"
                  onClick={() => patchSettings(writeWeekdayLimits(activeSettings, [0, 0, 0, 0, 0, 0, 0]))}
                >
                  No limit
                </button>
              </div>
            </div>

            <div className="ctrl-block">
              <h3>Reading & sound</h3>
              <div className="toggle-grid">
                <button
                  className={`toggle-chip${activeSettings.tts_enabled ? " on" : ""}`}
                  onClick={() => patchSettings({ tts_enabled: !activeSettings.tts_enabled })}
                >
                  🔊 Voice reading
                </button>
                <button
                  className={`toggle-chip${activeSettings.music_enabled ? " on" : ""}`}
                  onClick={() => patchSettings({ music_enabled: !activeSettings.music_enabled })}
                >
                  🎵 Background music
                </button>
                <button
                  className={`toggle-chip${activeSettings.voice_record_enabled ? " on" : ""}`}
                  onClick={() => patchSettings({ voice_record_enabled: !activeSettings.voice_record_enabled })}
                  title="Kid can record their own voice and replay. Stays on this device — never synced."
                >
                  🎙️ Voice recording
                </button>
              </div>
              <p className="muted small">🎙️ Voice recording lets a kid record and replay their own voice. Recordings stay on this device and are never sent to the server.</p>
            </div>

            <div className="row-buttons save-row">
              <button className="btn primary" disabled={busy} onClick={handleSaveSettings}>
                {busy ? "Saving…" : "Save settings"}
              </button>
              {savedTick > 0 && <span className="saved-note">✓ Saved</span>}
            </div>
          </section>

          {/* ── activity feed ── */}
          <section className="card">
            <h2>📈 Recent activity</h2>
            {(activity[active.id] ?? []).length === 0 ? (
              <p className="muted">Nothing yet — have {active.name} play a round to see it here.</p>
            ) : (
              <ul className="activity-list">
                {(activity[active.id] ?? []).map((a) => (
                  <li key={a.id} className={`activity-item ${a.correct ? "ok" : "no"}`}>
                    <span className="activity-badge">{a.correct ? "✓" : "✗"}</span>
                    <span className="activity-game">{gameLabel(a.game_id)}</span>
                    <span className="activity-time">{fmtTime(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── mastery table ── */}
          <section className="card">
            <h2>🧠 Skill mastery</h2>
            {activeMastery.length === 0 ? (
              <p className="muted">No practice yet — play the kid app to record progress.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th>Mastery</th>
                    <th>Correct / Attempts</th>
                    <th>Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {activeMastery.map((m) => (
                    <tr key={m.skill_id}>
                      <td>{m.skill_id.replace(/-/g, " ")}</td>
                      <td>
                        <div className="bar">
                          <div className={`fill${m.mastery >= 0.8 ? " done" : ""}`} style={{ width: `${masteryPct(m)}%` }} />
                        </div>
                        {masteryPct(m)}%
                      </td>
                      <td>{m.correct}/{m.attempts}</td>
                      <td>{m.streak}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* ── account & security ── */}
          <section className="card account">
            <h2>🔐 Account & security</h2>
            {acctMsg && (
              <p className={acctMsg.kind === "ok" ? "ok-note" : "err"}>{acctMsg.text}</p>
            )}

            <div className="ctrl-block">
              <h3>Display name</h3>
              <p className="muted small">Shown in the portal and on the kid app's sign-in screen.</p>
              <div className="form-grid">
                <label>
                  Name
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={profile?.display_name ?? "Parent"}
                  />
                </label>
              </div>
              <div className="row-buttons">
                <button className="btn primary" disabled={acctBusy || !displayName.trim()} onClick={handleSaveName}>
                  {acctBusy ? "Saving…" : "Save name"}
                </button>
              </div>
            </div>

            <div className="ctrl-block">
              <h3>Change password</h3>
              <p className="muted small">
                Changing it signs out every other device immediately — only this one stays in.
              </p>
              <div className="form-grid">
                <label>
                  Current password
                  <input type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} autoComplete="current-password" />
                </label>
                <label>
                  New password
                  <input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} autoComplete="new-password" placeholder="8+ characters" />
                </label>
                <label>
                  Confirm new password
                  <input type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} autoComplete="new-password" />
                </label>
              </div>
              <div className="row-buttons">
                <button
                  className="btn primary"
                  disabled={acctBusy || !pwCurrent || pwNew.length < 8 || pwNew !== pwConfirm}
                  onClick={handleChangePw}
                >
                  {acctBusy ? "Saving…" : "Change password"}
                </button>
              </div>
            </div>

            <div className="ctrl-block">
              <h3>Active logins</h3>
              <p className="muted small">Every device signed into this account. Revoke one you don't recognize.</p>
              {sessions.length === 0 ? (
                <p className="muted">Loading sessions…</p>
              ) : (
                <ul className="session-list">
                  {sessions.map((s) => (
                    <li key={s.id} className="session-row">
                      <span className="session-icon">{s.current ? "🖥️" : "📱"}</span>
                      <span className="session-meta">
                        <span className="session-device">
                          {s.current ? "This device" : friendlyDevice(s.user_agent)}
                          {s.current && <span className="session-current-badge">current</span>}
                        </span>
                        <span className="muted small">
                          {s.user_agent ? friendlyDevice(s.user_agent) : "Unknown device"}
                          {s.ip ? ` · ${s.ip}` : ""} · signed in {fmtTime(s.created_at)}
                          {!s.current && ` · last seen ${fmtTime(s.last_seen_at)}`}
                        </span>
                      </span>
                      {!s.current && (
                        <button
                          className="btn btn-small danger-ghost"
                          disabled={acctBusy}
                          onClick={() => handleRevoke(s.id, false)}
                        >
                          Sign out
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="row-buttons" style={{ marginTop: 14 }}>
                <button className="btn danger-ghost" disabled={acctBusy || sessions.length === 0} onClick={handleSignoutAll}>
                  Sign out of all devices
                </button>
              </div>
            </div>
          </section>

          {/* ── edit + danger zone ── */}
          <section className="card danger">
            <h2>⚙️ Edit {active.name}</h2>
            <div className="avatar-row">
              {AVATARS.map((a) => (
                <button key={a} className={`avatar-pick${editAvatar === a ? " on" : ""}`} onClick={() => setEditAvatar(a)}>
                  {a}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label>
                Name
                <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={active.name} />
              </label>
              <label>
                Birth year
                <input
                  type="number"
                  min={2010}
                  max={2030}
                  value={editBirthYear}
                  onChange={(e) => setEditBirthYear(Number(e.target.value) || 2021)}
                />
              </label>
            </div>
            <div className="row-buttons">
              <button className="btn primary" disabled={busy || !editName.trim()} onClick={handleRename}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>

            <hr />
            <div className="danger-row">
              <div>
                <h3>Reset progress</h3>
                <p className="muted small">Wipes all of {active.name}’s mastery and history. The profile stays.</p>
              </div>
              {confirmReset ? (
                <div className="confirm-group">
                  <button className="btn danger" disabled={busy} onClick={handleReset}>Yes, reset everything</button>
                  <button className="btn ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn danger-ghost" onClick={() => { setConfirmReset(true); setConfirmDelete(false); }}>Reset progress…</button>
              )}
            </div>

            <div className="danger-row">
              <div>
                <h3>Delete {active.name}</h3>
                <p className="muted small">Permanently removes this profile and all history. This cannot be undone.</p>
              </div>
              {confirmDelete ? (
                <div className="confirm-group">
                  <button className="btn danger" disabled={busy} onClick={handleDelete}>Yes, delete</button>
                  <button className="btn ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn danger-ghost" onClick={() => { setConfirmDelete(true); setConfirmReset(false); }}>Delete…</button>
              )}
            </div>
          </section>

          {/* ── #262 on-device data review (localStorage, offline) ── */}
          <OnDeviceData />
        </>
      )}

      {kids.length === 0 && !error && (
        <p className="hint center">No kids on this account yet — add one above to get started.</p>
      )}
    </main>
  );
}
