"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  isAllowedExternalUrl,
  SKILLS,
  A11Y_DEFAULTS,
  a11yStorageKey,
  a11yToStorage,
  parseA11yPrefs,
  type A11yPrefs,
} from "@numberverse/core";
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
  getAcceleration,
  getShareToken,
  resetKidProgress,
  createKid,
  updateKid,
  deleteKid,
  signout,
  signoutAll,
  getSessions,
  revokeSession,
  changePassword,
  setPassword,
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
  type AccelerationRow,
} from "../lib/api";
import { worksheetFor, type WorksheetProblem } from "../lib/worksheet";
import {
  ACCOUNT_LANGS,
  A11Y_LANGS,
  AVATARS,
  DEFAULT_SETTINGS,
  LOADING_LANGS,
  NAV_GROUPS,
  SUBJECTS,
  SYNC_LANGS,
  THEME_KEY,
  THEME_LANGS,
  WIZARD_LANGS,
  WizardLang,
  archiveToCsv,
  buildFlaggedSkills,
  buildMissedQuestions,
  buildMonthlyArchive,
  buildSessionTimeline,
  buildWeeklyNarrative,
  kidCurrentBand,
  nvDiagErrors,
  readNarrDraft,
  relTime,
  weekdayLimits,
  weeklyShareText,
} from "./lib/portal";
import LearningControls from "./components/LearningControls";
import { FamilyOverview, TodayCard, WeeklyCard, MasteryTimeline } from "./components/OverviewSections";
import {
  StoriesCard,
  WeekWordsCard,
  HelpNeededCard,
  AccelCard,
  ArchiveCard,
  SessionsCard,
} from "./components/ReportsSections";
import {
  GamesCard,
  CompareCard,
  WorksheetCard,
  FlashcardsCard,
} from "./components/ExploreSections";
import { ActivityFeed, MissedCard, MasteryCard } from "./components/ActivitySections";
import {
  AddKidCard,
  AccountCard,
  EditKidCard,
  DiagnosticsCard,
  HelpCard,
} from "./components/AccountSections";

