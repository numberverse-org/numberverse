"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { isAllowedExternalUrl, SKILLS } from "@numberverse/core";
import QRCode from "qrcode";
import OnDeviceData from "./OnDeviceData";
import {
  getProfile,
  getKids,
  getMastery,
  getKidSettings,
  saveKidSettings,
  getActivity,
  getWeekly,
  getWeakSkills,
  getStories,
  getStoryStats,
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
  type LearningStoryRow,
  type StoryStats,
  type NewKid,
  type SessionRow,
} from "../lib/api";
import { worksheetFor, type WorksheetProblem } from "../lib/worksheet";

const AVATARS = ["🛡️", "🔮", "🗡️", "🪓", "🏹", "🦊", "🐱", "🐼", "🐸", "🦄", "🐯", "🐰", "🐨", "🐹", "🦁"];
const SUBJECTS = [
  { id: "math", label: "Math", emoji: "🔢" },
  { id: "bangla", label: "Bangla", emoji: "অ" },
  { id: "english", label: "English", emoji: "🔤" },
  { id: "science", label: "Science", emoji: "🔬" },
  { id: "bgs", label: "BGS", emoji: "🌏" },
] as const;

/** #237 — the read-aloud / story-comprehension games that make up a kid's
 *  "reading & stories" progress (EN + BN tracks). Mastery for these skills is
 *  already loaded with the dashboard, so the card works fully offline. */
const READING_GAMES = new Set(["game-readstory", "game-storyread", "game-story", "game-readaloud"]);
const readingSkills = SKILLS.filter((s) => s.game && READING_GAMES.has(s.game));

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

// ── #238 KOTHA weekly learning narrative ────────────────────────────────
// A plain-language "what happened this week" paragraph generated from the
// kid's Kotha stories. Pure + client-side: it takes only the stories the portal
// already fetched and the skill catalog, and returns EN + BN text. Nothing is
// re-sent to any server, so a parent's edits are edit-safe and stay local.

/** Misconception fingerprint codes (packages/core/src/moni/fingerprint.ts) →
 *  short parent-friendly phrasing, EN + BN. */
const NARR_MIS: Record<string, { en: string; bn: string }> = {
  "overcount-1": { en: "counts one too many", bn: "একটা বেশি গোনা" },
  "undercount-1": { en: "counts one too few", bn: "একটা কম গোনা" },
  "off-by-ten": { en: "mixing up tens and ones", bn: "দশকের ঘর আর এককের ঘর গুলিয়ে ফেলা" },
  "off-by-hundred": { en: "mixing up hundreds with the tens", bn: "শতক আর দশকের ঘর গুলিয়ে ফেলা" },
  double: { en: "doubling the answer", bn: "উত্তরটাকে দ্বিগুণ করে ফেলা" },
  half: { en: "halving the answer", bn: "উত্তরটাকে অর্ধেক করে ফেলা" },
  reversal: { en: "writing digits the wrong way round (like 6 ↔ 9)", bn: "অঙ্ক উল্টো করে লেখা (যেমন ৬ ↔ ৯)" },
  "repeated-error": { en: "repeating the same mistake", bn: "একই ভুল বারবার করা" },
};

function narrTitleEn(id: string): string {
  return SKILLS.find((s) => s.id === id)?.title ?? id.replace(/-/g, " ");
}
function narrTitleBn(id: string): string {
  const s = SKILLS.find((x) => x.id === id);
  return s?.titleBn ?? narrTitleEn(id);
}

/** i18n-extensible join for a list of titles. */
function narrListEn(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;
}
function narrListBn(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  if (xs.length === 2) return `${xs[0]} ও ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")} ও ${xs[xs.length - 1]}`;
}

interface KothaNarrative {
  en: string;
  bn: string;
}

/** Build the EN+BN "this week" paragraph from the last 7 days of stories.
 *  Returns null when there's nothing this week (the card then invites play). */
