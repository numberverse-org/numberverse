/// <reference path="./types/playwright-node-shim.d.ts" />
import { test, expect } from "@playwright/test";
import { createMockApiState, mockNumberverseApi } from "./lib/apiMocks";

/**
 * #1535 — the parent-gated Web Push opt-in (#/feed: "push-consent") had zero
 * e2e coverage. The shipped parent dashboard turns notifications ON only after
 * the parent re-enters their password (the API has no /auth/verify yet, so a
 * successful POST /push/subscribe IS the documented reauth gate).
 *
 * This spec exercises the real bundle end to end against the mock /api surface:
 * notification permission is granted, the browser's PushManager is faked to
 * report an EXISTING subscription, and the spec asserts the exact wire body
 * (endpoint + p256dh + auth) that reaches the mocked POST /push/subscribe.
 * A pre-existing subscription is used on purpose: the portal accepts it
 * without the VAPID public key (which is not baked into the static export),
 * and no service worker is actually installed (the project blocks SWs).
 */

test.describe("push-notification opt-in / consent flow", () => {
  test.use({ serviceWorkers: "block" });

  test("parent confirms their password and enables notifications → subscribe POST reaches the mock with endpoint + keys", async ({ page, context }) => {
    const api = createMockApiState();
    await mockNumberverseApi(page, api);

    // Real consent gate: the browser must own the Notification permission for a
    // Web-Push opt-in to be possible. Playwright grants it at the context level.
    await context.grantPermissions(["notifications"]);

    // The dashboard needs `navigator.serviceWorker.ready` to resolve before it
    // can read the PushSubscription. Service workers are blocked network-wise by
    // this project, so replace the API object with one wrapped around a fake
    // registration whose pushManager reports an EXISTING subscription. The fixed
    // bytes below map to deterministic p256dh/auth base64 that the spec asserts.
    await page.addInitScript(() => {
      const sub = {
        endpoint: "https://example.com/push/e2e-endpoint-42",
        getKey(name: string): ArrayBuffer | null {
          if (name === "p256dh") return Uint8Array.from([1, 2, 3, 4, 5]).buffer;
          if (name === "auth") return Uint8Array.from([9, 8, 7, 6]).buffer;
          return null;
        },
      };
      const sw = {
        controller: null,
        ready: Promise.resolve({
          pushManager: {
            getSubscription: async () => sub,
            subscribe: async () => sub,
          },
        }),
        // PwaBoot registers the portal's SW on load; the fake must answer it
        // (a missing register() crashed the whole portal shell).
        register: async () => ({} as ServiceWorkerRegistration),
        // page.tsx reads the SW version for the diagnostics card via
        // getRegistration() — a missing method throws synchronously inside the
        // effect and crashes the whole portal shell.
        getRegistration: async () => null,
      };
      try {
        Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: sw });
      } catch {
        // instance locked — try the prototype as a fallback
        try {
          Object.defineProperty(Object.getPrototypeOf(navigator) as Navigator, "serviceWorker", {
            configurable: true,
            value: sw,
          });
        } catch {
          /* both locked — the app will show the "not configured" muted state */
        }
      }
    });

    // Sign in as the parent. The notif toggle lives on the authenticated
    // dashboard, so the mock login must complete first.
    await page.goto("/parent/login");
    await page.getByPlaceholder("Parent email").fill("parent@example.com");
    await page.getByPlaceholder("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/Signed in as/)).toBeVisible();
    await page.getByRole("link", { name: /Open dashboard/ }).click();

    // The toggle starts OFF because the mock subscription list is empty.
    const toggle = page.getByRole("button", { name: "Off", exact: true });
    await expect(toggle).toBeVisible();

    // Toggle ON → the consent prompt asks the parent to re-enter their password.
    await toggle.click();
    await expect(page.getByText("Notifications need parent confirmation.")).toBeVisible();

    // The password re-confirm IS the consent. Submit it and watch the UI flip.
    await page.getByLabel("Confirm your password to enable notifications").fill("password123");
    await page.getByRole("button", { name: "Confirm", exact: true }).click();

    // Success path: the toggle flips to ON and the confirmation message shows.
    await expect(page.getByRole("button", { name: "On", exact: true })).toBeVisible();
    await expect(page.getByText("Notifications are on")).toBeVisible();

    // The subscribe POST reached the mock exactly once with the expected keys.
    await expect.poll(() => api.pushSubscribeCalls.length, { timeout: 15_000 }).toBe(1);
    const body = api.pushSubscribeCalls[0] as {
      endpoint?: unknown;
      p256dh?: unknown;
      auth?: unknown;
    };
    expect(body.endpoint).toBe("https://example.com/push/e2e-endpoint-42");
    expect(body.p256dh).toBe("AQIDBAU=");
    expect(body.auth).toBe("CQgHBg==");
  });
});
