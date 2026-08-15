import type { AuthProvider } from "react-admin";

import { API } from "./apiBase";

export const authProvider: AuthProvider = {
  login: async ({ username, password }) => {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: username, password }),
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
      }).catch(() => {
        // ignore network errors — the client-side session is already gone
      });
    }
    localStorage.removeItem("nv_admin_token");
    return Promise.resolve();
  },
  checkError: ({ status }) => {
    // #851 — 401 means the session expired/revoked: clear the token and log out.
    if (status === 401) {
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
  checkAuth: () =>
    localStorage.getItem("nv_admin_token") ? Promise.resolve() : Promise.reject(),
  getPermissions: () => Promise.resolve(),
};