function buildWeeklyNarrative(kidName: string, stories: LearningStoryRow[]): KothaNarrative | null {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const week = stories.filter((s) => Date.now() - new Date(s.created_at).getTime() <= WEEK_MS);
  if (week.length === 0) return null;

  const bySkill = new Map<string, { total: number; correct: number }>();
  const byMis = new Map<string, number>();
  for (const s of week) {
    const e = bySkill.get(s.skill_id) ?? { total: 0, correct: 0 };
    e.total++;
    if (s.outcome) e.correct++;
    bySkill.set(s.skill_id, e);
    if (s.misconception_code) byMis.set(s.misconception_code, (byMis.get(s.misconception_code) ?? 0) + 1);
  }

  const ranked = [...bySkill.entries()].sort((a, b) => b[1].total - a[1].total);
  const topSkills = ranked.slice(0, 3);
  const highlight = [...bySkill.entries()].filter(([, e]) => e.correct > 0).sort((a, b) => b[1].correct - a[1].correct)[0];
  const struggle = [...bySkill.entries()]
    .filter(([, e]) => e.total - e.correct > 0)
    .sort((a, b) => b[1].total - b[1].correct - (a[1].total - a[1].correct))[0];

  // Most-repeated misconception on the struggle skill (if any).
  let misCode: string | null = null;
  if (struggle) {
    let best = 0;
    for (const s of week) {
      if (s.skill_id === struggle[0] && s.misconception_code) {
        const c = byMis.get(s.misconception_code) ?? 0;
        if (c > best) {
          best = c;
          misCode = s.misconception_code;
        }
      }
    }
  }

  const total = week.length;
  const wrong = week.length - week.filter((s) => s.outcome).length;

  // ── EN ──
  let en = `This week ${kidName} had ${total} learning moment${total === 1 ? "" : "s"} across ${narrListEn(topSkills.map(([id]) => narrTitleEn(id)))}.`;
  if (highlight) {
    const hl = highlight[1];
    en += ` ${kidName} was strongest at ${narrTitleEn(highlight[0])} — ${hl.correct}/${hl.total} right.`;
  } else {
    en += " Every correct answer is a win — lovely effort!";
  }
  if (struggle) {
    const st = struggle[1];
    en += ` ${narrTitleEn(struggle[0])} was trickiest (${st.total - st.correct} answer${st.total - st.correct === 1 ? "" : "s"} still to polish)`;
    if (misCode && NARR_MIS[misCode]) en += ` — the pattern we noticed: ${NARR_MIS[misCode].en}`;
    en += ". A little daily practice there will make it click.";
  } else {
    en += " No sticking points this week — smooth sailing!";
  }
  en += wrong > 0
    ? ` Keep the gentle rhythm going — ${kidName} is building a solid foundation.`
    : " Keep the daily rhythm going — consistency makes it stick!";

  // ── BN (natural Bangla, not phonetic) ──
  let bn = `এ সপ্তাহে ${kidName} করেছে ${total}টি শেখার মুহূর্ত — ${narrListBn(topSkills.map(([id]) => narrTitleBn(id)))}।`;
  if (highlight) {
    const hl = highlight[1];
    bn += ` ${kidName} সবচেয়ে ভালো করেছে ${narrTitleBn(highlight[0])} — ${hl.correct}/${hl.total}টি সঠিক উত্তর।`;
  } else {
    bn += " প্রতিটা সঠিক উত্তরের জন্য অনেক ভালো — দারুণ পরিশ্রম করেছে!";
  }
  if (struggle) {
    const st = struggle[1];
    bn += ` ${narrTitleBn(struggle[0])} একটু কঠিন লেগেছে — ${st.total - st.correct}টি উত্তর এখনও ঠিক করা বাকি`;
    if (misCode && NARR_MIS[misCode]) bn += ` — দেখা গেছে ${NARR_MIS[misCode].bn}`;
    bn += "। প্রতিদিন সামান্য অনুশীলন করলেই ঠিক হয়ে যাবে।";
  } else {
    bn += " এ সপ্তাহে কোনো আটকে যাওয়া নেই — দুর্দান্ত!";
  }
  bn += wrong > 0
    ? " ধীরে ধীরে এগিয়ে যাও — ভিত্তিটা মজবুত হচ্ছে।"
    : " প্রতিদিনের ছোট্ট অনুশীলনটাই সবচেয়ে বড় জাদু — এগিয়ে চলো!";

  return { en, bn };
}

