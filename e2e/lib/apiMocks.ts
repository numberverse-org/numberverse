/// <reference path="../types/playwright-node-shim.d.ts" />
import type { Page } from "@playwright/test";

/** A server-side kid as the mocked API would return it. */
export interface MockKid {
  id: string;
  name: string;
  avatar: string;
  birth_year: number;
}

/** An operator/guardian row as the admin /admin/profiles endpoints return it. */
export interface MockAdminProfile {
  id: number;
  email: string;
  display_name: string;
  is_admin: boolean;
  aggregate_opt_in: boolean;
  created_at: string;
}

/** #245 — the anonymized weekly aggregate a PUBLIC share card renders. It
 *  deliberately carries NO identity fields (no name/avatar/kid id/skill ids). */
export interface MockShareSnapshot {
  rounds: number;
  minutes: number;
  correct_pct: number;
  active_days: number;
  mastered_count: number;
  top_game: string | null;
  week_of: string;
  coins?: number;
  minutes_by_day?: number[];
}

/** One active login row on the mocked account (mirrors GET /auth/sessions). */
export interface MockSession {
  id: string;
  /** The bearer token that maps to this session (revoked → rejected at /me). */
  token: string;
  created_at: string;
  last_seen_at: string | null;
  user_agent: string | null;
  ip: string | null;
  current: boolean;
  revoked: boolean;
}

/** One "played" mastery row the mock serves on the /snapshot + /mastery routes
 *  (#9/#1345). The kid app's snapshot restore reads `skillId`; the parent
 *  portal's /mastery client reads `skill_id` — the handlers map between them. */
export interface MockMasteryRow {
  skillId: string;
  mastery: number;
  correct: number;
  attempts: number;
  streak: number;
}

/** Mutable backend stand-in shared between the page and the test. */
export interface MockApiState {
  kids: MockKid[];
  progressCalls: Array<Record<string, unknown>>;
  logoutCalls: number;
  /** #9/#1345 — server-side played-skill mastery (served by snapshot+mastery). */
  mastery: MockMasteryRow[];
  /** #9 — how many /snapshot restores the kid app actually performed. */
  snapshotCalls: number;
  /** #1535 — POST /push/subscribe bodies (parent-gated Web Push opt-in). */
  pushSubscribeCalls: Array<Record<string, unknown>>;
  /** #245 — payload served by the PUBLIC route /api/v1/share/* (no auth). */
  shareSnapshot: MockShareSnapshot;
  /** #245 — tokens observed on /api/v1/share/* (the unguessable link secret). */
  shareSnapshotTokens: string[];
  /** Every GET/PUT the app made against a kid's settings route. */
  settingsCalls: Array<{ kidId: string; method: string; body: Record<string, unknown> }>;
  /** Per-kid settings as last PUT by the parent portal (the "server" truth). */
  savedSettings: Record<string, Record<string, unknown>>;
  /** Active/revoked session rows; `current` is derived at request time. */
  sessions: MockSession[];
  /** The bearer token the current (most recent) login/signup issued. */
  currentToken: string;
  /** The account password — login/change-password validate against this. */
  password: string;
  /** Counters so specs can assert server-side effects happened. */
  loginCalls: number;
  changePasswordCalls: number;
  revokeCalls: number;
  logoutAllCalls: number;
  /** Number of /auth/me calls rejected with 401 (revoked/unrecognized token). */
  rejectedMeCalls: number;
  /** Google sign-in — id_tokens POSTed to /auth/google (one per Google tap). */
  googleTokenCalls: string[];
  /** Admin console (#935) — only non-default once mockAdminApi is in use. */
  adminLoginCalls: number;
  adminProfiles: MockAdminProfile[];
  adminProfileUpdates: Array<{ id: number; data: Record<string, unknown> }>;
}

export function createMockApiState(): MockApiState {
  return {
    kids: [],
    progressCalls: [],
    logoutCalls: 0,
    mastery: [],
    snapshotCalls: 0,
    pushSubscribeCalls: [],
    shareSnapshot: {
      rounds: 42,
      minutes: 137,
      correct_pct: 91,
      active_days: 6,
      mastered_count: 5,
      top_game: "game-nova-3d",
      week_of: "2026-08-10",
      coins: 128,
      minutes_by_day: [10, 15, 20, 25, 30, 35, 2],
    },
    shareSnapshotTokens: [],
    settingsCalls: [],
    savedSettings: {},
    sessions: [],
    currentToken: "e2e-token",
    password: "password123",
    loginCalls: 0,
    changePasswordCalls: 0,
    revokeCalls: 0,
    logoutAllCalls: 0,
    rejectedMeCalls: 0,
    googleTokenCalls: [],
    adminLoginCalls: 0,
    adminProfiles: [],
    adminProfileUpdates: [],
  };
}

