/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect } from "@playwright/test";
import { createMockApiState, mockNumberverseApi } from "./lib/apiMocks";

/**
 * Google sign-in journey — zero e2e until now (only the offline tolerance was
 * pinned). The real GIS button lives in a Google-owned cross-origin iframe and
 * opens an OAuth popup, so it can't be driven from Playwright. Instead this
 * spec proves the full app-side contract against the REAL shipped bundle:
 *
 *  - the Google feature flag is already ON in the deployed build
 *    (`VITE_GOOGLE_CLIENT_ID` is baked into the bundle, so the parent gate
 *    renders the Google slot) and the live HTTPS origin makes
 *    `window.isSecureContext` true, so `googleEnabled()` accepts the path;
 *  - `window.google.accounts.id` is stubbed via addInitScript BEFORE any app
 *    script runs, so GoogleSignIn's existing "gis is already here → start()"
 *    short-circuit renders a real, clickable "Continue with Google" button
 *    (the same label Google's own `text: "continue_with"` draws) without ever
 *    fetching accounts.google.com/gsi/client;
 *  - clicking that button fires the stubbed Identity `callback` with a fake id
 *    token, which flows through the app's real submitGoogle → signinGoogle →
 *    id-token POST to the mocked /api/v1/auth/google endpoint.
 *
 * Everything server-side is mocked — no live Google account is ever used.
 */

test.describe("Google sign-in journey", () => {
  test.use({ serviceWorkers: "block" });

  test("Continue-with-Google button renders and the id-token POST lands on auth/google", async ({ page }) => {
    const api = createMockApiState();
    await mockNumberverseApi(page, api);

    await page.addInitScript(() => {
      // Skip the one-time welcome (a device flag, not an account flag) so a
      // signed-out visit lands straight on the inline parent gate.
      try {
        localStorage.setItem("nv_seen_welcome", "1");
      } catch {
        /* ignore */
      }

      // Stub Google Identity Services the way the shipped GoogleSignIn chunk
      // expects, BEFORE any app module evaluates. The component checks
      // `window.google?.accounts?.id` first and calls start() directly when it
      // is present, so the real GIS script is never loaded in this run.
      const w = window as Window & {
        google?: {
          accounts: {
            id: {
              initialize: (cfg: { client_id: string; callback: (resp: { credential?: string }) => void }) => void;
              renderButton: (el: HTMLElement) => void;
            };
          };
        };
        __nvGsi?: { callback: (resp: { credential?: string }) => void } | null;
      };
      w.google = {
        accounts: {
          id: {
            // initialize() is where the app hands GIS the verified-token
            // callback; capture it so the stub button can invoke it on click.
            initialize(cfg) {
              w.__nvGsi = { callback: cfg.callback };
            },
            // renderButton draws the same affordance Google's own button would
            // (`text: "continue_with"`) as a real DOM button instead of the
            // cross-origin iframe GIS would normally inject.
            renderButton(container) {
              const btn = document.createElement("button");
              btn.type = "button";
              btn.textContent = "Continue with Google";
              btn.addEventListener("click", () => {
                w.__nvGsi?.callback({ credential: "e2e-google-id-token" });
              });
              container.appendChild(btn);
            },
          },
        },
      };
    });

    await page.goto("/");

    // A signed-out visit lands on the ONE parent page with the sign-in form
    // inline (there is no separate "gate page" anymore).
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(page.getByPlaceholder("at least 6 characters")).toBeVisible();

    // The Google slot renders because the shipped bundle has the OAuth client
    // id baked in AND this origin is a secure context — the stubbed GIS
    // renderButton draws a real button instead of Google's iframe.
    const googleButton = page.getByRole("button", { name: "Continue with Google" });
    await expect(googleButton).toBeVisible();

    // The "or continue with email" divider only renders when googleEnabled()
    // is true — pin it so this spec proves the feature flag path end-to-end.
    await expect(page.getByText("or continue with email")).toBeVisible();

    // Let the boot splash unmount so the click reaches the button, not the
    // dismiss-on-tap splash overlay sitting above it.
    await expect(page.locator(".splash")).toHaveCount(0);

    // Tap the stubbed GIS button → stubbed Identity callback → the app's real
    // submitGoogle → signinGoogle → POST /api/v1/auth/google.
    await googleButton.click();

    // The id-token POST reached the (mocked) backend exactly once.
    await expect.poll(() => api.googleTokenCalls.length, { timeout: 15_000 }).toBe(1);
    expect(api.googleTokenCalls[0]).toBe("e2e-google-id-token");

    // The mock backend issued a session → the app persisted it locally.
    expect(await page.evaluate(() => localStorage.getItem("nv_parent_token"))).toBe("e2e-google-token");
    expect(await page.evaluate(() => localStorage.getItem("nv_parent_name"))).toBe("Google Parent");

    // gateReturn defaults to "syllabus" on a fresh signed-out visit, so a
    // successful Google sign-in lands there — and now greets the parent by the
    // name the token exchange returned (never a guest banner again).
    await expect(page.getByText(/Hi Google Parent/)).toBeVisible();
    await expect(page.getByText(/browsing as a guest/)).toBeHidden();
  });
});
