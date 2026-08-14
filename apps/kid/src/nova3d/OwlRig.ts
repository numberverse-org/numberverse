/**
 * 🦉 #688 — OwlRig: every activity id → 3D clip + morph combo.
 *
 * The 2D NovaScene plays each of the 41 pet-care ACTIVITIES as its own Phaser
 * tween (actBath, actBrush, …). The 3D owl has 6 authored clips (idle/walk/
 * hop/fly/spin/dance) × 6 morph targets (happy/sad/scared/excited/sleepy/
 * grumpy). This table re-hosts every activity as a spatial action: the closest
 * clip + the matching emotion, plus a tiny floating-emoji burst so the action
 * still reads at a glance (same emoji the 2D scene bursts).
 *
 * ids = ACTIVITIES (activities.ts) — all 51: the 10 pet mini-games (game-*)
 * plus the 41 pet-care actions. `rigFor(id)` falls back to a gentle default so
 * a future activity never leaves the owl unresponsive.
 */
import type { NovaClip, NovaMorph } from "./OwlModel";

export interface OwlRig {
  clip: NovaClip;
  morph: NovaMorph;
  /** emoji that float up over the owl when the action plays */
  burst?: string[];
  /** seconds the action should read before the kid can move on */
  hold?: number;
}

const DEFAULT_RIG: OwlRig = { clip: "idle", morph: "happy", hold: 1.6 };

/** the 10 pet mini-game ids (activities.ts scene: entries) */
const GAMES = new Set([
  "game-feed", "game-catch", "game-bubble", "game-bath", "game-stroke",
  "game-sort", "game-fetch", "game-hide", "game-memory", "game-tuckin",
]);

