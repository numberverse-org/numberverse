import type { AuthProvider } from "react-admin";

import { API } from "./apiBase";

/** #1773 — rotate the httpOnly refresh cookie into a fresh short-lived admin
 *  access token. Stores it in nv_admin_token and returns it; null when there's
 *  no cookie / it's invalid / offline. */
async function tryRefreshAdmin(): Promise<string | null> {
  try {
    const res = await fetch(`${API}/auth/refresh`, { method: "POST", credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.access_token === "string") {
      localStorage.setItem("nv_admin_token", data.access_token);
      return data.access_token;
    }
    return null;
  } catch {
    return null; // offline — fall through
  }
}

export const authProvider: AuthProvider = {
  login: async ({ username, password }) => {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: username, password }),
      // #1773 — accept/store the httpOnly refresh cookie the API sets.
      credentials: "include",
    });
    if (!res.ok) {
      // #851 — preserve the backend's 401-vs-403 distinction: bad credentials
      // vs. a valid non-admin account.
      const body = await res.json().catch(() => null);
      const detail: string | undefined = body?.detail;
      if (res.status === 403) {
        throw new Error("This account is not an administrator");
      }
      if (res.status === 401) {
        throw new Error("Invalid email or password");
      }
      throw new Error(detail || res.statusText || "Login failed");
    }
    const { token, profile } = await res.json();
    if (!profile.is_admin) throw new Error("Not an admin account");
    localStorage.setItem("nv_admin_token", token);
    return Promise.resolve();
  },
  logout: ({ logoutAll = false } = {}) => {
    const token = localStorage.getItem("nv_admin_token");
    // #843 — real logout: revoke the session server-side too. Best-effort so
    // logout still succeeds offline; the local token is cleared regardless.
    if (token) {
      void fetch(`${API}${logoutAll ? "/auth/logout-all" : "/auth/logout"}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        // #1773 — send credentials so the API logout clears the httpOnly cookie.
        credentials: "include",
      }).catch(() => {
        // ignore network errors — the client-side session is already gone
      });
    }
    localStorage.removeItem("nv_admin_token");
    return Promise.resolve();
  },
  checkError: async ({ status }) => {
    // #851 — 401 means the session expired/revoked. #1773 — the stored admin
    // token is now only 10 minutes long, so a 401 may just mean it expired while
    // the httpOnly refresh cookie is still valid: try ONE refresh before logging
    // the admin out.
    if (status === 401) {
      const fresh = await tryRefreshAdmin();
      if (fresh) return Promise.resolve();
      localStorage.removeItem("nv_admin_token");
      return Promise.reject();
    }
    // #851 — 403 means the user IS authenticated but lacks admin rights on this
    // operation: keep the session and surface the error instead of logging out.
    if (status === 403) {
      return Promise.reject({ logoutUser: false });
    }
    return Promise.resolve();
  },
  checkAuth: async () => {
    // #1773 — the stored access token is short-lived; first try to rotate the
    // httpOnly refresh cookie into a fresh token.
    const fresh = await tryRefreshAdmin();
    if (fresh) return Promise.resolve();
    return localStorage.getItem("nv_admin_token") ? Promise.resolve() : Promise.reject();
  },
  getPermissions: () => Promise.resolve(),
};
