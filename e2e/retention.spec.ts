/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect, type Page } from "@playwright/test";
import { createMockApiState, mockNumberverseApi } from "./lib/apiMocks";

/**
 * Retention loop surfaces have no e2e coverage. HomeScreen (apps/kid/src/
 * components/HomeScreen.tsx) renders the "come back every day" shelf — the
 * 7-day login calendar (#281), the daily quest, the mastery mystery box (#284),
 * the pet-feed ritual, and the beat-the-owl challenge (#280). The one purely
 * interactive parts are the calendar tile (claims a coin bonus once per day)
 * and the mystery box (pays a mastery reward once per skill).
 *
 * This spec seeds a kid's offline nv_store_v1 with a claimable calendar day
 * (streak 3 → tile 3 → +5 🪙) and one un-mastery-boxed skill (count-1-10,
 * band 1 → 5–7 🪙), then taps the tile and the box and asserts the persisted
 * coin/state deltas the rendered taps produce. The backend is fully mocked —
 * no live account, no production data (see ./lib/apiMocks).
 */

const KID_ID = "retention-kid-e2e";
const BOXED_SKILL = "count-1-10"; // band 1, game skill → unclaimed mastery box

/** ISO date in the SAME browser-local-timezone the kid app uses (todayIso). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Seed the kid app's persisted store before the first page script runs.
 *  Boot then hydrates straight into a home screen that has every retention
 *  surface showing: streak 3 (pos 3 of the 7-day calendar, claimable +5 🪙),
 *  one mastered-but-unboxed skill, an unfed pet, and today's quest. */
async function seedRetentionStore(page: Page): Promise<void> {
  await page.addInitScript(
    ({ kidId, skillId }) => {
      const iso = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const today = iso(new Date());
      const ago = (n: number) => {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return iso(d);
      };

      // Mirror store.ts defaultNova() + the retention-relevant overrides:
      // - streak 3 + lastDay today → calendar pos 3, playedToday, claimable
      // - calendarDay far in the past → not claimed today
      // - petFed "" / petStage 1 → the nursery pet card is feedable
      // - boxes [] + a mastered skill → the mystery box shows
      const nova = {
        coins: 0,
        totalEarned: 0,
        owned: [],
        equipped: "none",
        streak: 3,
        days: [ago(2), ago(1), today],
        lastDay: today,
        affection: 0,
        affectionBest: false,
        gardenSeen: "",
        fed: "",
        played: "",
        earnedToday: 0,
        earnDay: "",
        careCoins: 0,
        careDay: "",
        careEarnedToday: 0,
        questDay: "",
        questRounds: 0,
        questDone: false,
        questClaimed: false,
        questPaid: 0,
        questType: "",
        questProgress: 0,
        bdayYear: "",
        shareDay: "",
        calendarDay: "2000-01-01",
        badges: [],
        trophies: [],
        bosses: [],
        boxes: [],
        freezes: 0,
        petStage: 1,
        petProgress: 0.4,
        petFed: "",
        species: "owl",
        adoptedPets: [],
        achievements: [],
        awake: true,
        lastGreeted: "",
      };

      const state = {
        skills: {
          [`${kidId}:${skillId}`]: {
            kidId,
            skillId,
            pMastered: 1, // ≥ 0.8 → skillMastered() true → unclaimed box
            correct: 60,
            attempts: 60,
            streak: 8,
            lastPractice: Date.now(),
            lastDecay: Date.now(),
          },
        },
        mistakes: {},
        stats: {},
        nova: { [kidId]: nova },
        garden: {},
        pending: [],
        stories: [],
        accel: [],
        moni: {},
        moniWrongStreak: {},
        moniStrictness: {},
        moniSkillDeltas: {},
        syncSignal: { lastSuccessAt: null, pendingCount: 0, lastError: null },
      };

      // Device flags so the app boots DIRECTLY into home for the seeded kid:
      // parent session present, welcome + first-play tour already seen.
      localStorage.setItem("nv_seen_welcome", "1");
      localStorage.setItem("nv_tour_done", "1");
      localStorage.setItem("nv_lang", "en");
      localStorage.setItem("nv_parent_token", "e2e-token");
      localStorage.setItem("nv_parent_name", "Test Parent");
      localStorage.setItem(
        "nv_kids",
        JSON.stringify([{ id: kidId, name: "Aria", avatar: "🦊", birthYear: 2020 }])
      );
      localStorage.setItem("nv_kid_id", kidId);
      localStorage.setItem("nv_store_v1", JSON.stringify({ state, version: 1 }));
    },
    { kidId: KID_ID, skillId: BOXED_SKILL }
  );
}

