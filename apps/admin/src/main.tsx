import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// #3153 — apply the persisted theme before first paint so the dashboard doesn't
// flash the wrong palette. `useDarkMode` keeps this attribute in sync afterwards.
{
  const stored = window.localStorage.getItem("nv-admin-theme");
  document.documentElement.setAttribute("data-nv-theme", stored === "light" ? "light" : "dark");
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
