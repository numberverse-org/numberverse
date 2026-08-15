import Phaser from "phaser";
import { pop, win, bad, tada } from "./audio";
import { speak } from "./speech";
import { cancelSpeech } from "./speech";
import { txt, NV_COCOA, NV_GOLD } from "./ui";
import { getAppLang, currentFestival } from "./locale";
import { t } from "./i18n";
import { bnNum } from "../i18n-core";
import {
  useKidStore,
  NOVA_OUTFITS,
  NOVA_SPECIES,
  speciesById,
  speciesEmoji,
  NOVA_DAILY_CAP,
  NOVA_CALENDAR_REWARDS,
  calendarCycleDay,
  questTypeFor,
  QUEST_TARGETS,
  NOVA_QUEST_TARGET,
  AFFECTION_BEST_COIN,
  todayIso,
  dayIsoAgo,
  defaultNova,
  type QuestType,
  type NovaOutfit,
  type NovaSpecies,
} from "../store";
import { ROOMS } from "./rooms";
import { ACTIVITIES, type ActivityDef } from "./activities";
import { enableSwipeRooms } from "./gestures";
import { prefersReducedMotion } from "./reducedMotion";
import { deriveLearningStyle, type LearningStyle } from "@numberverse/core";

/* ─────────────────────────── Nova scene i18n ─────────────────────────── */

const NOVA_T = {
  en: {
    greeting: (name: string) => `Whoo, ${name}! I'm Nova 🦉`,
    /** Personalized open greeting — name + streak + today's plan. */
    morning: (name: string, streak: number, skill: string) =>
      `Whoo, ${name}! ${streak > 0 ? `${streak}-day streak 🔥 ` : ""}Today: ${skill}! 🎯`,
    tapHint: "Tap me to play!",
    tapMsgs: ["Whoo-hoo! 😄", "That tickles! 😆", "You're my best friend! 💛"],
    feedMsg: "Yummy! Thanks! 🍎",
    feedReward: "Yummy! +1 🐾 for a tasty meal! 💛",
    playReward: "Wheee! +1 🐾 for playing! 🎈",
    dailyCap: "You earned ALL your coins today! 🪙✨ See you tomorrow!",
    doneTodayFeed: "I'm full now — see you tomorrow! 🍎💛",
    doneTodayPlay: "We already played lots today! 🎈💛",
    playMsg: "Whee! That was fun! 🎈",
    shopTitle: "🛍 Outfit Shop",
    speciesTitle: "🐣 Pet Friends",
    funTitle: "🎉 Play with Nova",
    close: "✕",
    playCta: "Let's Play!",
    playSub: "Win coins · Beat your streak 🔥",
    /* #765 — daily quest + claimable 7-day calendar mirrored from Home. */
    calDay: (pos: number) => `Day ${pos}`,
    calClaim: (reward: number) => `+${reward} 🪙`,
    calClaimed: "✓",
    calNotReady: "Play a game first, then tap to claim!",
    questType: { rounds: "🎯 rounds", stars: "⭐ stars", master: "🏅 master", newgame: "🆕 new game" },
    questSpeak: (label: string, progress: number, target: number) =>
      `Today's quest: ${label} — ${progress}/${target}! Tap here any time!`,
    questDoneSpeak: (label: string) => `Today's quest is done — ${label} complete! Great job! 💛`,
    calSpeak: (add: number) => `Daily bonus! +${add} coins! 🎁`,
    calCapSpeak: "Your coin cup is full — this bonus waits safely for tomorrow! 🌙",
    calFreezeSpeak: "Nice! A streak-freeze token — one missed day is safe! 🧊",
    /* #766 — care decay: a gentle 'come back' when affection lapsed. */
    missedYou: "Nova missed you — feed me to keep our friendship warm!",
    bestFriend: "Best friends! 💛",
    wear: "Wear",
    wearing: "On",
    needCoins: "Play games to earn coins! 💪",
    boughtMsg: "Ooh, I love it! 💛",
    equipMsg: "Fashion! 💅",
    adopt: "Adopt",
    adopted: "Mine",
    locked: "🔒 Grows to unlock",
    adoptedMsg: "New friend! 💛",
    needGrow: "Grow your pet to unlock me! 🌱",
    daily: (n: number) => `today ${n}/${NOVA_DAILY_CAP}`,
    streak: (n: number) => `${n}-day streak`,
    zzz: "Zzz…",
    wake: "Huh? Whoo? 😳",
    /** 🏅 #332 learning-style badge labels — kid-safe, fun, one line each. */
    styleBadge: { fast: "⚡ Speed Sprinter", steady: "🐢 Steady Pal", social: "🦉 Friend of All" },
    /** #278 — limited seasonal outfits (festival-gated). */
    seasonal: (festival: string) => `🎉 ${festival} only`,
    festEid: "Eid",
    festBoishakh: "Pohela Boishakh",
    /* #1411 — reaction voice lines (poke / activity reactions) */
    patDizzy: "Whoa whoa whoa! Too many pats! 😵",
    slap: "Ow! What was that? 😵",
    laugh: "Hoo hoo ha ha! 😂",
    yawn: "Yaaawn… so sleepy! 🥱",
    sneeze: "Achoo! 🤧",
    dance: "Boogie! 🕺",
    spin: "Wheee! 🌀",
    wave: "Hi there! 👋",
    jump: "Boing! 🦘",
    twirl: "Twirl! ✨",
    wink: "Wink! 😉",
    blink: "Blink blink! 😴",
    grumpy: "Hmph! 😤",
    happy: "Yay! 😄",
    sad: "Ohh… 😢",
    scared: "Eek! 😨",
    shocked: "Whoa! 😲",
    excited: "Woo-hoo! 🤩",
    sleepy: "Mm… sleepy 😪",
    snore: "Zzz… 💤",
    whistle: "Pew pew! 🎵",
    sing: "La la la! 🎵",
    heart: "Love you! 💛",
    dizzy: "Whoa, dizzy… 😵",
    stretch: "Big stretch! 🙆",
    peek: "Peekaboo! 🙈",
    hide: "Boo! 👀",
    cheer: "Yay! 🎉",
    hmm: "Hmm… 🤔",
    highfive: "High five! ✋",
    gobble: "Nom nom! 😋",
    glow: "Sparks! ✨",
    zoom: "Zoomies! 💨",
    disco: "Disco! 🪩",
    bath: "Rub-a-dub-dub! 🛁",
    brush: "So smooth! ✨",
    hug: "Hug time! 🤗",
    kiss: "Mwah! 😘",
    scritch: "Mmm… scritches! 😌",
    nap: "So cozy… nap time… 💤",
    fly: "I can fly! 🪶",
    read: "Once upon a time… 📖",
  },
  bn: {
    greeting: (name: string) => `হু, ${name}! আমি নোভা 🦉`,
    /** Personalized open greeting — name + streak + today's plan. */
    morning: (name: string, streak: number, skill: string) =>
      `হু, ${name}! ${streak > 0 ? `${streak} দিনের ধারা 🔥 ` : ""}আজ: ${skill}! 🎯`,
    tapHint: "আমায় ছুঁয়ে খেলো!",
    tapMsgs: ["হু-হু! 😄", "টিকলি! 😆", "তুমি আমার সেরা বন্ধু! 💛"],
    feedMsg: "মমম! ধন্যবাদ! 🍎",
    feedReward: "মমম! ভালো খাবারে +1 🐾! 💛",
    playReward: "উহু! খেলায় +1 🐾! 🎈",
    dailyCap: "আজ সব কয়েন জিতেছ! 🪙✨ কাল আবার দেখা হবে!",
    doneTodayFeed: "আমি ভর্তি — কাল দেখা হবে! 🍎💛",
    doneTodayPlay: "আজ তো অনেক খেললাম! 🎈💛",
    playMsg: "উহু! দারুণ মজা! 🎈",
    shopTitle: "🛍 পোশাকের দোকান",
    speciesTitle: "🐣 পোষা বন্ধু",
    funTitle: "🎉 নোভার সাথে খেলো",
    close: "✕",
    playCta: "খেলি!",
    playSub: "কয়েন জিতো · ধারা চালিয়ে যাও 🔥",
    /* #765 — daily quest + claimable 7-day calendar mirrored from Home. */
    calDay: (pos: number) => `দিন ${bnNum(pos)}`,
    calClaim: (reward: number) => `+${bnNum(reward)} 🪙`,
    calClaimed: "✓",
    calNotReady: "আগে একটি খেলা খেলো, তারপর বোনাস নাও!",
    questType: { rounds: "🎯 রাউন্ড", stars: "⭐ তারা", master: "🏅 মাস্টারি", newgame: "🆕 নতুন খেলা" },
    questSpeak: (label: string, progress: number, target: number) =>
      `আজকের চ্যালেঞ্জ: ${label} — ${bnNum(progress)}/${bnNum(target)}! যেকোনো সময় এখানে ট্যাপ করো!`,
    questDoneSpeak: (label: string) => `আজকের চ্যালেঞ্জ শেষ — ${label} সম্পূর্ণ! দারুণ! 💛`,
    calSpeak: (add: number) => `দিনের বোনাস! +${bnNum(add)} কয়েন! 🎁`,
    calCapSpeak: "কয়েনের পেয়ালা ভরে গেছে — এই বোনাস কাল নিরাপদে অপেক্ষা করবে! 🌙",
    calFreezeSpeak: "দারুণ! একটি স্ট্রিক-ফ্রিজ টোকেন — একটি মিস করা দিন নিরাপদ! 🧊",
    /* #766 — care decay: a gentle 'come back' when affection lapsed. */
    missedYou: "নোভা তোমাকে মিস করেছে — বন্ধুত্ব উষ্ণ রাখতে খাওয়াও!",
    bestFriend: "আমরা সেরা বন্ধু! 💛",
    wear: "পরো",
    wearing: "পরে",
    needCoins: "কয়েন পেতে খেলা খেলো! 💪",
    boughtMsg: "ওহ্, আমার খুব পছন্দ! 💛",
    equipMsg: "দারুণ ফ্যাশন! 💅",
    adopt: "দত্তক নাও",
    adopted: "আমার",
    locked: "🔒 বড়ো হলে খুলবে",
    adoptedMsg: "নতুন বন্ধু! 💛",
    needGrow: "পোষা প্রাণী বড়ো করলে আমায় পাবে! 🌱",
    daily: (n: number) => `আজ ${n}/${NOVA_DAILY_CAP}`,
    streak: (n: number) => `${n} দিনের ধারা`,
    zzz: "ঘুম…",
    wake: "হুঁ? হু? 😳",
    /** 🏅 #332 learning-style badge labels — kid-safe, fun, one line each. */
    styleBadge: { fast: "⚡ দ্রুত তারা", steady: "🐢 ধীরে সুস্থে", social: "🦉 সবার বন্ধু" },
    /** #278 — limited seasonal outfits (festival-gated). */
    seasonal: (festival: string) => `🎉 শুধু ${festival}`,
    festEid: "ঈদ",
    festBoishakh: "পহেলা বৈশাখ",
    /* #1411 — reaction voice lines (poke / activity reactions) */
    patDizzy: "আরে আরে! এত টিপাটিপি! 😵",
    slap: "ওহ! ওটা কী হলো? 😵",
    laugh: "হু হু হা হা! 😂",
    yawn: "হাই… কী ঘুম পেয়েছে! 🥱",
    sneeze: "হাচো! 🤧",
    dance: "নাচো নাচো! 🕺",
    spin: "উহু! ঘুরছি! 🌀",
    wave: "হ্যালো! 👋",
    jump: "লাফ! 🦘",
    twirl: "পাক খাই! ✨",
    wink: "চোখ টিপি! 😉",
    blink: "পিটপিট! 😴",
    grumpy: "হুঁ! 😤",
    happy: "ইয়া! 😄",
    sad: "ওহ… 😢",
    scared: "উফ্! 😨",
    shocked: "ওয়াও! 😲",
    excited: "হুররে! 🤩",
    sleepy: "হুম… ঘুম ঘুম 😪",
    snore: "ঘুম… 💤",
    whistle: "ফিউ ফিউ! 🎵",
    sing: "লা লা লা! 🎵",
    heart: "ভালোবাসি! 💛",
    dizzy: "ওহ, মাথা ঘুরছে… 😵",
    stretch: "আরাম করে মেলে ধরি! 🙆",
    peek: "উঁকিঝুঁকি! 🙈",
    hide: "বু! 👀",
    cheer: "ইয়া! 🎉",
    hmm: "হুম… 🤔",
    highfive: "হাই ফাইভ! ✋",
    gobble: "মম মম! 😋",
    glow: "ঝলমলে! ✨",
    zoom: "সোঁ সোঁ! 💨",
    disco: "ডিস্কো! 🪩",
    bath: "কচকচ! স্নান! 🛁",
    brush: "চকচকে! ✨",
    hug: "জড়িয়ে ধরি! 🤗",
    kiss: "চুমু! 😘",
    scritch: "হুম… চুলকানি! 😌",
    nap: "আরাম… ঘুমের সময়… 💤",
    fly: "আমি উড়তে পারি! 🪶",
    read: "একদিনের গল্প… 📖",
  },
};
type NovaLang = keyof typeof NOVA_T;

/* ─────────────────────────── canvas texture builders ─────────────────────────── */

type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function makeTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: DrawFn): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  draw(ctx, w, h);
  tex.refresh();
  return key;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * MODERN 2026 character textures — soft-plush look:
 * big head, huge glossy eyes, small beak, integrated limbs, smooth cel-ish shading.
 * No sticker parts, no hard outlines, no 90s clip-art noise.
 */

