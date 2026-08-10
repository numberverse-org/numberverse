import type { AuthProvider } from "react-admin";

import { API } from "./apiBase";

export const authProvider: AuthProvider = {
  login: async ({ username, password }) => {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: username, password }),
    });
    if (!res.ok) throw new Error("Invalid credentials");
    const { token, profile } = await res.json();
    if (!profile.is_admin) throw new Error("Not an admin account");
    localStorage.setItem("nv_admin_token", token);
    return Promise.resolve();
  },
  logout: () => {
    localStorage.removeItem("nv_admin_token");
    return Promise.resolve();
  },
  checkError: ({ status }) => {
    if (status === 401 || status === 403) {
      localStorage.removeItem("nv_admin_token");
      return Promise.reject();
    }
    return Promise.resolve();
  },
  checkAuth: () =>
    localStorage.getItem("nv_admin_token") ? Promise.resolve() : Promise.reject(),
  getPermissions: () => Promise.resolve(),
};