/** Seed the one-time device flags a fresh install sets on first mount, so the
 *  journey specs start on the real home screen instead of a welcome/tour modal.
 *  - nv_seen_welcome  → skip the language-welcome gate (App.tsx:312)
 *  - nv_tour_done=1   → skip the #356 first-play tour overlay (App.tsx:1876);
 *    the tour's overlay intercepts pointer events, so without this the core-loop
 *    specs can never tap Play/Parents/etc.
 * Call inside `page.addInitScript` BEFORE any goto. */
export function seedDeviceFlags(page: Page): void {
  page.addInitScript(() => {
    try {
      localStorage.setItem("nv_seen_welcome", "1");
      localStorage.setItem("nv_tour_done", "1");
      localStorage.setItem("nv_lang", "en");
    } catch {
      /* storage denied — ignore */
    }
  });
}

const MOCK_PROFILE = {
  id: "profile-1",
  email: "parent@example.com",
  display_name: "Test Parent",
  is_admin: false,
};

/** Profile the mocked /auth/google issues after verifying the id token. */
const MOCK_GOOGLE_PROFILE = {
  id: "profile-google-1",
  email: "google@example.com",
  display_name: "Google Parent",
  is_admin: false,
};

/** Per-kid settings the portal reads before any parent save. Mirrors
 *  apps/parent/app/lib/portal.ts DEFAULT_SETTINGS so the dashboard renders the
 *  same neutral state the real backend would return for a fresh kid. */
const MOCK_SETTINGS = {
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
};

/**
 * Replace the same-origin /api/v1 surface with a deterministic in-memory
 * backend. Used by the cross-app and parent-portal specs so the journey is
 * proven against the real shipped bundles without creating live accounts or
 * hitting the production database.
 *
 * The broad catch-all is registered FIRST because Playwright runs the most
 * recently registered matching route first — the specific handlers below win.
 */
