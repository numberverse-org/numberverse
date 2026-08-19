"use client";

import { useEffect } from "react";
import { getLocale, isRtl } from "@numberverse/core";

/** 🗺️ #2962 — keep the document's announced language + text direction in lock-step
 *  with the portal locale (nv_parent_lang), instead of the hardcoded <html lang="en">.
 *
 *  Reads the same localStorage key page.tsx uses for wizLang, then sets
 *  document.documentElement.lang (so screen readers / browser auto-translate see
 *  the right language) and .dir (derived from the core LocalePack, so a future
 *  RTL locale flips the direction with zero component changes). Listens for
 *  cross-tab storage changes too, mirroring the a11y sync in page.tsx. */
export default function LocaleDocument() {
  useEffect(() => {
    const apply = () => {
      let code = "en";
      try {
        const saved = localStorage.getItem("nv_parent_lang");
        if (saved === "en" || saved === "bn") code = saved;
      } catch {
        /* private browsing — fall back to en */
      }
      const locale = getLocale(code);
      const el = document.documentElement;
      if (el.lang !== locale.code) el.lang = locale.code;
      el.dir = isRtl(locale.code) ? "rtl" : "ltr";
    };

    apply();

    // Cross-tab sync: the kid app / another portal tab may switch the language.
    const onStorage = (e: StorageEvent) => {
      if (e.key === "nv_parent_lang") apply();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return null;
}