/** Soft glowing cloud perch — gentle, low-contrast, blends into the room. */
function texCloud(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "rgba(120,70,120,0.12)";
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.92, w * 0.3, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  const puffs: [number, number, number, number][] = [
    [0.2, 0.82, 0.3, 0.4],
    [0.5, 0.62, 0.42, 0.5],
    [0.8, 0.86, 0.26, 0.36],
    [0.35, 0.94, 0.3, 0.32],
    [0.7, 0.96, 0.32, 0.32],
  ];
  for (const [bx, by, bw, bh] of puffs) {
    const g = ctx.createRadialGradient(bx * w, by * h, 4, bx * w, by * h, Math.max(bw * w, bh * h) * 0.7);
    g.addColorStop(0, "rgba(255,255,255,0.5)");
    g.addColorStop(0.6, "rgba(255,246,235,0.3)");
    g.addColorStop(1, "rgba(255,240,228,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(bx * w, by * h, bw * w, bh * h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ── realistic great-horned-owl Nova (matches the shell SVG: brown mottled
 * body, cream barred chest, dark-rimmed facial disc, huge amber eyes) ─── */

/** Realistic owl body — pear-shaped, brown mottled flanks, cream barred chest. */
function texBody(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2;
  // pear-shaped body (narrow shoulders, full belly)
  const body = ctx.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, NV_COCOA);
  body.addColorStop(0.55, "#8a5c33");
  body.addColorStop(1, "#a06a3a");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.03);
  ctx.bezierCurveTo(cx - w * 0.2, h * 0.06, cx - w * 0.44, h * 0.3, cx - w * 0.42, h * 0.62);
  ctx.bezierCurveTo(cx - w * 0.4, h * 0.9, cx - w * 0.18, h * 0.98, cx, h * 0.98);
  ctx.bezierCurveTo(cx + w * 0.18, h * 0.98, cx + w * 0.4, h * 0.9, cx + w * 0.42, h * 0.62);
  ctx.bezierCurveTo(cx + w * 0.44, h * 0.3, cx + w * 0.2, h * 0.06, cx, h * 0.03);
  ctx.closePath();
  ctx.fill();
  // warm top-light
  const top = ctx.createRadialGradient(cx, h * 0.22, 8, cx, h * 0.3, h * 0.5);
  top.addColorStop(0, "rgba(255,224,180,0.22)");
  top.addColorStop(1, "rgba(255,224,180,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h);
  // flank mottling — scattered darker feather ovals away from the chest
  ctx.fillStyle = "rgba(90,58,32,0.38)";
  const mottles: Array<[number, number, number, number, number]> = [
    [0.16, 0.3, 0.05, 0.07, 0.25], [0.84, 0.3, 0.05, 0.07, -0.25],
    [0.14, 0.44, 0.045, 0.06, -0.2], [0.86, 0.44, 0.045, 0.06, 0.2],
    [0.17, 0.58, 0.05, 0.065, 0.22], [0.83, 0.58, 0.05, 0.065, -0.22],
    [0.13, 0.7, 0.04, 0.055, -0.18], [0.87, 0.7, 0.04, 0.055, 0.18],
    [0.2, 0.76, 0.045, 0.06, 0.2], [0.8, 0.76, 0.045, 0.06, -0.2],
    [0.28, 0.3, 0.05, 0.06, 0.3], [0.72, 0.3, 0.05, 0.06, -0.3],
  ];
  for (const [mx, my, mrx, mry, rot] of mottles) {
    ctx.beginPath();
    ctx.ellipse(mx * w, my * h, mrx * w, mry * h, rot, 0, Math.PI * 2);
    ctx.fill();
  }
  // chest — cream panel with dark barring rows, sits just below the facial disc
  const chest = ctx.createRadialGradient(cx, h * 0.72, 10, cx, h * 0.74, h * 0.3);
  chest.addColorStop(0, "#eee0c0");
  chest.addColorStop(0.7, "#e3d2a6");
  chest.addColorStop(1, "#dcc9a0");
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.74, w * 0.28, h * 0.23, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = chest;
  ctx.fillRect(0, h * 0.45, w, h * 0.55);
  ctx.strokeStyle = "rgba(122,78,42,0.8)";
  ctx.lineWidth = Math.max(2.4, h * 0.011);
  for (let i = 0; i < 6; i++) {
    const by = h * (0.51 + i * 0.075);
    ctx.beginPath();
    for (let x = cx - w * 0.26; x <= cx + w * 0.26; x += 8) {
      const yy = by + Math.sin(x * 0.14 + i * 1.7) * 2.2;
      if (x === cx - w * 0.26) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
  // soft bottom AO
  const ao = ctx.createRadialGradient(cx, h * 0.98, 6, cx, h * 0.94, h * 0.2);
  ao.addColorStop(0, "rgba(60,36,18,0.3)");
  ao.addColorStop(1, "rgba(60,36,18,0)");
  ctx.fillStyle = ao;
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.94, w * 0.4, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Realistic head + facial disc — brown dome, dark rim, cream lobes, brows. */
function texFace(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2;
  // 1. brown head dome (the disc sits inside it; tufts sprout from its top)
  const head = ctx.createLinearGradient(0, 0, 0, h);
  head.addColorStop(0, "#6b4526");
  head.addColorStop(0.5, NV_COCOA);
  head.addColorStop(1, "#8a5c33");
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.06);
  ctx.bezierCurveTo(cx - w * 0.42, h * 0.1, cx - w * 0.48, h * 0.45, cx - w * 0.3, h * 0.86);
  ctx.quadraticCurveTo(cx - w * 0.1, h * 0.97, cx, h * 0.97);
  ctx.quadraticCurveTo(cx + w * 0.1, h * 0.97, cx + w * 0.3, h * 0.86);
  ctx.bezierCurveTo(cx + w * 0.48, h * 0.45, cx + w * 0.42, h * 0.1, cx, h * 0.06);
  ctx.closePath();
  ctx.fill();
  // dome feather streaks
  ctx.fillStyle = "rgba(60,36,18,0.3)";
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.ellipse(cx + i * w * 0.12, h * 0.16, w * 0.03, h * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 2. facial disc — dark outer rim frame
  ctx.fillStyle = "#4f331b";
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.5, w * 0.42, h * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  // warm inner rim
  ctx.fillStyle = "#6b4626";
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.5, w * 0.38, h * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  // cream lobes (the dark eye sockets sit right on their centers)
  ctx.fillStyle = "#f0e3c2";
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.23, h * 0.5, w * 0.22, h * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.23, h * 0.5, w * 0.22, h * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  // brighter lobe centers
  ctx.fillStyle = "#f4ead0";
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.23, h * 0.5, w * 0.17, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.23, h * 0.5, w * 0.17, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // the "Y" of dark feather lines under the bill (owl facial disc signature)
  ctx.strokeStyle = "rgba(122,78,42,0.4)";
  ctx.lineWidth = Math.max(1.4, h * 0.012);
  for (let i = 0; i < 3; i++) {
    const y0 = h * (0.56 + i * 0.055);
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.08, y0);
    ctx.lineTo(cx, y0 + h * 0.032);
    ctx.lineTo(cx + w * 0.08, y0);
    ctx.stroke();
  }
  // dark angled brows above the eyes
  ctx.strokeStyle = "#3d2a17";
  ctx.lineWidth = Math.max(3, h * 0.028);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.38, h * 0.18);
  ctx.lineTo(cx - w * 0.1, h * 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.38, h * 0.18);
  ctx.lineTo(cx + w * 0.1, h * 0.3);
  ctx.stroke();
}

/** Dark eye socket — great horned owls have no visible white sclera. */
function texEyeWhite(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2, cy = h / 2;
  const g = ctx.createRadialGradient(cx - 2, cy - 3, 3, cx, cy, w * 0.5);
  g.addColorStop(0, "#3a2a1c");
  g.addColorStop(1, "#241609");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.5, 0, Math.PI * 2);
  ctx.fill();
  // thin orbital ring so the socket reads against the cream disc
  ctx.strokeStyle = "rgba(20,12,5,0.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.5 - 1, 0, Math.PI * 2);
  ctx.stroke();
}

/** Big amber iris — radial honey, dark limbal ring, large pupil, twin glints. */
function texIris(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2, cy = h / 2;
  const g = ctx.createRadialGradient(cx, cy - 2, 2, cx, cy, w * 0.46);
  g.addColorStop(0, "#ffe37a");
  g.addColorStop(0.55, "#f4ae3f");
  g.addColorStop(0.85, "#d8871a");
  g.addColorStop(1, "#b96b0f");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.46, 0, Math.PI * 2);
  ctx.fill();
  // subtle dark limbal ring
  ctx.strokeStyle = "rgba(80,40,5,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.46 - 1, 0, Math.PI * 2);
  ctx.stroke();
  // large pupil (hunting owl — keeps the cute look)
  const p = w * 0.22;
  ctx.fillStyle = "#1a1206";
  ctx.beginPath();
  ctx.arc(cx, cy, p, 0, Math.PI * 2);
  ctx.fill();
  // twin catchlights — big top-left, tiny bottom-right
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(cx - p * 0.5, cy - p * 0.55, p * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.arc(cx + p * 0.45, cy + p * 0.5, p * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

/** Dark hooked beak — slate gray with a soft top shine. */
function texBeak(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#5a5a50");
  g.addColorStop(0.5, "#3a3a34");
  g.addColorStop(1, "#2a2a24");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.04);
  ctx.quadraticCurveTo(w * 0.92, h * 0.55, w * 0.6, h * 0.82);
  ctx.quadraticCurveTo(w * 0.54, h * 0.9, w * 0.5, h * 0.9);
  ctx.quadraticCurveTo(w * 0.46, h * 0.9, w * 0.4, h * 0.82);
  ctx.quadraticCurveTo(w * 0.08, h * 0.55, w * 0.5, h * 0.04);
  ctx.closePath();
  ctx.fill();
  // soft top shine + faint center ridge
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.ellipse(w * 0.42, h * 0.3, w * 0.08, h * 0.06, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.1);
  ctx.quadraticCurveTo(w * 0.52, h * 0.5, w * 0.5, h * 0.86);
  ctx.stroke();
}

/** Folded wing — brown panel, shoulder at the top, scalloped feather hem
 *  along the outer edge (pokes out beside the body). */
function texWing(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w * 0.3, h);
  g.addColorStop(0, NV_COCOA);
  g.addColorStop(0.5, "#5a3a20");
  g.addColorStop(1, "#4f331b");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(w * 0.7, h * 0.05);
  ctx.quadraticCurveTo(w * 0.95, h * 0.22, w * 0.85, h * 0.42);
  ctx.quadraticCurveTo(w * 0.78, h * 0.5, w * 0.72, h * 0.56);
  ctx.quadraticCurveTo(w * 0.64, h * 0.62, w * 0.6, h * 0.7);
  ctx.quadraticCurveTo(w * 0.52, h * 0.78, w * 0.48, h * 0.85);
  ctx.quadraticCurveTo(w * 0.42, h * 0.92, w * 0.34, h * 0.86);
  ctx.quadraticCurveTo(w * 0.26, h * 0.74, w * 0.32, h * 0.5);
  ctx.quadraticCurveTo(w * 0.38, h * 0.28, w * 0.55, h * 0.14);
  ctx.quadraticCurveTo(w * 0.62, h * 0.05, w * 0.7, h * 0.05);
  ctx.closePath();
  ctx.fill();
  // feather rows across the wing
  ctx.strokeStyle = "rgba(79,51,27,0.6)";
  ctx.lineWidth = Math.max(1.5, h * 0.008);
  for (let i = 0; i < 4; i++) {
    const y = h * (0.22 + i * 0.17);
    ctx.beginPath();
    ctx.moveTo(w * 0.4, y);
    ctx.quadraticCurveTo(w * 0.62, y + h * 0.03, w * 0.85, y);
    ctx.stroke();
  }
  // shoulder highlight
  ctx.fillStyle = "rgba(255,220,170,0.18)";
  ctx.beginPath();
  ctx.ellipse(w * 0.7, h * 0.12, w * 0.14, h * 0.08, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

/** Ear tuft — the great horned owl's signature raised brow-horns (brown). */
function texTuft(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, NV_COCOA);
  g.addColorStop(0.6, "#5a3a20");
  g.addColorStop(1, "#4f331b");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.97);
  ctx.quadraticCurveTo(w * 0.94, h * 0.82, w * 0.8, h * 0.3);
  ctx.quadraticCurveTo(w * 0.72, h * 0.08, w * 0.56, h * 0.02);
  ctx.quadraticCurveTo(w * 0.38, h * 0.1, w * 0.34, h * 0.3);
  ctx.quadraticCurveTo(w * 0.2, h * 0.6, w * 0.16, h * 0.9);
  ctx.quadraticCurveTo(w * 0.3, h * 0.97, w * 0.5, h * 0.97);
  ctx.closePath();
  ctx.fill();
  // feather split + light center streak
  ctx.strokeStyle = "rgba(79,51,27,0.8)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(w * 0.48, h * 0.92);
  ctx.lineTo(w * 0.44, h * 0.55);
  ctx.lineTo(w * 0.5, h * 0.3);
  ctx.stroke();
  ctx.fillStyle = "rgba(220,180,120,0.25)";
  ctx.beginPath();
  ctx.ellipse(w * 0.52, h * 0.5, w * 0.1, h * 0.22, 0.12, 0, Math.PI * 2);
  ctx.fill();
}

/* ── outfit textures (drawn, so Nova actually wears them on her body) ── */

/**
 * Red hero cape — WIDE so it peeks out from behind Nova's body on both
 * sides + below. Narrow at the neck, flaring to a wavy hem.
 */
function texCape(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#ff6b76");
  g.addColorStop(0.55, "#e11d48");
  g.addColorStop(1, "#9f1239");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.02);
  ctx.bezierCurveTo(cx - w * 0.5, h * 0.14, cx - w * 0.5, h * 0.6, cx - w * 0.34, h * 0.97);
  ctx.bezierCurveTo(cx - w * 0.28, h * 0.9, cx - w * 0.18, h * 0.93, cx - w * 0.14, h * 0.98);
  ctx.bezierCurveTo(cx - w * 0.1, h * 0.9, cx - w * 0.04, h * 0.94, cx, h * 0.99);
  ctx.bezierCurveTo(cx + w * 0.04, h * 0.94, cx + w * 0.1, h * 0.9, cx + w * 0.14, h * 0.98);
  ctx.bezierCurveTo(cx + w * 0.18, h * 0.93, cx + w * 0.28, h * 0.9, cx + w * 0.34, h * 0.97);
  ctx.bezierCurveTo(cx + w * 0.5, h * 0.6, cx + w * 0.5, h * 0.14, cx, h * 0.02);
  ctx.closePath();
  ctx.fill();
  // soft highlight along the left side
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.04);
  ctx.bezierCurveTo(cx - w * 0.3, h * 0.12, cx - w * 0.28, h * 0.5, cx - w * 0.14, h * 0.82);
  ctx.lineTo(cx, h * 0.3);
  ctx.closePath();
  ctx.fill();
}