// #1530/#1508 — single source of truth for the "new kid" birth-year default.
function defaultBirthYear(): number {
  return new Date().getFullYear() - 6;
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
  // 🚀 #249 — per-kid acceleration plans (skills skipped ahead + why + band jump).
  const [accel, setAccel] = useState<Record<string, AccelerationRow[]>>({});
  // 🗓️ #251 — monthly archive: the FULL activity feed per kid (lazy, up to 2000
  // rounds) + the selected month key. Summaries are derived client-side.
  const [archActivity, setArchActivity] = useState<Record<string, ActivityRow[]>>({});
  // #1506/#1518 — per-kid archive lifecycle. The card spinner/error/retry derive
  // from this explicit status instead of a single global boolean.
  const [archStatus, setArchStatus] = useState<Record<string, "loading" | "loaded" | "error">>({});
  const [archMonth, setArchMonth] = useState<Record<string, string>>({});
  // 🧵 #255 — per-kid session-timeline day filter ("all" = no filter).
  const [sessionDay, setSessionDay] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedTick, setSavedTick] = useState(0);
  const [showAdd, setShowAdd] = useState(false);

  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState("🦊");
  // #1540 — a 6-year-old is a more common starter than the old hardcoded
  // age-5 cohort; parents can still change it before the kid is created.
  const [editBirthYear, setEditBirthYear] = useState(defaultBirthYear);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // #1496 — active-section tracking for the sticky sidebar / mobile strip.
  const [activeNav, setActiveNav] = useState<string | null>(null);

  // #246 — guided multi-kid onboarding. Opens only when the account has NO kids
  // and this browser hasn't finished onboarding before (`nv_parent_onboarded`).
  const [onboarding, setOnboarding] = useState<"init" | "open" | "done">("init");
  const [onboardBusy, setOnboardBusy] = useState(false);
  const [onboardErr, setOnboardErr] = useState<string | null>(null);
  const [wizLang, setWizLang] = useState<WizardLang>("en");
  useEffect(() => {
    const saved = localStorage.getItem("nv_parent_lang");
    if (saved === "en" || saved === "bn") setWizLang(saved);
  }, []);

  // 🧏 #250 — GLOBAL accessibility toggles. One localStorage key (`nv_a11y`,
  // same origin as the kid app) → toggling here applies to BOTH areas; a
  // `storage` listener live-syncs the portal to the kid app and vice-versa.
  const [a11y, setA11y] = useState<A11yPrefs>(() => {
    try {
      return parseA11yPrefs(localStorage.getItem(a11yStorageKey()));
    } catch {
      return { ...A11Y_DEFAULTS };
    }
  });
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("nv-big-text", a11y.bigText);
    el.classList.toggle("nv-high-contrast", a11y.highContrast);
  }, [a11y]);
  useEffect(() => {
    // Cross-tab sync: the kid app (same origin) or another portal tab.
    const el = document.documentElement;
    const onStorage = (e: StorageEvent) => {
      if (e.key === a11yStorageKey()) {
        const next = parseA11yPrefs(e.newValue);
        el.classList.toggle("nv-big-text", next.bigText);
        el.classList.toggle("nv-high-contrast", next.highContrast);
        setA11y(next);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 🎨 #254 — dashboard light/dark theme. Persisted per-browser (portal-only,
  // unlike nv_a11y). Applied as a `theme-light` class on <html>; a `storage`
  // listener keeps other portal tabs in sync.
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("theme-light", theme === "light");
  }, [theme]);
  useEffect(() => {
    const el = document.documentElement;
    const onThemeStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) {
        const next = e.newValue === "light" ? "light" : "dark";
        el.classList.toggle("theme-light", next === "light");
        setTheme(next);
      }
    };
    window.addEventListener("storage", onThemeStorage);
    return () => window.removeEventListener("storage", onThemeStorage);
  }, []);

  // #7 — read the service-worker version (if any) for the diagnostics card.
  // Guarded: registration can reject (older browsers / private mode) → keep null.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const ctrl = navigator.serviceWorker.controller;
    if (ctrl) {
      setSwVersion(ctrl.scriptURL.split("/").pop() ?? ctrl.scriptURL);
      return;
    }
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        const url = reg?.active?.scriptURL ?? reg?.installing?.scriptURL;
        if (url) setSwVersion(url.split("/").pop() ?? url);
      })
      .catch(() => {
        /* no SW — keep null */
      });
  }, []);

  // #85 — live online/offline for the sync chip (browser network events).
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // #238 — weekly narrative language + editable draft (localStorage only).
  const [narrLang, setNarrLang] = useState<"en" | "bn">("en");
  const [narrDraft, setNarrDraft] = useState<{ en: string; bn: string; edited: boolean } | null>(null);
  const [narrCopied, setNarrCopied] = useState(false);

  // #239 — reteach QR deep-links for flagged skills (client-side only).
  const [reteachQr, setReteachQr] = useState<Record<string, { title: string; dataUrl: string; code: string }>>({});
  const [reteachBusy, setReteachBusy] = useState(false);

  // #240 — side-by-side kid comparison (offline: derives from loaded state).
  const [cmpA, setCmpA] = useState<string | null>(null);
  const [cmpB, setCmpB] = useState<string | null>(null);

  // #245 — per-kid share-card deep link (minted lazily on first share).
  // #1531 — keyed by kid id so kid A's link/copied/busy never leaks onto
  // kid B's weekly card after a switch.
  const [shareBusy, setShareBusy] = useState<Record<string, boolean>>({});
  const [shareLink, setShareLink] = useState<Record<string, string | null>>({});
  const [shareCopied, setShareCopied] = useState<Record<string, boolean>>({});

  // #7/#85 — local diagnostics: when the dashboard data last synced (set on
  // every successful refreshAll), whether the diagnostics card is open, and the
  // SW version (read lazily; null until a service worker controls this page).
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [diagCopied, setDiagCopied] = useState(false);
  const [swVersion, setSwVersion] = useState<string | null>(null);
  // #85 — topbar sync chip: live online/offline + "synced X ago". Tracked from
  // the browser's network events; the manual button just re-runs refreshAll.
  const [online, setOnline] = useState(true);
  const [syncingNow, setSyncingNow] = useState(false);
  // #1516 — first data load shows a neutral skeleton instead of the cards'
  // zero-state defaults. initialLoadStarted keeps later refreshes (manual sync,
  // add/edit/delete) from re-skeletonizing the already-rendered dashboard.
  const [initialLoading, setInitialLoading] = useState(false);
  const initialLoadStarted = useRef(false);
  // #18 — help card (iOS install / Bangla voice / build check), collapsible.
  const [helpOpen, setHelpOpen] = useState(false);

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
  // #1548 — sessions load separately from the rest of the dashboard so the
  // active-logins list can show a real loading state before rows arrive.
  const [sessionsLoading, setSessionsLoading] = useState(false);

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
      // #1516 — the first data load gets a neutral skeleton over the overview
      // area; later refreshes (manual sync, add/edit/delete) keep the existing
      // cards visible and rely on the syncingNow dim instead.
      if (!initialLoadStarted.current) setInitialLoading(true);
      try {
        const k = await getKids(tok);
        initialLoadStarted.current = true;
        setKids(k);
        setActiveId((prev) => (prev && k.some((x) => x.id === prev) ? prev : (k[0]?.id ?? null)));
        if (k.length === 0) {
          // #246 — first run (or all kids deleted): open the guided setup wizard,
          // but never nag a browser that already finished/skipped onboarding.
          if (!localStorage.getItem("nv_parent_onboarded")) setOnboarding("open");
          return;
        }
        // Load every kid up-front so the family overview + switcher are instant.
        // #1492/#1495 — activity is intentionally NOT part of this per-kid block
        // anymore. The one full-history cursor is loadArchive; the Recent Activity
        // prefix and the archive/session timelines all derive from archActivity.
        const entries = await Promise.all(
          k.map(async (kid) => {
            const [m, s, w, st, sts, ac] = await Promise.all([
              // #1504 — mastery degrades to [] like its siblings so one kid's
              // mastery failure can no longer reject the whole Promise.all.
              getMastery(tok, kid.id).catch(() => []),
              getKidSettings(tok, kid.id).catch(() => DEFAULT_SETTINGS),
              getWeekly(tok, kid.id).catch(() => null),
              getStories(tok, kid.id).catch(() => []),
              getStoryStats(tok, kid.id).catch(() => null),
              getAcceleration(tok, kid.id).catch(() => []),
            ]);
            return [kid.id, { m, s, w, st, sts, ac }] as const;
          })
        );
        const mm: Record<string, MasteryRow[]> = {};
        const ss: Record<string, KidSettingsT> = {};
        const ww: Record<string, WeeklyReport> = {};
        const stt: Record<string, LearningStoryRow[]> = {};
        const sst: Record<string, StoryStats | null> = {};
        const acc: Record<string, AccelerationRow[]> = {};
        for (const [id, { m, s, w, st, sts, ac }] of entries) {
          mm[id] = m;
          ss[id] = s;
          if (w) ww[id] = w;
          stt[id] = st;
          sst[id] = sts;
          acc[id] = ac;
        }
        setMastery(mm);
        setSettings(ss);
        setWeekly(ww);
        setStories(stt);
        setStoryStats(sst);
        setAccel(acc);
        // #7/#85 — record when the dashboard data last came from the API, so the
        // diagnostics card + sync chip can say "synced X ago" (offline-safe).
        setLastSync(Date.now());
      } finally {
        setInitialLoading(false);
      }
    },
    []
  );

  const reloadAccount = useCallback(async (tok: string) => {
    setSessionsLoading(true);
    try {
      const [p, s] = await Promise.all([getProfile(tok), getSessions(tok)]);
      setProfile(p);
      setDisplayName(p.display_name ?? "");
      setSessions(s);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  // 🗓️ #251 — lazily fetch a kid's FULL activity history (up to 2000 rounds)
  // once per kid, then derive all 12 monthly summaries client-side (offline).
  // #1492/#1495/#1506/#1518 — per-kid archStatus is the lifecycle source of
  // truth. Failure sets "error" so the card can show an inline retry instead of
  // leaving the auto-loader to spin forever or poisoning the global banner.
  const loadArchive = useCallback(async (kidId: string, force = false) => {
    if (!token) return;
    if (!force && (archStatus[kidId] || archActivity[kidId])) return;
    setArchStatus((prev) => ({ ...prev, [kidId]: "loading" }));
    try {
      const rows = await getActivity(token, kidId, 2000);
      setArchActivity((prev) => ({ ...prev, [kidId]: rows }));
      setArchStatus((prev) => ({ ...prev, [kidId]: "loaded" }));
    } catch {
      // #1506 — keep the failure scoped to this kid's card; the inline
      // "Try again" button re-runs loadArchive(kidId, true).
      setArchStatus((prev) => ({ ...prev, [kidId]: "error" }));
    }
  }, [token, archStatus, archActivity]);

  // Auto-load the archive once per kid (cached; the dashboard stays snappy for
  // accounts with many kids because it's the ONLY big activity fetch).
  // #1518 — gate per activeId on archStatus, so a second kid's fetch is never
  // blocked by another kid's in-flight request.
  useEffect(() => {
    if (activeId && token && !archStatus[activeId]) void loadArchive(activeId);
  }, [activeId, token, archStatus, loadArchive]);

  // #1532 — restore the last selected kid on reload (client-only). refreshAll's
  // functional activeId updater already keeps `prev` when it still exists in the
  // freshly fetched kid list, so seeding `activeId` from the shared `nv_kid_id`
  // key here is enough — no need to change the fetch orchestration.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("nv_kid_id");
      if (stored) setActiveId(stored);
    } catch {
      /* private browsing — keep the in-memory selection only */
    }
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
        // #1538 — ?welcome=1 (from signup or first-run login) opens the #246
        // onboarding wizard once, then cleans the URL so a reload doesn't
        // re-trigger it. Matches the empty-kids onboarding logic in refreshAll.
        if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("welcome") === "1") {
          const url = new URL(window.location.href);
          url.searchParams.delete("welcome");
          window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
          if (!localStorage.getItem("nv_parent_onboarded")) setOnboarding("open");
        }
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
      // #1529/#1530 — never carry one kid's danger-zone confirms or half-typed
      // edit form over to the next kid. Reset before the active id flips.
      setConfirmReset(false);
      setConfirmDelete(false);
      setEditName("");
      setEditAvatar("🦊");
      setEditBirthYear(defaultBirthYear());
      // #1532 — remember the selected kid across reloads (same key the kid app
      // already reads for its own launches).
      try {
        localStorage.setItem("nv_kid_id", id);
      } catch {
        /* private browsing — keep the selection in memory only */
      }
      setActiveId(id);
      // #1495 — kids loaded by refreshAll already have mastery cached, so this
      // early return IS the cache hit; no per-kid activity re-fetch happens on
      // a normal switch.
      if (mastery[id]) return;
      try {
        // #1492/#1495 — never double-fetch activity. If this kid's full archive
        // already exists (or is already in flight), derive the feed from it.
        // Only fetch the 40-row fallback when no archive cursor is available.
        const needActivityFallback = !archActivity[id] && archStatus[id] !== "loading";
        const [m, s, a, w, st, sts, ac] = await Promise.all([
          getMastery(token, id),
          getKidSettings(token, id).catch(() => DEFAULT_SETTINGS),
          needActivityFallback
            ? getActivity(token, id).catch(() => [])
            : Promise.resolve<ActivityRow[] | null>(null),
          getWeekly(token, id).catch(() => null),
          getStories(token, id).catch(() => []),
          getStoryStats(token, id).catch(() => null),
          getAcceleration(token, id).catch(() => []),
        ]);
        setMastery((prev) => ({ ...prev, [id]: m }));
        setSettings((prev) => ({ ...prev, [id]: s }));
        if (needActivityFallback && a) setActivity((prev) => ({ ...prev, [id]: a }));
        if (w) setWeekly((prev) => ({ ...prev, [id]: w }));
        setStories((prev) => ({ ...prev, [id]: st }));
        setStoryStats((prev) => ({ ...prev, [id]: sts }));
        setAccel((prev) => ({ ...prev, [id]: ac }));
      } catch {
        setError("Failed to load that kid.");
      }
    },
    [token, mastery, archActivity, archStatus, activity]
  );

  // #238 — load the kid's saved narrative draft (edit-safe: localStorage).
  useEffect(() => {
    setNarrDraft(activeId ? readNarrDraft(activeId) : null);
    setNarrCopied(false);
  }, [activeId]);

  // #1496 — keep the sidebar's active-section highlight in sync with the
  // section currently in view. Sections appear/disappear as the active kid and
  // the add-kid form change, so the observer is rebuilt on those transitions.
  useEffect(() => {
    if (kids.length === 0) return;
    const ids = NAV_GROUPS.flatMap((g) => g.items.map((it) => it.id));
    const computeActive = () => {
      const line = 150; // pixels below the viewport top to use as the "reading" line
      const els = ids
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      let current: string | null = null;
      for (const el of els) {
        if (el.getBoundingClientRect().top <= line) current = el.id;
      }
      // At the very top of the page (before any section has crossed the
      // reading line), highlight the first section so the nav is never blank.
      if (!current && window.scrollY < 10 && els.length > 0) current = els[0].id;
      setActiveNav(current);
    };
    computeActive();
    window.addEventListener("scroll", computeActive, { passive: true });
    window.addEventListener("resize", computeActive);
    return () => {
      window.removeEventListener("scroll", computeActive);
      window.removeEventListener("resize", computeActive);
    };
  }, [kids.length, activeId, showAdd]);

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
    const deletedId = activeId;
    setBusy(true);
    setError(null);
    try {
      await deleteKid(token, deletedId);
      // #1509 — mirror doSignout's cleanup so the kid app never keeps pointing
      // at a deleted profile id. Drop the id/map entry if it belongs to the
      // deleted kid; refreshAll re-derives the map when it next loads.
      try {
        if (localStorage.getItem("nv_kid_id") === deletedId) localStorage.removeItem("nv_kid_id");
        const raw = localStorage.getItem("nv_kid_map");
        if (raw) {
          const map = JSON.parse(raw) as Record<string, string>;
          const next = Object.fromEntries(Object.entries(map).filter(([, serverId]) => serverId !== deletedId));
          if (Object.keys(next).length > 0) localStorage.setItem("nv_kid_map", JSON.stringify(next));
          else localStorage.removeItem("nv_kid_map");
        }
      } catch {
        /* corrupted/absent storage — refreshAll will rebuild on its own */
      }
      setConfirmDelete(false);
      setShowAdd(false);
      // #1530 — a deleted kid's edit form must not linger for the next one.
      setEditName("");
      setEditAvatar("🦊");
      setEditBirthYear(defaultBirthYear());
      await refreshAll(token);
    } catch {
      setError("Failed to delete kid.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!token || !editName.trim()) return;
    // #1539 — validate the same 2010..2030 range the API schema enforces, and
    // show a field-specific message instead of a misleading connectivity error.
    if (editBirthYear < 2010 || editBirthYear > 2030) {
      setError(WIZARD_LANGS[wizLang].birthRangeErr);
      return;
    }
    // #1510 — client-side guard: duplicates are indistinguishable in the
    // avatar/name/year switcher, so ask before creating a second identical kid.
    const name = editName.trim();
    const duplicate = kids.some((k) => k.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) {
      const ok = window.confirm(WIZARD_LANGS[wizLang].dupConfirm.replace("{name}", name));
      if (!ok) return;
    } else if (kids.length >= 8) {
      const ok = window.confirm(WIZARD_LANGS[wizLang].manyKidsWarn.replace("{count}", String(kids.length)));
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      await createKid(token, {
        name,
        avatar: editAvatar,
        birth_year: editBirthYear,
      } satisfies NewKid);
      setShowAdd(false);
      setEditName("");
      setEditAvatar("🦊");
      // #1508 — don't let the previous kid's birth year pre-fill the next add.
      setEditBirthYear(defaultBirthYear());
      await refreshAll(token);
      setSavedTick((t) => t + 1);
    } catch {
      setError("Failed to add kid.");
    } finally {
      setBusy(false);
    }
  }

  /** #246 — guided-first-run add. Same server call, but the wizard STAYS open so
   *  the parent can add 2+ kids back-to-back; on failure the entered values are
   *  kept (offline-friendly retry — nothing typed is ever lost). */
  async function handleOnboardCreate() {
    if (!token || !editName.trim() || onboardBusy) return;
    // #1539 — same range guard as handleCreate, but the wizard keeps its own
    // inline error so the entered name/year stay put for a one-click retry.
    if (editBirthYear < 2010 || editBirthYear > 2030) {
      setOnboardErr(WIZARD_LANGS[wizLang].birthRangeErr);
      return;
    }
    // #1510 — the wizard stays open for back-to-back adds, so duplicate names
    // would be easy to create by accident. Confirm before creating another.
    const name = editName.trim();
    const duplicate = kids.some((k) => k.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) {
      const ok = window.confirm(WIZARD_LANGS[wizLang].dupConfirm.replace("{name}", name));
      if (!ok) return;
    } else if (kids.length >= 8) {
      const ok = window.confirm(WIZARD_LANGS[wizLang].manyKidsWarn.replace("{count}", String(kids.length)));
      if (!ok) return;
    }
    setOnboardBusy(true);
    setOnboardErr(null);
    try {
      await createKid(token, {
        name,
        avatar: editAvatar,
        birth_year: editBirthYear,
      } satisfies NewKid);
      setEditName("");
      setEditAvatar("🦊");
      // #1508 — clear the birth year so the next add starts fresh, not with
      // the previous kid's year silently carried over.
      setEditBirthYear(defaultBirthYear());
      await refreshAll(token);
      setSavedTick((t) => t + 1);
    } catch {
      // Keep the form values so "Add kid" is a one-click retry once online.
      setOnboardErr(WIZARD_LANGS[wizLang].err.replace("{name}", name));
    } finally {
      setOnboardBusy(false);
    }
  }

  /** #246 — leave the wizard for the dashboard. Marks this browser done so the
   *  wizard never re-opens (even if all kids are deleted later). */
  function finishOnboarding() {
    localStorage.setItem("nv_parent_onboarded", "1");
    setOnboarding("done");
    setShowAdd(false);
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
    // #1490 — bcrypt truncates at 72 bytes, so stop over-long passwords here
    // (before the min-length check) with a message that actually says why.
    if (pwNew.length > 72) {
      setAcctMsg({ kind: "err", text: ACCOUNT_LANGS[wizLang].pwTooLong });
      return;
    }
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

  /** #1487 — Google accounts have no current password to verify, so they set a
   *  fresh one through /auth/set-password (new + confirm only). */
  async function handleSetPassword(pw: string) {
    if (!token) return;
    if (pw.length > 72) {
      setAcctMsg({ kind: "err", text: ACCOUNT_LANGS[wizLang].pwTooLong });
      return;
    }
    if (pw.length < 8) {
      setAcctMsg({ kind: "err", text: "New password must be at least 8 characters." });
      return;
    }
    if (pw !== pwConfirm) {
      setAcctMsg({ kind: "err", text: "New passwords don't match." });
      return;
    }
    setAcctBusy(true);
    setAcctMsg(null);
    try {
      await setPassword(token, pw);
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      setAcctMsg({ kind: "ok", text: ACCOUNT_LANGS[wizLang].setPwOk });
      await reloadAccount(token);
    } catch {
      setAcctMsg({ kind: "err", text: ACCOUNT_LANGS[wizLang].setPwErr });
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
  // #79 — 🏆 mastery timeline: every mastered skill, newest first by the moment
  // it first hit ≥80% (`mastered_at`). Rows without a stamp (oldest data) sort
  // last under "earlier". Purely from already-loaded mastery → offline after load.
  const masteryTimeline = activeMastery
    .filter((m) => m.mastery >= 0.8)
    .map((m) => ({ id: m.skill_id, at: m.mastered_at ?? null }))
    .sort((a, b) => {
      if (a.at && b.at) return a.at < b.at ? 1 : -1;
      return a.at ? -1 : b.at ? 1 : 0;
    });
  const activeSettings = activeId ? settings[activeId] ?? DEFAULT_SETTINGS : DEFAULT_SETTINGS;
  const EMPTY_WEEKLY: WeeklyReport = { days: [], rounds: 0, correct_pct: 0, minutes: 0, active_days: 0, mastered_this_week: [], mastered_today: [], top_game: null, streak: 0 };
  const activeWeekly = activeId ? weekly[activeId] ?? EMPTY_WEEKLY : EMPTY_WEEKLY;

  // #244 — today's headline from the rolling weekly report (server UTC day
  // buckets, matching the weekly endpoint). Fully offline: derived from data
  // already loaded with the dashboard; a reload "refreshes daily".
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayEntry = activeWeekly.days.find((d) => d.date === todayKey);
  const todayRounds = todayEntry?.rounds ?? 0;
  const todayMinutes = todayEntry?.minutes ?? 0;
  const todayMastered = activeWeekly.mastered_today ?? [];

  // #4 — 🔥 streak + today's playtime vs the DAY's cap. Uses the same
  // weekdayLimits() as the portal's own limit editor → matches the kid app.
  const weeklyStreak = activeWeekly.streak ?? 0;
  const todayCap = weekdayLimits(activeSettings)[(new Date().getDay() + 6) % 7] ?? 0;
  const todayCapPct = todayCap > 0 ? Math.min(100, Math.round((todayMinutes / todayCap) * 100)) : 0;

  // #238 — weekly narrative derived from the kid's Kotha stories.
  const weekNarrative = activeId && active ? buildWeeklyNarrative(active.name, stories[activeId] ?? []) : null;
  // #239 — top Moni-flagged skills this week, derived from the same stories.
  const flags = activeId ? buildFlaggedSkills(stories[activeId] ?? []) : [];
  // #89 — per-skill missed questions, derived from the same offline story ledger.
  const missedSkills = activeId ? buildMissedQuestions(stories[activeId] ?? []) : [];
  // 🚀 #249 — the kid's acceleration plan (skills skipped ahead, newest first —
  // the backend already sorts; offline-safe because it's already-loaded state).
  const accelRows = activeId ? accel[activeId] ?? [] : [];
  // 🗓️ #251 — the 12-month archive derived client-side from the full activity
  // feed (once loaded, fully offline). Selected month defaults to the newest.
  const activeArchive = activeId ? buildMonthlyArchive(archActivity[activeId] ?? []) : [];
  // #1506/#1518 — archive lifecycle is per-kid now. Derive the card flags from
  // archStatus so switching kids never shows another kid's loading indicator.
  const archLoading = !!activeId && archStatus[activeId] === "loading";
  const archError = !!activeId && archStatus[activeId] === "error";
  const archiveLoaded = !!activeId && archStatus[activeId] === "loaded";
  // #1492 — the Recent Activity feed is a slice of the SAME full-history cursor
  // as the archive. Fall back to the legacy 40-row per-kid fetch only while a
  // kid has never had loadArchive run (e.g. the switchKid fallback branch).
  const recentActivity = activeId ? (archActivity[activeId] ?? activity[activeId] ?? []) : [];
  const selMonth = activeId ? (archMonth[activeId] ?? activeArchive[0]?.key ?? null) : null;
  const selSummary = activeArchive.find((m) => m.key === selMonth) ?? null;
  // 🧵 #255 — session timeline, derived client-side from the SAME full-history
  // feed as the archive (offline after load). Day filter is remembered per kid.
  const activeSessions = activeId ? buildSessionTimeline(archActivity[activeId] ?? []) : [];
  const sessionDays = [...new Set(activeSessions.map((s) => s.date))]
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, 14);
  const selSessionDay = activeId ? (sessionDay[activeId] ?? "all") : "all";
  const visibleSessions =
    selSessionDay === "all" ? activeSessions : activeSessions.filter((s) => s.date === selSessionDay);
  // 🎮 #252 — game coverage: which games (per skill) the kid has tried. Derived
  // from the already-loaded mastery (attempts > 0) → fully offline, per-kid.
  const playedSkills = new Set(activeMastery.filter((m) => m.attempts > 0).map((m) => m.skill_id));
  const coverageGames = SKILLS.filter((s) => s.game).map((s) => ({ skill: s, tried: playedSkills.has(s.id) }));
  const coverageTotal = coverageGames.length;
  const coveragePlayed = coverageGames.filter((g) => g.tried).length;
  const coveragePct = coverageTotal ? Math.round((coveragePlayed / coverageTotal) * 100) : 0;
  const coverageBySubject = SUBJECTS.map((sub) => {
    const gs = coverageGames.filter((g) => g.skill.subject === sub.id);
    const tried = gs.filter((g) => g.tried).length;
    return { ...sub, total: gs.length, tried };
  }).filter((x) => x.total > 0);
  const untriedGames = coverageGames.filter((g) => !g.tried);
  const exportArchive = () => {
    if (!activeId || !active?.name || !activeArchive.length) return;
    const blob = new Blob([archiveToCsv(activeArchive)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `numberverse-monthly-${active.name}-${activeId.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // #240 — side-by-side comparison of two kids, purely from loaded state.
  const cmpAId = cmpA ?? kids[0]?.id ?? "";
  const cmpBId = cmpB ?? kids[1]?.id ?? kids[0]?.id ?? "";
  const cmpMetric = (id: string) => {
    const m = mastery[id] ?? [];
    const w = weekly[id];
    const kid = kids.find((k) => k.id === id);
    return {
      id,
      name: kid?.name ?? "—",
      avatar: kid?.avatar ?? "🧒",
      mastered: m.filter((x) => x.mastery >= 0.8).length,
      inProgress: m.filter((x) => x.mastery < 0.8 && x.attempts > 0).length,
      band: kidCurrentBand(m),
      minutes: w?.minutes ?? 0,
      rounds: w?.rounds ?? 0,
      correctPct: w?.correct_pct ?? 0,
      activeDays: w?.active_days ?? 0,
      masteredWeek: (w?.mastered_this_week ?? []).length,
    };
  };
  const mtrA = cmpMetric(cmpAId);
  const mtrB = cmpMetric(cmpBId);
  const compareRows = [
    { label: "🏆 Skills mastered", a: String(mtrA.mastered), b: String(mtrB.mastered), higher: mtrA.mastered !== mtrB.mastered ? (mtrA.mastered > mtrB.mastered ? "a" : "b") : null },
    { label: "🚀 Current world", a: mtrA.band ? `World ${mtrA.band}` : "—", b: mtrB.band ? `World ${mtrB.band}` : "—", higher: mtrA.band !== mtrB.band ? (mtrA.band > mtrB.band ? "a" : "b") : null },
    { label: "🕒 Minutes this week", a: String(mtrA.minutes), b: String(mtrB.minutes), higher: mtrA.minutes !== mtrB.minutes ? (mtrA.minutes > mtrB.minutes ? "a" : "b") : null },
    { label: "🎮 Rounds this week", a: String(mtrA.rounds), b: String(mtrB.rounds), higher: mtrA.rounds !== mtrB.rounds ? (mtrA.rounds > mtrB.rounds ? "a" : "b") : null },
    { label: "🎯 Correct this week", a: `${mtrA.correctPct}%`, b: `${mtrB.correctPct}%`, higher: mtrA.correctPct !== mtrB.correctPct ? (mtrA.correctPct > mtrB.correctPct ? "a" : "b") : null },
    { label: "📅 Days active", a: String(mtrA.activeDays), b: String(mtrB.activeDays), higher: mtrA.activeDays !== mtrB.activeDays ? (mtrA.activeDays > mtrB.activeDays ? "a" : "b") : null },
    { label: "🆕 Mastered this week", a: String(mtrA.masteredWeek), b: String(mtrB.masteredWeek), higher: mtrA.masteredWeek !== mtrB.masteredWeek ? (mtrA.masteredWeek > mtrB.masteredWeek ? "a" : "b") : null },
    { label: "📖 Skills in progress", a: String(mtrA.inProgress), b: String(mtrB.inProgress), higher: null },
  ];
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

  /** #85 — manual sync: re-fetch every kid's progress from the app's own API.
   *  Sets the chip to "Syncing…", then `lastSync` updates on success. */
  const manualSync = useCallback(async () => {
    if (!token || syncingNow) return;
    setSyncingNow(true);
    try {
      await refreshAll(token);
    } catch {
      /* refreshAll surfaces its own error banner; chip just stays as-is */
    } finally {
      setSyncingNow(false);
    }
  }, [token, syncingNow, refreshAll]);

  /** #7 — export the local-only diagnostics as a plain-text blob (clipboard).
   *  No PII: kid names/ids/emails are never included — only browser/env facts. */
  async function exportDiagnostics() {
    const rows: string[] = [
      "Numberverse parent portal diagnostics",
      `time: ${new Date().toISOString()}`,
      `online: ${navigator.onLine ? "yes" : "no"}`,
      `last sync: ${lastSync ? new Date(lastSync).toISOString() : "never"}`,
      `service worker: ${swVersion ?? "not installed"}`,
      `user agent: ${navigator.userAgent}`,
      "--- errors (last 20) ---",
      ...(nvDiagErrors.length ? nvDiagErrors.map((e) => `${e.at}  ${e.msg}`) : ["(none)"]),
    ];
    const text = rows.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setDiagCopied(true);
      window.setTimeout(() => setDiagCopied(false), 2000);
    } catch {
      // Clipboard blocked → fall back to a download (still stays on-device).
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `numberverse-diagnostics-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  /** #245 — share-card deep link: mint the kid's opaque token (first share
   *  only) and append a UNIQUE per-kid link to the WhatsApp weekly card. The
   *  link opens an ANONYMOUS snapshot page — no name, no skill data, no
   *  tracking; only the parent can mint the token. */
  async function handleShareWeekly() {
    if (!token || !activeId || shareBusy[activeId]) return;
    const kidId = activeId;
    setShareBusy((prev) => ({ ...prev, [kidId]: true }));
    setError(null);
    try {
      const shareToken = await getShareToken(token, kidId);
      const base = (typeof window !== "undefined" ? window.location.origin : "") + (process.env.NEXT_PUBLIC_BASE_PATH ?? "");
      const link = `${base}/share/?t=${encodeURIComponent(shareToken)}`;
      const text = weeklyShareText(active?.name ?? "My kid", activeWeekly) + `\n🔗 See the week: ${link}`;
      const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
      if (isAllowedExternalUrl(wa)) window.open(wa, "_blank", "noopener,noreferrer");
      // #1531 — store the minted link under the kid it belongs to.
      setShareLink((prev) => ({ ...prev, [kidId]: link }));
      setShareCopied((prev) => ({ ...prev, [kidId]: false }));
    } catch {
      setError("Couldn't create the share link.");
    } finally {
      setShareBusy((prev) => ({ ...prev, [kidId]: false }));
    }
  }

  /** #239 — a reteach hook for a flagged skill: a QR the kid scans in the app
   *  (`NV:<skillId>`) to jump straight into that skill's game. Pure client-side
   *  QR, no network needed — matches the existing flashcard-card pattern. */
  async function handleReteachQr(skillId: string, title: string) {
    if (reteachQr[skillId] || reteachBusy) return;
    setReteachBusy(true);
    try {
      const code = `NV:${skillId}`;
      const dataUrl = await QRCode.toDataURL(code, { margin: 1, width: 160, errorCorrectionLevel: "M" });
      setReteachQr((prev) => ({ ...prev, [skillId]: { title, dataUrl, code } }));
    } catch {
      setError("Couldn't build the reteach QR.");
    } finally {
      setReteachBusy(false);
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
            {authNote && <p className="center err mt-8">{authNote}</p>}
          </>
        )}
        <div className="center mt-24">
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
        {/* 🧏 #250 — global accessibility toggles (shared with the kid app). */}
        <span className="a11y-toggle-group" role="group" aria-label="Accessibility">
          <button
            className={`a11y-toggle${a11y.bigText ? " on" : ""}`}
            onClick={() => {
              const next = { ...a11y, bigText: !a11y.bigText };
              setA11y(next);
              try {
                localStorage.setItem(a11yStorageKey(), a11yToStorage(next));
              } catch {
                /* ignore */
              }
            }}
            aria-pressed={a11y.bigText}
            title={A11Y_LANGS[wizLang].bigText}
            aria-label={A11Y_LANGS[wizLang].bigText}
          >
            🔍 <span className="a11y-toggle-label">{A11Y_LANGS[wizLang].bigText}</span>
          </button>
          <button
            className={`a11y-toggle${a11y.highContrast ? " on" : ""}`}
            onClick={() => {
              const next = { ...a11y, highContrast: !a11y.highContrast };
              setA11y(next);
              try {
                localStorage.setItem(a11yStorageKey(), a11yToStorage(next));
              } catch {
                /* ignore */
              }
            }}
            aria-pressed={a11y.highContrast}
            title={A11Y_LANGS[wizLang].highContrast}
            aria-label={A11Y_LANGS[wizLang].highContrast}
          >
            🎨 <span className="a11y-toggle-label">{A11Y_LANGS[wizLang].highContrast}</span>
          </button>
          {/* 🎨 #254 — dashboard light/dark theme toggle (portal-only, persisted). */}
          <button
            className={`a11y-toggle${theme === "light" ? " on" : ""}`}
            onClick={() => {
              const next = theme === "light" ? "dark" : "light";
              setTheme(next);
              try {
                localStorage.setItem(THEME_KEY, next);
              } catch {
                /* ignore */
              }
            }}
            aria-pressed={theme === "light"}
            title={THEME_LANGS[wizLang][theme === "light" ? "lightOn" : "darkOn"]}
            aria-label={THEME_LANGS[wizLang][theme === "light" ? "lightOn" : "darkOn"]}
          >
            {theme === "light" ? "☀️" : "🌙"} <span className="a11y-toggle-label">{THEME_LANGS[wizLang][theme]}</span>
          </button>
        </span>
        {/* #85 — sync status chip + manual sync (own-API only, no analytics). */}
        <span
          className={`sync-chip${online ? " on" : " off"}`}
          title={
            lastSync
              ? `${SYNC_LANGS[wizLang].synced} ${relTime(lastSync, wizLang)} ${SYNC_LANGS[wizLang].ago}`
              : SYNC_LANGS[wizLang].justNow
          }
        >
          <span className={`sync-dot ${online ? "ok" : "bad"}`} aria-hidden />
          {online ? SYNC_LANGS[wizLang].online : SYNC_LANGS[wizLang].offline}
          {lastSync && online && (
            <span className="sync-when">
              {" · "}
              {SYNC_LANGS[wizLang].synced} {relTime(lastSync, wizLang)}
            </span>
          )}
          <button
            className="sync-btn"
            disabled={syncingNow}
            onClick={() => void manualSync()}
            aria-label={SYNC_LANGS[wizLang].syncNow}
            title={SYNC_LANGS[wizLang].syncNow}
          >
            {syncingNow ? SYNC_LANGS[wizLang].syncing : SYNC_LANGS[wizLang].syncNow}
          </button>
        </span>
        <span className="topbar-user" title={profile?.email ?? "signed in"}>
          {profile?.display_name ?? "Parent"} 👨‍👩‍👧
        </span>
        <button className="btn btn-small ghost" onClick={() => token && doSignout(token)}>
          Sign out
        </button>
      </header>

      {error && <p className="err banner">{error}</p>}

      {/* #1516 — first data load: a neutral skeleton over the overview area
          instead of every card flashing its misleading "nothing yet" empty
          state. (portal-loading is a CSS-only hook — see globals owner note.) */}
      {initialLoading && (
        <section className="card portal-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden />
          <p className="muted">{LOADING_LANGS[wizLang].familyProgress}</p>
        </section>
      )}

      {/* #246 — guided multi-kid onboarding (first run with no kids) */}
      {onboarding === "open" && !error && (
        <section className="card onboarding-card">
          <div className="onboard-head">
            <h2>{WIZARD_LANGS[wizLang].title}</h2>
            <button
              className="onboard-lang"
              onClick={() => {
                const next: WizardLang = wizLang === "en" ? "bn" : "en";
                setWizLang(next);
                localStorage.setItem("nv_parent_lang", next);
              }}
              title="EN / বাংলা"
            >
              {WIZARD_LANGS[wizLang].lang}
            </button>
          </div>
          <p className="onboard-step">
            {kids.length === 0 ? WIZARD_LANGS[wizLang].step0 : WIZARD_LANGS[wizLang].stepN}
          </p>

          <div className="avatar-row">
            {AVATARS.map((a) => (
              <button
                key={a}
                className={`avatar-pick${editAvatar === a ? " on" : ""}`}
                onClick={() => setEditAvatar(a)}
                aria-label={a}
              >
                {a}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <label>
              {WIZARD_LANGS[wizLang].nameLabel}
              <input
                id="onboard-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={wizLang === "en" ? "e.g. Aria" : "যেমন: আরিয়া"}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && editName.trim() && !onboardBusy) void handleOnboardCreate();
                }}
              />
            </label>
            <label>
              {WIZARD_LANGS[wizLang].birthLabel}
              <input
                type="number"
                min={2010}
                max={2030}
                value={editBirthYear}
                onChange={(e) => {
                  // #1539 — ignore out-of-range / empty input rather than
                  // silently snapping it to a wrong default.
                  if (e.target.value === "") return;
                  const v = Number(e.target.value);
                  if (v >= 2010 && v <= 2030) setEditBirthYear(v);
                }}
              />
              {/* #1540 — keep the WHY visible right at the field. */}
              {editBirthYear >= 2010 && editBirthYear <= 2030 && (
                <span className="hint">{WIZARD_LANGS[wizLang].birthHint}</span>
              )}
            </label>
          </div>
          <div className="row-buttons">
            <button className="btn primary" disabled={onboardBusy || !editName.trim()} onClick={handleOnboardCreate}>
              {onboardBusy ? WIZARD_LANGS[wizLang].adding : WIZARD_LANGS[wizLang].add}
            </button>
          </div>

          {onboardErr && <p className="err inline">{onboardErr}</p>}

          {kids.length >= 1 && (
            <div className="onboard-added">
              <div className="onboard-chips">
                {kids.map((k) => (
                  <span className="onboard-chip" key={k.id}>
                    {k.avatar ?? "🧒"} {k.name}
                  </span>
                ))}
              </div>
              <p className="onboard-ok">{WIZARD_LANGS[wizLang].addedAll}</p>
            </div>
          )}

          <div className="onboard-actions">
            <button
              className="btn ghost"
              disabled={onboardBusy}
              onClick={() => document.getElementById("onboard-name")?.focus()}
            >
              {WIZARD_LANGS[wizLang].addAnother}
            </button>
            <button className="btn primary" disabled={onboardBusy} onClick={finishOnboarding}>
              {kids.length === 0 ? WIZARD_LANGS[wizLang].notNow : WIZARD_LANGS[wizLang].finish}
            </button>
          </div>
        </section>
      )}

      {/* After onboarding (or skipped): a plain empty state with a fast path in */}
      {kids.length === 0 && onboarding === "done" && !error && (
        <div className="empty-state">
          <p className="hint center">{WIZARD_LANGS[wizLang].noKidsDone}</p>
          <div className="row-buttons center">
            <button className="btn primary" onClick={() => { setShowAdd(true); setEditName(""); setEditAvatar("🦊"); }}>
              ＋ {wizLang === "en" ? "Add your first kid" : "প্রথম বাচ্চা যোগ করুন"}
            </button>
          </div>
        </div>
      )}

      {/* #619 — persistent section navigation (sticky sidebar on desktop,
          horizontal tab strip on mobile). Every section carries an id anchor
          from NAV_GROUPS. */}
      {!initialLoading && kids.length > 0 && (
        <div className="portal-layout">
          <aside className="portal-nav" aria-label="Portal sections">
            <p className="portal-nav-title">Jump to</p>
            {NAV_GROUPS.map((g) => {
              // #1527 — omit pills whose section lives inside the `active &&`
              // block when no kid is selected; those anchors would scroll to
              // nothing.
              const items = g.items.filter((it) => !it.needsKid || active);
              if (items.length === 0) return null;
              return (
                <div className="portal-nav-group" key={g.label}>
                  <span className="portal-nav-head">{g.label}</span>
                  <ul>
                    {items.map((it) => (
                      <li key={it.id}>
                        <a
                          href={`#${it.id}`}
                          className={activeNav === it.id ? "active" : undefined}
                          aria-current={activeNav === it.id ? "true" : undefined}
                        >
                          {wizLang === "bn" && it.bn ? it.bn : it.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </aside>
          <div className={`portal-content${syncingNow ? " nv-syncing" : ""}`} aria-busy={syncingNow}>
      {/* #1519 — echo the topbar "Syncing…" chip on the data area itself. The
          `nv-syncing` class is the CSS-only dim hook (see globals owner note). */}
      {syncingNow && (
        <p className="sync-inline" role="status" aria-live="polite">
          <span className="spinner" aria-hidden /> {LOADING_LANGS[wizLang].refreshing}
        </p>
      )}
      {/* ── family overview ── */}
      <FamilyOverview
        kids={kids}
        famMastered={famMastered}
        famRounds={famRounds}
        famMinutes={famMinutes}
        famActive={famActive}
      />

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
      <AddKidCard
        showAdd={showAdd}
        busy={busy}
        editName={editName}
        editAvatar={editAvatar}
        editBirthYear={editBirthYear}
        handleCreate={handleCreate}
        setEditName={setEditName}
        setEditAvatar={setEditAvatar}
        setEditBirthYear={setEditBirthYear}
        setShowAdd={setShowAdd}
      />

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

          {/* #244 — daily play summary: today's headline on open */}
          <TodayCard
            todayRounds={todayRounds}
            todayMinutes={todayMinutes}
            todayMastered={todayMastered}
          />

          {/* ── this week (the "show me my kid learned" card) ── */}
          <WeeklyCard
            active={active}
            activeWeekly={activeWeekly}
            weeklyStreak={weeklyStreak}
            todayCap={todayCap}
            todayCapPct={todayCapPct}
            todayMinutes={todayMinutes}
            shareBusy={shareBusy[active.id] ?? false}
            shareLink={shareLink[active.id] ?? null}
            shareCopied={shareCopied[active.id] ?? false}
            handleShareWeekly={handleShareWeekly}
            setShareCopied={(v) => setShareCopied((prev) => ({ ...prev, [active.id]: v }))}
            wizLang={wizLang}
          />

          {/* #79 — 🏆 mastery timeline: when each skill was won */}
          <MasteryTimeline
            active={active}
            masteryTimeline={masteryTimeline}
            wizLang={wizLang}
          />

          {/* #237 — per-kid reading & story progress view */}
<StoriesCard
          active={active}
                      activeMastery={activeMastery}
          />

          {/* #238 — auto-generated weekly learning narrative from Kotha */}
<WeekWordsCard
          active={active}
                      weekNarrative={weekNarrative}
                      narrLang={narrLang}
                      setNarrLang={setNarrLang}
                      narrText={narrText}
                      onNarrativeEdit={onNarrativeEdit}
                      handleRegenerateNarr={handleRegenerateNarr}
                      handleCopyNarr={handleCopyNarr}
                      narrCopied={narrCopied}
          />

          {/* #239 — struggle alert: top Moni-flagged skills this week */}
<HelpNeededCard
          active={active}
                      flags={flags}
                      narrLang={narrLang}
                      reteachQr={reteachQr}
                      reteachBusy={reteachBusy}
                      handleReteachQr={handleReteachQr}
          />

          {/* 🚀 #249 — acceleration plan: skills the kid skipped ahead past + why */}
<AccelCard
          active={active}
                      accelRows={accelRows}
                      narrLang={narrLang}
          />

          {/* 🗓️ #251 — rolling 12-month archive, derived client-side from the
              full activity history (offline-generated after one lazy fetch). */}
<ArchiveCard
          active={active}
                      activeArchive={activeArchive}
                      archLoading={archLoading}
                      archiveLoaded={archiveLoaded}
                      activeId={activeId!}
                      selMonth={selMonth}
                      setArchMonth={setArchMonth}
                      exportArchive={exportArchive}
                      narrLang={narrLang}
                      archiveError={archError}
                      onRetryArchive={() => activeId && loadArchive(activeId, true)}
          />

          {/* 🧵 #255 — session timeline: play blocks (date, rounds, accuracy,
              mastered skills) grouped client-side from the full history. */}
<SessionsCard
          activeId={activeId}
                      activeSessions={activeSessions}
                      sessionDays={sessionDays}
                      selSessionDay={selSessionDay}
                      setSessionDay={setSessionDay}
                      visibleSessions={visibleSessions}
                      archLoading={archLoading}
                      archiveLoaded={archiveLoaded}
                      wizLang={wizLang}
          />

          {/* 🎮 #252 — game coverage: which games the kid hasn't tried yet (nudge variety). */}
<GamesCard
          active={active}
                      coverageBySubject={coverageBySubject}
                      coveragePct={coveragePct}
                      coveragePlayed={coveragePlayed}
                      coverageTotal={coverageTotal}
                      untriedGames={untriedGames}
          />

          {/* #240 — compare two kids side-by-side (offline) */}
          <CompareCard
            kids={kids}
            cmpAId={cmpAId}
            cmpBId={cmpBId}
            setCmpA={setCmpA}
            setCmpB={setCmpB}
            mtrA={mtrA}
            mtrB={mtrB}
            compareRows={compareRows}
          />

          {/* #132 — printable worksheet from weak skills */}
<WorksheetCard
          active={active}
                      sheet={sheet}
                      sheetBusy={sheetBusy}
                      handleWorksheet={handleWorksheet}
                      setSheet={setSheet}
          />

          {/* #139 — printable flashcard QR sheet (offline-first) */}
<FlashcardsCard
          active={active}
                      qrCards={qrCards}
                      qrBusy={qrBusy}
                      handleQRCards={handleQRCards}
                      setQrCards={setQrCards}
          />
          {/* ── controls ── */}
          <LearningControls
            active={active}
            activeSettings={activeSettings}
            patchSettings={patchSettings}
            wizLang={wizLang}
            busy={busy}
            handleSaveSettings={handleSaveSettings}
            savedTick={savedTick}
          />

          {/* ── activity feed ── */}
<ActivityFeed
          active={active}
                      activity={recentActivity}
                      wizLang={wizLang}
          />

          {/* #89 — per-skill missed questions, derived from the already-loaded
              story ledger (offline-first). Shows the answer picked vs the right
              one + Moni's diagnosis, grouped per skill, with a reteach badge. */}
<MissedCard
          active={active}
                      missedSkills={missedSkills}
                      wizLang={wizLang}
          />

          {/* ── mastery table ── */}
<MasteryCard
          activeMastery={activeMastery}
          />

          {/* ── account & security ── */}
<AccountCard
          profile={profile}
                      displayName={displayName}
                      setDisplayName={setDisplayName}
                      pwCurrent={pwCurrent}
                      setPwCurrent={setPwCurrent}
                      pwNew={pwNew}
                      setPwNew={setPwNew}
                      pwConfirm={pwConfirm}
                      setPwConfirm={setPwConfirm}
                      handleSaveName={handleSaveName}
                      handleChangePw={handleChangePw}
                      handleSignoutAll={handleSignoutAll}
                      sessions={sessions}
                      handleRevoke={handleRevoke}
                      acctBusy={acctBusy}
                      acctMsg={acctMsg}
                      onSetPassword={handleSetPassword}
                      sessionsLoading={sessionsLoading}
                      wizLang={wizLang}
          />

          {/* ── edit + danger zone ── */}
<EditKidCard
          active={active}
                      busy={busy}
                      editName={editName}
                      setEditName={setEditName}
                      editAvatar={editAvatar}
                      setEditAvatar={setEditAvatar}
                      editBirthYear={editBirthYear}
                      setEditBirthYear={setEditBirthYear}
                      confirmReset={confirmReset}
                      setConfirmReset={setConfirmReset}
                      confirmDelete={confirmDelete}
                      setConfirmDelete={setConfirmDelete}
                      handleRename={handleRename}
                      handleReset={handleReset}
                      handleDelete={handleDelete}
          />

          {/* #7 — 🩺 local-only diagnostics (never leaves the device).
              #1499 — wrapped in a stable id so the sidebar can jump here. */}
          <section id="diagnostics">
            <DiagnosticsCard
              debugOpen={debugOpen}
              setDebugOpen={setDebugOpen}
              wizLang={wizLang}
              lastSync={lastSync}
              swVersion={swVersion}
              diagCopied={diagCopied}
              exportDiagnostics={exportDiagnostics}
            />
          </section>

          {/* #18 — ❓ Help & setup (iOS install + Bangla voice + build check) */}
<HelpCard
          helpOpen={helpOpen}
                      setHelpOpen={setHelpOpen}
                      wizLang={wizLang}
          />

          {/* ── #262 on-device data review (localStorage, offline) ── */}
          <div id="on-device">
            <OnDeviceData />
          </div>
        </>
      )}
          </div>
        </div>
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
