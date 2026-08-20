"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import ErrorBoundary, { logBoundaryError } from "../../../kid/src/components/ErrorBoundary";

import {
  isAllowedExternalUrl,
  SKILLS,
  A11Y_DEFAULTS,
  a11yStorageKey,
  parseA11yPrefs,
  type A11yPrefs,
} from "@numberverse/core";
import QRCode from "qrcode";
import OnDeviceData from "../OnDeviceData";
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
  revokeShareToken,
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
  deleteAccount,
  validateToken,
  refreshSession,
  listPushSubscriptions,
  subscribePush,
  unsubscribePush,
  type PushSubscribeBody,
  type PushSubscriptionRecord,
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
} from "../../lib/api";
import { worksheetFor, type WorksheetProblem } from "../../lib/worksheet";
import {
  ACCOUNT_LANGS,
  BANNER_LANGS,
  DEBUG_LANGS,
  DEFAULT_SETTINGS,
  KID_FORM_LANGS,
  LOADING_LANGS,
  NAV_GROUPS,
  NOTIF_LANGS,
  PAIR_LANGS,
  REGEN_LANGS,
  SUBJECTS,
  THEME_KEY,
  TOPBAR_LANGS,
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
  nvTrackParent,
  readNarrDraft,
  readParentUsage,
  relTime,
  toBnNum,
  weekdayLimits,
  weeklyShareText,
  type MissedSkill,
  type MonthSummary,
} from "../lib/portal";
import { sanitizeDisplayName, sanitizeDownloadName } from "../sanitize";
import LearningControls from "../components/LearningControls";
import ConfirmDialog from "../components/ConfirmDialog";
import PortalHeader from "../components/PortalHeader";
import OnboardingCard from "../components/OnboardingCard";
import EmptyState from "../components/EmptyState";
import NextStepsCard from "../components/NextStepsCard";
import KidSwitcher from "../components/KidSwitcher";
import SummaryCard from "../components/SummaryCard";
import AuthGate from "../components/AuthGate";
import { FamilyOverview, TodayCard, WeeklyCard, MasteryTimeline } from "../components/OverviewSections";
import {
  StoriesCard,
  WeekWordsCard,
  HelpNeededCard,
  AccelCard,
  ArchiveCard,
  SessionsCard,
} from "../components/ReportsSections";
import {
  GamesCard,
  CompareCard,
  WorksheetCard,
  FlashcardsCard,
} from "../components/ExploreSections";
import { ActivityFeed, MissedCard, MasteryCard } from "../components/ActivitySections";
import {
  AddKidCard,
  AccountCard,
  EditKidCard,
  DiagnosticsCard,
  HelpCard,
} from "../components/AccountSections";

// #1530/#1508 — single source of truth for the "new kid" birth-year default.
function defaultBirthYear(): number {
  return new Date().getFullYear() - 6;
}

/** #1535 — browser support for the Web Push opt-in. Guarded so SSR/older
 *  webviews degrade to a muted "not supported" line instead of crashing. */
function browserSupportsPush(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "PushManager" in window;
}

/** #1535 — convert a VAPID public key (URL-safe base64) to the Uint8Array
 *  `pushManager.subscribe` expects. Mirrors the standard MDN helper. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/** #1535 — read the browser's PushSubscription into the API's wire shape. */
function pushSubToBody(sub: PushSubscription): PushSubscribeBody {
  const toB64 = (buf: ArrayBuffer | null): string => {
    if (!buf) return "";
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return window.btoa(binary);
  };
  return {
    endpoint: sub.endpoint,
    p256dh: toB64(sub.getKey("p256dh")),
    auth: toB64(sub.getKey("auth")),
  };
}

/** #1705 — per-section error boundary for the dashboard. A throw in ONE card
 *  shows an INLINE friendly fallback (with a Retry that re-renders the same
 *  section) instead of blanking the whole portal. Uses the shared
 *  ErrorBoundary; copy stays in the portal's BANNER_LANGS tone, self-contained
 *  en/bn (this helper must render even when the section's data is bad). */