/** Backpack — bag peeking above Nova's head + front shoulder straps. */
function texBackpack(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2;
  const g = ctx.createLinearGradient(cx, 0, cx, h);
  g.addColorStop(0, "#38bdf8");
  g.addColorStop(0.55, "#0284c7");
  g.addColorStop(1, "#075985");
  ctx.fillStyle = g;
  rr(ctx, cx - w * 0.36, h * 0.18, w * 0.72, h * 0.78, 22);
  ctx.fill();
  // top flap opening toward the viewer
  ctx.fillStyle = "#0c4a6e";
  ctx.beginPath();
  ctx.roundRect(cx - w * 0.36, h * 0.12, w * 0.72, h * 0.3, 14);
  ctx.fill();
  // front pocket
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  rr(ctx, cx - w * 0.26, h * 0.54, w * 0.52, h * 0.34, 12);
  ctx.fill();
  // buckle dots
  ctx.fillStyle = "#f8fafc";
  for (const dx of [-0.18, 0.18]) {
    ctx.beginPath();
    ctx.arc(cx + w * dx, h * 0.3, w * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Shoulder strap strip for the backpack (renders over the belly). */
function texStrap(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, "#075985");
  g.addColorStop(1, "#0ea5e9");
  ctx.fillStyle = g;
  rr(ctx, 0, 0, w, h, 4);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  rr(ctx, 0, h / 2 - 1, w, 2, 1);
  ctx.fill();
}

/** Panjabi tunic — cream kurta over the belly with side slits + buttons. */
function texPanjabi(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#fffdf7");
  g.addColorStop(0.55, "#f2ead8");
  g.addColorStop(1, "#ddd0b4");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.42, h * 0.02);
  ctx.bezierCurveTo(cx - w * 0.46, h * 0.5, cx - w * 0.4, h * 0.82, cx - w * 0.3, h * 0.99);
  ctx.lineTo(cx + w * 0.3, h * 0.99);
  ctx.bezierCurveTo(cx + w * 0.4, h * 0.82, cx + w * 0.46, h * 0.5, cx + w * 0.42, h * 0.02);
  ctx.closePath();
  ctx.fill();
  // center placket
  ctx.strokeStyle = "rgba(160,140,110,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.08);
  ctx.lineTo(cx, h * 0.95);
  ctx.stroke();
  // buttons
  for (let i = 0; i < 4; i++) {
    const by = h * (0.2 + i * 0.18);
    ctx.fillStyle = "#b8a483";
    ctx.beginPath();
    ctx.arc(cx, by, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // collar
  ctx.fillStyle = "rgba(150,125,95,0.35)";
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.16, h * 0.02);
  ctx.lineTo(cx, h * 0.16);
  ctx.lineTo(cx + w * 0.16, h * 0.02);
  ctx.closePath();
  ctx.fill();
}

/** Warm soft bloom behind Nova. */
function texGlow(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.42, w * 0.5);
  g.addColorStop(0, "rgba(255,214,150,0.4)");
  g.addColorStop(0.5, "rgba(255,186,120,0.16)");
  g.addColorStop(1, "rgba(255,170,110,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/* ─────────────────────────── the scene ─────────────────────────── */

const SHOP_PAGE = 3;
const ACT_PAGE = 8;

export class NovaScene extends Phaser.Scene {
  private kidId = "";
  private kidName = "";
  private lang: NovaLang = "en";
  private onBack?: () => void;
  private onPlay?: () => void;
  /** Today's recommended skill (en / bn title) — the greeting shows the plan. */
  private recTitle: string | null = null;
  private recTitleBn: string | null = null;
  private streak = 0;

  private root!: Phaser.GameObjects.Container;
  private glowImg!: Phaser.GameObjects.Image;
  /** #19 — the adopted pet companion floating beside Nova (owl = no companion). */
  private companion!: Phaser.GameObjects.Text;
  private owl!: Phaser.GameObjects.Container;
  private cloud!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Graphics;
  private eyeL!: Phaser.GameObjects.Container;
  private eyeR!: Phaser.GameObjects.Container;
  private irisL!: Phaser.GameObjects.Image;
  private irisR!: Phaser.GameObjects.Image;
  private wingL!: Phaser.GameObjects.Image;
  private wingR!: Phaser.GameObjects.Image;
  private dust: Phaser.GameObjects.Image[] = [];
  private vignette!: Phaser.GameObjects.Image;

  private bubble!: Phaser.GameObjects.Container;
  private bubbleBg!: Phaser.GameObjects.Graphics;
  private bubbleText!: Phaser.GameObjects.Text;
  private bubbleTimer?: Phaser.Time.TimerEvent;

  // top bar
  private backBtn!: Phaser.GameObjects.Container;
  private roomPill!: Phaser.GameObjects.Container;
  private roomPillBg!: Phaser.GameObjects.Graphics;
  private roomPrevBtn!: Phaser.GameObjects.Container;
  private roomNextBtn!: Phaser.GameObjects.Container;
  private roomLabel!: Phaser.GameObjects.Text;
  private walletChip!: Phaser.GameObjects.Image;
  private wallet!: Phaser.GameObjects.Text;
  private walletSub!: Phaser.GameObjects.Text;
  private careBadge!: Phaser.GameObjects.Text; // #1192 — 🐾 care coins, distinct from 🪙
  private streakStrip!: Phaser.GameObjects.Container;
  private streakText!: Phaser.GameObjects.Text;
  private streakDots: Phaser.GameObjects.Image[] = [];
  // 🏅 #332 learning-style badge — a fun pill under the streak.
  private styleBadge!: Phaser.GameObjects.Container;
  private styleBadgeBg!: Phaser.GameObjects.Graphics;
  private styleBadgeText!: Phaser.GameObjects.Text;

  // #765 — kid-facing daily quest chip + claimable 7-day calendar tile,
  // mirrored from Home so the pet room is the same "come back daily" home.
  private questChip!: Phaser.GameObjects.Container;
  private questChipBg!: Phaser.GameObjects.Graphics;
  private questChipText!: Phaser.GameObjects.Text;
  private calTile!: Phaser.GameObjects.Container;
  private calTileBg!: Phaser.GameObjects.Graphics;
  private calCells: Phaser.GameObjects.Text[] = [];
  // #768 — streak-freeze token count, tucked right after the streak dots.
  private freezePill!: Phaser.GameObjects.Text;
  // #766 — "Nova missed you" shown once per scene visit, never nagging.
  private missedYouSpoken = false;

  // outfit on Nova's body
  private outfitNodes: Record<string, Phaser.GameObjects.GameObject[]> = {};

  // device safe-area insets (px). The canvas is full-bleed now (edge-to-edge,
  // under notches/home-indicator) — the scene offsets its own top bar / dock
  // so they stay clear of the notch & home indicator on real phones.
  private topInset = 0;
  private bottomInset = 0;

  // bottom action cluster
  private affLine!: Phaser.GameObjects.Graphics;
  private dock!: Phaser.GameObjects.Container;
  private dockBg!: Phaser.GameObjects.Image;
  private cta!: Phaser.GameObjects.Container;
  private shine!: Phaser.GameObjects.Image;
  private ctaCoin!: Phaser.GameObjects.Text;
  private ctaSub!: Phaser.GameObjects.Text;
  private feedFab!: Phaser.GameObjects.Container;
  private careFab!: Phaser.GameObjects.Container;
  private shopFab!: Phaser.GameObjects.Container;
  private funFab!: Phaser.GameObjects.Container;
  /** #19 — opens the pet-species adopt sheet. */
  private speciesFab!: Phaser.GameObjects.Container;

  // rooms
  private roomIdx = 0;
  private roomBackdrop!: Phaser.GameObjects.Image;
  private roomAmbient: Phaser.GameObjects.Text[] = [];
  /** True mid-room-fade so rapid swipes can't skip rooms erratically. */
  private roomSwitching = false;
  /** First room flip ever → hides the one-time swipe nudge for good. */
  private static swipedRooms = false;

  // one-time "swipe to explore" nudge under Nova
  private swipeHint!: Phaser.GameObjects.Container;
  private swipeHintBg!: Phaser.GameObjects.Graphics;
  private swipeHintChevL!: Phaser.GameObjects.Text;
  private swipeHintChevR!: Phaser.GameObjects.Text;
  private swipeHintLabel!: Phaser.GameObjects.Text;
  private swipeHintTimer?: Phaser.Time.TimerEvent;
  private static swipeHintDismissed = false;

  // shop sheet
  private shopPanel!: Phaser.GameObjects.Container;
  private shopDim!: Phaser.GameObjects.Rectangle;
  private shopCard!: Phaser.GameObjects.Graphics;
  private shopTitleText!: Phaser.GameObjects.Text;
  private shopCloseText!: Phaser.GameObjects.Text;
  private shop!: Phaser.GameObjects.Container;
  private shopPrevBtn!: Phaser.GameObjects.Container;
  private shopNextBtn!: Phaser.GameObjects.Container;
  private shopDots: Phaser.GameObjects.Image[] = [];
  private shopPage = 0;
  private shopPages = 1;
  private shopTargetY = 0;

  // #19 — pet species sheet (adopt a new friend once a growth milestone is reached)
  private speciesPanel!: Phaser.GameObjects.Container;
  private speciesDim!: Phaser.GameObjects.Rectangle;
  private speciesCard!: Phaser.GameObjects.Graphics;
  private speciesTitleText!: Phaser.GameObjects.Text;
  private speciesCloseText!: Phaser.GameObjects.Text;
  private species!: Phaser.GameObjects.Container;
  private speciesTargetY = 0;

  // fun sheet
  private actPanel!: Phaser.GameObjects.Container;
  private actDim!: Phaser.GameObjects.Rectangle;
  private actCard!: Phaser.GameObjects.Graphics;
  private actTitleText!: Phaser.GameObjects.Text;
  private actCloseText!: Phaser.GameObjects.Text;
  private actPrevBtn!: Phaser.GameObjects.Container;
  private actNextBtn!: Phaser.GameObjects.Container;
  private actDots: Phaser.GameObjects.Image[] = [];
  private actPage = 0;
  private actPages = 1;
  private actTargetY = 0;
  private actCards: Phaser.GameObjects.Container[] = [];

  // animation helpers
  private baseX = 0;
  private baseY = 0;
  private baseScale = 1;

  private blinkTimer?: Phaser.Time.TimerEvent;
  private headTimer?: Phaser.Time.TimerEvent;
  private wingTimer?: Phaser.Time.TimerEvent;
  private idleTimer?: Phaser.Time.TimerEvent;
  private dozing = false;
  private zzz?: Phaser.GameObjects.Text;
  private touched = false;

  private unsub?: () => void;

  constructor() {
    super("Nova");
  }

  private t() {
    return NOVA_T[this.lang];
  }

  /** #278 — the current locale's active festival key (null off-season). */
  private festivalKey(): string | null {
    return currentFestival()?.key ?? null;
  }

  /** #278 — localized festival label for the shop lock badge. */
  private festivalLabel(key: string): string {
    if (key === "eid_fitr") return this.t().festEid;
    if (key === "boishakh") return this.t().festBoishakh;
    return key;
  }

  create(data: {
    kidId: string;
    kidName: string;
    onBack?: () => void;
    onPlay?: () => void;
    recTitle?: string | null;
    recTitleBn?: string | null;
    streak?: number;
  }) {
    this.kidId = data?.kidId ?? "";
    this.kidName = data?.kidName ?? "";
    this.onBack = data?.onBack;
    this.onPlay = data?.onPlay;
    this.recTitle = data?.recTitle ?? null;
    this.recTitleBn = data?.recTitleBn ?? null;
    this.streak = data?.streak ?? 0;
    this.lang = getAppLang() === "bn" ? "bn" : "en";
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => cancelSpeech());

    this.buildTopBar();
    this.buildStyleBadge();
    this.buildDailyStrip();
    this.buildRoom(this.roomIdx);
    // KID GESTURE — swipe LEFT/RIGHT on the open canvas flips the room.
    // Swipes that start ON a tappable thing (Nova, dock, chevrons, an open
    // sheet's dim) are taps and left alone; only open-canvas swipes flip.
    this.buildSwipeHint();
    enableSwipeRooms(this, (dir) => {
      if (this.shopPanel.visible || this.speciesPanel.visible || this.actPanel.visible) return; // a sheet is open — that press was its close
      this.poke();
      this.setRoom(dir);
      if (!NovaScene.swipedRooms) {
        NovaScene.swipedRooms = true;
        this.hideSwipeHint();
      }
      this.say(t("roomFlipped"), 1600);
    }, { ignoreStart: () => this.shopPanel.visible || this.speciesPanel.visible || this.actPanel.visible });
    makeTex(this, "nv-grad-Nova", 4, 4, (ctx) => {
      ctx.fillStyle = "#2b1e6d";
      ctx.fillRect(0, 0, 4, 4);
    });

    this.cloud = this.add.image(0, 0, makeTex(this, "nv-cloud", 380, 140, texCloud)).setDepth(5).setAlpha(0.6);
    this.shadow = this.add.graphics().setDepth(6);
    this.spawnDust();
    this.buildVignette();

    this.buildOwl();
    this.buildBubble();
    this.buildBottomDock();
    this.buildShopSheet();
    this.buildSpeciesSheet();
    this.buildActSheet();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    const teardown = () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.dust.forEach((d) => this.tweens.killTweensOf(d));
      this.dust.forEach((d) => d.destroy());
      this.dust = [];
      this.roomAmbient.forEach((t) => this.tweens.killTweensOf(t));
      this.roomAmbient.forEach((t) => t.destroy());
      this.roomAmbient = [];
      this.swipeHintTimer?.remove();
      this.swipeHintTimer = undefined;
      if (this.swipeHint) {
        this.tweens.killTweensOf(this.swipeHintChevL);
        this.tweens.killTweensOf(this.swipeHintChevR);
        this.tweens.killTweensOf(this.swipeHint);
        this.swipeHint.destroy();
      }
      this.unsub?.();
      this.unsub = undefined;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
    this.events.once(Phaser.Scenes.Events.DESTROY, teardown);
    this.layout();

    this.unsub = useKidStore.subscribe(() => this.refresh());
    this.refresh();

    this.startIdleAnimations();
    this.resetIdleTimer();
    this.entrance();

    const T = this.t();
    const name = this.kidName || "friend";
    if (this.recTitle) {
      // TODAY'S PLAN greeting — the app never says "pick something", it says
      // "here's what we're doing today" by name + streak, like a coach.
      const plan = this.lang === "bn" ? this.recTitleBn || this.recTitle : this.recTitle;
      this.say(T.morning(name, this.streak, plan), 3400);
      this.time.delayedCall(3600, () => {
        if (!this.touched && !this.dozing) this.say(T.tapHint, 2000);
      });
    } else {
      this.say(T.greeting(name), 2600);
      this.time.delayedCall(2800, () => {
        if (!this.touched && !this.dozing) this.say(T.tapHint, 2000);
      });
    }
    // #766 — when affection decayed from missed care days, Nova gently asks the
    // kid to come back and feed her (once per scene visit, after the greeting —
    // never nags, never guilt).
    const novaHere = useKidStore.getState().nova[this.kidId] ?? defaultNova();
    const todayHere = todayIso();
    const careGap = novaHere.careDay && novaHere.careDay !== todayHere
      ? Math.max(0, Math.round((new Date(todayHere).getTime() - new Date(novaHere.careDay).getTime()) / 86400000))
      : 0;
    if (careGap > 1 && (novaHere.affection ?? 0) < 100) {
      this.missedYouSpoken = true;
      this.time.delayedCall(4700, () => {
        if (!this.dozing && !this.touched) this.say(this.t().missedYou, 2600);
      });
    }
    // after the hello, tease the one-time "swipe to explore" nudge — only if
    // no sheet is already open, Nova is awake, and the kid hasn't tapped yet.
    this.time.delayedCall(5000, () => this.showSwipeHint());
  }

  /* ────────────────────────── vignette + rooms ────────────────────────── */

  private buildVignette() {
    const { width: W, height: H } = this.scale;
    const key = "nv-vignette";
    if (this.textures.exists(key)) this.textures.remove(key);
    this.textures.createCanvas(key, Math.max(2, W), Math.max(2, H))!;
    const tex = this.textures.get(key) as Phaser.Textures.CanvasTexture;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, W, H);
    const rg = ctx.createRadialGradient(W / 2, H * 0.44, Math.min(W, H) * 0.34, W / 2, H * 0.5, Math.max(W, H) * 0.72);
    rg.addColorStop(0, "rgba(8,6,20,0)");
    rg.addColorStop(1, "rgba(8,6,20,0.4)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    // gentle bottom grounding shade
    const bg = ctx.createLinearGradient(0, H * 0.78, 0, H);
    bg.addColorStop(0, "rgba(8,6,20,0)");
    bg.addColorStop(1, "rgba(8,6,20,0.34)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    tex.refresh();
    if (!this.vignette) {
      this.vignette = this.add.image(0, 0, key).setOrigin(0).setDepth(1);
    } else {
      this.vignette.setTexture(key);
    }
    this.vignette.setDisplaySize(W, H);
  }

  private buildRoom(idx: number) {
    const room = ROOMS[((idx % ROOMS.length) + ROOMS.length) % ROOMS.length];
    const { width: W, height: H } = this.scale;
    const key = `nv-room-${room.id}`;
    if (this.textures.exists(key)) this.textures.remove(key);
    this.textures.createCanvas(key, Math.max(2, W), Math.max(2, H))!;
    const tex = this.textures.get(key) as Phaser.Textures.CanvasTexture;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, W, H);
    room.draw(ctx, W, H);
    tex.refresh();
    if (!this.roomBackdrop) {
      this.roomBackdrop = this.add.image(0, 0, key).setOrigin(0).setDepth(-1).setDisplaySize(W, H);
    } else {
      this.roomBackdrop.setTexture(key).setDisplaySize(W, H);
    }
    this.roomAmbient.forEach((t) => {
      this.tweens.killTweensOf(t);
      t.destroy();
    });
    this.roomAmbient = [];
    this.spawnRoomAmbient(room.ambient, W, H);
    this.roomLabel.setText(`${room.emoji} ${this.lang === "bn" ? room.nameBn : room.name}`);
  }

  private spawnRoomAmbient(kind: string | undefined, W: number, H: number) {
    if (!kind) return;
    const emojiMap: Record<string, string> = { bubbles: "🫧", fireflies: "✨", stars: "🌟", confetti: "🎉", snow: "❄️" };
    const e = emojiMap[kind] ?? "✨";
    const n = kind === "stars" ? 10 : 6;
    for (let i = 0; i < n; i++) {
      const t = this.add
        .text(Phaser.Math.Between(10, Math.max(11, W - 10)), Phaser.Math.Between(30, H * 0.6), e, txt(15, "#ffffff", { bold: true, shadow: false }))
        .setOrigin(0.5)
        .setDepth(4)
        .setAlpha(Phaser.Math.FloatBetween(0.25, 0.6));
      this.tweens.add({
        targets: t,
        y: (t.y as number) - Phaser.Math.Between(30, 90),
        x: (t.x as number) + Phaser.Math.Between(-14, 14),
        duration: Phaser.Math.Between(3000, 6500),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: i * 200,
      });
      this.roomAmbient.push(t);
    }
  }

  private setRoom(dir: number) {
    if (this.roomSwitching) return; // mid-fade — a fast second swipe shouldn't skip rooms
    const next = (((this.roomIdx + dir) % ROOMS.length) + ROOMS.length) % ROOMS.length;
    if (next === this.roomIdx) return;
    this.roomIdx = next;
    this.roomSwitching = true;
    pop();
    this.tweens.add({ targets: this.cloud, alpha: 0, duration: 160 });
    this.tweens.add({
      targets: this.root,
      alpha: 0,
      y: this.baseY - 24,
      duration: 170,
      onComplete: () => {
        this.buildRoom(this.roomIdx);
        this.tweens.add({ targets: this.root, alpha: 1, y: this.baseY, duration: 300, ease: "Back.easeOut" });
        this.tweens.add({ targets: this.cloud, alpha: 0.6, duration: 300 });
        this.sparkle(this.baseX, this.baseY - 30);
        this.time.delayedCall(320, () => { this.roomSwitching = false; });
      },
    });
  }

  /* ────────────────────────── swipe discoverability nudge ────────────────────────── */

  /** One-time "‹ swipe to explore ›" hint under Nova — fades after a while or
   *  permanently on the kid's first successful room flip. */
  private buildSwipeHint() {
    this.swipeHintLabel = this.add
      .text(0, 0, t("swipeRooms"), txt(12, "#ffffff", { bold: true, shadow: false }))
      .setOrigin(0.5)
      .setAlpha(0.92);
    this.swipeHintChevL = this.add.text(0, 0, "‹", txt(17, NV_GOLD, { bold: true, shadow: false })).setOrigin(0.5);
    this.swipeHintChevR = this.add.text(0, 0, "›", txt(17, NV_GOLD, { bold: true, shadow: false })).setOrigin(0.5);
    this.swipeHintBg = this.add.graphics();
    const w = Math.max(170, this.swipeHintLabel.width + 64);
    this.swipeHintBg.fillStyle(0x0f1935, 0.55);
    this.swipeHintBg.fillRoundedRect(-w / 2, -16, w, 32, 16);
    this.swipeHintBg.lineStyle(1.2, 0xffffff, 0.28);
    this.swipeHintBg.strokeRoundedRect(-w / 2, -16, w, 32, 16);
    this.swipeHint = this.add.container(0, 0, [this.swipeHintBg, this.swipeHintChevL, this.swipeHintLabel, this.swipeHintChevR]).setDepth(410);
    const L = -(this.swipeHintLabel.width / 2 + 18);
    const R = this.swipeHintLabel.width / 2 + 18;
    this.swipeHintChevL.setPosition(L, 0);
    this.swipeHintChevR.setPosition(R, 0);
    this.swipeHint.setVisible(false).setAlpha(0);
    // the chevrons gently reach toward each other — "swipe here" (kept still
    // when reduced motion is on: the static hint still points both ways).
    if (!prefersReducedMotion()) {
      this.tweens.add({ targets: this.swipeHintChevL, x: L + 6, duration: 620, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.tweens.add({ targets: this.swipeHintChevR, x: R - 6, duration: 620, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
  }

  /** The nudge only belongs on an actually-swipeable, awake open canvas. */
  private swipeHintBlocked(): boolean {
    return (
      this.dozing ||
      this.touched ||
      this.shopPanel.visible ||
      this.speciesPanel.visible ||
      this.actPanel.visible
    );
  }

  private showSwipeHint() {
    if (NovaScene.swipedRooms || NovaScene.swipeHintDismissed) return;
    if (this.swipeHintBlocked()) return;
    this.swipeHint.setVisible(true);
    this.swipeHint.setAlpha(0);
    this.tweens.add({ targets: this.swipeHint, alpha: 0.95, duration: 400 });
    this.swipeHintTimer = this.time.delayedCall(9000, () => this.hideSwipeHint());
  }

  private hideSwipeHintIfVisible() {
    if (this.swipeHint?.visible) this.hideSwipeHint();
  }

  private hideSwipeHint() {
    NovaScene.swipeHintDismissed = true;
    this.swipeHintTimer?.remove();
    this.swipeHintTimer = undefined;
    this.tweens.killTweensOf(this.swipeHint);
    this.tweens.add({
      targets: this.swipeHint,
      alpha: 0,
      duration: 380,
      onComplete: () => this.swipeHint.setVisible(false),
    });
  }

  private chevron(glyph: string) {
    const c = this.add.container(0, 0, [this.add.image(0, 0, makeTex(this, `nv-chev-${glyph}`, 36, 36, (ctx, w) => {
      const g = ctx.createLinearGradient(0, 0, 0, w);
      g.addColorStop(0, "rgba(255,255,255,0.22)");
      g.addColorStop(1, "rgba(255,255,255,0.08)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(w / 2, w / 2, w / 2 - 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 22px 'Baloo 2','Nunito',sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(glyph, w / 2, w / 2 + 1);
    }))]).setSize(36, 36);
    c.setInteractive({ useHandCursor: true });
    return c;
  }

  /* ────────────────────────── top bar ────────────────────────── */

  private buildTopBar() {
    this.backBtn = this.add.container(0, 0, [this.add.image(0, 0, makeTex(this, "nv-back", 46, 46, (ctx, w) => {
      const g = ctx.createLinearGradient(0, 0, 0, w);
      g.addColorStop(0, "rgba(14,22,48,0.6)");
      g.addColorStop(1, "rgba(10,16,38,0.5)");
      ctx.fillStyle = g;
      rr(ctx, 1, 1, w - 2, w - 2, 23);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 24px 'Baloo 2','Nunito',sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("‹", w / 2, w / 2 + 1);
    }))]).setDepth(400);
    this.backBtn.setSize(46, 46);
    this.backBtn.setInteractive({ useHandCursor: true });
    this.backBtn.on("pointerdown", () => {
      pop();
      this.onBack?.();
    });

    // room pill: ‹ 🌾 Field › — Graphics-backed so it shrinks on narrow screens
    this.roomPrevBtn = this.chevron("‹");
    this.roomPrevBtn.on("pointerdown", () => this.setRoom(-1));
    this.roomNextBtn = this.chevron("›");
    this.roomNextBtn.on("pointerdown", () => this.setRoom(1));
    this.roomLabel = this.add.text(0, 0, "", txt(14, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5).setDepth(400);
    this.roomPillBg = this.add.graphics();
    this.roomPill = this.add.container(0, 0, [this.roomPillBg, this.roomPrevBtn, this.roomLabel, this.roomNextBtn]).setDepth(400);
    this.roomPill.setSize(1, 40);

    // wallet chip (compact)
    this.walletChip = this.add
      .image(0, 0, makeTex(this, "nv-wallet-chip", 92, 40, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "rgba(16,26,56,0.62)");
        g.addColorStop(1, "rgba(12,20,46,0.5)");
        ctx.fillStyle = g;
        rr(ctx, 1, 1, w - 2, h - 2, 20);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,214,102,0.55)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }))
      .setDepth(400);
    this.wallet = this.add.text(0, 0, "", txt(16, NV_GOLD, { bold: true, shadow: false })).setOrigin(0.5).setDepth(400);
    this.walletSub = this.add.text(0, 0, "", txt(9, "#c9d4ff", { bold: true, shadow: false })).setOrigin(0.5).setDepth(400);
    // #1192 — a tiny 🐾 chip sits left of the wallet so care coins are visibly
    // a SEPARATE reward from learning coins (they never share the daily cap).
    this.careBadge = this.add.text(0, 0, "", txt(11, "#ffc2d9", { bold: true, shadow: false })).setOrigin(0.5).setDepth(400);

    // streak strip: 🔥 3-day streak + dots
    this.streakText = this.add.text(0, 0, "", txt(12, NV_GOLD, { bold: true, shadow: false })).setOrigin(0.5).setDepth(400);
    const dotK = makeTex(this, "nv-dot-s", 10, 10, (ctx, w, h) => {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.44, 0, Math.PI * 2);
      ctx.fill();
    });
    this.streakDots = Array.from({ length: 7 }, () => this.add.image(0, 0, dotK).setDepth(400).setAlpha(0.65));
    this.streakStrip = this.add.container(0, 0, [this.streakText, ...this.streakDots]).setDepth(400);
  }

  /** Redraw the room pill backdrop at a given width (responsive). */
  private redrawRoomPill(w: number) {
    const h = 40;
    this.roomPillBg.clear();
    const g = this.roomPillBg;
    const grad = g.fillGradientStyle(0x101a38, 0x101a38, 0x0c142e, 0x0c142e, 0.62);
    void grad;
    g.fillStyle(0x0f1935, 0.6);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 20);
    g.lineStyle(1.4, 0xffffff, 0.32);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 20);
    g.fillStyle(0xffffff, 0.14);
    g.fillRoundedRect(-w / 2 + 6, -h / 2 + 2, w - 12, 9, 5);
    this.roomPillBg.setDepth(400);
    this.roomPill.setSize(w, h);
    const inner = w / 2 - 22;
    this.roomPrevBtn.setPosition(-inner, 0);
    this.roomNextBtn.setPosition(inner, 0);
  }

  /* ────────────────────────── learning-style badge (#332) ────────────────────────── */

  /** 🏅 A small pill under the streak showing the kid's detected learning style
   *  (⚡ fast / 🐢 steady / 🦉 social) — hidden until Moni has seen enough rounds
   *  to have a real opinion. Fun, kid-safe, offline. */
  private buildStyleBadge() {
    this.styleBadgeText = this.add
      .text(0, 0, "", txt(12, "#ffffff", { bold: true, shadow: false }))
      .setOrigin(0.5)
      .setDepth(401);
    this.styleBadgeBg = this.add.graphics().setDepth(400);
    this.styleBadge = this.add.container(0, 0, [this.styleBadgeBg, this.styleBadgeText]).setDepth(401);
    this.styleBadge.setVisible(false);
  }

  private updateStyleBadge() {
    const profile = useKidStore.getState().moni?.[this.kidId];
    if (!profile || profile.totalRounds < 4) {
      this.styleBadge.setVisible(false);
      return;
    }
    const style: LearningStyle = deriveLearningStyle(profile.style);
    this.styleBadgeText.setText(this.t().styleBadge[style]);
    const w = Math.max(150, this.styleBadgeText.width + 40);
    this.styleBadgeBg.clear();
    this.styleBadgeBg.fillStyle(0x0f1935, 0.6);
    this.styleBadgeBg.fillRoundedRect(-w / 2, -16, w, 32, 16);
    this.styleBadgeBg.lineStyle(1.4, 0xffd166, 0.5);
    this.styleBadgeBg.strokeRoundedRect(-w / 2, -16, w, 32, 16);
    this.styleBadge.setVisible(true);
  }

  /* ────────────────────────── daily hooks (#765/#768) ────────────────────────── */

  /** #765 — the pet room shows the SAME daily hooks as Home: a quest chip
   *  (type rotates per kid/day, tap to hear today's goal) and a compact
   *  7-day login calendar whose "today" tile lights up when claimable after
   *  the first session — tapping it calls novaClaimCalendar.
   *  #768 — the streak-freeze token count rides right on the streak strip. */
  private buildDailyStrip() {
    // freeze token pill — hidden until a token is owned; rides on the streak
    // strip so it moves and scales with the 🔥 line (#768)
    this.freezePill = this.add
      .text(0, 0, "", txt(11, "#9fd7ff", { bold: true, shadow: false }))
      .setOrigin(0.5)
      .setDepth(400)
      .setVisible(false);
    this.streakStrip.add(this.freezePill);

    // quest chip — emoji + progress, tappable for a spoken goal
    this.questChipText = this.add
      .text(0, 0, "", txt(12, "#ffffff", { bold: true, shadow: false }))
      .setOrigin(0.5)
      .setDepth(401);
    this.questChipBg = this.add.graphics().setDepth(400);
    this.questChip = this.add.container(0, 0, [this.questChipBg, this.questChipText]).setDepth(401);
    this.questChip.setSize(220, 34).setInteractive({ useHandCursor: true });
    this.questChip.on("pointerdown", () => this.sayQuestGoal());

    // 7-day calendar tile — one mini cell per cycle day
    const cellW = 26;
    const n = NOVA_CALENDAR_REWARDS.length;
    for (let i = 0; i < n; i++) {
      this.calCells.push(
        this.add
          .text(-((n - 1) * cellW) / 2 + i * cellW, 0, "", txt(10, "#eafaff", { bold: true, shadow: false }))
          .setOrigin(0.5)
          .setDepth(401)
      );
    }
    this.calTileBg = this.add.graphics().setDepth(400);
    this.calTile = this.add.container(0, 0, [this.calTileBg, ...this.calCells]).setDepth(401);
    this.calTile.setSize(n * cellW, 34).setInteractive({ useHandCursor: true });
    this.calTile.on("pointerdown", () => this.claimCalendarTile());
  }

  /** Re-render the quest chip + calendar tile + freeze pill from the store. */
  private refreshDailyStrip() {
    const kidId = this.kidId;
    const nova = useKidStore.getState().nova[kidId] ?? defaultNova();
    const today = todayIso();

    // ── quest chip (#765): progress only counts once today's type is fresh.
    const todayFresh = nova.questDay === today;
    const type: QuestType = todayFresh && nova.questType ? (nova.questType as QuestType) : questTypeFor(kidId, today);
    const progress = todayFresh ? (nova.questProgress ?? (type === "rounds" ? nova.questRounds ?? 0 : 0)) : 0;
    const target = QUEST_TARGETS[type] ?? NOVA_QUEST_TARGET;
    const done = todayFresh ? !!nova.questDone : false;
    this.questChipText.setText(`${done ? "✅" : "🎯"} ${Math.min(progress, target)}/${target}`);
    const qw = Math.max(92, this.questChipText.width + 36);
    this.questChipBg.clear();
    this.questChipBg.fillStyle(done ? 0x1e5f43 : 0x0f1935, 0.75);
    this.questChipBg.fillRoundedRect(-qw / 2, -17, qw, 34, 17);
    this.questChipBg.lineStyle(1.4, done ? 0x8ef0b0 : 0xffd166, done ? 0.6 : 0.45);
    this.questChipBg.strokeRoundedRect(-qw / 2, -17, qw, 34, 17);

    // ── calendar tile (#765): claimable only after today's first session.
    const playedToday = nova.lastDay === today;
    const pos = playedToday
      ? calendarCycleDay(nova.streak)
      : nova.lastDay === dayIsoAgo(1)
        ? calendarCycleDay(nova.streak + 1) // today would extend the streak → next tile
        : 1; // missed a day → fresh restart at day 1
    const claimable = playedToday && nova.calendarDay !== today;
    const claimedToday = nova.calendarDay === today;
    const capFull = nova.earnDay === today && (nova.earnedToday ?? 0) >= NOVA_DAILY_CAP;
    this.calCells.forEach((c, i) => {
      const day = i + 1;
      const isToday = day === pos;
      const state = isToday && claimable ? "claim" : day < pos || claimedToday ? "done" : isToday ? "wait" : "future";
      if (state === "claim") {
        c.setText(`🪙${bnNum(NOVA_CALENDAR_REWARDS[i])}`).setColor("#052e3f");
      } else if (state === "done") {
        c.setText("✓").setColor("#9fd7ff");
      } else if (state === "wait") {
        c.setText(`🪙${bnNum(NOVA_CALENDAR_REWARDS[i])}`).setColor("#ffe08a");
      } else {
        c.setText("🔒").setColor("#8aa0c8");
      }
    });
    this.calTileBg.clear();
    const cw = NOVA_CALENDAR_REWARDS.length * 26 + 14;
    this.calTileBg.fillStyle(0x0f1935, 0.55);
    this.calTileBg.fillRoundedRect(-cw / 2, -17, cw, 34, 17);
    this.calTileBg.lineStyle(1.4, claimable ? 0x8ef0b0 : 0xffffff, claimable ? 0.6 : 0.3);
    this.calTileBg.strokeRoundedRect(-cw / 2, -17, cw, 34, 17);
    // Pulse while claimable — a gentle "tap me" beat (and when the day's cap is
    // already full, hold the calm glow so a waiting bonus reads as WAITING).
    this.tweens.killTweensOf(this.calTile);
    if (claimable && !capFull) {
      this.tweens.add({ targets: this.calTile, scale: 1.05, duration: 320, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    } else {
      this.calTile.setScale(1);
    }

    // ── freeze pill (#768) — sits right after the streak dots.
    const freezes = nova.freezes ?? 0;
    this.freezePill.setText(`🧊 ${bnNum(freezes)}`);
    this.freezePill.setVisible(freezes > 0);
    this.freezePill.setPosition(this.streakText.width / 2 + 12 + 7 * 13 + 10, 0);
  }

  /** Tap the quest chip → speak today's goal (offline, kid-safe). */
  private sayQuestGoal() {
    const kidId = this.kidId;
    const nova = useKidStore.getState().nova[kidId] ?? defaultNova();
    const today = todayIso();
    const todayFresh = nova.questDay === today;
    const type: QuestType = todayFresh && nova.questType ? (nova.questType as QuestType) : questTypeFor(kidId, today);
    const progress = todayFresh ? (nova.questProgress ?? (type === "rounds" ? nova.questRounds ?? 0 : 0)) : 0;
    const target = QUEST_TARGETS[type] ?? NOVA_QUEST_TARGET;
    const done = todayFresh ? !!nova.questDone : false;
    const label = this.t().questType[type];
    pop();
    if (done) this.say(this.t().questDoneSpeak(label), 2200);
    else this.say(this.t().questSpeak(label, Math.min(progress, target), target), 2400);
  }

  /** Tap the calendar tile → claim today's bonus (novaClaimCalendar). */
  private claimCalendarTile() {
    const kidId = this.kidId;
    const today = todayIso();
    const beforeFreezes = useKidStore.getState().nova[kidId]?.freezes ?? 0;
    const add = useKidStore.getState().novaClaimCalendar(kidId);
    const afterFreezes = useKidStore.getState().nova[kidId]?.freezes ?? 0;
    const token = afterFreezes > beforeFreezes;
    if (add > 0 || token) {
      pop();
      this.refresh();
      if (token) {
        this.burstEmoji("🧊", 4, 22);
        this.say(this.t().calFreezeSpeak, 2400);
      } else {
        this.floatCoin(`+${add} 🪙`);
        this.say(this.t().calSpeak(add), 2000);
      }
      return;
    }
    // Not claimable — explain gently instead of a silent tap.
    const nova = useKidStore.getState().nova[kidId] ?? defaultNova();
    if (nova.calendarDay === today) return; // already claimed today — nothing to say
    if (nova.lastDay !== today) {
      this.say(this.t().calNotReady, 1800);
      return;
    }
    if (nova.earnDay === today && (nova.earnedToday ?? 0) >= NOVA_DAILY_CAP) {
      this.say(this.t().calCapSpeak, 2400);
    }
  }

  /* ────────────────────────── build pieces ────────────────────────── */

  private buildOwl() {
    const bodyK = makeTex(this, "nv-owl-body", 300, 340, texBody);
    const faceK = makeTex(this, "nv-owl-face", 200, 180, texFace);
    const whiteK = makeTex(this, "nv-owl-eye", 96, 96, texEyeWhite);
    const irisK = makeTex(this, "nv-owl-iris", 78, 78, texIris);
    const beakK = makeTex(this, "nv-owl-beak", 54, 42, texBeak);
    const wingK = makeTex(this, "nv-owl-wing", 190, 200, texWing);
    const tuftK = makeTex(this, "nv-owl-tuft", 54, 64, texTuft);

    const tuftL = this.add.image(-52, -198, tuftK).setAngle(-10);
    const tuftR = this.add.image(52, -198, tuftK).setAngle(10).setScale(-1, 1);

    // folded wings hug the body sides — outer scalloped edge peeks out
    this.wingL = this.add.image(-92, -6, wingK);
    this.wingR = this.add.image(92, -6, wingK).setScale(-1, 1);

    const body = this.add.image(0, -24, bodyK);
    const face = this.add.image(0, -132, faceK);

    this.eyeL = this.add.container(-46, -148, [this.add.image(0, 0, whiteK), (this.irisL = this.add.image(0, 0, irisK))]);
    this.eyeR = this.add.container(46, -148, [this.add.image(0, 0, whiteK), (this.irisR = this.add.image(0, 0, irisK))]);

    const beak = this.add.image(0, -92, beakK);

    // outfit accessories — drawn onto Nova's body (front items render on top)
    const emojiOn = (emoji: string, x: number, y: number, size: number, key: string) => {
      const t = this.add
        .text(x, y, emoji, txt(size, "#ffffff", { bold: true, shadow: false }))
        .setOrigin(0.5)
        .setDepth(20)
        .setVisible(false);
      this.outfitNodes[key] = [...(this.outfitNodes[key] ?? []), t];
      return t;
    };

    // back layer (render behind body): cape + backpack
    this.outfitNodes["cape"] = [this.add.image(0, 10, makeTex(this, "nv-outfit-cape", 380, 300, texCape)).setDepth(-2).setVisible(false)];
    const bpBag = this.add.image(0, -245, makeTex(this, "nv-outfit-backpack", 150, 160, texBackpack)).setDepth(-1).setVisible(false);
    const bpStrapL = this.add.image(-44, 46, makeTex(this, "nv-outfit-strap", 18, 110, texStrap)).setDepth(20).setVisible(false).setAngle(4);
    const bpStrapR = this.add.image(44, 46, makeTex(this, "nv-outfit-strap", 18, 110, texStrap)).setDepth(20).setVisible(false).setAngle(-4);
    this.outfitNodes["backpack"] = [bpBag, bpStrapL, bpStrapR];

    // front layer (render on top of body/face)
    emojiOn("🎩", 0, -222, 34, "hat");
    emojiOn("🎀", -60, -188, 32, "bow");
    emojiOn("🕶️", 0, -150, 30, "glasses");
    emojiOn("🧣", 0, -60, 30, "scarf");
    this.outfitNodes["panjabi"] = [this.add.image(0, 12, makeTex(this, "nv-outfit-panjabi", 190, 130, texPanjabi)).setDepth(15).setVisible(false)];
    emojiOn("🥾", -38, 130, 26, "boots");
    emojiOn("🥾", 38, 130, 26, "boots");

    this.owl = this.add.container(0, 0, [
      ...this.outfitNodes["cape"],
      bpBag,
      tuftL,
      tuftR,
      this.wingL,
      this.wingR,
      body,
      this.outfitNodes["panjabi"][0],
      face,
      this.eyeL,
      this.eyeR,
      beak,
      ...this.outfitNodes["hat"],
      ...this.outfitNodes["bow"],
      ...this.outfitNodes["glasses"],
      ...this.outfitNodes["scarf"],
      ...this.outfitNodes["boots"],
      bpStrapL,
      bpStrapR,
    ]);
    this.glowImg = this.add.image(0, -20, makeTex(this, "nv-owl-glow", 380, 340, texGlow));
    // #19 — a tiny adopted pet floats beside Nova (owl starter → hidden; a
    // bobbing companion for cat/peacock/dragon). Updated in refresh().
    this.companion = this.add.text(0, 0, "", txt(30, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    this.companion.setVisible(false);
    this.root = this.add.container(0, 0, [this.glowImg, this.owl, this.companion]).setDepth(10);
    this.root.setSize(320, 400);
    this.root.setInteractive({ useHandCursor: true });
    this.root.on("pointerdown", () => this.onTap());

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.dozing) return;
      const mL = this.eyeL.getWorldTransformMatrix();
      const mR = this.eyeR.getWorldTransformMatrix();
      // socket r48 / iris r36 → keep the amber inside the dark socket (max ~11)
      const track = (m: Phaser.GameObjects.Components.TransformMatrix, iris: Phaser.GameObjects.Image) => {
        iris.setPosition(Phaser.Math.Clamp(p.x - m.tx, -11, 11), Phaser.Math.Clamp(p.y - m.ty, -8, 8));
      };
      track(mL, this.irisL);
      track(mR, this.irisR);
    });
  }

  private buildBubble() {
    this.bubbleBg = this.add.graphics();
    this.bubbleText = this.add.text(0, 0, "", txt(15, "#1f1c3c", { bold: true, shadow: false })).setOrigin(0.5);
    this.bubble = this.add.container(0, 0, [this.bubbleBg, this.bubbleText]).setDepth(6000).setVisible(false);
  }

  private buildBottomDock() {
    // affection hairline
    this.affLine = this.add.graphics().setDepth(300);

    // floating dark action panel behind the cluster
    this.dockBg = this.add.image(0, 0, makeTex(this, "nv-dock-bg", 430, 124, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(12,20,46,0.92)");
      g.addColorStop(1, "rgba(8,14,34,0.9)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(2, 2, w - 4, h - 4, 30);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.roundRect(6, 4, w - 12, 22, 12);
      ctx.fill();
    })).setDepth(300);

    // primary CTA — promising: glow, shine sweep, coin chip, sub-line
    const ctaK = makeTex(this, "nv-cta-lg", 300, 78, (ctx, w, h) => {
      ctx.shadowColor = "rgba(120,220,255,0.7)";
      ctx.shadowBlur = 34;
      ctx.shadowOffsetY = 7;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#9af2ff");
      g.addColorStop(0.5, "#23c8f5");
      g.addColorStop(1, "#0a8fd4");
      ctx.fillStyle = g;
      rr(ctx, 4, 4, w - 8, h - 8, 26);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      ctx.stroke();
      rr(ctx, 18, 8, w - 36, 22, 10);
      ctx.fillStyle = "rgba(255,255,255,0.34)";
      ctx.fill();
      rr(ctx, 4, h - 18, w - 8, 16, 14);
      ctx.fillStyle = "rgba(3,12,34,0.16)";
      ctx.fill();
    });
    this.shine = this.add.image(0, 0, makeTex(this, "nv-shine", 90, 90, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      rr(ctx, 0, 10, w, h - 20, 12);
      ctx.fill();
    })).setDepth(301).setAlpha(0.85);
    const main = this.add.text(0, -13, "🎮 " + this.t().playCta, txt(24, "#052e3f", { bold: true, shadow: false })).setOrigin(0.5).setDepth(301);
    this.ctaSub = this.add.text(0, 16, this.t().playSub, txt(12, "#eafaff", { bold: true, shadow: false })).setOrigin(0.5).setDepth(301);
    this.ctaCoin = this.add.text(0, 0, "", txt(12, "#5a2d00", { bold: true, shadow: false })).setOrigin(0.5).setDepth(301);
    this.cta = this.add
      .container(0, 0, [
        this.add.image(0, 0, ctaK),
        this.shine,
        main,
        this.ctaSub,
        this.add.image(18, -34, makeTex(this, "nv-coin-chip", 64, 24, (ctx, w, h) => {
          const g = ctx.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, "#fff3c8");
          g.addColorStop(1, NV_GOLD);
          ctx.fillStyle = g;
          rr(ctx, 1, 1, w - 2, h - 2, 12);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.8)";
          ctx.lineWidth = 1.4;
          ctx.stroke();
        })),
        this.ctaCoin,
      ])
      .setDepth(300);
    this.cta.setSize(300, 78);
    this.cta.setInteractive({ useHandCursor: true });
    this.cta.on("pointerdown", () => {
      pop();
      this.onPlay?.();
    });
    this.tweens.add({ targets: this.shine, x: { from: -190, to: 190 }, duration: 2200, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: this.cta, scale: { from: 1, to: 1.03 }, duration: 1300, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    // small round FABs — quiet utility row
    this.shopFab = this.roundFab("🛍️");
    this.shopFab.on("pointerdown", () => this.showShop());
    this.speciesFab = this.roundFab("🐣");
    this.speciesFab.on("pointerdown", () => this.showSpecies());
    this.feedFab = this.roundFab("🍎");
    this.feedFab.on("pointerdown", () => this.care("feed"));
    this.careFab = this.roundFab("🎈");
    this.careFab.on("pointerdown", () => this.care("play"));
    this.funFab = this.roundFab("🎉");
    this.funFab.on("pointerdown", () => this.showAct());

    this.dock = this.add
      .container(0, 0, [this.dockBg, this.cta, this.shopFab, this.speciesFab, this.feedFab, this.careFab, this.funFab])
      .setDepth(310);
  }

  private roundFab(emoji: string) {
    const c = this.add.container(0, 0, [
      this.add.image(0, 0, makeTex(this, `nv-fab-${emoji}`, 54, 54, (ctx, w) => {
        const g = ctx.createLinearGradient(0, 0, 0, w);
        g.addColorStop(0, "rgba(16,26,56,0.66)");
        g.addColorStop(1, "rgba(12,20,46,0.5)");
        ctx.fillStyle = g;
        rr(ctx, 1, 1, w - 2, w - 2, w / 2 - 1);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        rr(ctx, 9, 4, w - 18, 12, 6);
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.fill();
      })),
      this.add.text(0, 0, emoji, txt(24, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5),
    ]).setSize(54, 54).setDepth(301);
    c.setInteractive({ useHandCursor: true });
    c.on("pointerdown", () => this.tweens.add({ targets: c, scale: 0.9, duration: 80, yoyo: true }));
    return c;
  }

  /* ────────────────────────── bottom-sheet panels ────────────────────────── */

  private buildShopSheet() {
    this.shopPanel = this.add.container(0, 0).setDepth(5000).setVisible(false);
    this.shopDim = this.add.rectangle(0, 0, 10, 10, 0x04060f, 0.62).setOrigin(0).setInteractive();
    this.shopDim.on("pointerdown", () => this.hideShop());
    this.shopCard = this.add.graphics();
    this.shopTitleText = this.add.text(0, 0, this.t().shopTitle, txt(20, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    this.shopCloseText = this.add.text(0, 0, this.t().close, txt(22, "#c9d4ff", { bold: true, shadow: false })).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.shopCloseText.on("pointerdown", () => this.hideShop());
    this.shop = this.add.container(0, 0);
    this.shopPrevBtn = this.chevron("‹");
    this.shopPrevBtn.on("pointerdown", () => this.paginateShop(-1));
    this.shopNextBtn = this.chevron("›");
    this.shopNextBtn.on("pointerdown", () => this.paginateShop(1));
    this.shopPages = Math.ceil(NOVA_OUTFITS.length / SHOP_PAGE);
    this.shopPanel.add([this.shopDim, this.shopCard, this.shopTitleText, this.shopCloseText, this.shop, this.shopPrevBtn, this.shopNextBtn]);
  }

  private buildActSheet() {
    this.actPanel = this.add.container(0, 0).setDepth(5000).setVisible(false);
    this.actDim = this.add.rectangle(0, 0, 10, 10, 0x04060f, 0.62).setOrigin(0).setInteractive();
    this.actDim.on("pointerdown", () => this.hideAct());
    this.actCard = this.add.graphics();
    this.actTitleText = this.add.text(0, 0, this.t().funTitle, txt(20, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    this.actCloseText = this.add.text(0, 0, this.t().close, txt(22, "#c9d4ff", { bold: true, shadow: false })).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.actCloseText.on("pointerdown", () => this.hideAct());
    this.actPrevBtn = this.chevron("‹");
    this.actPrevBtn.on("pointerdown", () => this.paginateAct(-1));
    this.actNextBtn = this.chevron("›");
    this.actNextBtn.on("pointerdown", () => this.paginateAct(1));
    this.actPages = Math.ceil(ACTIVITIES.length / ACT_PAGE);
    this.actPanel.add([this.actDim, this.actCard, this.actTitleText, this.actCloseText, this.actPrevBtn, this.actNextBtn]);
  }

  private showShop() {
    this.poke();
    if (this.shopPanel.visible) return;
    this.hideSwipeHintIfVisible();
    this.hideAct(true);
    this.shopPanel.setVisible(true);
    this.shopPanel.setAlpha(1).setPosition(this.shopPanel.x, this.shopTargetY + 90);
    this.tweens.add({ targets: this.shopPanel, y: this.shopTargetY, duration: 300, ease: "Back.easeOut" });
    this.renderShopPage();
  }

  private hideShop(instant = false) {
    if (!this.shopPanel.visible) return;
    if (instant) {
      this.shopPanel.setVisible(false);
      return;
    }
    this.tweens.add({
      targets: this.shopPanel,
      y: this.shopPanel.y + 90,
      alpha: 0,
      duration: 200,
      ease: "Sine.easeIn",
      onComplete: () => this.shopPanel.setVisible(false),
    });
  }

  private showAct() {
    this.poke();
    if (this.actPanel.visible) return;
    this.hideSwipeHintIfVisible();
    this.hideShop(true);
    this.actPanel.setVisible(true);
    this.actPanel.setAlpha(1).setPosition(this.actPanel.x, this.actTargetY + 90);
    this.tweens.add({ targets: this.actPanel, y: this.actTargetY, duration: 300, ease: "Back.easeOut" });
    this.renderActPage();
  }

  private hideAct(instant = false) {
    if (!this.actPanel.visible) return;
    if (instant) {
      this.actPanel.setVisible(false);
      return;
    }
    this.tweens.add({
      targets: this.actPanel,
      y: this.actPanel.y + 90,
      alpha: 0,
      duration: 200,
      ease: "Sine.easeIn",
      onComplete: () => this.actPanel.setVisible(false),
    });
  }

  private paginateShop(dir: number) {
    this.shopPage = (((this.shopPage + dir) % this.shopPages) + this.shopPages) % this.shopPages;
    pop();
    this.renderShopPage();
  }

  private paginateAct(dir: number) {
    this.actPage = (((this.actPage + dir) % this.actPages) + this.actPages) % this.actPages;
    pop();
    this.renderActPage();
  }

  private shopButton(outfit: NovaOutfit) {
    const st = useKidStore.getState();
    const nova = st.nova[this.kidId] ?? defaultNova();
    const has = nova.owned.includes(outfit.id);
    const wearing = nova.equipped === outfit.id;
    const afford = nova.coins >= outfit.cost;

    const cardK = makeTex(this, "nv-shop-card", 116, 118, (ctx, w, h) => {
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 5;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(255,255,255,0.96)");
      g.addColorStop(1, "rgba(240,244,252,0.92)");
      ctx.fillStyle = g;
      rr(ctx, 2, 2, w - 4, h - 4, 20);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    });
    // #278 — seasonal outfits are locked (teaser) outside their festival window.
    const seasonalLocked = !!outfit.festival && outfit.festival !== this.festivalKey();
    const face = this.add.image(0, 0, cardK);
    face.setTint(wearing ? 0xffd166 : has ? 0xbdf0d0 : afford && !seasonalLocked ? 0xdceeff : 0xd4dbe6);

    const tile = this.add.image(0, -28, makeTex(this, "nv-shop-tile", 54, 54, (ctx, w) => {
      const g = ctx.createLinearGradient(0, 0, 0, w);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(1, "rgba(235,240,250,0.9)");
      ctx.fillStyle = g;
      rr(ctx, 1, 1, w - 2, w - 2, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(210,220,240,0.9)";
      ctx.lineWidth = 1.3;
      ctx.stroke();
    })).setDepth(301);
    const emoji = this.add.text(0, -28, outfit.emoji, txt(26, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5).setDepth(302);

    const name = this.lang === "bn" ? outfit.nameBn : outfit.name;
    const state = wearing
      ? `✅ ${this.t().wearing}`
      : has
        ? this.t().wear
        : seasonalLocked
          ? `🔒 ${this.t().seasonal(this.festivalLabel(outfit.festival!))}`
          : `🪙 ${outfit.cost}`;
    const stateColor = wearing ? "#8a5a00" : has ? "#0c7a3d" : afford && !seasonalLocked ? "#0b4f7a" : "#7c8898";

    const c = this.add.container(0, 0, [
      face,
      tile,
      emoji,
      this.add.text(0, 16, name, txt(11, "#23203f", { bold: true, shadow: false, wrap: 100 })).setOrigin(0.5).setDepth(301),
      this.add.text(0, 44, state, txt(13, stateColor, { bold: true, shadow: false })).setOrigin(0.5).setDepth(301),
    ]).setDepth(300);
    c.setSize(116, 118);
    c.setInteractive({ useHandCursor: true });
    c.on("pointerdown", () => {
      this.tweens.add({ targets: c, scale: 0.93, duration: 80, yoyo: true });
      if (has) this.equip(outfit);
      else this.buy(outfit);
    });
    return c;
  }

  private actButton(act: ActivityDef) {
    const K = makeTex(this, "nv-act-card", 74, 84, (ctx, w, h) => {
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(255,255,255,0.96)");
      g.addColorStop(1, "rgba(242,246,252,0.94)");
      ctx.fillStyle = g;
      rr(ctx, 2, 2, w - 4, h - 4, 17);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    const c = this.add.container(0, 0, [
      this.add.image(0, 0, K),
      this.add.text(0, -11, act.emoji, txt(26, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5),
      this.add.text(0, 27, this.lang === "bn" ? act.nameBn : act.name, txt(14, "#23203f", { bold: true, shadow: false, wrap: 68 })).setOrigin(0.5),
    ]).setSize(74, 84).setDepth(301);
    c.setInteractive({ useHandCursor: true });
    c.on("pointerdown", () => {
      pop();
      this.hideAct();
      if (act.scene) {
        // full pet mini-game (#104) — launch over a paused Nova, return on close
        this.scene.launch(act.scene, {
          kidId: this.kidId,
          kidName: this.kidName,
          onBack: () => this.returnFromMiniGame(act.scene!),
        });
        this.scene.pause("Nova");
      } else {
        this.runActivity(act.id);
      }
    });
    return c;
  }

  /** Mini-game close → back to the (paused) Nova screen. */
  private returnFromMiniGame(key: string) {
    this.scene.stop(key);
    this.scene.resume("Nova");
  }

  private renderShopPage() {
    this.shop.removeAll(true);
    const from = this.shopPage * SHOP_PAGE;
    NOVA_OUTFITS.slice(from, from + SHOP_PAGE).forEach((o, i) => {
      const btn = this.shopButton(o);
      btn.x = (i - (Math.min(SHOP_PAGE, NOVA_OUTFITS.length - from) - 1) / 2) * 132;
      this.shop.add(btn);
    });
    this.updateDots(this.shopPanel, this.shopDots, this.shopPages, this.shopPage, 116, this.shopPrevBtn, this.shopNextBtn);
  }

  /* ────────────────────────── pet species sheet (#19) ────────────────────────── */

  private buildSpeciesSheet() {
    this.speciesPanel = this.add.container(0, 0).setDepth(5000).setVisible(false);
    this.speciesDim = this.add.rectangle(0, 0, 10, 10, 0x04060f, 0.62).setOrigin(0).setInteractive();
    this.speciesDim.on("pointerdown", () => this.hideSpecies());
    this.speciesCard = this.add.graphics();
    this.speciesTitleText = this.add.text(0, 0, this.t().speciesTitle, txt(20, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5);
    this.speciesCloseText = this.add.text(0, 0, this.t().close, txt(22, "#c9d4ff", { bold: true, shadow: false })).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.speciesCloseText.on("pointerdown", () => this.hideSpecies());
    this.species = this.add.container(0, 0);
    this.speciesPanel.add([this.speciesDim, this.speciesCard, this.speciesTitleText, this.speciesCloseText, this.species]);
  }

  private showSpecies() {
    this.poke();
    if (this.speciesPanel.visible) return;
    this.hideSwipeHintIfVisible();
    this.hideShop(true);
    this.hideAct(true);
    this.speciesPanel.setVisible(true);
    this.speciesPanel.setAlpha(1).setPosition(this.speciesPanel.x, this.speciesTargetY + 90);
    this.tweens.add({ targets: this.speciesPanel, y: this.speciesTargetY, duration: 300, ease: "Back.easeOut" });
    this.renderSpeciesPage();
  }

  private hideSpecies(instant = false) {
    if (!this.speciesPanel.visible) return;
    if (instant) {
      this.speciesPanel.setVisible(false);
      return;
    }
    this.tweens.add({
      targets: this.speciesPanel,
      y: this.speciesPanel.y + 90,
      alpha: 0,
      duration: 200,
      ease: "Sine.easeIn",
      onComplete: () => this.speciesPanel.setVisible(false),
    });
  }

  private speciesButton(sp: NovaSpecies) {
    const st = useKidStore.getState();
    const nova = st.nova[this.kidId] ?? defaultNova();
    const isCurrent = nova.species === sp.id;
    const unlocked = nova.petStage >= sp.unlockStage;
    const afford = nova.coins >= sp.cost;

    // the pet's face at THIS growth stage — the adopt sheet previews your friend
    const preview = speciesEmoji(sp.id, nova.petStage);

    const cardK = makeTex(this, `nv-species-card-${sp.id}`, 100, 118, (ctx, w, h) => {
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 5;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(255,255,255,0.96)");
      g.addColorStop(1, "rgba(240,244,252,0.92)");
      ctx.fillStyle = g;
      rr(ctx, 2, 2, w - 4, h - 4, 18);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    });
    const face = this.add.image(0, 0, cardK);
    face.setTint(isCurrent ? 0xffd166 : unlocked && afford ? 0xdceeff : unlocked ? 0xffd9b3 : 0xc9d2df);

    const tile = this.add.image(0, -26, makeTex(this, `nv-species-tile-${sp.id}`, 52, 52, (ctx, w) => {
      const g = ctx.createLinearGradient(0, 0, 0, w);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(1, "rgba(235,240,250,0.9)");
      ctx.fillStyle = g;
      rr(ctx, 1, 1, w - 2, w - 2, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(210,220,240,0.9)";
      ctx.lineWidth = 1.3;
      ctx.stroke();
    })).setDepth(301);
    const emoji = this.add
      .text(0, -26, unlocked ? preview : "🔒", txt(24, "#ffffff", { bold: true, shadow: false }))
      .setOrigin(0.5)
      .setDepth(302);

    const name = this.lang === "bn" ? sp.nameBn : sp.name;
    // state line: current friend / adopt+price / locked milestone
    let state: string;
    let stateColor: string;
    if (isCurrent) {
      state = `✅ ${this.t().adopted}`;
      stateColor = "#8a5a00";
    } else if (!unlocked) {
      state = this.t().locked;
      stateColor = "#7c8898";
    } else if (!afford) {
      state = `🪙 ${sp.cost}`;
      stateColor = "#b3630c";
    } else {
      state = `${this.t().adopt} 🪙${sp.cost}`;
      stateColor = "#0b4f7a";
    }

    const c = this.add.container(0, 0, [
      face,
      tile,
      emoji,
      this.add.text(0, 16, name, txt(10, "#23203f", { bold: true, shadow: false, wrap: 92 })).setOrigin(0.5).setDepth(301),
      this.add.text(0, 44, state, txt(11, stateColor, { bold: true, shadow: false, wrap: 92 })).setOrigin(0.5).setDepth(301),
    ]).setSize(100, 118).setDepth(300);
    c.setInteractive({ useHandCursor: true });
    c.on("pointerdown", () => {
      this.tweens.add({ targets: c, scale: 0.93, duration: 80, yoyo: true });
      this.adoptSpecies(sp, unlocked, afford);
    });
    return c;
  }

  private renderSpeciesPage() {
    this.species.removeAll(true);
    NOVA_SPECIES.forEach((sp, i) => {
      const btn = this.speciesButton(sp);
      btn.x = (i - (NOVA_SPECIES.length - 1) / 2) * 108;
      this.species.add(btn);
    });
  }

  private adoptSpecies(sp: NovaSpecies, unlocked: boolean, afford: boolean) {
    const T = this.t();
    const nova = useKidStore.getState().nova[this.kidId] ?? defaultNova();
    if (nova.species === sp.id) {
      this.say(`${T.adoptedMsg} ${this.lang === "bn" ? sp.nameBn : sp.name}!`, 1600);
      return;
    }
    if (!unlocked) {
      this.say(T.needGrow, 2000);
      return;
    }
    if (!afford) {
      this.say(T.needCoins, 2000);
      return;
    }
    useKidStore.getState().petAdopt(this.kidId, sp.id);
    win();
    this.say(`${T.adoptedMsg} ${this.lang === "bn" ? sp.nameBn : sp.name}!`, 1800);
    this.sparkle(this.baseX + 40, this.baseY - 60);
    this.refresh();
  }

  private renderActPage() {
    this.actCards.forEach((c) => c.destroy());
    this.actCards = [];
    const from = this.actPage * ACT_PAGE;
    ACTIVITIES.slice(from, from + ACT_PAGE).forEach((a, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const c = this.actButton(a);
      c.x = (col - 1.5) * 84;
      c.y = (row - 0.5) * 88 + 34;
      this.actPanel.add(c);
      this.actCards.push(c);
    });
    this.updateDots(this.actPanel, this.actDots, this.actPages, this.actPage, 136, this.actPrevBtn, this.actNextBtn);
  }

  private updateDots(panel: Phaser.GameObjects.Container, dots: Phaser.GameObjects.Image[], pages: number, page: number, y: number, prev: Phaser.GameObjects.Container, next: Phaser.GameObjects.Container) {
    dots.forEach((d) => d.destroy());
    dots.length = 0;
    const dotK = makeTex(this, "nv-dot-s", 10, 10, (ctx, w, h) => {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.44, 0, Math.PI * 2);
      ctx.fill();
    });
    for (let i = 0; i < pages; i++) {
      const d = this.add.image((i - (pages - 1) / 2) * 16, y, dotK).setDepth(302);
      d.setTint(i === page ? 0xffd166 : 0x5a6b8c);
      d.setScale(i === page ? 1.35 : 1);
      panel.add(d);
      dots.push(d);
    }
    prev.setAlpha(pages > 1 ? 1 : 0.35);
    next.setAlpha(pages > 1 ? 1 : 0.35);
  }

  /* ────────────────────────── interactions ────────────────────────── */

  private tapBurst = 0;
  private tapBurstTimer?: Phaser.Time.TimerEvent;

  private onTap() {
    this.touched = true;
    this.resetIdleTimer();
    if (this.dozing) {
      this.wake();
      return;
    }
    // Silly easter egg: 5 quick pats in a row → Nova gets REALLY dizzy + spins
    this.tapBurst += 1;
    if (this.tapBurstTimer) this.tapBurstTimer.remove();
    this.tapBurstTimer = this.time.delayedCall(1200, () => {
      this.tapBurst = 0;
    });
    if (this.tapBurst >= 5) {
      this.tapBurst = 0;
      this.actDizzyEgg();
      return;
    }
    // Tap me to play picks from every activity: quick care reactions AND the
    // full mini-game scenes — the fun panel should never be the only way in.
    const act = ACTIVITIES[Phaser.Math.Between(0, ACTIVITIES.length - 1)];
    if (act.scene) {
      this.scene.launch(act.scene, {
        kidId: this.kidId,
        kidName: this.kidName,
        onBack: () => this.returnFromMiniGame(act.scene!),
      });
      this.scene.pause("Nova");
    } else {
      this.runActivity(act.id);
    }
  }

  /** The secret rapid-pat reaction — full spin, cross-eyes, star-rush. */
  private actDizzyEgg() {
    bad();
    this.shake(8, 80, 6);
    this.tweens.add({ targets: this.root, angle: (this.root.angle ?? 0) + 360, duration: 700, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: this.eyeL, scaleX: 0.5, scaleY: 1.5, duration: 100, yoyo: true, repeat: 5 });
    this.tweens.add({ targets: this.eyeR, scaleX: 0.5, scaleY: 1.5, duration: 100, yoyo: true, repeat: 5 });
    this.burstEmoji("😵", 5, 30);
    this.burstEmoji("⭐", 3, 20);
    this.say(this.t().patDizzy, 2000);
  }

  /** Any kid interaction wakes Nova if she dozed off and restarts the idle
   *  clock — so tapping the feed/play/shop/play FABs never happens on a
   *  sleeping mascot. */
  private poke() {
    this.touched = true;
    this.resetIdleTimer();
    if (this.dozing) this.wake();
  }

  private runActivity(id: string) {
    this.poke();
    switch (id) {
      case "bath": this.actBath(); break;
      case "brush": this.actBrush(); break;
      case "hug": this.actHug(); break;
      case "kiss": this.actKiss(); break;
      case "scritch": this.actScritch(); break;
      case "nap": this.actNap(); break;
      case "fly": this.actFly(); break;
      case "read": this.actRead(); break;
      case "slap": this.actSlap(); break;
      case "laugh": this.actLaugh(); break;
      case "yawn": this.actYawn(); break;
      case "sneeze": this.actSneeze(); break;
      case "dance": this.actDance(); break;
      case "spin": this.actSpin(); break;
      case "wave": this.actWave(); break;
      case "jump": this.actJump(); break;
      case "twirl": this.actTwirl(); break;
      case "wink": this.actWink(); break;
      case "blink": this.actBlink(); break;
      case "grumpy": this.actGrumpy(); break;
      case "happy": this.actHappy(); break;
      case "sad": this.actSad(); break;
      case "scared": this.actScared(); break;
      case "shocked": this.actShocked(); break;
      case "excited": this.actExcited(); break;
      case "sleepy": this.actSleepy(); break;
      case "snore": this.actSnore(); break;
      case "whistle": this.actWhistle(); break;
      case "sing": this.actSing(); break;
      case "heart": this.actHeart(); break;
      case "dizzy": this.actDizzy(); break;
      case "stretch": this.actStretch(); break;
      case "hide": this.actHide(); break;
      case "peek": this.actPeek(); break;
      case "cheer": this.actCheer(); break;
      case "hmm": this.actHmm(); break;
      case "highfive": this.actHighfive(); break;
      case "gobble": this.actGobble(); break;
      case "glow": this.actGlow(); break;
      case "zoom": this.actZoom(); break;
      case "disco": this.actDisco(); break;
    }
  }

  /* ── activity animations ── */

  private shake(amp = 6, dur = 80, pulses = 3) {
    this.tweens.add({ targets: this.root, x: this.baseX + amp, duration: dur, yoyo: true, repeat: Math.max(0, pulses * 2 - 1), ease: "Sine.easeInOut" });
  }

  private tilt(deg: number, dur: number, pulses = 1) {
    this.tweens.add({ targets: this.root, angle: deg, duration: dur, yoyo: true, repeat: Math.max(0, pulses * 2 - 1), ease: "Sine.easeInOut" });
  }

  private pulse(amp: number, times: number, dur: number) {
    this.tweens.add({ targets: this.root, scale: this.baseScale * amp, duration: dur, yoyo: true, repeat: Math.max(0, times * 2 - 1), ease: "Quad.easeInOut" });
  }

  private squintEye(side: "L" | "R", scale = 0.1, dur = 150, reps = 1) {
    const eye = side === "L" ? this.eyeL : this.eyeR;
    this.tweens.add({ targets: eye, scaleY: scale, duration: dur, yoyo: true, repeat: Math.max(0, reps * 2 - 1), ease: "Sine.easeInOut" });
  }

  private bothEyes(scale: number, dur: number, reps = 1) {
    this.tweens.add({ targets: this.eyeL, scaleY: scale, duration: dur, yoyo: true, repeat: Math.max(0, reps * 2 - 1), ease: "Sine.easeInOut" });
    this.tweens.add({ targets: this.eyeR, scaleY: scale, duration: dur, yoyo: true, repeat: Math.max(0, reps * 2 - 1), ease: "Sine.easeInOut" });
  }

  private wingWave(side: "L" | "R", deg: number, reps = 2) {
    const wing = side === "L" ? this.wingL : this.wingR;
    this.tweens.add({ targets: wing, angle: deg, duration: 160, yoyo: true, repeat: Math.max(0, reps * 2 - 1), ease: "Sine.easeInOut" });
  }

  private burstEmoji(e: string, n = 3, size = 24) {
    for (let i = 0; i < n; i++) {
      const t = this.add
        .text(this.baseX + Phaser.Math.Between(-50, 50), this.baseY - 70, e, txt(size, "#ffffff", { bold: true, shadow: false }))
        .setOrigin(0.5)
        .setDepth(9000);
      this.tweens.add({
        targets: t,
        y: (t.y as number) - Phaser.Math.Between(60, 130),
        x: (t.x as number) + Phaser.Math.Between(-44, 44),
        alpha: 0,
        scale: Phaser.Math.FloatBetween(0.6, 1.1),
        duration: Phaser.Math.Between(650, 1100),
        ease: "Quad.easeOut",
        onComplete: () => t.destroy(),
      });
    }
  }

  private actSlap() {
    bad();
    this.shake(7, 70, 4);
    this.tilt(-5, 120, 3);
    this.burstEmoji("💢", 4);
    this.say(this.t().slap, 1600);
  }

  private actLaugh() {
    pop();
    this.pulse(1.1, 4, 220);
    this.tilt(5, 140, 4);
    this.burstEmoji("😂", 3, 28);
    this.say(this.t().laugh, 1600);
  }

  private actYawn() {
    this.squintEye("L", 0.14, 300, 0);
    this.squintEye("R", 0.14, 300, 0);
    this.tweens.add({ targets: this.owl, scaleY: 1.08, duration: 260, yoyo: true, ease: "Sine.easeInOut" });
    this.wingWave("L", -42, 1);
    this.wingWave("R", 42, 1);
    this.time.delayedCall(700, () => this.squintEye("L", 1, 120, 0));
    this.say(this.t().yawn, 1600);
  }

  private actSneeze() {
    win();
    this.pulse(1.15, 2, 140);
    this.shake(5, 60, 2);
    this.burstEmoji("💨", 4);
    this.burstEmoji("🤧", 1, 30);
    this.say(this.t().sneeze, 1500);
  }

  private actDance() {
    pop();
    this.tilt(7, 130, 6);
    this.pulse(1.06, 6, 180);
    this.burstEmoji("🎵", 2, 22);
    this.say(this.t().dance, 1500);
  }

  private actSpin() {
    win();
    this.tweens.add({ targets: this.root, angle: 360, duration: 700, ease: "Sine.easeInOut", onComplete: () => this.root.setAngle(0) });
    this.burstEmoji("🌀", 3);
    this.say(this.t().spin, 1500);
  }

  private actWave() {
    pop();
    this.wingWave("L", -55, 3);
    this.burstEmoji("👋", 2, 26);
    this.say(this.t().wave, 1500);
  }

  private actJump() {
    win();
    this.tweens.add({ targets: this.root, y: { from: this.baseY, to: this.baseY - 60 }, duration: 300, yoyo: true, repeat: 1, ease: "Quad.easeOut" });
    this.tweens.add({ targets: this.shadow, alpha: 0.3, duration: 150, yoyo: true, repeat: 1 });
    this.burstEmoji("⭐", 3);
    this.say(this.t().jump, 1500);
  }

  private actTwirl() {
    win();
    this.tweens.add({ targets: this.root, angle: 720, duration: 900, ease: "Sine.easeInOut", onComplete: () => this.root.setAngle(0) });
    this.burstEmoji("✨", 4, 22);
    this.say(this.t().twirl, 1500);
  }

  private actWink() {
    pop();
    this.squintEye("R", 0.1, 200, 0);
    this.time.delayedCall(500, () => this.squintEye("R", 1, 160, 0));
    this.burstEmoji("😉", 1, 30);
    this.say(this.t().wink, 1500);
  }

  private actBlink() {
    this.bothEyes(0.1, 120, 3);
    this.burstEmoji("😴", 1, 26);
    this.say(this.t().blink, 1500);
  }

  private actGrumpy() {
    bad();
    this.tilt(-6, 300, 1);
    this.squintEye("L", 0.4, 200, 0);
    this.squintEye("R", 0.4, 200, 0);
    this.burstEmoji("😤", 2);
    this.say(this.t().grumpy, 1500);
  }

  private actHappy() {
    pop();
    this.pulse(1.12, 3, 200);
    this.burstEmoji("😄", 2, 26);
    this.say(this.t().happy, 1500);
  }

  private actSad() {
    bad();
    this.tweens.add({ targets: this.root, y: this.baseY + 12, duration: 400, yoyo: true, ease: "Sine.easeInOut" });
    this.squintEye("L", 0.3, 250, 0);
    this.squintEye("R", 0.3, 250, 0);
    this.burstEmoji("😢", 2, 24);
    this.say(this.t().sad, 1500);
  }

  private actScared() {
    bad();
    this.shake(5, 50, 5);
    this.tweens.add({ targets: this.eyeL, scale: 1.6, duration: 120, yoyo: true, repeat: 3 });
    this.tweens.add({ targets: this.eyeR, scale: 1.6, duration: 120, yoyo: true, repeat: 3 });
    this.burstEmoji("💦", 3);
    this.say(this.t().scared, 1500);
  }

  private actShocked() {
    pop();
    this.tweens.add({ targets: this.eyeL, scale: 1.7, duration: 150, yoyo: true });
    this.tweens.add({ targets: this.eyeR, scale: 1.7, duration: 150, yoyo: true });
    this.pulse(1.08, 1, 200);
    this.burstEmoji("😲", 1, 30);
    this.say(this.t().shocked, 1500);
  }

  private actExcited() {
    win();
    this.pulse(1.15, 6, 150);
    this.burstEmoji("⭐", 5, 20);
    this.say(this.t().excited, 1500);
  }

  private actSleepy() {
    this.bothEyes(0.12, 400, 0);
    this.tweens.add({ targets: this.root, angle: 4, duration: 500, yoyo: true });
    this.time.delayedCall(900, () => this.bothEyes(1, 250, 0));
    this.burstEmoji("😪", 1, 28);
    this.say(this.t().sleepy, 1500);
  }

  private actSnore() {
    this.bothEyes(0.1, 500, 0);
    this.burstEmoji("💤", 3, 26);
    this.say(this.t().snore, 1500);
  }

  private actWhistle() {
    win();
    this.tweens.add({ targets: this.owl, scaleX: 1.06, scaleY: 0.96, duration: 160, yoyo: true, repeat: 1 });
    this.burstEmoji("🎶", 2, 24);
    this.say(this.t().whistle, 1500);
  }

  private actSing() {
    win();
    this.pulse(1.06, 4, 260);
    this.burstEmoji("🎤", 2, 26);
    this.burstEmoji("🎵", 2, 20);
    this.say(this.t().sing, 1500);
  }

  private actHeart() {
    win();
    this.pulse(1.08, 2, 240);
    this.burstEmoji("💛", 6, 26);
    this.tweens.add({ targets: this.glowImg, alpha: 0.9, duration: 300, yoyo: true, ease: "Sine.easeInOut" });
    this.say(this.t().heart, 1600);
  }

  private actDizzy() {
    bad();
    this.shake(6, 70, 4);
    this.tweens.add({ targets: this.eyeL, scaleX: 0.6, scaleY: 1.4, duration: 120, yoyo: true, repeat: 3 });
    this.tweens.add({ targets: this.eyeR, scaleX: 0.6, scaleY: 1.4, duration: 120, yoyo: true, repeat: 3 });
    this.burstEmoji("😵", 2, 28);
    this.say(this.t().dizzy, 1600);
  }

  private actStretch() {
    pop();
    this.wingWave("L", -60, 1);
    this.wingWave("R", 60, 1);
    this.tweens.add({ targets: this.root, scaleY: this.baseScale * 1.06, duration: 500, yoyo: true, ease: "Sine.easeInOut" });
    this.say(this.t().stretch, 1500);
  }

  private actHide() {
    pop();
    this.tweens.add({
      targets: this.root,
      y: this.baseY + 60,
      alpha: 0.35,
      duration: 320,
      ease: "Quad.easeIn",
      onComplete: () => {
        this.tweens.add({ targets: this.root, y: this.baseY, alpha: 1, duration: 260, ease: "Back.easeOut" });
      },
    });
    this.say(this.t().peek, 1500);
  }

  private actPeek() {
    pop();
    this.tweens.add({ targets: this.root, alpha: 0, duration: 140, onComplete: () => {
      this.tweens.add({ targets: this.root, y: this.baseY - 26, alpha: 1, duration: 200, ease: "Sine.easeInOut", onComplete: () => {
        this.tweens.add({ targets: this.root, y: this.baseY, duration: 200, ease: "Sine.easeInOut" });
      } });
    } });
    this.burstEmoji("👀", 1, 30);
    this.say(this.t().hide, 1500);
  }

  private actCheer() {
    win();
    this.wingWave("L", -70, 2);
    this.wingWave("R", 70, 2);
    this.pulse(1.1, 3, 200);
    this.burstEmoji("🎉", 4, 24);
    this.say(this.t().cheer, 1500);
  }

  private actHmm() {
    this.tilt(-6, 320, 1);
    this.squintEye("L", 0.5, 220, 0);
    this.time.delayedCall(500, () => this.squintEye("L", 1, 180, 0));
    this.burstEmoji("🤔", 1, 28);
    this.say(this.t().hmm, 1500);
  }

  private actHighfive() {
    win();
    this.wingWave("R", 80, 2);
    this.pulse(1.08, 1, 160);
    this.burstEmoji("✋", 2, 28);
    this.say(this.t().highfive, 1500);
  }

  private actGobble() {
    win();
    this.tweens.add({ targets: this.owl, scaleX: 1.18, scaleY: 0.9, duration: 130, yoyo: true, repeat: 3 });
    this.burstEmoji("😋", 2, 26);
    this.say(this.t().gobble, 1500);
  }

  private actGlow() {
    win();
    this.tweens.add({ targets: this.glowImg, alpha: 0.95, duration: 400, yoyo: true, ease: "Sine.easeInOut" });
    this.burstEmoji("✨", 5, 22);
    this.say(this.t().glow, 1500);
  }

  private actZoom() {
    win();
    const { width: W } = this.scale;
    this.burstEmoji("💨", 4, 26);
    this.tweens.add({
      targets: this.root,
      x: { from: -180, to: W + 180 },
      duration: 900,
      ease: "Sine.easeInOut",
      onComplete: () => this.tweens.add({ targets: this.root, x: this.baseX, duration: 220, ease: "Sine.easeInOut" }),
    });
    this.say(this.t().zoom, 1500);
  }

  private actDisco() {
    win();
    this.pulse(1.1, 8, 130);
    this.tilt(4, 110, 8);
    this.burstEmoji("🪩", 1, 34);
    this.burstEmoji("✨", 4, 18);
    this.tweens.add({ targets: this.glowImg, alpha: 0.9, duration: 200, yoyo: true, repeat: 5 });
    this.say(this.t().disco, 1500);
  }

  /* ── pet-care: Nova is the kid's pet — bath, brush, cuddle, the works ── */

  /** 🛁 Bath time — Nova settles into the tub and bubbles foam up. */
  private actBath() {
    win();
    this.tweens.add({ targets: this.root, y: this.baseY + 14, duration: 260, ease: "Sine.easeInOut" });
    this.tilt(6, 130, 4); // scrub wiggle
    this.burstEmoji("🫧", 5, 26);
    this.time.delayedCall(280, () => this.burstEmoji("🫧", 4, 20));
    this.time.delayedCall(560, () => {
      this.burstEmoji("💦", 3, 18);
      this.burstEmoji("✨", 3, 18);
    });
    this.say(this.t().bath, 1700);
  }

  /** 🪮 Brush — long smooth sweeps, sparkles fly off the feathers. */
  private actBrush() {
    pop();
    this.tweens.add({ targets: this.owl, scaleX: 1.12, scaleY: 0.94, duration: 150, yoyo: true, repeat: 2, ease: "Sine.easeInOut" });
    this.wingWave("L", -34, 3);
    this.time.delayedCall(220, () => this.burstEmoji("✨", 4, 18));
    this.say(this.t().brush, 1500);
  }

  /** 🤗 A big cozy hug — Nova squishes in close. */
  private actHug() {
    win();
    this.pulse(1.16, 3, 180);
    this.tilt(-6, 260, 1);
    this.burstEmoji("🤗", 3, 28);
    this.burstEmoji("💛", 3, 22);
    this.say(this.t().hug, 1600);
  }

  /** 😘 Blow a kiss — hearts drift up from the beak. */
  private actKiss() {
    pop();
    this.tweens.add({ targets: this.owl, scaleX: 1.12, scaleY: 0.92, duration: 120, yoyo: true, repeat: 1 });
    this.burstEmoji("😘", 2, 30);
    this.burstEmoji("💛", 4, 20);
    this.say(this.t().kiss, 1500);
  }

  /** 🫳 Head scritches — Nova leans in, happy squint, gentle bob. */
  private actScritch() {
    pop();
    this.tilt(-8, 300, 1);
    this.squintEye("L", 0.3, 240, 0);
    this.squintEye("R", 0.3, 240, 0);
    this.time.delayedCall(420, () => this.bothEyes(1, 160, 0));
    this.tweens.add({ targets: this.root, y: this.baseY - 8, duration: 150, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
    this.burstEmoji("🫳", 2, 26);
    this.say(this.t().scritch, 1700);
  }

  /** 🛏️ Nap — Nova settles down, dozes off, then wakes with a start. */
  private actNap() {
    this.tweens.add({ targets: this.root, y: this.baseY + 18, duration: 500, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: this.owl, scaleX: 0.96, scaleY: 0.96, duration: 500, ease: "Sine.easeInOut" });
    this.time.delayedCall(160, () => this.bothEyes(0.08, 300, 0));
    this.burstEmoji("🛏️", 1, 30);
    this.burstEmoji("💤", 2, 24);
    this.time.delayedCall(1300, () => {
      this.tweens.add({ targets: this.root, y: this.baseY, duration: 300, ease: "Back.easeOut" });
      this.tweens.add({ targets: this.owl, scaleX: 1, scaleY: 1, duration: 300 });
      this.bothEyes(1, 200, 0);
      this.burstEmoji("😳", 2, 24);
    });
    this.say(this.t().nap, 1900);
  }

  /** 🪶 Fly — Nova spreads her wings and soars out over the screen. */
  private actFly() {
    win();
    const { width: W } = this.scale;
    const y0 = this.baseY;
    this.wingWave("L", -70, 1);
    this.wingWave("R", 70, 1);
    this.tweens.add({
      targets: this.root,
      x: { from: this.baseX, to: Math.max(40, W - 90) },
      y: { from: y0, to: y0 - 170 },
      duration: 700,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        this.root.setPosition(this.baseX, y0);
        this.hop();
      },
    });
    this.burstEmoji("🪶", 3, 20);
    this.say(this.t().fly, 1600);
  }

  /** 📖 Read — Nova opens a storybook and bobs along. */
  private actRead() {
    pop();
    this.tweens.add({ targets: this.owl, scaleY: 1.04, duration: 400, yoyo: true, ease: "Sine.easeInOut" });
    const beak = this.worldPoint({ x: 0, y: -4 });
    const book = this.add.text(beak.x + 30, beak.y + 6, "📖", txt(30, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5).setDepth(9000);
    this.tweens.add({ targets: book, y: book.y - 14, duration: 500, yoyo: true, repeat: 1, onComplete: () => book.destroy() });
    this.burstEmoji("📚", 2, 22);
    this.say(this.t().read, 1700);
  }

  /* ── care / buy / equip ── */

  private care(action: "feed" | "play") {
    this.poke();
    const T = this.t();
    const before = useKidStore.getState().nova[this.kidId] ?? defaultNova();
    const today = todayIso();
    // Already cared for today? The toy still animates (it's fun!), but the
    // reward message tells the kid the daily coin is banked for tomorrow.
    const alreadyToday = action === "feed" ? before.fed === today : before.played === today;

    if (action === "feed") {
      pop();
      useKidStore.getState().novaCare(this.kidId, "feed");
      this.feedAnimation();
    } else {
      win();
      useKidStore.getState().novaCare(this.kidId, "play");
      this.playAnimation();
    }
    const after = useKidStore.getState().nova[this.kidId] ?? defaultNova();
    const earnedToday = after.earnDay === today ? after.earnedToday : 0;
    // #766 — the one-time "best friend" bonus is celebrated separately from the
    // daily care coin, so the float never reads as one lumped number.
    const best = !!after.affectionBest && !before.affectionBest;
    const bestCoins = best ? AFFECTION_BEST_COIN : 0;
    const coinAdded = after.coins - before.coins - bestCoins;
    this.refresh();
    this.resetIdleTimer();

    if (alreadyToday) {
      this.say(action === "feed" ? T.doneTodayFeed : T.doneTodayPlay, 1800);
      return;
    }
    if (best) {
      // #766 — first time affection hits 100 → visible, one-time celebration.
      tada();
      this.burstEmoji("💛", 10, 28);
      this.say(`${T.bestFriend} +${bestCoins} 🪙`, 2600);
      this.floatCoin(`+${bestCoins} 🪙`);
    }
    if (coinAdded > 0) {
      // #1192 — care earns its OWN currency (🐾), never the learning cap
      this.floatCoin(`+${coinAdded} 🐾`);
      if (earnedToday >= NOVA_DAILY_CAP) this.say(T.dailyCap, 2200);
      else this.say(action === "feed" ? T.feedReward : T.playReward, 1800);
    } else if (!best && earnedToday >= NOVA_DAILY_CAP) {
      this.say(T.dailyCap, 2200);
    } else if (!best) {
      this.say(action === "feed" ? T.feedMsg : T.playMsg, 1800);
    }
  }

  private feedAnimation() {
    const from = this.feedFab.getWorldTransformMatrix();
    const apple = this.add.text(from.tx, from.ty, "🍎", txt(28, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5).setDepth(9000);
    const beakPt = this.worldPoint({ x: 0, y: -4 });
    this.tweens.add({
      targets: apple,
      x: beakPt.x,
      y: beakPt.y - 10,
      scale: 0.5,
      duration: 380,
      ease: "Quad.easeIn",
      onComplete: () => {
        apple.destroy();
        this.tweens.add({ targets: this.owl, scaleX: 1.12, scaleY: 1.12, duration: 90, yoyo: true, ease: "Quad.easeOut" });
        this.tweens.add({ targets: this.root, y: this.baseY - 14, duration: 90, yoyo: true });
        for (let i = 0; i < 3; i++) {
          const h = this.add.text(beakPt.x + Phaser.Math.Between(-24, 24), beakPt.y, "💛", txt(24, "#ffffff", { bold: true, shadow: false }))
            .setOrigin(0.5)
            .setDepth(9000);
          this.tweens.add({ targets: h, y: h.y - 60 - i * 18, alpha: 0, duration: 900 + i * 120, onComplete: () => h.destroy() });
        }
      },
    });
  }

  private playAnimation() {
    const start = this.worldPoint({ x: -60, y: 40 });
    const end = this.worldPoint({ x: 70, y: 60 });
    const topY = this.baseY - 140;
    const ball = this.add.text(start.x, start.y, "🎈", txt(32, "#ffffff", { bold: true, shadow: false })).setOrigin(0.5).setDepth(9000);
    this.tweens.add({
      targets: ball,
      x: { from: start.x, to: end.x, duration: 900, ease: "Sine.easeInOut" },
      y: { from: start.y, to: topY, duration: 450, yoyo: true, repeat: 1, ease: "Quad.easeOut" },
      angle: 360,
      onComplete: () => {
        ball.destroy();
        this.hop();
      },
    });
  }

  private buy(outfit: NovaOutfit) {
    const st = useKidStore.getState();
    const nova = st.nova[this.kidId] ?? defaultNova();
    // #278 — seasonal sets are only purchasable during their festival window.
    if (outfit.festival && outfit.festival !== this.festivalKey()) {
      this.say(this.t().seasonal(this.festivalLabel(outfit.festival)), 2000);
      return;
    }
    if (nova.coins < outfit.cost) {
      this.say(this.t().needCoins, 2000);
      return;
    }
    st.novaBuy(this.kidId, outfit.id, this.festivalKey());
    win();
    this.say(this.t().boughtMsg, 1800);
    this.sparkle(this.baseX + 40, this.baseY - 60);
    this.refresh();
  }

  private equip(outfit: NovaOutfit) {
    useKidStore.getState().novaEquip(this.kidId, outfit.id);
    pop();
    this.say(this.t().equipMsg, 1600);
    this.hop();
    this.refresh();
  }

  /* ────────────────────────── helpers ────────────────────────── */

  private worldPoint(local: { x: number; y: number }) {
    return {
      x: this.baseX + local.x * this.baseScale,
      y: this.baseY + local.y * this.baseScale,
    };
  }

  private say(msg: string, ms = 2000) {
    if (this.bubbleTimer) this.bubbleTimer.remove();
    this.bubbleText.setText(msg);
    speak(msg);
    const w = Math.max(70, this.bubbleText.width + 34);
    const h = Math.max(38, this.bubbleText.height + 20);
    this.bubbleBg.clear();
    this.bubbleBg.fillStyle(0x1a0a20, 0.16);
    this.bubbleBg.fillRoundedRect(-w / 2 - 2, -h / 2 + 5, w + 4, h + 4, 20);
    this.bubbleBg.fillStyle(0xfffdf7, 1);
    this.bubbleBg.fillRoundedRect(-w / 2, -h / 2, w, h, 20);
    this.bubbleBg.fillTriangle(0, h / 2 - 2, -10, h / 2 + 13, 10, h / 2 + 13);
    this.bubbleBg.fillRect(-10, h / 2 - 2, 20, 13);
    this.bubbleBg.fillStyle(0xffffff, 0.55);
    this.bubbleBg.fillRoundedRect(-w / 2 + 6, -h / 2 + 4, w - 12, Math.max(8, h * 0.3), 12);
    this.bubble.setPosition(this.baseX, this.baseY - 235 * this.baseScale);
    this.bubble.setVisible(true).setAlpha(0).setScale(0.7);
    this.tweens.add({ targets: this.bubble, alpha: 1, scale: 1, duration: 180, ease: "Back.easeOut" });
    this.bubbleTimer = this.time.delayedCall(ms, () => {
      this.tweens.add({
        targets: this.bubble,
        alpha: 0,
        y: this.bubble.y - 8,
        duration: 200,
        onComplete: () => this.bubble.setVisible(false),
      });
    });
  }

  /** A coin reward pops up from the wallet chip and floats away — makes care
   *  actions *feel* like they pay out, without breaking the daily cap. */
  private floatCoin(text: string) {
    const m = this.walletChip.getWorldTransformMatrix();
    const t = this.add
      .text(m.tx, m.ty - 6, text, txt(20, NV_GOLD, { bold: true, shadow: false }))
      .setOrigin(0.5)
      .setDepth(9100);
    this.tweens.add({
      targets: t,
      y: (t.y as number) - 48,
      alpha: 0,
      scale: 1.3,
      duration: 900,
      ease: "Quad.easeOut",
      onComplete: () => t.destroy(),
    });
  }

  private sparkle(x: number, y: number) {
    for (let i = 0; i < 12; i++) {
      const p = this.add.circle(x, y, 2 + Math.random() * 3, this.randomColor()).setDepth(7000);
      this.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-60, 60),
        y: y + Phaser.Math.Between(-70, 30),
        alpha: 0,
        scale: 0.2,
        duration: 500,
        onComplete: () => p.destroy(),
      });
    }
  }

  private randomColor(): number {
    return Phaser.Display.Color.GetColor(
      Phaser.Math.Between(120, 255),
      Phaser.Math.Between(120, 255),
      Phaser.Math.Between(120, 255)
    );
  }

  private drawShadow() {
    this.shadow.clear();
    this.shadow.fillStyle(0x1a0a20, 0.28);
    this.shadow.fillEllipse(this.baseX, this.baseY + 150 * this.baseScale, 170 * this.baseScale, 26 * this.baseScale);
  }

  /* ────────────────────────── idle behaviour ────────────────────────── */

  private startIdleAnimations() {
    this.tweens.add({ targets: this.owl, scaleY: 1.02, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.scheduleBlink();
    this.scheduleHead();
    this.scheduleWing();
  }

  private scheduleBlink() {
    this.blinkTimer = this.time.delayedCall(Phaser.Math.Between(2200, 5200), () => {
      this.tweens.add({ targets: this.eyeL, scaleY: 0.08, duration: 80, yoyo: true, ease: "Sine.easeInOut" });
      this.time.delayedCall(Phaser.Math.Between(40, 120), () => {
        if (!this.dozing) this.tweens.add({ targets: this.eyeR, scaleY: 0.08, duration: 80, yoyo: true, ease: "Sine.easeInOut" });
      });
      this.scheduleBlink();
    });
  }

  private scheduleHead() {
    this.headTimer = this.time.delayedCall(Phaser.Math.Between(5000, 9000), () => {
      const a = Phaser.Math.Between(-1, 1) * Phaser.Math.FloatBetween(2, 4.5);
      this.tweens.add({ targets: this.root, angle: a, duration: 320, yoyo: true, ease: "Sine.easeInOut" });
      this.scheduleHead();
    });
  }

  private scheduleWing() {
    this.wingTimer = this.time.delayedCall(Phaser.Math.Between(3800, 7200), () => {
      const side = Math.random() > 0.5 ? this.wingL : this.wingR;
      const flip = side === this.wingL ? 1 : -1;
      this.tweens.add({ targets: side, angle: -16 * flip, duration: 180, yoyo: true, ease: "Sine.easeInOut" });
      this.scheduleWing();
    });
  }

  private resetIdleTimer() {
    if (this.idleTimer) this.idleTimer.remove();
    this.idleTimer = this.time.delayedCall(16000, () => this.doze());
  }

  private doze() {
    this.dozing = true;
    this.hideSwipeHintIfVisible();
    this.tweens.add({ targets: this.eyeL, scaleY: 0.08, duration: 500, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: this.eyeR, scaleY: 0.08, duration: 500, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: this.root, angle: 3, duration: 500, ease: "Sine.easeInOut" });
    this.zzz = this.add
      .text(this.baseX + 70 * this.baseScale, this.baseY - 130 * this.baseScale, "💤 " + this.t().zzz, txt(20, "#ffffff", { bold: true }))
      .setOrigin(0.5)
      .setDepth(6000);
    this.tweens.add({ targets: this.zzz, y: this.zzz.y - 24, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }

  private wake() {
    this.dozing = false;
    this.tweens.add({ targets: this.eyeL, scaleY: 1, duration: 300, ease: "Back.easeOut" });
    this.tweens.add({ targets: this.eyeR, scaleY: 1, duration: 300, ease: "Back.easeOut" });
    this.tweens.add({ targets: this.root, angle: 0, duration: 400, ease: "Sine.easeInOut" });
    if (this.zzz) {
      this.zzz.destroy();
      this.zzz = undefined;
    }
    pop();
    this.hop();
    this.sparkle(this.baseX, this.baseY - 40);
    this.say(this.t().wake, 1600);
  }

  private entrance() {
    const y0 = this.baseY;
    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 480, ease: "Sine.easeOut" });
    this.tweens.add({ targets: this.root, y: { from: y0 - 80, to: y0 }, duration: 750, ease: "Back.easeOut" });
    this.cloud.setAlpha(0);
    this.tweens.add({ targets: this.cloud, alpha: 0.6, duration: 620, delay: 160 });
    this.shadow.setAlpha(0);
    this.tweens.add({ targets: this.shadow, alpha: 1, duration: 500, delay: 300 });
    this.time.delayedCall(460, () => this.sparkle(this.baseX, this.baseY - 30));
  }

  private hop() {
    this.tweens.add({ targets: this.root, y: this.baseY - 26, duration: 130, yoyo: true, ease: "Quad.easeOut" });
    this.tweens.add({ targets: this.shadow, alpha: 0.55, duration: 65, yoyo: true });
  }

  private spawnDust() {
    const { width: W, height: H } = this.scale;
    const K = makeTex(this, "nv-dust", 14, 14, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, "rgba(255,255,255,0.8)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    for (let i = 0; i < 7; i++) {
      const d = this.add
        .image(Phaser.Math.Between(0, Math.max(1, W)), Phaser.Math.Between(0, Math.max(1, H)), K)
        .setDepth(2)
        .setAlpha(Phaser.Math.FloatBetween(0.08, 0.28))
        .setScale(Phaser.Math.FloatBetween(0.6, 1.8))
        .setTint(0xffe3b3);
      this.tweens.add({
        targets: d,
        y: (d.y as number) - Phaser.Math.Between(60, 160),
        duration: Phaser.Math.Between(6000, 12000),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: i * 260,
      });
      this.dust.push(d);
    }
  }

  /* ────────────────────────── refresh + layout ────────────────────────── */

  /** Show the equipped outfit on Nova's body (or nothing). */
  private applyOutfit(equipped: string) {
    for (const key of Object.keys(this.outfitNodes)) {
      const on = key === equipped;
      this.outfitNodes[key].forEach((o) =>
        (o as unknown as { setVisible: (v: boolean) => void }).setVisible(on)
      );
    }
    if (equipped && equipped !== "none") {
      this.tweens.add({ targets: this.owl, scaleY: 1.04, duration: 260, yoyo: true, ease: "Sine.easeInOut" });
    }
  }

  private refresh() {
    if (!this.game || !this.game.renderer) return;
    const st = useKidStore.getState();
    const nova = st.nova[this.kidId] ?? defaultNova();
    const today = todayIso();
    const earnedToday = nova.earnDay === today ? nova.earnedToday : 0;

    this.applyOutfit(nova.equipped);

    // #19 — adopted pet companion (owl = the mascot itself, no companion)
    const sp = speciesById(nova.species);
    if (sp.id === "owl") {
      this.companion.setVisible(false);
    } else {
      this.companion.setText(speciesEmoji(sp.id, nova.petStage));
      this.companion.setPosition(-100, 170);
      this.companion.setVisible(true);
    }

    this.wallet.setText(`🪙 ${nova.coins}`);
    this.walletSub.setText(this.t().daily(Math.min(earnedToday, NOVA_DAILY_CAP)));
    this.careBadge.setText(`🐾 ${nova.careCoins ?? 0}`);
    this.tweens.add({ targets: this.wallet, scale: 1.18, duration: 120, yoyo: true });

    this.streakText.setText(`🔥 ${this.t().streak(nova.streak)}`);
    const streakHalf = this.streakText.width / 2;
    this.streakDots.forEach((d, i) => d.setPosition(streakHalf + 12 + i * 13, 0));
    this.updateStyleBadge();
    // light the 7-day calendar (oldest → today): played days glow gold
    const days = nova.days ?? [];
    this.streakDots.forEach((d, i) => {
      const lit = days.includes(dayIsoAgo(6 - i));
      d.setTint(lit ? 0xffd166 : 0xffffff);
      d.setAlpha(lit ? 1 : 0.22);
    });

    // affection hairline
    this.affLine.clear();
    const w = 260;
    this.affLine.fillStyle(0x3a2a4d, 0.4);
    this.affLine.fillRoundedRect(-w / 2, -3, w, 6, 3);
    this.affLine.fillStyle(0xff8fa3, 1);
    this.affLine.fillRoundedRect(-w / 2, -3, Math.max(3, (nova.affection / 100) * w), 6, 3);
    this.affLine.fillStyle(0xff5d7e, 1);
    this.affLine.fillRoundedRect(-w / 2, -3, 10, 6, 3);

    const earned = Math.min(earnedToday, NOVA_DAILY_CAP);
    this.ctaCoin.setText(`🪙 ${earned}/${NOVA_DAILY_CAP}`);
    this.ctaCoin.setPosition(18, -34);
    this.ctaSub.setText(this.t().playSub);

    // #765/#768 — quest chip, 7-day calendar tile + freeze pill (all from store)
    this.refreshDailyStrip();

    this.renderShopPage();
    this.renderSpeciesPage();
    this.renderActPage();
  }

  private layout() {
    const { width: W, height: H } = this.scale;
    const s = Phaser.Math.Clamp(Math.min(W / 430, H / 780), 0.6, 1.22);

    this.readSafeArea();

    this.baseScale = s;
    this.baseX = W / 2;
    this.baseY = H * 0.4;
    this.root.setScale(s);
    this.root.setPosition(W / 2, H * 0.4);
    this.cloud.setPosition(W / 2, H * 0.4 + 140 * s);
    this.cloud.setScale(s);
    this.drawShadow();
    this.buildVignette();

    // top bar — responsive so nothing overlaps on narrow phones;
    // pushed below the notch on notched devices (canvas is full-bleed)
    const topY = 46 + this.topInset;
    this.backBtn.setPosition(40, topY);
    this.walletChip.setPosition(W - 52, topY);
    this.wallet.setPosition(W - 52, topY - 2);
    this.walletSub.setPosition(W - 52, topY + 24);
    // 🐾 care badge — left of the wallet chip (room pill shrinks to make room)
    this.careBadge.setPosition(W - 52 - 46 - 20, topY);

    // room pill width: fit between back (right edge ~69) and care badge (left edge W-118)
    const backRight = 69;
    const walletLeft = W - 52 - 46 - 20 - this.careBadge.width / 2 - 10;
    const pillMax = Math.min(250, walletLeft - backRight - 14);
    const pillW = Math.min(pillMax, Math.max(146, this.roomLabel.width + 74));
    this.roomPill.setPosition(W / 2, topY);
    this.roomLabel.setPosition(0, 0);
    this.redrawRoomPill(pillW);

    // streak strip centered under the room pill
    this.streakText.setPosition(0, 0);
    const streakHalf = this.streakText.width / 2;
    this.streakDots.forEach((d, i) => d.setPosition(streakHalf + 12 + i * 13, 0));
    this.streakStrip.setPosition(W / 2, 90 + this.topInset);
    // 🏅 learning-style badge floats just below the streak
    this.styleBadge.setPosition(W / 2, 132 + this.topInset);
    // #765 — daily quest chip + claimable 7-day calendar tile under the streak
    this.questChip.setPosition(W / 2, 174 + this.topInset);
    this.calTile.setPosition(W / 2, 214 + this.topInset);
    // #768 — freeze pill rides on the streak strip (right after the dots)
    this.freezePill.setPosition(streakHalf + 12 + 7 * 13 + 10, 0);

    // one-time "swipe to explore" nudge floats under Nova, above the dock
    this.swipeHint.setPosition(W / 2, H * 0.7);

    // bottom action cluster — floating panel anchored above the home indicator
    this.affLine.setPosition(W / 2, H * 0.8);
    this.dock.setPosition(W / 2, H - 14 - 62 - this.bottomInset);
    this.dockBg.setDisplaySize(Math.min(W - 24, 430), 124);
    this.cta.setPosition(0, -28);
    this.shopFab.setPosition(-152, 28);
    this.speciesFab.setPosition(-76, 28);
    this.feedFab.setPosition(0, 28);
    this.careFab.setPosition(76, 28);
    this.funFab.setPosition(152, 28);

    // sheets
    this.layoutShopSheet(W, H);
    this.layoutSpeciesSheet(W, H);
    this.layoutActSheet(W, H);

    this.buildRoom(this.roomIdx);
  }

  /** Read device notch/home-indicator insets (mirrored by CSS custom props
   *  `--sat` / `--sab` from `env(safe-area-inset-*)`) so the scene's own top
   *  bar and bottom dock stay clear of them. */
  private readSafeArea() {
    const cs = getComputedStyle(document.documentElement);
    const sat = parseFloat(cs.getPropertyValue("--sat"));
    const sab = parseFloat(cs.getPropertyValue("--sab"));
    this.topInset = Number.isFinite(sat) ? sat : 0;
    this.bottomInset = Number.isFinite(sab) ? sab : 0;
  }

  private layoutShopSheet(W: number, H: number) {
    const sw = Math.min(W - 20, 470);
    const sh = 300;
    const ty = H - 14 - this.bottomInset - sh / 2;
    this.shopTargetY = ty;
    this.shopPanel.setPosition(W / 2, this.shopPanel.visible ? ty : ty);
    this.shopDim.setPosition(-W / 2, -ty).setSize(W, H);
    this.shopCard.clear();
    this.shopCard.fillStyle(0x0d1733, 0.96);
    this.shopCard.fillRoundedRect(-sw / 2, -sh / 2, sw, sh, { tl: 28, tr: 28, bl: 0, br: 0 });
    this.shopCard.lineStyle(1.5, 0xffffff, 0.18);
    this.shopCard.strokeRoundedRect(-sw / 2, -sh / 2, sw, sh, { tl: 28, tr: 28, bl: 0, br: 0 });
    // handle
    this.shopCard.fillStyle(0xffffff, 0.35);
    this.shopCard.fillRoundedRect(-20, -sh / 2 + 8, 40, 5, 3);
    this.shopTitleText.setPosition(0, -sh / 2 + 36);
    this.shopCloseText.setPosition(sw / 2 - 26, -sh / 2 + 36);
    this.shop.setPosition(0, 6);
    this.shopPrevBtn.setPosition(-sw / 2 + 32, 6);
    this.shopNextBtn.setPosition(sw / 2 - 32, 6);
  }

  private layoutSpeciesSheet(W: number, H: number) {
    const sw = Math.min(W - 20, 470);
    const sh = 280;
    const ty = H - 14 - this.bottomInset - sh / 2;
    this.speciesTargetY = ty;
    this.speciesPanel.setPosition(W / 2, this.speciesPanel.visible ? ty : ty);
    this.speciesDim.setPosition(-W / 2, -ty).setSize(W, H);
    this.speciesCard.clear();
    this.speciesCard.fillStyle(0x0d1733, 0.96);
    this.speciesCard.fillRoundedRect(-sw / 2, -sh / 2, sw, sh, { tl: 28, tr: 28, bl: 0, br: 0 });
    this.speciesCard.lineStyle(1.5, 0xffffff, 0.18);
    this.speciesCard.strokeRoundedRect(-sw / 2, -sh / 2, sw, sh, { tl: 28, tr: 28, bl: 0, br: 0 });
    // handle
    this.speciesCard.fillStyle(0xffffff, 0.35);
    this.speciesCard.fillRoundedRect(-20, -sh / 2 + 8, 40, 5, 3);
    this.speciesTitleText.setPosition(0, -sh / 2 + 36);
    this.speciesCloseText.setPosition(sw / 2 - 26, -sh / 2 + 36);
    this.species.setPosition(0, 6);
  }

  private layoutActSheet(W: number, H: number) {
    const sw = Math.min(W - 20, 430);
    const sh = 340;
    const ty = H - 12 - this.bottomInset - sh / 2;
    this.actTargetY = ty;
    this.actPanel.setPosition(W / 2, this.actPanel.visible ? ty : ty);
    this.actDim.setPosition(-W / 2, -ty).setSize(W, H);
    this.actCard.clear();
    this.actCard.fillStyle(0x0d1733, 0.96);
    this.actCard.fillRoundedRect(-sw / 2, -sh / 2, sw, sh, { tl: 28, tr: 28, bl: 0, br: 0 });
    this.actCard.lineStyle(1.5, 0xffffff, 0.18);
    this.actCard.strokeRoundedRect(-sw / 2, -sh / 2, sw, sh, { tl: 28, tr: 28, bl: 0, br: 0 });
    this.actCard.fillStyle(0xffffff, 0.35);
    this.actCard.fillRoundedRect(-20, -sh / 2 + 8, 40, 5, 3);
    this.actTitleText.setPosition(0, -sh / 2 + 34);
    this.actCloseText.setPosition(sw / 2 - 26, -sh / 2 + 34);
    this.actPrevBtn.setPosition(-sw / 2 + 28, 56);
    this.actNextBtn.setPosition(sw / 2 - 28, 56);
  }
}
