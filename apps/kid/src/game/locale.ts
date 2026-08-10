/**
 * Tiny app-language bridge shared by game code (Phaser scenes) and React.
 * Kept dependency-free so scenes can read the current UI language without
 * threading props through every scene's create().
 */

let appLang: "en" | "bn" =
  typeof localStorage !== "undefined"
    ? (localStorage.getItem("nv_lang") as "en" | "bn") || "en"
    : "en";

export function setAppLang(lang: "en" | "bn") {
  appLang = lang;
}

export function getAppLang(): "en" | "bn" {
  return appLang;
}