function SectionErr({ label, children }: { label: string; children: ReactNode }) {
  const bn =
    typeof window !== "undefined" &&
    (() => {
      try {
        return localStorage.getItem("nv_parent_lang") === "bn";
      } catch {
        return false;
      }
    })();
  return (
    <ErrorBoundary
      label={`parent:${label}`}
      lang={bn ? "bn" : "en"}
      copy={{
        title: bn ? "এই অংশে সমস্যা হয়েছে" : "This section hit a snag",
        body: bn ? "চিন্তা নেই — আবার চেষ্টা করুন।" : "Don't worry — try again.",
        retry: bn ? "আবার চেষ্টা করুন" : "Try again",
      }}
      onCatch={(error) => logBoundaryError(`parent:${label}`, error)}
      fallback={({ copy, retry }) => (
        <section className="card" role="alert" style={{ textAlign: "center", padding: 24 }}>
          <p className="muted">{copy.body}</p>
          <button type="button" className="btn btn-small" onClick={retry}>
            {copy.retry}
          </button>
        </section>
      )}
    >
      {children}
    </ErrorBoundary>
  );
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
  // #3044 — whether each kid's settings actually fetched (vs DEFAULT_SETTINGS
  // placeholder). Save/Pause must NOT persist the placeholder, which would wipe
  // the kid's real row server-side. Tracked per kid id, set on every fetch.
  const [settingsLoaded, setSettingsLoaded] = useState<Record<string, boolean>>({});
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
  // #3032 — whether a kid's full-history fetch hit the API's 2000-round cap
  // (older months may be silently empty). Drives an honest "oldest months may be
  // incomplete" caption on the archive card.
  const [archTruncated, setArchTruncated] = useState<Record<string, boolean>>({});
  const [archMonth, setArchMonth] = useState<Record<string, string>>({});
  // 🧵 #255 — per-kid session-timeline day filter ("all" = no filter).
  const [sessionDay, setSessionDay] = useState<Record<string, string>>({});
  // #1822 — off-thread aggregation results (per kid). buildMissedQuestions and
  // buildMonthlyArchive are async (chunked across frames + memoized on the input
  // array reference in portal.ts), so their outputs live in state and are
  // refreshed by the effect below instead of blocking the dashboard hydrate.
  const [missedByKid, setMissedByKid] = useState<Record<string, MissedSkill[]>>({});
  const [archiveByKid, setArchiveByKid] = useState<Record<string, MonthSummary[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // #3048 — settings save-failure surface lives INLINE next to the Save button
  // (not the top-of-shell banner), because the Save row is ~500 lines below the
  // global banner and a parent there would otherwise never see the failure.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // #3053 — track the "saved" tick PER KID so the "✓ Saved" badge only shows on
  // the kid that was actually saved (not every kid after saving just one), and
  // so the snapshot re-seed is scoped to the right kid. Keyed by kid id.
  const [savedTick, setSavedTick] = useState<Record<string, number>>({});
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
  // #3024 — lazily initialize the wizard language from localStorage so a
  // Bangla-preferring parent never sees an English wizard for one frame (the
  // a11y/theme/narrLang states already use this same initializer pattern).
  const [wizLang, setWizLang] = useState<WizardLang>(() => {
    try {
      return localStorage.getItem("nv_parent_lang") === "bn" ? "bn" : "en";
    } catch {
      return "en";
    }
  });
  // #3023 — dismissible first-run "next steps" checklist. Persisted per browser
  // (nv_parent_next_steps_dismissed) so it collapses once a parent opts out.
  const [showNextSteps, setShowNextSteps] = useState<boolean>(() => {
    try {
      return localStorage.getItem("nv_parent_next_steps_dismissed") !== "1";
    } catch {
      return true;
    }
  });
  const dismissNextSteps = useCallback(() => {
    setShowNextSteps(false);
    try {
      localStorage.setItem("nv_parent_next_steps_dismissed", "1");
    } catch {
      /* private browsing — in-memory only */
    }
  }, []);

  // #2974 — keep the narrative/report language in sync with the parent's
  // chosen language. When the parent flips the global EN/বাংলা toggle, the
  // weekly narrative and the narrLang-driven report cards follow. The manual
  // per-card narrative toggle (WeekWordsCard's setNarrLang) is untouched: it
  // only changes narrLang without touching wizLang, so it isn't reverted here.
  useEffect(() => {
    setNarrLang(wizLang);
  }, [wizLang]);

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
  // #2974 — initialize from the parent's chosen language (nv_parent_lang) so a
  // Bangla parent lands on Bengali prose without hunting for the card toggle,
  // instead of always defaulting to English.
  const [narrLang, setNarrLang] = useState<"en" | "bn">(() => {
    try {
      const saved = localStorage.getItem("nv_parent_lang");
      return saved === "bn" ? "bn" : "en";
    } catch {
      return "en";
    }
  });
  const [narrDraft, setNarrDraft] = useState<{ en: string; bn: string; edited: boolean } | null>(null);
  const [narrCopied, setNarrCopied] = useState(false);
  // #1558 — two-tap inline confirm before regeneration discards an edited draft.
  const [regenConfirm, setRegenConfirm] = useState(false);
  const [regenDiscarded, setRegenDiscarded] = useState(false);

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
  // #1594 — per-kid share failure, shown INLINE in the share dialog (not the
  // global banner). Cleared on a fresh attempt.
  const [shareErr, setShareErr] = useState<Record<string, string | null>>({});
  // #866 — stop-sharing (revoke) is a separate busy flag so the "share" button
  // stays live while a revoke is in flight.
  const [shareStopBusy, setShareStopBusy] = useState<Record<string, boolean>>({});

  // #1595 — inline duplicate / kid-count guard. Replaces the previous native
  // `window.confirm` (headless-incompatible + no a11y). The armed guard's
  // "Continue" runs `confirmDupGuard`, which creates the payload captured in
  // `dupGuardPayloadRef`.
  const [dupGuard, setDupGuard] = useState<{ kind: "dup" | "many"; name: string; count: number; via: "add" | "onboard" } | null>(null);
  const dupGuardPayloadRef = useRef<NewKid | null>(null);
  const dupGuardBusyRef = useRef(false);
  // #1589 — bumped after add/delete so the edit-form prefill re-syncs even when
  // the active kid id did not change.
  const [prefillTick, setPrefillTick] = useState(0);

  // #7/#85 — local diagnostics: when the dashboard data last synced (set on
  // every successful refreshAll), whether the diagnostics card is open, and the
  // SW version (read lazily; null until a service worker controls this page).
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [diagCopied, setDiagCopied] = useState(false);
  // #1617 — copied hint for the local-only usage-ring export button.
  const [usageCopied, setUsageCopied] = useState(false);
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

  // #1553 — the kid app persists a same-origin `nv_sync_signal` key
  // ({ lastSuccessAt, pendingCount, lastError }). This is the DEVICE sync,
  // intentionally separate from `lastSync` (which records the PORTAL's fetch).
  const [deviceSync, setDeviceSync] = useState<{ lastSuccessAt: number | null; pendingCount: number; lastError: string | null } | null>(null);
  // #1535 — parent-gated notifications opt-in.
  const [notifSupported] = useState<boolean>(() => browserSupportsPush());
  const [notifState, setNotifState] = useState<"loading" | "on" | "off">("loading");
  const [notifEndpoint, setNotifEndpoint] = useState<string | null>(null);
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifAskPass, setNotifAskPass] = useState(false);
  const [notifPassword, setNotifPassword] = useState("");
  const [notifMsg, setNotifMsg] = useState<{ kind: "ok" | "err" | "muted"; text: string } | null>(null);

  // #1553 — read the kid app's same-origin `nv_sync_signal` key (OnDeviceData
  // pattern). If it is absent, show nothing (graceful). A `storage` listener
  // keeps the chip live when the kid app drains its outbox in another tab.
  useEffect(() => {
    const readDeviceSync = () => {
      try {
        const raw = localStorage.getItem("nv_sync_signal");
        if (!raw) {
          setDeviceSync(null);
          return;
        }
        const parsed = JSON.parse(raw) as { lastSuccessAt?: unknown; pendingCount?: unknown; lastError?: unknown };
        setDeviceSync({
          lastSuccessAt: typeof parsed.lastSuccessAt === "number" ? parsed.lastSuccessAt : null,
          pendingCount: typeof parsed.pendingCount === "number" ? parsed.pendingCount : 0,
          lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
        });
      } catch {
        setDeviceSync(null);
      }
    };
    readDeviceSync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "nv_sync_signal") readDeviceSync();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // #1535 — initial toggle state. #3005 — reconcile against the BROWSER's real
  // getSubscription() result rather than trusting the server list alone, so the
  // on/off UI reflects the browser's actual registration (a revoked sub reads
  // "off" even if a stale server row lingered).
  useEffect(() => {
    if (authState !== "ok" || !token || !browserSupportsPush()) return;
    let alive = true;
    setNotifState("loading");
    const readBrowser = async (): Promise<PushSubscribeBody | null> => {
      try {
        const reg = await readyServiceWorker();
        const existing = reg ? await reg.pushManager.getSubscription() : null;
        return existing ? pushSubToBody(existing) : null;
      } catch {
        return null;
      }
    };
    Promise.all([listPushSubscriptions(token).catch(() => [] as PushSubscriptionRecord[]), readBrowser()])
      .then(([subs, browserSub]) => {
        if (!alive) return;
        // Prefer the browser's real state when it exists; otherwise fall back to
        // the server list (e.g. a sub created on another device).
        if (browserSub) {
          setNotifEndpoint(browserSub.endpoint);
          setNotifState("on");
          return;
        }
        const current = subs[0];
        setNotifEndpoint(current?.endpoint ?? null);
        setNotifState(current ? "on" : "off");
      })
      .catch(() => {
        if (!alive) return;
        setNotifEndpoint(null);
        setNotifState("off");
      });
    return () => {
      alive = false;
    };
  }, [authState, token]);

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
              // #3044 — a failed settings fetch must map to a sentinel (null),
              // NOT DEFAULT_SETTINGS, so a later Save/Pause can't persist the
              // placeholder and wipe the kid's real row. Loaded-ness is tracked
              // separately in settingsLoaded below.
              getKidSettings(tok, kid.id).catch(() => null),
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
        const sl: Record<string, boolean> = {};
        const ww: Record<string, WeeklyReport> = {};
        const stt: Record<string, LearningStoryRow[]> = {};
        const sst: Record<string, StoryStats | null> = {};
        const acc: Record<string, AccelerationRow[]> = {};
        for (const [id, { m, s, w, st, sts, ac }] of entries) {
          mm[id] = m;
          if (s !== null) {
            ss[id] = s;
            sl[id] = true;
          } else {
            // #3044 — settings fetch failed: leave the entry unset so
            // activeSettings falls back to the explicit placeholder for DISPLAY
            // only, and settingsLoaded[id] stays false so Save/Pause bail.
            sl[id] = false;
          }
          if (w) ww[id] = w;
          stt[id] = st;
          sst[id] = sts;
          acc[id] = ac;
        }
        setMastery(mm);
        setSettings(ss);
        setSettingsLoaded(sl);
        setWeekly(ww);
        setStories(stt);
        setStoryStats(sst);
        setAccel(acc);
        // #7/#85 — record when the dashboard data last came from the API, so the
        // diagnostics card + sync chip can say "synced X ago" (offline-safe).
        setLastSync(Date.now());
        // #1617 — the parent is looking at the dashboard (weekly report view),
        // so record the feature use locally. Never leaves the device.
        nvTrackParent("weekly_report_view");
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
      // #3032 — the API hard-caps at 2000 rounds (kids.py:398). When we got a
      // full page back, older months may exist beyond the cap even though the
      // archive would render them as 0 — surface that instead of a silent false
      // "idle month".
      setArchTruncated((prev) => ({ ...prev, [kidId]: rows.length >= 2000 }));
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
  // #3027 — skip the 2000-row full-history fetch for a brand-new kid until they
  // have actually played (mastery shows attempts). `mastery` is a dep so the
  // archive loads on its own once the kid has activity.
  useEffect(() => {
    if (!activeId || !token || archStatus[activeId]) return;
    const m = mastery[activeId];
    // If mastery isn't loaded yet (e.g. a just-switched kid), proceed — the
    // `switchKid` fallback path owns a small 40-row fetch anyway. Only skip
    // when we know the kid has zero attempts.
    const hasPlayed = m ? m.some((row) => row.attempts > 0) : true;
    if (!hasPlayed) return;
    void loadArchive(activeId);
  }, [activeId, token, archStatus, loadArchive, mastery]);

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
    setAuthState("checking");
    // #1773 — FIRST try rotating the httpOnly refresh cookie into a fresh
    // short-lived access token. A real session's week-long credential never
    // touches localStorage/JS — the access token stored here is ≤15 min.
    refreshSession().then((fresh) => {
      if (fresh) {
        localStorage.setItem("nv_parent_token", fresh);
        // #1538 — ?welcome=1 (from signup or first-run login) cleans the URL so
        // a reload doesn't re-trigger it. #3021 — the wizard is opened ONLY by
        // refreshAll's empty-roster gate (kids.length===0 AND flag unset), so a
        // parent who already has kids never gets the add-kid wizard dumped over
        // their real dashboard just because this browser is fresh.
        if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("welcome") === "1") {
          const url = new URL(window.location.href);
          url.searchParams.delete("welcome");
          window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        }
        // Only a token the API accepts unlocks the dashboard. This is the real
        // gate: presence of ANY string in nv_parent_token (shared, stale, or
        // forged — the kid app writes the same key) no longer grants access.
        setToken(fresh);
        setAuthState("ok");
        refreshAll(fresh).catch((e) => {
          const status = (e as { status?: unknown } | null)?.status;
          setError(
            status === 401 || status === 403
              ? ACCOUNT_LANGS[wizLang].sessionEnded
              : "Could not load progress. Is the API running?"
          );
        });
        reloadAccount(fresh).catch((e) => {
          const status = (e as { status?: unknown } | null)?.status;
          setError(
            status === 401 || status === 403
              ? ACCOUNT_LANGS[wizLang].sessionEnded
              : "Could not load account details."
          );
        });
        return;
      }
      // No refresh cookie (or offline) — fall back to the stored-token path
      // unchanged (offline / no cookie keeps today's behavior, token survives).
      if (!tok) {
        setToken(null);
        setAuthState("anon");
        return;
      }
      validateToken(tok).then((verdict) => {
        if (verdict === "ok") {
          // #1538 — ?welcome=1 cleans the URL so a reload doesn't re-trigger it.
          // #3021 — the wizard itself is opened only by refreshAll's empty-roster
          // gate, so an existing roster lands on the dashboard directly.
          if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("welcome") === "1") {
            const url = new URL(window.location.href);
            url.searchParams.delete("welcome");
            window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
          }
          setToken(tok);
          setAuthState("ok");
          refreshAll(tok).catch((e) => {
            const status = (e as { status?: unknown } | null)?.status;
            setError(
              status === 401 || status === 403
                ? ACCOUNT_LANGS[wizLang].sessionEnded
                : "Could not load progress. Is the API running?"
            );
          });
          reloadAccount(tok).catch((e) => {
            const status = (e as { status?: unknown } | null)?.status;
            setError(
              status === 401 || status === 403
                ? ACCOUNT_LANGS[wizLang].sessionEnded
                : "Could not load account details."
            );
          });
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
    });
  }, [refreshAll, reloadAccount]);

  // #1513 — last-saved settings snapshot per kid (seeded from the first load,
  // then updated only by a successful save) so we can compare edits and warn
  // before the parent switches away and loses them.
  const [savedSettings, setSavedSettings] = useState<Record<string, KidSettingsT>>({});
  // #1513 — two-tap inline confirm: the kid id the parent is trying to switch
  // to while the active kid has unsaved settings edits.
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);
  // #3051 — sign-out guard: when the active (or any) kid has unsaved settings
  // edits, confirm before wiping local state (doSignout currently discards all
  // staged edits without warning, unlike the kid-switch path which is guarded).
  const [pendingSignout, setPendingSignout] = useState<boolean>(false);

  useEffect(() => {
    setSavedSettings((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [id, s] of Object.entries(settings)) {
        if (!next[id]) {
          next[id] = s;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [settings]);

  function isDirtyKid(id: string | null): boolean {
    if (!id) return false;
    const cur = settings[id];
    const saved = savedSettings[id];
    if (!cur || !saved) return false;
    return JSON.stringify(cur) !== JSON.stringify(saved);
  }

  // #3051 — true when ANY kid has staged, unsaved settings edits. Sign-out
  // wipes every local settings snapshot, so the confirm must look beyond just
  // the active kid.
  function anyDirtyKid(): boolean {
    return Object.keys(settings).some((id) => isDirtyKid(id));
  }

  /** #3051 — sign-out entry point. Routes through a two-tap confirm when any
   *  kid has unsaved edits; otherwise signs out immediately. Mirrors the
   *  switchKid guard so a parent can never silently lose staged settings. */
  const requestSignout = useCallback(() => {
    if (!token) return;
    if (anyDirtyKid()) {
      setPendingSignout(true);
      return;
    }
    void doSignout(token);
  }, [token, settings, savedSettings, doSignout]);

  const switchKid = useCallback(
    async (id: string, opts?: { force?: boolean }) => {
      if (!token) return;
      if (id === activeId) return;
      // #1513 — don't silently discard unsaved settings edits on kid switch.
      if (!opts?.force && isDirtyKid(activeId)) {
        setPendingSwitchId(id);
        return;
      }
      setPendingSwitchId(null);
      // #1529 — never carry one kid's danger-zone confirms over to the next kid.
      setConfirmReset(false);
      setConfirmDelete(false);
      // #1532 — remember the selected kid across reloads (same key the kid app
      // already reads for its own launches).
      try {
        localStorage.setItem("nv_kid_id", id);
      } catch {
        /* private browsing — keep the selection in memory only */
      }
      // #1617 — local-only adoption signal (nothing leaves the device).
      nvTrackParent("switch_kid");
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
          // #3044 — sentinel null on failure (see refreshAll) so Save/Pause can't
          // persist the DEFAULT_SETTINGS placeholder and wipe the real row.
          getKidSettings(token, id).catch(() => null),
          needActivityFallback
            ? getActivity(token, id).catch(() => [])
            : Promise.resolve<ActivityRow[] | null>(null),
          getWeekly(token, id).catch(() => null),
          getStories(token, id).catch(() => []),
          getStoryStats(token, id).catch(() => null),
          getAcceleration(token, id).catch(() => []),
        ]);
        setMastery((prev) => ({ ...prev, [id]: m }));
        if (s !== null) {
          setSettings((prev) => ({ ...prev, [id]: s }));
          setSettingsLoaded((prev) => ({ ...prev, [id]: true }));
        } else {
          setSettingsLoaded((prev) => ({ ...prev, [id]: false }));
        }
        if (needActivityFallback && a) setActivity((prev) => ({ ...prev, [id]: a }));
        if (w) setWeekly((prev) => ({ ...prev, [id]: w }));
        setStories((prev) => ({ ...prev, [id]: st }));
        setStoryStats((prev) => ({ ...prev, [id]: sts }));
        setAccel((prev) => ({ ...prev, [id]: ac }));
      } catch (e) {
        const status = (e as { status?: unknown } | null)?.status;
        setError(
          status === 401 || status === 403
            ? ACCOUNT_LANGS[wizLang].sessionEnded
            : "Failed to load that kid."
        );
      }
    },
    [token, mastery, archActivity, archStatus, activity, activeId, settings, savedSettings, wizLang]
  );

  function confirmSwitchKid() {
    const id = pendingSwitchId;
    if (!id) return;
    setPendingSwitchId(null);
    // Discard the active kid's unsaved edits so switching back starts clean.
    if (activeId && savedSettings[activeId]) {
      setSettings((prev) => ({ ...prev, [activeId]: savedSettings[activeId] }));
    }
    void switchKid(id, { force: true });
  }

  // #1589 — the edit-kid form must open PRE-FILLED with the active kid's current
  // values, not a blank "add" form. Track the last key we prefilled from so we
  // never clobber the parent's in-progress typing on unrelated re-renders.
  const editPrefillKeyRef = useRef("");
  useEffect(() => {
    const kid = kids.find((k) => k.id === activeId);
    if (!kid) return;
    const key = `${kid.id}|${kid.name}|${kid.avatar ?? ""}|${kid.birth_year ?? ""}`;
    if (editPrefillKeyRef.current === key) return;
    editPrefillKeyRef.current = key;
    setEditName(kid.name);
    setEditAvatar(kid.avatar ?? "🦊");
    setEditBirthYear(kid.birth_year ?? defaultBirthYear());
  }, [kids, activeId, prefillTick]);

  // #238 — load the kid's saved narrative draft (edit-safe: localStorage).
  useEffect(() => {
    setNarrDraft(activeId ? readNarrDraft(activeId) : null);
    setNarrCopied(false);
  }, [activeId]);

  // #1822 — hydrate the async per-kid aggregations OFF the main thread. The
  // builders chunk their folds across frames and memoize on the input-array
  // reference (portal.ts), so a re-hydration with the SAME feed is a cache hit.
  // Results are keyed by kid so switching never shows another kid's data while
  // the first build for the newly active kid is still in flight.
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    const kidStories = stories[activeId] ?? null;
    const kidArch = archActivity[activeId] ?? null;
    if (kidStories) {
      void buildMissedQuestions(kidStories)
        .then((rows) => {
          if (!cancelled) setMissedByKid((prev) => (prev[activeId] === rows ? prev : { ...prev, [activeId]: rows }));
        })
        // Pure builders never reject; a catch keeps an unexpected failure from
        // becoming an unhandled rejection while the dashboard stays on the
        // previous (or empty) value.
        .catch(() => {});
    }
    if (kidArch) {
      void buildMonthlyArchive(kidArch)
        .then((rows) => {
          if (!cancelled) setArchiveByKid((prev) => (prev[activeId] === rows ? prev : { ...prev, [activeId]: rows }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [activeId, stories, archActivity]);

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

  // #1558 — briefly surface "edits discarded" after a confirmed regenerate.
  useEffect(() => {
    if (!regenDiscarded) return;
    const t = window.setTimeout(() => setRegenDiscarded(false), 5000);
    return () => window.clearTimeout(t);
  }, [regenDiscarded]);

  async function handleSaveSettings() {
    if (!token || !activeId) return;
    // #3044 — never persist the DEFAULT_SETTINGS placeholder: if the kid's real
    // settings never loaded, bailing here (with a clear inline message) stops the
    // PUT from overwriting every column of the kid_settings row with all-nulls.
    if (!settingsLoaded[activeId]) {
      setSaveError("Settings didn't load — check your connection and reload, then try again.");
      return;
    }
    // #1617 — local-only adoption signal (nothing leaves the device).
    nvTrackParent("save_settings");
    setBusy(true);
    setSaveError(null);
    setError(null);
    try {
      const s = settings[activeId];
      if (!s) {
        setSaveError("Settings didn't load — check your connection and reload, then try again.");
        return;
      }
      const saved = await saveKidSettings(token, activeId, s);
      // #1513 — the server response becomes the new last-saved snapshot, so the
      // dirty badge clears exactly when the save has landed.
      setSettings((prev) => ({ ...prev, [activeId]: saved }));
      setSavedSettings((prev) => ({ ...prev, [activeId]: saved }));
      setSavedTick((prev) => ({ ...prev, [activeId]: (prev[activeId] ?? 0) + 1 }));
    } catch (e) {
      const status = (e as { status?: unknown } | null)?.status;
      // #3048 — surface the failure INLINE (near the Save button) instead of the
      // global top-of-shell banner, which is far above the parent's viewport.
      setSaveError(
        status === 401 || status === 403
          ? ACCOUNT_LANGS[wizLang].sessionEnded
          : "Failed to save settings."
      );
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

  /** #1593 — the parent's pause decision is persisted SERVER-SIDE immediately
   *  (not just local state). The kill-switch survives reloads and applies on
   *  every device. */
  async function handleTogglePause() {
    if (!token || !activeId) return;
    // #3044 — the pause PUT also sends the whole settings object; if the kid's
    // real settings never loaded, persisting DEFAULT_SETTINGS would wipe the row.
    // Bail with the same explicit message instead of a silent destructive write.
    const base = settingsLoaded[activeId] ? settings[activeId] : undefined;
    if (!base) {
      setError("Settings didn't load — reload the page, then try pausing again.");
      return;
    }
    // #1617 — local-only adoption signal (nothing leaves the device).
    nvTrackParent("pause_toggle");
    setBusy(true);
    setError(null);
    try {
      const next = !(base.paused ?? false);
      const saved = await saveKidSettings(token, activeId, {
        ...base,
        paused: next,
      });
      setSettings((prev) => ({ ...prev, [activeId]: saved }));
      setSavedSettings((prev) => ({ ...prev, [activeId]: saved }));
      setSavedTick((prev) => ({ ...prev, [activeId]: (prev[activeId] ?? 0) + 1 }));
    } catch {
      setError("Failed to save pause state.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    if (!token || !activeId || !confirmReset) return;
    setBusy(true);
    setError(null);
    try {
      await resetKidProgress(token, activeId);
      setConfirmReset(false);
      await refreshAll(token);
      setSavedTick((prev) => ({ ...prev, [activeId]: (prev[activeId] ?? 0) + 1 }));
    } catch {
      setError("Failed to reset progress.");
    } finally {
      setBusy(false);
    }
  }

  /** #132 — build + show a printable worksheet from the kid's weak skills. */
  async function handleWorksheet() {
    if (!token || !activeId || sheetBusy) return;
    // #1617 — local-only adoption signal (nothing leaves the device).
    nvTrackParent("worksheet_print");
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
    // #1617 — local-only adoption signal (nothing leaves the device).
    nvTrackParent("qr_cards");
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
      await refreshAll(token);
      // #1589 — re-sync the edit form to whatever kid is active now.
      setPrefillTick((t) => t + 1);
    } catch {
      setError("Failed to delete kid.");
    } finally {
      setBusy(false);
    }
  }

  async function performCreate(payload: NewKid, via: "add" | "onboard") {
    if (!token || dupGuardBusyRef.current) return;
    dupGuardBusyRef.current = true;
    if (via === "add") setBusy(true);
    else setOnboardBusy(true);
    setError(null);
    setOnboardErr(null);
    try {
      const created = await createKid(token, payload);
      if (via === "onboard") {
        // #1508 — clear the birth year so the next add starts fresh, not with
        // the previous kid's year silently carried over.
        setEditName("");
        setEditAvatar("🦊");
        setEditBirthYear(defaultBirthYear());
      } else {
        setShowAdd(false);
        // #1589 — re-sync the edit form to the (now possibly switched) active kid.
        setPrefillTick((t) => t + 1);
      }
      await refreshAll(token);
      // #3053 — bump the new kid's own save tick (not a global counter), so its
      // snapshot re-seeds without leaking a "✓ Saved" badge onto other kids.
      setSavedTick((prev) => ({ ...prev, [created.id]: (prev[created.id] ?? 0) + 1 }));
    } catch {
      if (via === "onboard") {
        // Keep the form values so "Add kid" is a one-click retry once online.
        setOnboardErr(WIZARD_LANGS[wizLang].err.replace("{name}", payload.name ?? ""));
      } else {
        setError("Failed to add kid.");
      }
    } finally {
      dupGuardBusyRef.current = false;
      if (via === "add") setBusy(false);
      else setOnboardBusy(false);
    }
  }

  /** #1595 — the inline duplicate / kid-count guard's "Continue". Creates the
   *  kid that was captured when the guard armed, in the flow it came from. */
  function confirmDupGuard() {
    const via = dupGuard?.via;
    const payload = dupGuardPayloadRef.current;
    setDupGuard(null);
    if (!via || !payload) return;
    void performCreate(payload, via);
  }

  async function handleCreate() {
    if (!token || !editName.trim()) return;
    // #1539 — validate the same 2010..2030 range the API schema enforces, and
    // show a field-specific message instead of a misleading connectivity error.
    if (editBirthYear < 2010 || editBirthYear > 2030) {
      setError(WIZARD_LANGS[wizLang].birthRangeErr);
      return;
    }
    // #1510/#1595 — client-side guard: duplicates are indistinguishable in the
    // avatar/name/year switcher, so ask BEFORE creating a second identical kid
    // (or an 8th+). Uses the app's inline confirm dialog, never window.confirm.
    const name = editName.trim();
    const duplicate = kids.some((k) => k.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate || kids.length >= 8) {
      dupGuardPayloadRef.current = { name, avatar: editAvatar, birth_year: editBirthYear } satisfies NewKid;
      setDupGuard({
        kind: duplicate ? "dup" : "many",
        // #1829 — strip control chars/newlines so a weird pasted name can't
        // break the dialog.
        name: sanitizeDisplayName(name),
        count: kids.length,
        via: "add",
      });
      return;
    }
    await performCreate({ name, avatar: editAvatar, birth_year: editBirthYear } satisfies NewKid, "add");
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
    // #1510/#1595 — the wizard stays open for back-to-back adds, so duplicate
    // names would be easy to create by accident. Confirm before creating.
    const name = editName.trim();
    const duplicate = kids.some((k) => k.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate || kids.length >= 8) {
      dupGuardPayloadRef.current = { name, avatar: editAvatar, birth_year: editBirthYear } satisfies NewKid;
      setDupGuard({
        kind: duplicate ? "dup" : "many",
        name: sanitizeDisplayName(name),
        count: kids.length,
        via: "onboard",
      });
      return;
    }
    await performCreate({ name, avatar: editAvatar, birth_year: editBirthYear } satisfies NewKid, "onboard");
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
      // #2975 — only send the fields the Edit card actually edits (name/avatar).
      // Sending birth_year unconditionally would let a stale form default silently
      // overwrite the kid's real birth year on the server. The Edit card's
      // birth-year field is display/seed only — Avatar + Name are what "Edit" saves.
      await updateKid(token, activeId, {
        name: editName.trim(),
        avatar: editAvatar,
      } satisfies NewKid);
      // #1589 — don't blank the edit form; the prefill effect re-syncs it to
      // the freshly-renamed kid after refreshAll.
      await refreshAll(token);
      setSavedTick((prev) => ({ ...prev, [activeId]: (prev[activeId] ?? 0) + 1 }));
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

  /** #980/#1679 — right-to-erasure: the parent confirmed the phrase + password
   *  and the API deleted the account. Clear every local parent credential (mirror
   *  doSignout's cleanup so no stale token can silently re-auth) and land on the
   *  gate. The delete-account done string names the deleted kid count. */
  async function handleDeleteAccount(confirmation: string, password: string) {
    if (!token) return;
    setAcctBusy(true);
    setAcctMsg(null);
    try {
      const res = await deleteAccount(token, { confirmation, password });
      setAcctMsg({ kind: "ok", text: ACCOUNT_LANGS[wizLang].deleteAccountDone(res.kids_removed) });
      localStorage.removeItem("nv_parent_token");
      localStorage.removeItem("nv_parent_name");
      localStorage.removeItem("nv_kid_id");
      localStorage.removeItem("nv_kid_map");
      setToken(null);
      setProfile(null);
      setAuthState("anon");
      setAuthNote(null);
    } catch (e) {
      const status = (e as { status?: unknown } | null)?.status;
      const detail = (e as { message?: unknown } | null)?.message;
      setAcctMsg({
        kind: "err",
        text:
          status === 401 || status === 403
            ? ACCOUNT_LANGS[wizLang].sessionEnded
            : typeof detail === "string" && detail && detail !== "Failed to delete account"
              ? detail
              : ACCOUNT_LANGS[wizLang].deleteAccountErr,
      });
    } finally {
      setAcctBusy(false);
    }
  }

  /** #3008 — wait for a service worker registration with a hard timeout so a
   *  skipped/failed registration can never leave `navigator.serviceWorker.ready`
   *  (which only settles when a page-controlling registration exists) dangling.
   *  Explicitly (re)resolves the registration here rather than relying on the
   *  `ready` promise alone. */
  async function readyServiceWorker(timeoutMs = 5000): Promise<ServiceWorkerRegistration | null> {
    if (!("serviceWorker" in navigator)) return null;
    const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const swUrl = `${base}/sw.js`;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    return (await Promise.race([
      (async () => {
        // #3008 — `ready` only settles when a page-controlling registration
        // exists; if registration was skipped (dev) or failed, it hangs forever.
        // Race it against an explicit get/register so we always settle and can
        // surface a bounded "not configured" error instead of an infinite spinner.
        try {
          const reg = await navigator.serviceWorker.ready;
          if (reg) return reg;
        } catch {
          /* `ready` never settled — fall through to an explicit resolve. */
        }
        try {
          return (await navigator.serviceWorker.getRegistration(swUrl)) ||
            (await navigator.serviceWorker.register(swUrl)) ||
            null;
        } catch {
          return null;
        }
      })(),
      timeout,
    ]));
  }

  /** #1535 — get (or create) the browser PushSubscription in the API's wire
   *  shape. Returns a discriminated result instead of a bare payload/null so
   *  callers can tell "permission denied" apart from "not configured".
   *
   *  #3009 — permission is requested explicitly FIRST and branched on, so a
   *  previously-denied browser permission gets its own message instead of being
   *  mislabelled "not configured on this server". Only a missing VAPID key maps
   *  to notConfigured. */
  type PushSubscribeResult =
    | { ok: true; sub: PushSubscribeBody }
    | { ok: false; reason: "unsupported" | "notConfigured" | "blocked" | "noSw" | "error" };

  async function getExistingPushSubscription(): Promise<PushSubscribeResult> {
    if (!browserSupportsPush()) return { ok: false, reason: "unsupported" };
    try {
      // #3009 — ask permission explicitly; a `denied` (or `default` after a
      // prior deny) result is a browser-permission problem, not a config one.
      const perm: NotificationPermission = await Notification.requestPermission();
      if (perm === "denied") return { ok: false, reason: "blocked" };

      const reg = await readyServiceWorker();
      if (!reg) return { ok: false, reason: "noSw" };

      let existing: PushSubscription | null = null;
      try {
        existing = await reg.pushManager.getSubscription();
      } catch {
        /* no existing sub — proceed to create one below */
      }
      if (existing) return { ok: true, sub: pushSubToBody(existing) };

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) return { ok: false, reason: "notConfigured" };

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      return { ok: true, sub: pushSubToBody(sub) };
    } catch {
      return { ok: false, reason: "error" };
    }
  }

  /** #1535 — toggle OFF: POST /push/unsubscribe for the current endpoint, then
   *  #3005 best-effort revoke the browser-side subscription so `getSubscription()`
   *  returns null and the on/off UI can never drift from the browser's real state. */
  async function turnOffNotifications() {
    if (!token) return;
    setNotifBusy(true);
    setNotifMsg(null);
    try {
      if (notifEndpoint) await unsubscribePush(token, notifEndpoint);
      // #3005 — revoke the live browser sub even if the server call failed;
      // it's a best-effort browser-side cleanup that must not block the toggle.
      try {
        const reg = await readyServiceWorker();
        if (reg) {
          const existing = await reg.pushManager.getSubscription();
          if (existing) await existing.unsubscribe();
        }
      } catch {
        /* best-effort; the server unbind already succeeded/ran */
      }
      setNotifEndpoint(null);
      setNotifState("off");
      setNotifMsg({ kind: "ok", text: NOTIF_LANGS[wizLang].disabled });
    } catch {
      setNotifMsg({ kind: "err", text: NOTIF_LANGS[wizLang].disabledFailed });
    } finally {
      setNotifBusy(false);
    }
  }

  /** #1535/#1596 — the parent-facing toggle. OFF → unsubscribe. ON → check the
   *  feature is actually CONFIGURED (browser support + VAPID key) BEFORE asking
   *  for a password re-confirm. If push isn't configured, say so plainly with a
   *  one-time dismissible message — never a dead-end password prompt. */
  function handleNotifToggle() {
    if (!token || notifBusy) return;
    setNotifMsg(null);
    if (notifState === "on") {
      void turnOffNotifications();
      return;
    }
    // #1596 — surface "not configured" / "unsupported" BEFORE the password gate.
    if (!browserSupportsPush()) {
      setNotifMsg({ kind: "muted", text: NOTIF_LANGS[wizLang].unsupported });
      return;
    }
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      setNotifMsg({ kind: "muted", text: NOTIF_LANGS[wizLang].notConfiguredNow });
      return;
    }
    // #3009 — ask browser permission up front. If the parent previously denied
    // it, surface the dedicated "blocked" message instead of a dead-end prompt.
    void (async () => {
      let perm: NotificationPermission = "default";
      try {
        perm = await Notification.requestPermission();
      } catch {
        perm = "default";
      }
      if (perm === "denied") {
        setNotifMsg({ kind: "muted", text: NOTIF_LANGS[wizLang].blocked });
        return;
      }
      // Configured + supported + not denied → the normal parent re-confirm gate.
      setNotifAskPass(true);
      setNotifPassword("");
    })();
  }

  /** #1596 — dismiss the one-time "not configured" message. */
  function dismissNotifMsg() {
    setNotifMsg(null);
  }

  /** #1535 — enable after the parent re-enters their password. We only perform
   *  a soft client-side length check here; the real parent gate is the token and
   *  the successful subscribe below (documented "token = parent-gate" fallback
   *  until a dedicated /auth/verify endpoint ships). */
  async function confirmEnableNotifications() {
    if (!token || notifBusy) return;
    if (notifPassword.trim().length < 8) {
      setNotifMsg({ kind: "err", text: NOTIF_LANGS[wizLang].passwordRequired });
      return;
    }
    setNotifBusy(true);
    setNotifMsg({ kind: "muted", text: NOTIF_LANGS[wizLang].verifying });
    try {
      const result = await getExistingPushSubscription();
      if (!result.ok) {
        // #3009/#3008 — surface a precise reason instead of a generic dead-end.
        const text =
          result.reason === "blocked"
            ? NOTIF_LANGS[wizLang].blocked
            : result.reason === "noSw"
              ? NOTIF_LANGS[wizLang].notConfigured
              : result.reason === "unsupported"
                ? NOTIF_LANGS[wizLang].unsupported
                : NOTIF_LANGS[wizLang].notConfigured;
        setNotifMsg({ kind: "muted", text });
        setNotifAskPass(false);
        setNotifPassword("");
        return;
      }
      await subscribePush(token, result.sub);
      setNotifEndpoint(result.sub.endpoint);
      setNotifState("on");
      setNotifAskPass(false);
      setNotifPassword("");
      setNotifMsg({ kind: "ok", text: NOTIF_LANGS[wizLang].enabled });
    } catch {
      setNotifMsg({ kind: "err", text: NOTIF_LANGS[wizLang].enabledFailed });
    } finally {
      setNotifBusy(false);
    }
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
  // #1822 — the builder is async; its per-kid result is hydrated into state by
  // the effect above (chunked across frames, memoized on the story-array ref).
  const missedSkills = activeId ? (missedByKid[activeId] ?? []) : [];
  // 🚀 #249 — the kid's acceleration plan (skills skipped ahead, newest first —
  // the backend already sorts; offline-safe because it's already-loaded state).
  const accelRows = activeId ? accel[activeId] ?? [] : [];
  // 🗓️ #251 — the 12-month archive derived client-side from the full activity
  // feed (once loaded, fully offline). Selected month defaults to the newest.
  // #1822 — the builder is async; its per-kid result is hydrated into state by
  // the effect above (chunked across frames, memoized on the activity-array ref).
  const activeArchive = activeId ? (archiveByKid[activeId] ?? []) : [];
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
  const activeSessions = activeId ? buildSessionTimeline(archActivity[activeId] ?? [], activeMastery) : [];
  // #3041 — keep the FULL distinct-day list so a parent can reach sessions on
  // any active day, not just the 14 most recent. The card caps the visible
  // chips and offers a "more…" affordance for the rest, leaving "All days" as
  // the complete source.
  const allSessionDays = [...new Set(activeSessions.map((s) => s.date))]
    .sort((a, b) => (a < b ? 1 : -1));
  const sessionDays = allSessionDays.slice(0, 14);
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
    // #1825 — sanitize the kid name before putting it in the filename: strip
    // path separators/control chars/leading dots, collapse whitespace, cap ~60.
    a.download = `numberverse-monthly-${sanitizeDownloadName(active.name)}-${activeId.slice(0, 8)}.csv`;
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
  /** #1558 — the actual regenerate. Only called freely for an unedited draft or
   *  from the confirm dialog for an edited one; never silently destroys edits. */
  function doRegenerateNarr() {
    if (!activeId) return;
    const hadEdits = !!narrDraft?.edited;
    const next = { en: weekNarrative?.en ?? "", bn: weekNarrative?.bn ?? "", edited: false };
    setNarrDraft(next);
    setRegenConfirm(false);
    setRegenDiscarded(hadEdits);
    try {
      localStorage.setItem(`nv_kotha_nar_${activeId}`, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  function handleRegenerateNarr() {
    if (!activeId) return;
    // #1558 — a polished draft is a data-loss footgun on one tap: open a
    // two-tap inline confirm instead of overwriting the parent's edits.
    if (narrDraft?.edited) {
      setRegenConfirm(true);
      return;
    }
    doRegenerateNarr();
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

  /** #1617 — export the local-only feature-usage ring as plain text (clipboard,
   *  falling back to a download), mirroring exportDiagnostics above. Only event
   *  handles + timestamps leave the browser — NO names, ids, emails or device
   *  data, and nothing is ever sent over the network. */
  async function exportUsage() {
    const events = readParentUsage();
    const rows: string[] = [
      "Numberverse parent portal — local feature usage (on-device only)",
      `time: ${new Date().toISOString()}`,
      "--- usage (last 200) ---",
      ...(events.length ? events.map((e) => `${e.at}  ${e.event}`) : ["(none recorded yet)"]),
    ];
    const text = rows.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setUsageCopied(true);
      window.setTimeout(() => setUsageCopied(false), 2000);
    } catch {
      // Clipboard blocked → fall back to a download (still stays on-device).
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `numberverse-usage-${new Date().toISOString().slice(0, 10)}.txt`;
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
    // #1617 — local-only adoption signal (nothing leaves the device).
    nvTrackParent("share_report");
    const kidId = activeId;
    setShareBusy((prev) => ({ ...prev, [kidId]: true }));
    setShareErr((prev) => ({ ...prev, [kidId]: null }));
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
    } catch (e) {
      // #1594 — failure stays INLINE in the share dialog with the real reason
      // (session vs network vs API detail), never the global banner.
      const err = e as { status?: unknown; message?: unknown } | null;
      const status = typeof err?.status === "number" ? err.status : null;
      const detail = typeof err?.message === "string" && err.message ? err.message : null;
      setShareErr((prev) => ({
        ...prev,
        [kidId]:
          status === 401 || status === 403
            ? ACCOUNT_LANGS[wizLang].sessionEnded
            : detail && detail !== "Failed to create share link"
              ? detail
              : "Couldn't create the share link.",
      }));
    } finally {
      setShareBusy((prev) => ({ ...prev, [kidId]: false }));
    }
  }

  /** #866 — stop sharing: revoke the kid's share token so the public snapshot
   *  link stops resolving. The server nulls the token (next share mints a
   *  fresh one); we clear this kid's local link state to match. */
  async function handleStopSharing() {
    if (!token || !activeId || shareStopBusy[activeId]) return;
    const kidId = activeId;
    setShareStopBusy((prev) => ({ ...prev, [kidId]: true }));
    setShareErr((prev) => ({ ...prev, [kidId]: null }));
    try {
      await revokeShareToken(token, kidId);
      setShareLink((prev) => ({ ...prev, [kidId]: null }));
      setShareCopied((prev) => ({ ...prev, [kidId]: false }));
    } catch {
      setShareErr((prev) => ({ ...prev, [kidId]: "Couldn't stop sharing." }));
    } finally {
      setShareStopBusy((prev) => ({ ...prev, [kidId]: false }));
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
    return <AuthGate authState={authState} authNote={authNote} wizLang={wizLang} />;
  }

  // #1505 — the load-time error string is developer-speak; render the
  // parent-friendly copy while keeping specific handler errors as-is.
  const LOAD_ERROR = "Could not load progress. Is the API running?";
  const bannerText = error === LOAD_ERROR ? BANNER_LANGS[wizLang].loadError : error;

  /** #1505 — retry the load (or reload if there is no token to retry with).
   *  Clearing `error` first means dismiss/retry can't be immediately undone by
   *  a stale in-flight source; the banner only returns if the fresh call fails. */
  function retryError() {
    setError(null);
    if (token) {
      void refreshAll(token).catch(() => setError(LOAD_ERROR));
    } else if (typeof window !== "undefined") {
      window.location.reload();
    }
  }

  return (
    <main className={`shell${!initialLoading && kids.length > 0 ? " shell-wide" : ""}`}>
      <PortalHeader
        a11y={a11y}
        setA11y={setA11y}
        theme={theme}
        setTheme={(next) => {
          setTheme(next);
          try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
          document.documentElement.classList.toggle("theme-light", next === "light");
        }}
        online={online}
        lastSync={lastSync}
        kidsCount={kids.length}
        syncingNow={syncingNow}
        manualSync={() => void manualSync()}
        deviceSync={deviceSync}
        notifSupported={notifSupported}
        notifState={notifState}
        notifBusy={notifBusy}
        notifAskPass={notifAskPass}
        notifPassword={notifPassword}
        setNotifPassword={setNotifPassword}
        onToggleNotif={handleNotifToggle}
        confirmEnableNotifications={() => void confirmEnableNotifications()}
        cancelNotifAsk={() => {
          setNotifAskPass(false);
          setNotifPassword("");
          setNotifMsg(null);
        }}
        notifMsg={notifMsg}
        dismissNotifMsg={dismissNotifMsg}
        profile={profile}
        onSignOut={requestSignout}
        wizLang={wizLang}
        onChangeLang={(next) => {
          setWizLang(next);
          try {
            localStorage.setItem("nv_parent_lang", next);
          } catch {
            /* ignore */
          }
        }}
      />

      {error && (
        <div
          className="err banner"
          role="alert"
          aria-live="assertive"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
        >
          <span>{bannerText}</span>
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <button className="btn btn-small" onClick={retryError}>
              {BANNER_LANGS[wizLang].retry}
            </button>
            <button
              onClick={() => setError(null)}
              aria-label={BANNER_LANGS[wizLang].dismiss}
              title={BANNER_LANGS[wizLang].dismiss}
              style={{ border: "none", background: "transparent", color: "inherit", fontSize: 18, lineHeight: 1, cursor: "pointer", padding: "0 4px" }}
            >
              ×
            </button>
          </span>
        </div>
      )}

      {/* #1558/#1600 — two-tap confirm before regeneration discards an edited
          narrative. Rendered via the shared ConfirmDialog (focus trap,
          autofocus, Escape, restore-on-close) instead of ad-hoc markup. */}
      <ConfirmDialog
        open={regenConfirm}
        title={REGEN_LANGS[wizLang].confirm}
        body=""
        confirmLabel={REGEN_LANGS[wizLang].continue}
        cancelLabel={REGEN_LANGS[wizLang].cancel}
        onConfirm={doRegenerateNarr}
        onCancel={() => setRegenConfirm(false)}
      />
      {regenDiscarded && (
        <p className="hint center" role="status">{REGEN_LANGS[wizLang].discarded}</p>
      )}

      {/* #1595 — inline duplicate / kid-count guard (replaces window.confirm). */}
      <ConfirmDialog
        open={dupGuard !== null}
        title={
          dupGuard?.kind === "dup"
            ? KID_FORM_LANGS[wizLang].dupTitle.replace("{name}", dupGuard?.name ?? "")
            : KID_FORM_LANGS[wizLang].manyTitle.replace("{count}", String(dupGuard?.count ?? 0))
        }
        body={
          dupGuard?.kind === "dup"
            ? KID_FORM_LANGS[wizLang].dupBody.replace("{name}", dupGuard?.name ?? "")
            : KID_FORM_LANGS[wizLang].manyBody.replace("{count}", String(dupGuard?.count ?? 0))
        }
        confirmLabel={KID_FORM_LANGS[wizLang].confirm}
        cancelLabel={KID_FORM_LANGS[wizLang].cancel}
        onConfirm={confirmDupGuard}
        onCancel={() => {
          setDupGuard(null);
          dupGuardPayloadRef.current = null;
        }}
      />

      {/* #3051 — confirm before sign-out while edits are unsaved, so a parent
          can't silently lose staged settings the way they once did on the
          kid-switch path before #1513 closed it. */}
      <ConfirmDialog
        open={pendingSignout}
        title={ACCOUNT_LANGS[wizLang].signOut}
        body={ACCOUNT_LANGS[wizLang].unsavedConfirm}
        confirmLabel={ACCOUNT_LANGS[wizLang].unsavedContinue}
        cancelLabel={ACCOUNT_LANGS[wizLang].unsavedCancel}
        danger
        onConfirm={() => {
          setPendingSignout(false);
          if (token) void doSignout(token);
        }}
        onCancel={() => setPendingSignout(false)}
      />

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
        <SectionErr label="onboarding">
          <OnboardingCard
            wizLang={wizLang}
            onChangeLang={(next) => {
              setWizLang(next);
              localStorage.setItem("nv_parent_lang", next);
            }}
            kids={kids}
            editName={editName}
            setEditName={setEditName}
            editAvatar={editAvatar}
            setEditAvatar={setEditAvatar}
            editBirthYear={editBirthYear}
            setEditBirthYear={setEditBirthYear}
            onboardBusy={onboardBusy}
            onboardErr={onboardErr}
            onSubmit={() => void handleOnboardCreate()}
            onAddAnother={() => document.getElementById("onboard-name")?.focus()}
            onFinish={finishOnboarding}
          />
        </SectionErr>
      )}

      {/* #3016/#3017 — zero-kid fallback: render for empty-AND-onboarded-done
          or empty-AND-init (already-onboarded browser), and give the "add first
          kid" path a real AddKidCard below (outside the kids.length layout). */}
      {kids.length === 0 && !initialLoading && !error && onboarding !== "open" && (
        <div className="empty-state-wrap">
          <SectionErr label="empty-state">
            <EmptyState
              wizLang={wizLang}
              onAddFirst={() => {
                setShowAdd(true);
                setEditName("");
                setEditAvatar("🦊");
                setEditBirthYear(defaultBirthYear());
              }}
              onRerunSetup={() => {
                setOnboarding("open");
                setShowAdd(false);
              }}
            />
          </SectionErr>
          {/* #3017 — the add-kid form must be reachable with ZERO kids, so it
              renders here (outside the kids.length > 0 portal-layout) and also
              there (for accounts that already have kids). */}
          {showAdd && (
            <SectionErr label="add-kid-form">
              <AddKidCard
                showAdd={showAdd}
                busy={busy}
                editName={editName}
                editAvatar={editAvatar}
                editBirthYear={editBirthYear}
                wizLang={wizLang}
                handleCreate={handleCreate}
                setEditName={setEditName}
                setEditAvatar={setEditAvatar}
                setEditBirthYear={setEditBirthYear}
                setShowAdd={setShowAdd}
              />
            </SectionErr>
          )}
        </div>
      )}

      {/* #619 — persistent section navigation (sticky sidebar on desktop,
          horizontal tab strip on mobile). Every section carries an id anchor
          from NAV_GROUPS. */}
      {!initialLoading && kids.length > 0 && (
        <div className="portal-layout">
          <aside className="portal-nav" aria-label={TOPBAR_LANGS[wizLang].jumpTo}>
            <p className="portal-nav-title">{TOPBAR_LANGS[wizLang].jumpTo}</p>
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
                          // #1607 — hash anchors scroll but never move focus;
                          // keyboard/SR users would be left at the old position.
                          onClick={(e) => {
                            e.preventDefault();
                            const el = document.getElementById(it.id);
                            if (el) {
                              el.scrollIntoView({ behavior: "smooth", block: "start" });
                              el.setAttribute("tabindex", "-1");
                              el.focus({ preventScroll: true });
                            }
                            window.history.replaceState(null, "", `#${it.id}`);
                          }}
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
      {/* #3023 — first-run "what's next" checklist. Only when the account has a
          kid but zero rounds played yet (the ~26 sections below are all empty),
          and never after the parent dismisses it. */}
      {!initialLoading && kids.length > 0 && showNextSteps && famRounds === 0 && (
        <SectionErr label="next-steps">
          <NextStepsCard wizLang={wizLang} onDismiss={dismissNextSteps} />
        </SectionErr>
      )}

      {/* ── family overview ── */}
      <SectionErr label="family-overview">
        <FamilyOverview
          kids={kids}
          famMastered={famMastered}
          famRounds={famRounds}
          famMinutes={famMinutes}
          famActive={famActive}
          wizLang={wizLang}
        />
      </SectionErr>

      {/* ── kid switcher ── */}
      <SectionErr label="kid-switcher">
        <KidSwitcher
          kids={kids}
          activeId={activeId}
          onSwitch={(id) => void switchKid(id)}
          onToggleAdd={() => {
            setShowAdd((s) => !s);
            setConfirmReset(false);
            setConfirmDelete(false);
            // #1589 — opening the ADD form always starts blank, never with the
            // active kid's pre-filled edit values.
            setEditName("");
            setEditAvatar("🦊");
            setEditBirthYear(defaultBirthYear());
          }}
          wizLang={wizLang}
        />
      </SectionErr>

      {/* ── add-kid form ── */}
      <SectionErr label="add-kid-form">
        <AddKidCard
          showAdd={showAdd}
          busy={busy}
          editName={editName}
          editAvatar={editAvatar}
          editBirthYear={editBirthYear}
          wizLang={wizLang}
          handleCreate={handleCreate}
          setEditName={setEditName}
          setEditAvatar={setEditAvatar}
          setEditBirthYear={setEditBirthYear}
          setShowAdd={setShowAdd}
        />
      </SectionErr>

      {/* #1590 — how the kid's device joins (the kid app signs in with the
          same parent account — verified flow, no device code). */}
      {!initialLoading && kids.length > 0 && (
        <SectionErr label="device-join">
          <section className="card pair-card" id="device-join">
            <h2>{PAIR_LANGS[wizLang].title}</h2>
            <ol className="help-steps">
              {[1, 2, 3, 4].map((i) => (
                <li key={i}>{PAIR_LANGS[wizLang][`step${i}` as keyof typeof PAIR_LANGS.en]}</li>
              ))}
            </ol>
            <p className="hint">{PAIR_LANGS[wizLang].note}</p>
          </section>
        </SectionErr>
      )}

      {active && (
        <>
          {/* ── progress summary ── */}
          <SectionErr label="summary">
            <SummaryCard
              active={active}
              masteredCount={masteredCount}
              inProgressCount={activeMastery.filter((m) => m.mastery < 0.8 && m.attempts > 0).length}
              catalogCount={SKILLS.length}
              wizLang={wizLang}
              pendingSwitchId={pendingSwitchId}
              onConfirmSwitch={confirmSwitchKid}
              onCancelSwitch={() => setPendingSwitchId(null)}
            />
          </SectionErr>

          {/* ── controls ── */}
          {/* #3054 — learning controls sit directly after the summary (before any
              printable/explore cards) so the parent's settings surface is
              discoverable without scrolling past Games/Compare/Worksheet/Flashcards. */}
          <SectionErr label="learning-controls">
            <LearningControls
              active={active}
              activeSettings={activeSettings}
              patchSettings={patchSettings}
              wizLang={wizLang}
              busy={busy}
              handleSaveSettings={handleSaveSettings}
              savedTick={savedTick}
              onTogglePause={() => void handleTogglePause()}
              saveError={saveError}
              settingsLoaded={activeId ? settingsLoaded[activeId] === true : false}
            />
          </SectionErr>

          {/* #244 — daily play summary: today's headline on open */}
          <SectionErr label="today">
            <TodayCard
              todayRounds={todayRounds}
              todayMinutes={todayMinutes}
              todayMastered={todayMastered}
              wizLang={wizLang}
            />
          </SectionErr>

          {/* ── this week (the "show me my kid learned" card) ── */}
          <SectionErr label="weekly">
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
              shareErr={shareErr[active.id] ?? null}
              handleShareWeekly={handleShareWeekly}
              handleStopSharing={handleStopSharing}
              shareStopBusy={shareStopBusy[active.id] ?? false}
              setShareCopied={(v) => setShareCopied((prev) => ({ ...prev, [active.id]: v }))}
              wizLang={wizLang}
            />
          </SectionErr>

          {/* #79 — 🏆 mastery timeline: when each skill was won */}
          <SectionErr label="mastery-timeline">
            <MasteryTimeline
              active={active}
              masteryTimeline={masteryTimeline}
              wizLang={wizLang}
            />
          </SectionErr>

          {/* #237 — per-kid reading & story progress view */}
<SectionErr label="stories">
            <StoriesCard
              active={active}
              activeMastery={activeMastery}
            />
          </SectionErr>

          {/* #238 — auto-generated weekly learning narrative from Kotha */}
          <SectionErr label="week-words">
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
          </SectionErr>

          {/* #239 — struggle alert: top Moni-flagged skills this week */}
          <SectionErr label="help-needed">
            <HelpNeededCard
              active={active}
              flags={flags}
              narrLang={narrLang}
              reteachQr={reteachQr}
              reteachBusy={reteachBusy}
              handleReteachQr={handleReteachQr}
            />
          </SectionErr>

          {/* 🚀 #249 — acceleration plan: skills the kid skipped ahead past + why */}
<SectionErr label="accel">
            <AccelCard
              active={active}
              accelRows={accelRows}
              narrLang={narrLang}
            />
          </SectionErr>

          {/* 🗓️ #251 — rolling 12-month archive, derived client-side from the
              full activity history (offline-generated after one lazy fetch). */}
          <SectionErr label="archive">
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
              archiveTruncated={!!activeId && !!archTruncated[activeId]}
              onRetryArchive={() => activeId && loadArchive(activeId, true)}
            />
          </SectionErr>

          {/* 🧵 #255 — session timeline: play blocks (date, rounds, accuracy,
              mastered skills) grouped client-side from the full history. */}
          <SectionErr label="sessions">
            <SessionsCard
              activeId={activeId}
              activeSessions={activeSessions}
              sessionDays={sessionDays}
              allSessionDays={allSessionDays}
              selSessionDay={selSessionDay}
              setSessionDay={setSessionDay}
              visibleSessions={visibleSessions}
              archLoading={archLoading}
              archiveLoaded={archiveLoaded}
              wizLang={wizLang}
            />
          </SectionErr>

          {/* 🎮 #252 — game coverage: which games the kid hasn't tried yet (nudge variety). */}
          <SectionErr label="games">
            <GamesCard
              active={active}
              coverageBySubject={coverageBySubject}
              coveragePct={coveragePct}
              coveragePlayed={coveragePlayed}
              coverageTotal={coverageTotal}
              untriedGames={untriedGames}
            />
          </SectionErr>

          {/* #240 — compare two kids side-by-side (offline) */}
          <SectionErr label="compare">
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
          </SectionErr>

          {/* #132 — printable worksheet from weak skills */}
          <SectionErr label="worksheet">
            <WorksheetCard
              active={active}
              sheet={sheet}
              sheetBusy={sheetBusy}
              handleWorksheet={handleWorksheet}
              setSheet={setSheet}
            />
          </SectionErr>

          {/* #139 — printable flashcard QR sheet (offline-first) */}
          <SectionErr label="flashcards">
            <FlashcardsCard
              active={active}
              qrCards={qrCards}
              qrBusy={qrBusy}
              handleQRCards={handleQRCards}
              setQrCards={setQrCards}
            />
          </SectionErr>
          {/* ── activity feed ── */}
          <SectionErr label="activity-feed">
            <ActivityFeed
              active={active}
              activity={recentActivity}
              wizLang={wizLang}
            />
          </SectionErr>

          {/* #89 — per-skill missed questions, derived from the already-loaded
              story ledger (offline-first). Shows the answer picked vs the right
              one + Moni's diagnosis, grouped per skill, with a reteach badge. */}
          <SectionErr label="missed">
            <MissedCard
              active={active}
              missedSkills={missedSkills}
              wizLang={wizLang}
            />
          </SectionErr>

          {/* ── mastery table ── */}
          <SectionErr label="mastery">
            <MasteryCard
              activeMastery={activeMastery}
            />
          </SectionErr>

          {/* ── edit + danger zone ── */}
          <SectionErr label="edit-kid">
            <EditKidCard
              active={active}
              busy={busy}
              editName={editName}
              setEditName={setEditName}
              editAvatar={editAvatar}
              setEditAvatar={setEditAvatar}
              editBirthYear={editBirthYear}
              setEditBirthYear={setEditBirthYear}
              wizLang={wizLang}
              confirmReset={confirmReset}
              setConfirmReset={setConfirmReset}
              confirmDelete={confirmDelete}
              setConfirmDelete={setConfirmDelete}
              handleRename={handleRename}
              handleReset={handleReset}
              handleDelete={handleDelete}
            />
          </SectionErr>
        </>
      )}
          </div>
        </div>
      )}

      {/* #3047 — account & security / diagnostics / help / on-device data are
          profile/session-only (no kid data), so they render OUTSIDE the kid
          gate above and stay reachable even when the account has zero kids. */}
      {!initialLoading && (
        <div className="portal-layout">
          <div className="portal-content">
            {/* ── account & security ── */}
            <SectionErr label="account">
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
                onDeleteAccount={(confirmation, password) => void handleDeleteAccount(confirmation, password)}
                wizLang={wizLang}
              />
            </SectionErr>

            {/* #7 — 🩺 local-only diagnostics (never leaves the device).
                #1499 — wrapped in a stable id so the sidebar can jump here. */}
            <SectionErr label="diagnostics">
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
                {/* #1617 — export the local-only feature-usage ring beside the
                    diagnostics buffer. Never leaves the device. */}
                <div className="card" style={{ marginTop: 12 }}>
                  <h2>{DEBUG_LANGS[wizLang].usageExport}</h2>
                  <p className="hint">{DEBUG_LANGS[wizLang].hint}</p>
                  <button
                    className="btn btn-small"
                    type="button"
                    onClick={() => void exportUsage()}
                  >
                    {usageCopied ? DEBUG_LANGS[wizLang].usageExported : DEBUG_LANGS[wizLang].usageExport}
                  </button>
                </div>
              </section>
            </SectionErr>

            {/* #18 — ❓ Help & setup (iOS install + Bangla voice + build check) */}
            <SectionErr label="help">
              <HelpCard
                helpOpen={helpOpen}
                setHelpOpen={setHelpOpen}
                wizLang={wizLang}
              />
            </SectionErr>

            {/* ── #262 on-device data review (localStorage, offline) ── */}
            <SectionErr label="on-device">
              <div id="on-device">
                <OnDeviceData />
              </div>
            </SectionErr>
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
