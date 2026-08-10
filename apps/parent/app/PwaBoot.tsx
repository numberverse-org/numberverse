"use client";

import { useEffect } from "react";

/** Parent portal PWA boot — register the service worker (scope /parent/) so
 *  the portal is installable and reopens fast from a home-screen icon.
 *  Runs on window load so it never blocks first paint, and only in a real
 *  build (never local dev, avoiding stale-cache footguns). */
export default function PwaBoot() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") return;
    if (!("serviceWorker" in navigator)) return;
    const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const onLoad = () => {
      navigator.serviceWorker.register(`${base}/sw.js`).catch(() => {
        /* SW is a progressive enhancement — a failure just means no offline
         * installability, the portal still works fine. */
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