export async function mockNumberverseApi(page: Page, state: MockApiState): Promise<void> {
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );

  await page.route("**/api/v1/auth/signup", (route) => {
    state.currentToken = "e2e-token";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: state.currentToken, profile: MOCK_PROFILE }),
    });
  });

  // Login validates the password against the mock account so a change-password
  // flow can PROVE the old credential stops working and the new one signs in.
  await page.route("**/api/v1/auth/login", (route) => {
    const body = route.request().postDataJSON() as { email?: string; password?: string };
    if (body.password !== state.password) {
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Invalid email or password" }),
      });
    }
    state.loginCalls += 1;
    state.currentToken = "e2e-token";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: state.currentToken, profile: MOCK_PROFILE }),
    });
  });

  // /auth/me doubles as the session gate: the token in the Authorization header
  // must be the current token OR a live (non-revoked) session row. A revoked or
  // unrecognized token gets 401 so the app's own gate bounces to the login page.
  await page.route("**/api/v1/auth/me", (route) => {
    const auth = route.request().headers()["authorization"] ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (token && token === state.currentToken) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_PROFILE) });
    }
    const session = state.sessions.find((s) => s.token === token);
    if (!session || session.revoked) {
      state.rejectedMeCalls += 1;
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Session revoked" }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_PROFILE) });
  });

  // Active logins — the current flag is derived from the caller's bearer token,
  // and revoked rows drop out exactly as the real API filters them.
  await page.route("**/api/v1/auth/sessions", (route) => {
    const auth = route.request().headers()["authorization"] ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const rows = state.sessions
      .filter((s) => !s.revoked)
      .map((s) => ({
        id: s.id,
        created_at: s.created_at,
        last_seen_at: s.last_seen_at,
        user_agent: s.user_agent,
        ip: s.ip,
        current: s.token === token,
      }));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });

  await page.route("**/api/v1/auth/logout", (route) => {
    state.logoutCalls += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  // Google sign-in (#1463). The GIS component first asks whether THIS backend
  // can verify Google tokens (a backend without NV_GOOGLE_CLIENT_ID would swap
  // the button for a fallback note) — answer enabled so the button stays. The
  // /auth/google POST is the real id-token exchange: record the token so the
  // spec can prove the app sent Google's credential to exactly this endpoint,
  // then issue our own token exactly like auth/signup does.
  await page.route("**/api/v1/auth/google/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true }) })
  );
  await page.route("**/api/v1/auth/google", async (route) => {
    const body = route.request().postDataJSON() as { id_token?: string };
    state.googleTokenCalls.push(body.id_token ?? "");
    state.currentToken = "e2e-google-token";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: state.currentToken, profile: MOCK_GOOGLE_PROFILE }),
    });
  });

  // Sign out of ALL devices — every session row dies (the real #265 contract).
  await page.route("**/api/v1/auth/logout-all", (route) => {
    state.logoutAllCalls += 1;
    for (const s of state.sessions) s.revoked = true;
    return route.fulfill({ status: 204, body: "" });
  });

  // Change password — validates the current password, flips the account
  // credential, and revokes every OTHER session (only the caller stays in).
  await page.route("**/api/v1/auth/change-password", (route) => {
    const body = route.request().postDataJSON() as { current_password?: string; new_password?: string };
    if (!body.current_password || body.current_password !== state.password) {
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Current password is incorrect" }),
      });
    }
    state.changePasswordCalls += 1;
    state.password = body.new_password ?? state.password;
    for (const s of state.sessions) {
      if (s.token !== state.currentToken) s.revoked = true;
    }
    return route.fulfill({ status: 204, body: "" });
  });

  // Revoke ONE device (DELETE /auth/sessions/{id} — the auth.py:269 route this
  // spec was written to cover). The row is marked revoked and stops appearing
  // in GET /auth/sessions AND stops passing the /auth/me gate.
  await page.route("**/api/v1/auth/sessions/*", (route) => {
    if (route.request().method() !== "DELETE") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    const url = new URL(route.request().url());
    const id = url.pathname.split("/").pop() ?? "";
    const session = state.sessions.find((s) => s.id === id);
    if (session) session.revoked = true;
    state.revokeCalls += 1;
    return route.fulfill({ status: 204, body: "" });
  });

  await page.route("**/api/v1/kids", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state.kids) });
    }
    const body = route.request().postDataJSON() as {
      name?: string;
      avatar?: string | null;
      birth_year?: number | null;
    };
    const kid: MockKid = {
      id: `server-kid-${state.kids.length + 1}`,
      name: body.name ?? "Kid",
      avatar: body.avatar ?? "🦊",
      birth_year: body.birth_year ?? new Date().getFullYear() - 6,
    };
    state.kids.push(kid);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(kid) });
  });

  await page.route("**/api/v1/kids/*/snapshot", (route) => {
    // #9 — the kid app's multi-device restore pulls a kid's played mastery from
    // this route; count the fetch so a spec can wait for the restore to land.
    state.snapshotCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ coins: 0, mastery: state.mastery }),
    });
  });

  // Guardrail settings — the parent portal GETs a kid's controls on every load
  // and PUTs the full object on "Save settings"; the kid app GETs the same route
  // to enforce the parent's rules on-device. The handler is stateful so a save
  // in the portal is what a reload (and the kid app) actually reads back.
  await page.route("**/api/v1/kids/*/settings", async (route) => {
    const url = route.request().url();
    const kidId = /\/api\/v1\/kids\/([^/?]+)\/settings/.exec(url)?.[1] ?? "unknown";
    const method = route.request().method();
    if (method === "PUT") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      state.savedSettings[kidId] = body;
      state.settingsCalls.push({ kidId, method, body });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    }
    const body = state.savedSettings[kidId] ?? MOCK_SETTINGS;
    state.settingsCalls.push({ kidId, method, body });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  // Delete a kid from the parent portal's danger zone. The catch-all above
  // would otherwise answer with 200 "{}" forever — this route actually removes
  // the kid from the roster so the dashboard re-fetches an empty family.
  await page.route("**/api/v1/kids/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    const url = route.request().url();
    const kidId = /\/api\/v1\/kids\/([^/?]+)/.exec(url)?.[1] ?? null;
    if (kidId) state.kids = state.kids.filter((k) => k.id !== kidId);
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route("**/api/v1/kids/*/mastery", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        // The parent portal reads `skill_id` (MasteryRow), the kid app's
        // snapshot restore reads `skillId` — both draw from the same mock rows.
        state.mastery.map((m) => ({
          skill_id: m.skillId,
          mastery: m.mastery,
          correct: m.correct,
          attempts: m.attempts,
          streak: m.streak,
        }))
      ),
    })
  );
  await page.route("**/api/v1/kids/*/weekly", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        days: [],
        rounds: 0,
        correct_pct: 0,
        minutes: 0,
        active_days: 0,
        mastered_this_week: [],
        mastered_today: [],
        top_game: null,
      }),
    })
  );
  await page.route("**/api/v1/kids/*/stories/stats", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ total: 0, by_skill: {}, by_error_kind: {}, by_misconception: {} }),
    })
  );
  await page.route("**/api/v1/kids/*/stories?limit=*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.route("**/api/v1/kids/*/acceleration", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.route("**/api/v1/kids/*/activity?limit=*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );

  // #245 — PUBLIC share-snapshot read (the token IS the key, no auth header).
  // Records the token so the spec can prove the card used exactly the link it
  // was given and made exactly this one request.
  await page.route("**/api/v1/share/*", (route) => {
    const url = new URL(route.request().url());
    state.shareSnapshotTokens.push(url.pathname.split("/").pop() ?? "");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(state.shareSnapshot),
    });
  });

  await page.route("**/api/v1/progress", async (route) => {
    state.progressCalls.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.route("**/api/v1/push/subscriptions", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );

  // #1535 — record the Web Push endpoint the portal POSTs when the parent
  // confirms the opt-in. The app treats a 2xx as the reauth gate, so a plain
  // 200 "{}" is the only contract we need to satisfy.
  await page.route("**/api/v1/push/subscribe", async (route) => {
    state.pushSubscribeCalls.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

/**
 * Admin console (apps/admin — the react-admin SPA under /admin/, #935) mock.
 *
 * Call AFTER mockNumberverseApi so its routes are registered LAST and thereby
 * win over the generic same-origin catch-all (Playwright prefers the most
 * recently registered matching route). It covers exactly the surface the real
 * shipped admin bundle needs for the login → profiles-list → profiles-edit
 * journey:
 *
 *  - /auth/login issues an ADMIN profile (is_admin: true) — the portal login
 *    mock above answers with a non-admin profile, which would rightly fail the
 *    admin gate.
 *  - /admin/profiles speaks ra-data-simple-rest: GET_LIST answers an array plus
 *    the Content-Range total header, GET_ONE answers the bare record, UPDATE
 *    answers the echoed record and records the PUT body on `state`.
 *  - /admin/stats and /admin/stories/health return fully-populated payloads.
 *    Without them the dashboard would render `health.sanity.ok` on the catch-all's
 *    `{}` and crash the whole tree.
 */
export async function mockAdminApi(
  page: Page,
  state: MockApiState,
  profiles: MockAdminProfile[]
): Promise<void> {
  // Load the seeded operator rows into the shared state so GET_LIST serves them
  // (and UPDATE mutates them) — previously the state array stayed empty and the
  // profiles datagrid had zero rows.
  state.adminProfiles = profiles;
  await page.route("**/api/v1/auth/login", (route) => {
    state.adminLoginCalls += 1;
    const body = route.request().postDataJSON() as { email?: string } | null;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        token: "e2e-admin-token",
        profile: {
          email: body?.email ?? "admin@example.com",
          display_name: "Console Admin",
          is_admin: true,
        },
      }),
    });
  });

  // GET_LIST (and hypothetical POST create) — `/admin/profiles?sort=…`.
  await page.route("**/api/v1/admin/profiles*", (route) => {
    if (route.request().method() !== "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Content-Range": `profiles 0-9/${state.adminProfiles.length}` },
      body: JSON.stringify(state.adminProfiles),
    });
  });

  // GET_ONE + UPDATE — `/admin/profiles/:id`.
  await page.route("**/api/v1/admin/profiles/*", async (route) => {
    const url = new URL(route.request().url());
    const id = Number(url.pathname.split("/").pop());
    if (route.request().method() === "PUT") {
      const data = route.request().postDataJSON() as Record<string, unknown>;
      state.adminProfileUpdates.push({ id, data });
      const prev = state.adminProfiles.find((p) => p.id === id) ?? ({} as MockAdminProfile);
      const updated = { ...prev, ...data, id } as MockAdminProfile;
      const idx = state.adminProfiles.findIndex((p) => p.id === id);
      if (idx >= 0) state.adminProfiles[idx] = updated;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(updated) });
    }
    const profile = state.adminProfiles.find((p) => p.id === id);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(profile ?? null) });
  });

  // Dashboard tiles + recent-rounds feed (Dashboard.tsx).
  await page.route("**/api/v1/admin/stats", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        profiles: state.adminProfiles.length,
        kids: 0,
        skills: 0,
        content_items: 0,
        progress_events: 0,
        subscriptions: 0,
        recent_events: [],
      }),
    })
  );

  // Kotha story-health widgets (StoryHealth.tsx) — a complete, empty-but-valid
  // document so the dashboard renders the "sanity passed" state.
  await page.route("**/api/v1/admin/stories/health", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        total: 0,
        charts: { by_kid: [], by_skill: [], by_error_kind: [], by_action: [], by_day: [] },
        rate_limit_per_hour: 100,
        high_velocity_kids: [],
        sanity: { ok: true, warnings: [] },
      }),
    })
  );
}
