/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect } from "@playwright/test";
import { createMockApiState, mockNumberverseApi } from "./lib/apiMocks";
import type { MockShareSnapshot } from "./lib/apiMocks";

/**
 * #245 — the PUBLIC share-card page (/parent/share?t=<token>) had zero e2e
 * coverage of its privacy contract: it must render the week's five AGGREGATE
 * tiles (rounds, correct %, minutes, active days, mastered skills) while never
 * leaking a kid's name, avatar, or id into the DOM. The page makes exactly one
 * fetch — the unauthenticated /api/v1/share/<token> snapshot — and the token is
 * the only key. The backend is mocked; the real shipped bundle is under test.
 */

/** The known aggregate payload the mock serves for this card. */
const AGGREGATE: MockShareSnapshot = {
  rounds: 42,
  minutes: 137,
  correct_pct: 91,
  active_days: 6,
  mastered_count: 5,
  top_game: "game-nova-3d",
  week_of: "2026-08-10",
  coins: 128,
  minutes_by_day: [10, 15, 20, 25, 30, 35, 2],
};

/** The unguessable per-kid link secret handed to a friend/relative. */
const SHARE_TOKEN = "e2e-share-abc123";

test.describe("public share-card privacy contract", () => {
  test.use({ serviceWorkers: "block" });

  test("renders the five aggregate tiles and leaks no name/avatar/kid id", async ({ page }) => {
    const api = createMockApiState();

    // The backend knows an identity (kid + parent) that the PUBLIC card must
    // never reveal. The share page never fetches these — this just gives the
    // "no personal data leak" assertion real teeth.
    api.kids.push({ id: "server-kid-7", name: "Zara", avatar: "🦄", birth_year: 2019 });
    api.shareSnapshot = { ...AGGREGATE };

    await mockNumberverseApi(page, api);

    // The card makes exactly ONE network call: the public share-snapshot read.
    await page.goto(`/parent/share?t=${SHARE_TOKEN}`);

    // 1. Heading + the page's own privacy note.
    await expect(page.getByRole("heading", { name: "This week in Numberverse" })).toBeVisible();
    await expect(page.getByText(/No names, no personal details — just the numbers/)).toBeVisible();

    // 2. The five aggregate tiles render their known values.
    const expectedTiles: Array<[label: string, value: string]> = [
      ["rounds this week", "42"],
      ["correct", "91%"],
      ["minutes played", "137"],
      ["days active", "6"],
      ["skills mastered", "5"],
    ];
    for (const [label, value] of expectedTiles) {
      const tile = page.locator(".tile").filter({ hasText: label });
      await expect(tile).toHaveCount(1);
      await expect(tile.locator(".tile-num")).toHaveText(value);
    }

    // 3. The conditional extras that the known payload enables.
    await expect(page.locator(".tile").filter({ hasText: "coins in wallet" }).locator(".tile-num")).toHaveText("🪙 128");
    await expect(page.getByLabel("minutes played by day this week")).toBeVisible();
    await expect(page.getByText(/Favorite game: nova 3d/)).toBeVisible();

    // 4. The card hit exactly the share-snapshot route, with exactly our token.
    await expect.poll(() => api.shareSnapshotTokens).toEqual([SHARE_TOKEN]);

    // 5. PRIVACY CONTRACT — no name / avatar / kid id (or parent identity) in
    //    the rendered DOM, even though the mock backend knows them.
    const body = page.locator("body");
    await expect(body).not.toContainText("Zara");
    await expect(body).not.toContainText("🦄");
    await expect(body).not.toContainText("server-kid-7");
    await expect(body).not.toContainText("Test Parent");
    await expect(body).not.toContainText("parent@example.com");
  });
});
