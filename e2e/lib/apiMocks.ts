/// <reference path="../types/playwright-node-shim.d.ts" />
import type { Page } from "@playwright/test";

/** A server-side kid as the mocked API would return it. */
export interface MockKid {
  id: string;
  name: string;
  avatar: string;
  birth_year: number;
}

/** Mutable backend stand-in shared between the page and the test. */
export interface MockApiState {
  kids: MockKid[];
  progressCalls: Array<Record<string, unknown>>;
  logoutCalls: number;
}

export function createMockApiState(): MockApiState {
  return { kids: [], progressCalls: [], logoutCalls: 0 };
}

const MOCK_PROFILE = {
  id: "profile-1",
  email: "parent@example.com",
  display_name: "Test Parent",
  is_admin: false,
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

  await page.route("**/api/v1/auth/signup", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: "e2e-token", profile: MOCK_PROFILE }),
    })
  );
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: "e2e-token", profile: MOCK_PROFILE }),
    })
  );
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_PROFILE) })
  );
  await page.route("**/api/v1/auth/sessions", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.route("**/api/v1/auth/logout", (route) => {
    state.logoutCalls += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
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

  await page.route("**/api/v1/kids/*/snapshot", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ coins: 0, mastery: [] }) })
  );
  await page.route("**/api/v1/kids/*/settings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
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
      }),
    })
  );
  await page.route("**/api/v1/kids/*/mastery", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
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
  await page.route("**/api/v1/kids/*/stories", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.route("**/api/v1/kids/*/acceleration", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.route("**/api/v1/kids/*/activity", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );

  await page.route("**/api/v1/progress", async (route) => {
    state.progressCalls.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.route("**/api/v1/push/subscriptions", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
}
