import { useEffect, useState } from "react";

// #3153 — dark-mode toggle for the admin console. The palette itself lives in
// index.css as `html[data-nv-theme]` variables (dark is the default so existing
// users see no change); this hook merely flips the attribute and persists the
// choice so the toggle survives a reload.
const STORAGE_KEY = "nv-admin-theme";

function readInitial(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light") return false;
  if (stored === "dark") return true;
  return true; // default dark
}

export function useDarkMode(): { dark: boolean; toggle: () => void } {
  const [dark, setDark] = useState<boolean>(readInitial);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-nv-theme", dark ? "dark" : "light");
    window.localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}