const RIG: Record<string, OwlRig> = {
  /* ── pet mini-games (#104): best 3D read of the 2D mechanic ── */
  "game-feed": { clip: "hop", morph: "happy", burst: ["🍎", "🍇", "🍕"], hold: 2 },
  "game-catch": { clip: "hop", morph: "excited", burst: ["🍎", "🎾", "⭐"], hold: 2 },
  "game-bubble": { clip: "dance", morph: "excited", burst: ["🫧", "🫧", "✨"], hold: 2 },
  "game-bath": { clip: "spin", morph: "excited", burst: ["🫧", "💦", "🫧"], hold: 2 },
  "game-stroke": { clip: "dance", morph: "happy", burst: ["💛", "💛", "💛"], hold: 2 },
  "game-sort": { clip: "hop", morph: "happy", burst: ["🧺", "🍎", "⭐"], hold: 2 },
  "game-fetch": { clip: "walk", morph: "excited", burst: ["🎾", "🎾", "⭐"], hold: 2 },
  "game-hide": { clip: "hop", morph: "scared", burst: ["🙈", "👀", "✨"], hold: 2 },
  "game-memory": { clip: "spin", morph: "happy", burst: ["🃏", "🃏", "⭐"], hold: 2 },
  "game-tuckin": { clip: "idle", morph: "sleepy", burst: ["🌙", "💤", "⭐"], hold: 2 },

  /* ── pet-care: the 41 simple actions (NovaScene runActivity) ── */
  bath: { clip: "spin", morph: "excited", burst: ["🫧", "💦", "🫧"] },
  brush: { clip: "idle", morph: "happy", burst: ["🪮", "✨", "✨"] },
  hug: { clip: "dance", morph: "happy", burst: ["🤗", "💛", "💛"] },
  kiss: { clip: "hop", morph: "happy", burst: ["😘", "💛", "💛"] },
  scritch: { clip: "dance", morph: "happy", burst: ["🫳", "💛", "✨"] },
  nap: { clip: "idle", morph: "sleepy", burst: ["💤", "💤", "🌙"] },
  fly: { clip: "fly", morph: "excited", burst: ["🪶", "☁️", "✨"] },
  read: { clip: "idle", morph: "happy", burst: ["📖", "✨", "⭐"] },
  slap: { clip: "hop", morph: "grumpy", burst: ["💢", "💢", "😤"] },
  laugh: { clip: "dance", morph: "happy", burst: ["😂", "😂", "✨"] },
  yawn: { clip: "idle", morph: "sleepy", burst: ["🥱", "💤", "😴"] },
  sneeze: { clip: "hop", morph: "grumpy", burst: ["🤧", "💨", "💨"] },
  dance: { clip: "dance", morph: "excited", burst: ["🕺", "✨", "🎉"] },
  spin: { clip: "spin", morph: "excited", burst: ["🌀", "✨", "🌀"] },
  wave: { clip: "idle", morph: "happy", burst: ["👋", "✨", "✨"] },
  jump: { clip: "hop", morph: "excited", burst: ["🦘", "✨", "🦘"] },
  twirl: { clip: "spin", morph: "happy", burst: ["✨", "🌀", "✨"] },
  wink: { clip: "idle", morph: "happy", burst: ["😉", "💛", "✨"] },
  blink: { clip: "idle", morph: "happy", burst: ["😴", "✨", "👁️"] },
  grumpy: { clip: "idle", morph: "grumpy", burst: ["😤", "😤", "💢"] },
  happy: { clip: "dance", morph: "happy", burst: ["😄", "✨", "🎉"] },
  sad: { clip: "idle", morph: "sad", burst: ["😢", "💧", "😢"] },
  scared: { clip: "hop", morph: "scared", burst: ["😨", "😨", "💦"] },
  shocked: { clip: "hop", morph: "scared", burst: ["😲", "⚡", "😲"] },
  excited: { clip: "dance", morph: "excited", burst: ["🤩", "✨", "🎉"] },
  sleepy: { clip: "idle", morph: "sleepy", burst: ["😪", "💤", "😪"] },
  snore: { clip: "idle", morph: "sleepy", burst: ["💤", "💤", "😴"] },
  whistle: { clip: "dance", morph: "happy", burst: ["🎶", "🎶", "✨"] },
  sing: { clip: "dance", morph: "happy", burst: ["🎤", "🎶", "✨"] },
  heart: { clip: "dance", morph: "happy", burst: ["💛", "💛", "💖"] },
  dizzy: { clip: "spin", morph: "scared", burst: ["😵", "🌀", "😵"] },
  stretch: { clip: "idle", morph: "happy", burst: ["🙆", "✨", "🌞"] },
  hide: { clip: "hop", morph: "scared", burst: ["🙈", "🙈", "👀"] },
  peek: { clip: "hop", morph: "happy", burst: ["👀", "🙈", "✨"] },
  cheer: { clip: "hop", morph: "excited", burst: ["🎉", "🎉", "✨"] },
  hmm: { clip: "idle", morph: "grumpy", burst: ["🤔", "🤔", "💭"] },
  highfive: { clip: "hop", morph: "excited", burst: ["✋", "✋", "✨"] },
  gobble: { clip: "hop", morph: "happy", burst: ["😋", "🍎", "✨"] },
  glow: { clip: "dance", morph: "happy", burst: ["✨", "🌟", "✨"] },
  zoom: { clip: "fly", morph: "excited", burst: ["💨", "💨", "⚡"] },
  disco: { clip: "dance", morph: "excited", burst: ["🪩", "✨", "🎉"] },
};

/** the pet-care mini-games re-hosted as native 3D interactions (#688) */
export const NATIVE_3D = new Set(["game-feed", "game-stroke", "game-bath"]);

/** true for the pet mini-games that are still full 2D Phaser scenes */
export const is2DGame = (id: string): boolean => GAMES.has(id) && !NATIVE_3D.has(id);

/** the rig that plays when a 2D-only mini-game is tapped in the island */
export const RIG_FOR_2D: OwlRig = { clip: "idle", morph: "happy", burst: ["🕹️", "✨", "🎮"], hold: 1.4 };

export function rigFor(id: string): OwlRig {
  return RIG[id] ?? DEFAULT_RIG;
}