/** Read a kid's saved narrative draft (edit-safe: localStorage only). */
function readNarrDraft(kidId: string): { en: string; bn: string; edited: boolean } | null {
  try {
    const raw = localStorage.getItem(`nv_kotha_nar_${kidId}`);
    return raw ? (JSON.parse(raw) as { en: string; bn: string; edited: boolean }) : null;
  } catch {
    return null;
  }
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
  const [stories, setStories] = useState<Record<string, LearningStoryRow[]>>({});
  const [storyStats, setStoryStats] = useState<Record<string, StoryStats | null>>({});
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

  // #238 — weekly narrative language + editable draft (localStorage only).
  const [narrLang, setNarrLang] = useState<"en" | "bn">("en");
  const [narrDraft, setNarrDraft] = useState<{ en: string; bn: string; edited: boolean } | null>(null);
  const [narrCopied, setNarrCopied] = useState(false);

  // #132 — printable worksheet from weak skills
  const [sheet, setSheet] = useState<{ name: string; items: WorksheetProblem[]; date: string } | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  // #139 — printable flashcard QR sheet (offline-first: pure client-side codes).
  // Each QR encodes "NV:<skillId>" — a kid scans (or types) it in the app to
  // jump straight into that mini-game, no network needed.
  const [qrCards, setQrCards] = useState<Array<{ skillId: string; title: string; dataUrl: string; code: string }> | null>(null);
  const [qrBusy, setQrBusy] = useState(false);

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
          const [m, s, a, w, st, sts] = await Promise.all([
            getMastery(tok, kid.id),
            getKidSettings(tok, kid.id).catch(() => DEFAULT_SETTINGS),
            getActivity(tok, kid.id).catch(() => []),
            getWeekly(tok, kid.id).catch(() => null),
            getStories(tok, kid.id).catch(() => []),
            getStoryStats(tok, kid.id).catch(() => null),
          ]);
          return [kid.id, { m, s, a, w, st, sts }] as const;
        })
      );
      const mm: Record<string, MasteryRow[]> = {};
      const ss: Record<string, KidSettingsT> = {};
      const aa: Record<string, ActivityRow[]> = {};
      const ww: Record<string, WeeklyReport> = {};
      const stt: Record<string, LearningStoryRow[]> = {};
      const sst: Record<string, StoryStats | null> = {};
      for (const [id, { m, s, a, w, st, sts }] of entries) {
        mm[id] = m;
        ss[id] = s;
        aa[id] = a;
        if (w) ww[id] = w;
        stt[id] = st;
        sst[id] = sts;
      }
      setMastery(mm);
      setSettings(ss);
      setActivity(aa);
      setWeekly(ww);
      setStories(stt);
      setStoryStats(sst);
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
        const [m, s, a, w, st, sts] = await Promise.all([
          getMastery(token, id),
          getKidSettings(token, id).catch(() => DEFAULT_SETTINGS),
          getActivity(token, id).catch(() => []),
          getWeekly(token, id).catch(() => null),
          getStories(token, id).catch(() => []),
          getStoryStats(token, id).catch(() => null),
        ]);
        setMastery((prev) => ({ ...prev, [id]: m }));
        setSettings((prev) => ({ ...prev, [id]: s }));
        setActivity((prev) => ({ ...prev, [id]: a }));
        if (w) setWeekly((prev) => ({ ...prev, [id]: w }));
        setStories((prev) => ({ ...prev, [id]: st }));
        setStoryStats((prev) => ({ ...prev, [id]: sts }));
      } catch {
        setError("Failed to load that kid.");
      }
    },
    [token, mastery]
  );

  // #238 — load the kid's saved narrative draft (edit-safe: localStorage).
  useEffect(() => {
    setNarrDraft(activeId ? readNarrDraft(activeId) : null);
    setNarrCopied(false);
  }, [activeId]);

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

  /** #132 — build + show a printable worksheet from the kid's weak skills. */
  async function handleWorksheet() {
    if (!token || !activeId || sheetBusy) return;
    setSheetBusy(true);
    setError(null);
    try {
      const weak = await getWeakSkills(token, activeId);
      const active = kids.find((k) => k.id === activeId);
      setSheet({
        name: active?.name ?? "My kid",
        items: worksheetFor(weak, "en", Date.now() % 100000),
        date: new Date().toISOString().slice(0, 10),
      });
    } catch {
      setError("Couldn't load weak skills for the worksheet.");
    } finally {
      setSheetBusy(false);
    }
  }

  /** #139 — build a printable QR-card sheet for the games this kid has PLAYED.
   *  Cards are "real" (only played skills) so the deck stays small and relevant;
   *  each QR is pure client-side (offline-first, nothing leaves the browser). */
  async function handleQRCards() {
    if (!token || !activeId || qrBusy) return;
    setQrBusy(true);
    setError(null);
    try {
      const mastery = await getMastery(token, activeId);
      const played = new Set(mastery.map((m) => m.skill_id));
      const cards: NonNullable<typeof qrCards> = [];
      for (const s of SKILLS) {
        if (!s.game || !played.has(s.id)) continue;
        const code = `NV:${s.id}`;
        cards.push({
          skillId: s.id,
          title: s.title,
          dataUrl: await QRCode.toDataURL(code, { margin: 1, width: 170, errorCorrectionLevel: "M" }),
          code,
        });
      }
      setQrCards(cards);
    } catch {
      setError("Couldn't build the QR cards.");
    } finally {
      setQrBusy(false);
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

  // #238 — weekly narrative derived from the kid's Kotha stories.
  const weekNarrative = activeId && active ? buildWeeklyNarrative(active.name, stories[activeId] ?? []) : null;
  const narrText =
    narrDraft && narrDraft.edited
      ? narrLang === "en"
        ? narrDraft.en
        : narrDraft.bn
      : narrLang === "en"
        ? (weekNarrative?.en ?? "")
        : (weekNarrative?.bn ?? "");

  /** #238 — edit-safe: the parent's changes are stored in this browser only
   *  (localStorage), never sent anywhere. */
  function onNarrativeEdit(text: string) {
    if (!activeId) return;
    const next = { ...(narrDraft ?? { en: "", bn: "", edited: false }), edited: true, [narrLang]: text };
    setNarrDraft(next);
    try {
      localStorage.setItem(`nv_kotha_nar_${activeId}`, JSON.stringify(next));
    } catch {
      /* private browsing — keep the draft in memory for this session */
    }
  }
  function handleRegenerateNarr() {
    if (!activeId) return;
    const next = { en: weekNarrative?.en ?? "", bn: weekNarrative?.bn ?? "", edited: false };
    setNarrDraft(next);
    try {
      localStorage.setItem(`nv_kotha_nar_${activeId}`, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  async function handleCopyNarr() {
    if (!narrText) return;
    try {
      await navigator.clipboard.writeText(narrText);
      setNarrCopied(true);
      window.setTimeout(() => setNarrCopied(false), 1500);
    } catch {
      /* clipboard unavailable — nothing to show */
    }
  }

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

          {/* #237 — per-kid reading & story progress view */}
          <section className="card reading-card">
            <h2>📚 Reading & stories</h2>
            <p className="muted small">
              Which read-aloud books and story quizzes {active.name} has finished — and how they scored.
              Every story game stays on the kid's device data, so this works offline too.
            </p>
            {readingSkills.length === 0 ? (
              <p className="muted">No story games in the catalog yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Story</th>
                    <th>Progress</th>
                    <th>Score</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {readingSkills.map((s) => {
                    const m = activeMastery.find((x) => x.skill_id === s.id);
                    const pct = m ? Math.min(100, Math.round(m.mastery * 100)) : 0;
                    const status = !m ? "🌱 Not started" : m.mastery >= 0.8 ? "✅ Finished" : "🔶 In progress";
                    return (
                      <tr key={s.id}>
                        <td>
                          {s.title}
                          {s.titleBn ? <span className="muted small"> · {s.titleBn}</span> : null}
                        </td>
                        <td>
                          {m ? (
                            <>
                              <div className="bar">
                                <div className={`fill${m.mastery >= 0.8 ? " done" : ""}`} style={{ width: `${pct}%` }} />
                              </div>
                              {pct}%
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{m ? `${m.correct}/${m.attempts}` : "—"}</td>
                        <td>{status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {/* #238 — auto-generated weekly learning narrative from Kotha */}
          <section className="card narrative-card">
            <div className="narrative-head">
              <h2>📖 {active.name}'s week in words</h2>
              <div className="row-buttons" role="group" aria-label="Narrative language">
                <button
                  className={`toggle-chip${narrLang === "en" ? " on" : ""}`}
                  onClick={() => setNarrLang("en")}
                >
                  English
                </button>
                <button
                  className={`toggle-chip${narrLang === "bn" ? " on" : ""}`}
                  onClick={() => setNarrLang("bn")}
                >
                  বাংলা
                </button>
              </div>
            </div>
            <p className="muted small">
              A plain-language summary of what {active.name} practiced and found tricky this week,
              drawn from the learning stories the app recorded. It is written right here in your
              browser — edit it freely, and nothing you type is ever sent to a server.
            </p>
            {weekNarrative ? (
              <>
                <textarea
                  className="narrative-edit"
                  rows={7}
                  value={narrText}
                  onChange={(e) => onNarrativeEdit(e.target.value)}
                  aria-label="Weekly learning narrative (editable)"
                />
                <div className="row-buttons">
                  <button className="btn ghost-btn" onClick={handleRegenerateNarr}>
                    ↺ Regenerate
                  </button>
                  <button className="btn ghost-btn" onClick={() => void handleCopyNarr()}>
                    {narrCopied ? "✓ Copied" : "📋 Copy text"}
                  </button>
                </div>
                <p className="muted small" style={{ marginTop: 8 }}>
                  💾 Your edits stay in this browser only — safe to tweak and share however you like.
                </p>
              </>
            ) : (
              <p className="muted">
                No learning stories for this week yet — have {active.name} play a few rounds and a
                summary appears here.
              </p>
            )}
          </section>

          {/* #132 — printable worksheet from weak skills */}
          <section className="card worksheet-card">
            <h2>📄 Printable worksheet</h2>
            <p className="muted small">
              A practice sheet built from what {active.name} hasn't mastered yet — perfect for offline
              homework. Print or save as PDF (your browser's Print dialog).
            </p>
            <div className="worksheet-actions">
              <button className="btn" disabled={sheetBusy} onClick={() => void handleWorksheet()}>
                {sheetBusy ? "Building…" : "🖨️ Build worksheet"}
              </button>
              {sheet && (
                <button className="btn ghost-btn" onClick={() => window.print()}>Print / save PDF</button>
              )}
              {sheet && (
                <button className="btn ghost-btn" onClick={() => setSheet(null)}>Close</button>
              )}
            </div>
            {sheet && (
              <p className="muted small" style={{ marginTop: "8px" }}>
                {sheet.items.length} practice lines for {sheet.name} · generated {sheet.date} · tap Print for a clean A4 sheet.
              </p>
            )}
          </section>

          {/* #139 — printable flashcard QR sheet (offline-first) */}
          <section className="card worksheet-card">
            <h2>🎴 Flashcard QR cards</h2>
            <p className="muted small">
              Printable QR codes for the games {active.name} has played. A kid scans a card
              (or types its code) in the app to jump straight into that mini-game — works offline.
            </p>
            <div className="worksheet-actions">
              <button className="btn" disabled={qrBusy} onClick={() => void handleQRCards()}>
                {qrBusy ? "Building…" : "🎴 Build QR cards"}
              </button>
              {qrCards && qrCards.length > 0 && (
                <button className="btn ghost-btn" onClick={() => window.print()}>Print / save PDF</button>
              )}
              {qrCards && (
                <button className="btn ghost-btn" onClick={() => setQrCards(null)}>Close</button>
              )}
            </div>
            {qrCards && qrCards.length === 0 && (
              <p className="muted small" style={{ marginTop: "8px" }}>
                No games played yet — {active.name} needs a session first (mastery builds from rounds).
              </p>
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

      {/* #132 — print-only worksheet. Rendered in the DOM so window.print()
          picks it up; CSS @media print hides everything else. */}
      {sheet && (
        <div className="print-sheet" aria-hidden="false">
          <h1>📄 Numberverse practice worksheet</h1>
          <p className="sheet-meta">
            {sheet.name} · {sheet.date} · numberverse.org
          </p>
          <p className="sheet-sub">
            Practice a little every day — you’re getting better every time! ✨
          </p>
          <div className="sheet-problems">
            {sheet.items.map((p, i) => (
              <div className="sheet-problem" key={`${p.skillId}-${i}`}>
                <span className="sheet-num">{i + 1}.</span>
                <span className="sheet-prompt">{p.prompt}</span>
                <span className="sheet-answer">{p.lines === 1 ? "____" : ""}</span>
              </div>
            ))}
          </div>
          <p className="sheet-footer">Made with ❤️ by Numberverse for {sheet.name}</p>
        </div>
      )}

      {/* #139 — print-only QR card sheet. Cut along the grid, scan in the app. */}
      {qrCards && qrCards.length > 0 && (
        <div className="print-sheet" aria-hidden="false">
          <h1>🎴 Numberverse flashcard QR cards</h1>
          <p className="sheet-meta">
            {kids.find((k) => k.id === activeId)?.name ?? "My kid"} · numberverse.org · open the app → 📷 Scan a card
          </p>
          <div className="qr-grid">
            {qrCards.map((c) => (
              <div className="qr-card" key={c.skillId}>
                <img className="qr-img" src={c.dataUrl} alt={c.title} width={140} height={140} />
                <div className="qr-title">{c.title}</div>
                <div className="qr-code">{c.code}</div>
              </div>
            ))}
          </div>
          <p className="sheet-footer">Cut on the dashed lines — every card opens its mini-game offline.</p>
        </div>
      )}
    </main>
  );
}