/** Read the persisted nova entry for a kid (what zustand persist last wrote). */
async function readNova(page: Page, kidId: string): Promise<Record<string, unknown> | null> {
  return page.evaluate((kidId) => {
    const raw = localStorage.getItem("nv_store_v1");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { state?: { nova?: Record<string, Record<string, unknown>> } };
      return parsed.state?.nova?.[kidId] ?? null;
    } catch {
      return null; // blob not written yet — let expect.poll keep polling
    }
  }, kidId);
}

test.describe("retention loop surfaces", () => {
  test.use({ serviceWorkers: "block" });

  // The live site shares this machine with the rest of the suite; the lazy App
  // chunk can take several seconds to import while other specs are hammering
  // the host. Give the boot + retention taps a comfortable margin.
  test.setTimeout(180_000);

  test("a claimable calendar day + an unclaimed mystery box pay coins when tapped", async ({ page }) => {
    const api = createMockApiState();
    await mockNumberverseApi(page, api);
    await seedRetentionStore(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // The remembered kid boots straight to home without the welcome/tour gates.
    await expect(page.locator(".play-btn")).toBeVisible();

    // The whole retention shelf renders: quest, 7-day calendar, pet, box,
    // beat-the-owl challenge — all against the seeded store.
    await expect(page.getByText("🎯 Today's Quest")).toBeVisible();
    await expect(page.locator(".cal-chip")).toBeVisible();
    await expect(page.getByText("Day 3 of 7")).toBeVisible();
    await expect(page.locator(".pet-card")).toBeVisible();
    await expect(page.getByRole("button", { name: "🍎 Feed pet" })).toBeVisible();
    await expect(page.locator(".box-card")).toBeVisible();
    await expect(page.getByText("1 mystery box waiting to open!")).toBeVisible();
    await expect(page.locator(".challenge-card")).toBeVisible(); // aria-label is the "Challenge Nova to a math duel" card copy, not the ⚔️ Beat Nova title

    // The mock /api surface maps the local kid to a server kid by boot (the
    // same identity handshake the cross-app journey proves end-to-end).
    await expect.poll(() => api.kids.length, { timeout: 15_000 }).toBe(1);
    expect(api.kids[0].name).toBe("Aria");

    // ── 1. Calendar claim ─────────────────────────────────────────────────
    // Streak 3 → today's tile is position 3 of the cycle → +5 🪙, tappable.
    const claimTile = page.getByRole("button", { name: "Collect +5 🪙" });
    await expect(claimTile).toBeEnabled();

    // The claimable tile has an INFINITE calPulse animation AND sits below the
    // 720px fold, so both Playwright click paths fail: the stability check
    // never settles (animation) and a force click hits off-screen coordinates.
    // Dispatch a native DOM click instead — React's delegated onClick handles it.
    await claimTile.evaluate((el) => (el as HTMLButtonElement).click());

    // Rendered UI flips the tile to a locked, "✓ Collected" state.
    const collectedTile = page.getByRole("button", { name: "✓ Collected" });
    await expect(collectedTile).toBeVisible();
    await expect(collectedTile).toBeDisabled();
    await expect(page.getByRole("button", { name: "Collect +5 🪙" })).toHaveCount(0);

    // The persisted store shows the coin paid + the whole-day claim flag.
    await expect.poll(async () => (await readNova(page, KID_ID))?.coins).toBe(5);
    await expect.poll(async () => (await readNova(page, KID_ID))?.calendarDay).toBe(todayIso());
    await expect.poll(async () => (await readNova(page, KID_ID))?.earnedToday).toBe(5);

    // ── 2. Mystery box ────────────────────────────────────────────────────
    // count-1-10 is mastered (pMastered 1) and unboxed → the box opens for a
    // band-1 reward (5–7 🪙), inside the same daily cap. Same DOM-click as the
    // calendar tile: the box is below the fold and may pulse too.
    const openBox = page.locator(".box-card").getByRole("button", { name: "Open" });
    await expect(openBox).toBeEnabled();
    await openBox.evaluate((el) => (el as HTMLButtonElement).click());

    // The box card unmounts once App sees the skill in the opened set.
    await expect(page.locator(".box-card")).toHaveCount(0);

    // Persisted wallet: 5 (calendar) + 5..7 (box) = 10..12, and the skill is
    // marked opened so the box can never be farmed again.
    await expect.poll(async () => (await readNova(page, KID_ID))?.coins).toBeGreaterThanOrEqual(10);
    await expect.poll(async () => (await readNova(page, KID_ID))?.coins).toBeLessThanOrEqual(12);
    await expect.poll(async () => (await readNova(page, KID_ID))?.boxes).toContain(BOXED_SKILL);
  });
});
