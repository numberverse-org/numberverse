/* ═══════════════════════════════════════════════════════════════════════════
   Numberverse SVG asset library — crisp, consistent vector art that replaces
   OS-dependent emoji. One style: rounded, soft-shadowed "stickers". Every SVG
   is a plain string so it can be used BOTH by React (<img src=data-uri>) and
   Phaser (loaded as a texture). Fallback emoji live alongside each asset.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Every asset: SVG string + the emoji to fall back to if SVG fails to load. */
export interface Asset {
  /** Inline SVG (rasterized into a Phaser texture for scenes). Omit when a PNG is used. */
  svg?: string;
  emoji: string;
  /** width/height — omit for square stickers (1). Nova is a portrait 160×210. */
  aspect?: number;
  /** External static sprite (PNG) — precached by the service worker. When set,
   *  the PNG is shown directly and `svg` is ignored (emoji is the fallback). */
  url?: string;
}

const view = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#06122a" flood-opacity="0.3"/></filter></defs>${body}</svg>`;

/* ────────────────────────────── mascot: Nova the Owl ────────────────────────────── */
const NOVA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 210">
<defs>
  <filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#06122a" flood-opacity="0.3"/></filter>
  <linearGradient id="nb" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#7a4e2a"/><stop offset="0.5" stop-color="#8a5c33"/><stop offset="1" stop-color="#a06a3a"/>
  </linearGradient>
  <linearGradient id="nw" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#5a3a20"/><stop offset="0.55" stop-color="#7a4e2a"/><stop offset="1" stop-color="#4f331b"/>
  </linearGradient>
  <radialGradient id="ni" cx="0.42" cy="0.38" r="0.78">
    <stop offset="0" stop-color="#ffe37a"/><stop offset="0.5" stop-color="#f4ae3f"/><stop offset="0.85" stop-color="#d8871a"/><stop offset="1" stop-color="#b96b0f"/>
  </radialGradient>
  <linearGradient id="nc" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#eee0c0"/><stop offset="1" stop-color="#dcc9a0"/>
  </linearGradient>
  <clipPath id="chestclip"><ellipse cx="80" cy="150" rx="30" ry="40"/></clipPath>
</defs>
<g filter="url(#s)">
<ellipse cx="80" cy="197" rx="50" ry="8" fill="#06122a" opacity="0.18"/>
<g fill="#5a3a20">
    <path d="M62 178 Q56 190 58 200 Q74 196 82 186 Z" opacity="0.9"/>
    <path d="M98 178 Q104 190 102 200 Q86 196 78 186 Z" opacity="0.9"/>
  </g>
<g fill="#d9b58a">
    <ellipse cx="58" cy="190" rx="13" ry="6"/>
    <ellipse cx="80" cy="191" rx="11" ry="6"/>
    <ellipse cx="102" cy="190" rx="13" ry="6"/>
  </g>
  <g fill="#3a2a1c">
    <path d="M50 190 Q46 198 42 204 Q48 200 52 195 Z"/>
    <path d="M60 191 Q58 199 54 205 Q61 200 64 196 Z"/>
    <path d="M74 193 Q72 200 68 206 Q75 201 78 197 Z"/>
    <path d="M86 193 Q88 200 92 206 Q85 201 82 197 Z"/>
    <path d="M98 191 Q100 199 104 205 Q97 200 96 196 Z"/>
    <path d="M108 190 Q112 198 116 204 Q110 200 108 195 Z"/>
  </g>
<g fill="url(#nw)">
    <path d="M26 74 Q14 96 20 138 Q24 160 36 168 Q30 140 32 108 Q34 88 26 74 Z"/>
    <path d="M134 74 Q146 96 140 138 Q136 160 124 168 Q130 140 128 108 Q126 88 134 74 Z"/>
  </g>
<g fill="#b8844f" opacity="0.5">
    <path d="M26 86 Q30 100 34 112 Q26 104 26 86 Z"/>
    <path d="M24 108 Q30 122 36 132 Q24 126 24 108 Z"/>
    <path d="M26 130 Q32 144 38 152 Q26 148 26 130 Z"/>
    <path d="M134 86 Q130 100 126 112 Q134 104 134 86 Z"/>
    <path d="M136 108 Q130 122 124 132 Q136 126 136 108 Z"/>
    <path d="M134 130 Q128 144 122 152 Q134 148 134 130 Z"/>
  </g>
<path d="M80 34 C 46 40 26 76 26 118 C 26 162 50 188 80 188 C 110 188 134 162 134 118 C 134 76 114 40 80 34 Z" fill="url(#nb)"/>
<g fill="#5a3a20" opacity="0.35">
    <ellipse cx="48" cy="110" rx="6" ry="4"/><ellipse cx="114" cy="116" rx="7" ry="4"/>
    <ellipse cx="40" cy="132" rx="5" ry="3"/><ellipse cx="122" cy="130" rx="6" ry="3"/>
    <ellipse cx="56" cy="88" rx="5" ry="3"/><ellipse cx="106" cy="90" rx="5" ry="3"/>
    <ellipse cx="50" cy="152" rx="4" ry="3"/><ellipse cx="112" cy="150" rx="4" ry="3"/>
  </g>
<g clip-path="url(#chestclip)">
    <ellipse cx="80" cy="150" rx="30" ry="40" fill="url(#nc)"/>
    <g fill="#7a4e2a" opacity="0.8">
      <path d="M52 116 q14 6 28 0 q-6 3 -14 3 q-9 0 -14 -3 Z"/>
      <path d="M50 126 q15 6 30 0 q-7 3 -15 3 q-9 0 -15 -3 Z"/>
      <path d="M50 136 q15 6 30 0 q-7 3 -15 3 q-9 0 -15 -3 Z"/>
      <path d="M50 146 q15 6 30 0 q-7 3 -15 3 q-9 0 -15 -3 Z"/>
      <path d="M52 156 q14 6 28 0 q-6 3 -14 3 q-9 0 -14 -3 Z"/>
      <path d="M56 166 q10 4 24 0 q-5 2 -12 2 q-8 0 -12 -2 Z"/>
    </g>
  </g>
<path d="M80 26 C 46 30 34 58 34 88 C 34 116 50 132 80 132 C 110 132 126 116 126 88 C 126 58 114 30 80 26 Z" fill="url(#nb)"/>
<g fill="#5a3a20" opacity="0.4">
    <ellipse cx="46" cy="60" rx="4" ry="3"/><ellipse cx="116" cy="64" rx="4" ry="3"/>
    <ellipse cx="52" cy="78" rx="4" ry="2.6"/><ellipse cx="110" cy="80" rx="4" ry="2.6"/>
  </g>
<path d="M80 42 C 40 46 30 74 34 96 C 38 116 60 124 80 124 C 100 124 122 116 126 96 C 130 74 120 46 80 42 Z" fill="#4f331b"/>
  <path d="M80 46 C 46 50 38 76 42 94 C 46 112 66 118 80 118 C 94 118 114 112 118 94 C 122 76 114 50 80 46 Z" fill="#6b4626"/>
<path d="M80 52 C 58 54 48 70 50 88 C 52 102 64 110 80 110 C 96 110 108 102 110 88 C 112 70 102 54 80 52 Z" fill="#f0e3c2"/>
  <ellipse cx="58" cy="76" rx="22" ry="23" fill="#f4ead0"/>
  <ellipse cx="102" cy="76" rx="22" ry="23" fill="#f4ead0"/>
<g stroke="#d8c39a" stroke-width="1.6" opacity="0.55" stroke-linecap="round">
    <path d="M80 70 q-6 6 -14 12"/><path d="M80 70 q6 6 14 12"/>
    <path d="M80 76 q-5 8 -10 18"/><path d="M80 76 q5 8 10 18"/>
    <path d="M80 62 q-4 5 -9 9"/><path d="M80 62 q4 5 9 9"/>
  </g>
<path d="M44 60 Q 52 54 58 64 Q 53 67 48 63 Z" fill="#4f331b"/>
  <path d="M116 60 Q 108 54 102 64 Q 107 67 112 63 Z" fill="#4f331b"/>
<g>
    <ellipse cx="60" cy="76" rx="15.5" ry="16.5" fill="#3a2a1c"/>
    <ellipse cx="100" cy="76" rx="15.5" ry="16.5" fill="#3a2a1c"/>
    <circle cx="60" cy="76" r="13" fill="url(#ni)"/>
    <circle cx="100" cy="76" r="13" fill="url(#ni)"/>
    <circle cx="60" cy="76" r="6.8" fill="#1a1206"/>
    <circle cx="100" cy="76" r="6.8" fill="#1a1206"/>
    <circle cx="56.8" cy="72.8" r="2.6" fill="#fff" opacity="0.95"/>
    <circle cx="96.8" cy="72.8" r="2.6" fill="#fff" opacity="0.95"/>
    <circle cx="63" cy="79.6" r="1.3" fill="#fff" opacity="0.65"/>
    <circle cx="103" cy="79.6" r="1.3" fill="#fff" opacity="0.65"/>
  </g>
<path d="M80 88 Q 86 92 86 100 Q 86 106 80 108 Q 74 106 74 100 Q 74 92 80 88 Z" fill="#3a3a34"/>
  <path d="M80 91 Q 84 94 84 100 Q 84 104 80 106 Q 76 104 76 100 Q 76 94 80 91 Z" fill="#5a5a50"/>
  <path d="M80 100 Q 82 102 80 104 Q 78 102 80 100 Z" fill="#2a2a24"/>
<g>
    <path d="M48 30 Q 40 12 32 8 Q 40 14 42 26 Q 44 34 48 30 Z" fill="#5a3a20"/>
    <path d="M54 32 Q 50 14 44 6 Q 52 14 52 28 Z" fill="#7a4e2a"/>
    <path d="M112 30 Q 120 12 128 8 Q 120 14 118 26 Q 116 34 112 30 Z" fill="#5a3a20"/>
    <path d="M106 32 Q 110 14 116 6 Q 108 14 108 28 Z" fill="#7a4e2a"/>
  </g>
</g>
</svg>`;

/* ────────────────────────────── avatars (kid profiles) ────────────────────────────── */

function head(css: string): string {
  return view(
    `<g filter="url(#s)"><circle cx="50" cy="52" r="38" fill="#f6e0b8"/><circle cx="50" cy="52" r="36" fill="${css}"/></g>`
  );
}

const AVATARS: Record<string, Asset> = {
  fox: {
    emoji: "🦊",
    svg: view(`<g filter="url(#s)"><path d="M50 18 L18 34 L30 88 L50 94 L70 88 L82 34 Z" fill="#f58a3c"/>
      <path d="M50 22 L26 33 L40 88 L50 92 Z" fill="#fdf3dd"/>
      <circle cx="50" cy="52" r="26" fill="#f58a3c"/>
      <circle cx="40" cy="52" r="11" fill="#f58a3c"/><circle cx="60" cy="52" r="11" fill="#f58a3c"/>
      <circle cx="42" cy="52" r="5" fill="#3b2418"/><circle cx="58" cy="52" r="5" fill="#3b2418"/>
      <path d="M50 62 L56 68 L50 74 L44 68 Z" fill="#3b2418"/></g>`),
  },
  panda: {
    emoji: "🐼",
    svg: view(`<g filter="url(#s)"><circle cx="50" cy="50" r="40" fill="#f4f6f8"/>
      <circle cx="32" cy="38" r="13" fill="#3b3b3b"/><circle cx="68" cy="38" r="13" fill="#3b3b3b"/>
      <circle cx="40" cy="54" r="7" fill="#3b3b3b"/><circle cx="60" cy="54" r="7" fill="#3b3b3b"/>
      <circle cx="42" cy="54" r="2.6" fill="#fff"/><circle cx="58" cy="54" r="2.6" fill="#fff"/>
      <ellipse cx="50" cy="72" rx="15" ry="11" fill="#3b3b3b"/>
      <circle cx="44" cy="70" r="2" fill="#fff"/><circle cx="56" cy="70" r="2" fill="#fff"/></g>`),
  },
  lion: {
    emoji: "🦁",
    svg: view(`<g filter="url(#s)"><path d="M50 10 L58 24 L72 20 L70 34 L84 36 L72 46 L82 56 L66 56 L50 90 L34 56 L18 56 L28 46 L16 36 L30 34 L28 20 L42 24 Z" fill="#e8a24f"/>
      <circle cx="50" cy="52" r="24" fill="#f6c06a"/>
      <circle cx="42" cy="50" r="5" fill="#5a3416"/><circle cx="58" cy="50" r="5" fill="#5a3416"/>
      <ellipse cx="50" cy="66" rx="8" ry="5" fill="#8a5426"/></g>`),
  },
  frog: {
    emoji: "🐸",
    svg: view(`<g filter="url(#s)"><circle cx="50" cy="54" r="34" fill="#5fad6a"/>
      <circle cx="24" cy="26" r="10" fill="#4f9760"/><circle cx="76" cy="26" r="10" fill="#4f9760"/>
      <circle cx="40" cy="52" r="8" fill="#fdf3dd"/><circle cx="60" cy="52" r="8" fill="#fdf3dd"/>
      <circle cx="42" cy="52" r="4" fill="#2a4a33"/><circle cx="58" cy="52" r="4" fill="#2a4a33"/>
      <path d="M44 72 Q50 80 56 72 Q50 74 44 72 Z" fill="#3c6e46"/></g>`),
  },
  tiger: {
    emoji: "🐯",
    svg: view(`<g filter="url(#s)"><circle cx="50" cy="52" r="36" fill="#f4a261"/>
      <path d="M36 20 L32 6 L46 16 Z" fill="#d9822b"/><path d="M64 20 L68 6 L54 16 Z" fill="#d9822b"/>
      <path d="M22 40 L8 36 L18 46 Z" fill="#d9822b"/><path d="M78 40 L92 36 L82 46 Z" fill="#d9822b"/>
      <path d="M26 66 L14 70 L24 78 Z" fill="#d9822b"/><path d="M74 66 L86 70 L76 78 Z" fill="#d9822b"/>
      <circle cx="40" cy="52" r="6" fill="#5a3416"/><circle cx="60" cy="52" r="6" fill="#5a3416"/>
      <path d="M44 66 Q50 74 56 66 Q50 68 44 66 Z" fill="#e8893a"/>
      <path d="M42 58 L48 54 L54 58" stroke="#5a3416" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>`),
  },
  koala: {
    emoji: "🐨",
    svg: view(`<g filter="url(#s)"><circle cx="50" cy="52" r="38" fill="#9aa7b0"/>
      <circle cx="30" cy="36" r="15" fill="#6d7a86"/><circle cx="70" cy="36" r="15" fill="#6d7a86"/>
      <circle cx="42" cy="56" r="7" fill="#3b3b3b"/><circle cx="58" cy="56" r="7" fill="#3b3b3b"/>
      <circle cx="44" cy="56" r="2.6" fill="#fff"/><circle cx="56" cy="56" r="2.6" fill="#fff"/>
      <ellipse cx="50" cy="74" rx="14" ry="10" fill="#c2cdd6"/>
      <ellipse cx="50" cy="74" rx="5" ry="3.5" fill="#3b3b3b"/></g>`),
  },
  /* KayKit adventurers — CC0 3D models (Kay Lousberg, kaylousberg.com)
     rendered to transparent sprites. Static PNGs, precached by the PWA. */
  knight:    { emoji: "🛡️", url: "/avatars/knight.png",    aspect: 54 / 96 },
  mage:      { emoji: "🔮", url: "/avatars/mage.png",      aspect: 74 / 96 },
  rogue:     { emoji: "🗡️", url: "/avatars/rogue.png",     aspect: 48 / 96 },
  barbarian: { emoji: "🪓", url: "/avatars/barbarian.png", aspect: 50 / 96 },
  ranger:    { emoji: "🏹", url: "/avatars/ranger.png",    aspect: 47 / 96 },
};

/* ────────────────────────────── world emblems ────────────────────────────── */

const WORLDS: Record<string, Asset> = {
  "sprout-grove": {
    emoji: "🌱",
    svg: view(`<g filter="url(#s)"><path d="M50 84 C50 60 40 40 24 30 C22 52 30 72 50 84 Z" fill="#2ec4b6"/>
      <path d="M50 84 C50 64 60 46 76 38 C78 58 70 76 50 84 Z" fill="#4ade80"/>
      <rect x="47" y="76" width="6" height="18" rx="3" fill="#8a5a2b"/>
      <path d="M44 90 Q50 96 56 90" stroke="#2ec4b6" stroke-width="3" fill="none" stroke-linecap="round"/></g>`),
  },
  "cottage-fields": {
    emoji: "🐄",
    svg: view(`<g filter="url(#s)"><path d="M18 52 L50 22 L82 52 Z" fill="#e05c4e"/>
      <rect x="22" y="50" width="56" height="40" rx="4" fill="#f6c06a"/>
      <rect x="40" y="62" width="20" height="28" rx="3" fill="#8a5426"/>
      <circle cx="50" cy="76" r="4" fill="#f6c06a"/>
      <rect x="26" y="54" width="8" height="8" rx="2" fill="#fff"/><rect x="66" y="54" width="8" height="8" rx="2" fill="#fff"/>
      <path d="M18 52 L50 22 L82 52 L50 58 Z" fill="#b84538"/></g>`),
  },
  "river-town": {
    emoji: "🏞️",
    svg: view(`<g filter="url(#s)"><path d="M10 28 Q30 10 50 28 T90 28 L90 40 Q70 58 50 40 T10 40 Z" fill="#8fbfe0"/>
      <path d="M10 52 Q30 36 50 52 T90 52 L90 64 Q70 80 50 64 T10 64 Z" fill="#5fb6e8"/>
      <path d="M50 44 Q50 52 50 60" stroke="#fdf3dd" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.8"/></g>`),
  },
  "sky-castle": {
    emoji: "🏰",
    svg: view(`<g filter="url(#s)"><rect x="30" y="30" width="40" height="52" rx="4" fill="#e8b0a0"/>
      <rect x="18" y="42" width="14" height="40" rx="4" fill="#d99a8a"/>
      <rect x="68" y="42" width="14" height="40" rx="4" fill="#d99a8a"/>
      <path d="M18 42 L25 30 L32 42 Z" fill="#d99a8a"/><path d="M68 42 L75 30 L82 42 Z" fill="#d99a8a"/>
      <path d="M30 30 L50 14 L70 30 Z" fill="#b84538"/>
      <path d="M42 82 L58 82 L56 70 L44 70 Z" fill="#7a3a2a"/>
      <circle cx="50" cy="36" r="5" fill="#5a3416"/></g>`),
  },
  "star-academy": {
    emoji: "🚀",
    svg: view(`<g filter="url(#s)"><path d="M50 8 C62 22 66 40 64 58 L36 58 C34 40 38 22 50 8 Z" fill="#c4b5fd"/>
      <circle cx="50" cy="38" r="8" fill="#5ee6ff" stroke="#3b3b3b" stroke-width="3"/>
      <path d="M36 58 L64 58 L56 82 L44 82 Z" fill="#ff8fa3"/>
      <path d="M44 82 L40 92 L50 84 Z" fill="#ffb35c"/><path d="M56 82 L60 92 L50 84 Z" fill="#ffb35c"/>
      <rect x="48" y="60" width="4" height="14" rx="2" fill="#fff" opacity="0.7"/></g>`),
  },
  "jungle-canopy": {
    emoji: "🌴",
    svg: view(`<g filter="url(#s)"><path d="M50 88 Q46 60 34 44 L44 48 Q48 36 58 36 Q68 36 72 48 L78 40 C66 56 56 72 54 88 Z" fill="#43d17c"/>
      <path d="M30 48 Q22 56 14 52 Q26 44 34 46 Z" fill="#2f9e63"/>
      <path d="M76 48 Q84 56 92 52 Q80 44 74 46 Z" fill="#2f9e63"/>
      <rect x="47" y="74" width="6" height="22" rx="3" fill="#8a5a2b"/>
      <path d="M44 96 Q50 102 56 96" stroke="#2f9e63" stroke-width="3" fill="none" stroke-linecap="round"/></g>`),
  },
  "polar-peaks": {
    emoji: "❄️",
    svg: view(`<g filter="url(#s)"><path d="M28 92 L50 28 L72 92 Z" fill="#9fd6ff"/>
      <path d="M50 92 L66 52 L82 92 Z" fill="#c6e7ff"/>
      <path d="M18 92 L34 52 L50 92 Z" fill="#7abfff"/>
      <path d="M50 28 L50 42" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      <path d="M50 58 L58 78 L42 78 Z" fill="#e8f6ff"/></g>`),
  },
};

/* ────────────────────────────── subject icons ────────────────────────────── */

const SUBJECTS: Record<string, Asset> = {
  math: {
    emoji: "🧮",
    svg: view(`<g filter="url(#s)"><rect x="22" y="22" width="56" height="56" rx="10" fill="#5fb6e8"/>
      <text x="50" y="44" font-size="26" font-weight="800" text-anchor="middle" fill="#fff">+</text>
      <text x="50" y="72" font-size="26" font-weight="800" text-anchor="middle" fill="#fff">−</text></g>`),
  },
  bangla: {
    emoji: "📘",
    svg: view(`<g filter="url(#s)"><rect x="22" y="22" width="56" height="56" rx="10" fill="#4caf6a"/>
      <path d="M40 38 L60 38" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
      <path d="M40 52 L60 52" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
      <path d="M40 66 L54 66" stroke="#fff" stroke-width="5" stroke-linecap="round"/></g>`),
  },
  english: {
    emoji: "📗",
    svg: view(`<g filter="url(#s)"><rect x="22" y="22" width="56" height="56" rx="10" fill="#6d9dc5"/>
      <text x="50" y="60" font-size="30" font-weight="800" text-anchor="middle" fill="#fff" font-family="sans-serif">Ab</text></g>`),
  },
  science: {
    emoji: "🔬",
    svg: view(`<g filter="url(#s)"><path d="M36 30 L64 30 L64 40 L52 54 L52 74 L48 78 L48 54 L36 40 Z" fill="#e8eef4" stroke="#9fb4c8" stroke-width="2"/>
      <circle cx="50" cy="66" r="5" fill="#5ee6ff"/><rect x="46" y="22" width="8" height="10" rx="2" fill="#9fb4c8"/></g>`),
  },
  bgs: {
    emoji: "🇧🇩",
    svg: view(`<g filter="url(#s)"><rect x="22" y="26" width="56" height="44" rx="5" fill="#2a9e4b"/>
      <circle cx="50" cy="48" r="14" fill="#e05c4e"/></g>`),
  },
  ict: {
    emoji: "💻",
    svg: view(`<g filter="url(#s)"><rect x="22" y="26" width="56" height="38" rx="6" fill="#5a6b7a"/>
      <rect x="30" y="32" width="40" height="26" rx="3" fill="#0d1b2a"/>
      <rect x="40" y="64" width="20" height="6" rx="2" fill="#9fb4c8"/>
      <rect x="34" y="70" width="32" height="6" rx="3" fill="#5a6b7a"/></g>`),
  },
};

/* ────────────────────────────── shapes (Shape Catcher) ────────────────────────────── */

const SHAPES: Record<string, Asset> = {
  circle: { emoji: "🔵", svg: view(`<g filter="url(#s)"><circle cx="50" cy="50" r="34" fill="#5fb6e8"/></g>`) },
  square: { emoji: "🟨", svg: view(`<g filter="url(#s)"><rect x="18" y="18" width="64" height="64" rx="8" fill="#ffd166"/></g>`) },
  triangle: { emoji: "🔺", svg: view(`<g filter="url(#s)"><path d="M50 16 L86 82 L14 82 Z" fill="#5fad6a"/></g>`) },
  star: { emoji: "⭐", svg: view(`<g filter="url(#s)"><path d="M50 12 L61 40 L90 41 L67 61 L75 92 L50 74 L25 92 L33 61 L10 41 L39 40 Z" fill="#ffd166" stroke="#efb419" stroke-width="3"/></g>`) },
  coin: { emoji: "🪙", svg: view(`<g filter="url(#s)"><circle cx="50" cy="50" r="34" fill="#ffd166" stroke="#efb419" stroke-width="5"/><circle cx="50" cy="50" r="24" fill="none" stroke="#efb419" stroke-width="3"/><path d="M50 28 L57 43 L73 43 L61 53 L66 69 L50 59 L34 69 L39 53 L27 43 L43 43 Z" fill="#efb419"/></g>`) },
  diamond: { emoji: "💠", svg: view(`<g filter="url(#s)"><path d="M50 14 L86 50 L50 86 L14 50 Z" fill="#c4b5fd"/><path d="M50 32 L68 50 L50 68 L32 50 Z" fill="#5ee6ff"/></g>`) },
  heart: { emoji: "❤️", svg: view(`<g filter="url(#s)"><path d="M50 88 C24 70 14 52 20 36 C25 22 42 20 50 32 C58 20 75 22 80 36 C86 52 76 70 50 88 Z" fill="#ff6b7a"/></g>`) },
  ring: { emoji: "⭕", svg: view(`<g filter="url(#s)"><circle cx="50" cy="50" r="32" fill="none" stroke="#ffb35c" stroke-width="14"/></g>`) },
  moon: { emoji: "🌙", svg: view(`<g filter="url(#s)"><path d="M58 14 A38 38 0 1 0 86 62 A30 30 0 1 1 58 14 Z" fill="#ffd166"/></g>`) },
  egg: { emoji: "🥚", svg: view(`<g filter="url(#s)"><path d="M50 14 C70 22 74 40 70 56 C66 72 58 84 50 84 C42 84 34 72 30 56 C26 40 30 22 50 14 Z" fill="#fdf3dd"/></g>`) },
  arrow: { emoji: "⬆️", svg: view(`<g filter="url(#s)"><path d="M50 10 L78 38 L62 38 L62 84 L38 84 L38 38 L22 38 Z" fill="#5fb6e8"/></g>`) },
  bolt: { emoji: "⚡", svg: view(`<g filter="url(#s)"><path d="M58 8 L28 56 L46 56 L40 92 L72 42 L52 42 Z" fill="#ffd166" stroke="#efb419" stroke-width="3"/></g>`) },
  flower: { emoji: "🌼", svg: view(`<g filter="url(#s)"><circle cx="50" cy="24" r="12" fill="#ff8fa3"/><circle cx="76" cy="38" r="12" fill="#ff8fa3"/><circle cx="68" cy="64" r="12" fill="#ff8fa3"/><circle cx="32" cy="64" r="12" fill="#ff8fa3"/><circle cx="24" cy="38" r="12" fill="#ff8fa3"/><circle cx="50" cy="50" r="14" fill="#ffd166"/></g>`) },
};

/* ────────────────────────────── animals ────────────────────────────── */

const ANIMALS: Record<string, Asset> = {
  fish: { emoji: "🐟", svg: view(`<g filter="url(#s)"><ellipse cx="44" cy="50" rx="34" ry="20" fill="#5fb6e8"/>
    <path d="M72 50 L92 36 L92 64 Z" fill="#4c96d8"/>
    <circle cx="30" cy="46" r="4" fill="#3b2418"/><circle cx="31" cy="45" r="1.5" fill="#fff"/>
    <path d="M26 56 Q34 62 42 56" stroke="#4c96d8" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>`) },
  tiger: { emoji: "🐯", svg: view(`<g filter="url(#s)"><circle cx="50" cy="50" r="36" fill="#f4a261"/>
    <path d="M36 18 L32 4 L46 14 Z" fill="#d9822b"/><path d="M64 18 L68 4 L54 14 Z" fill="#d9822b"/>
    <path d="M24 36 L10 32 L20 42 Z" fill="#d9822b"/><path d="M76 36 L90 32 L80 42 Z" fill="#d9822b"/>
    <circle cx="40" cy="50" r="6" fill="#5a3416"/><circle cx="60" cy="50" r="6" fill="#5a3416"/>
    <path d="M44 62 Q50 70 56 62 Q50 64 44 62 Z" fill="#e8893a"/>
    <path d="M42 56 L48 52 L54 56" stroke="#5a3416" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>`) },
  eagle: { emoji: "🦅", svg: view(`<g filter="url(#s)"><path d="M14 40 Q40 26 86 40 L76 60 Q50 50 24 60 Z" fill="#8a5426"/>
    <ellipse cx="50" cy="50" rx="22" ry="26" fill="#b5654b"/>
    <circle cx="42" cy="48" r="4.5" fill="#fff"/><circle cx="58" cy="48" r="4.5" fill="#fff"/>
    <circle cx="43" cy="48" r="2" fill="#3b2418"/><circle cx="57" cy="48" r="2" fill="#3b2418"/>
    <path d="M50 56 L56 62 L50 68 L44 62 Z" fill="#ffb843"/></g>`) },
  dolphin: { emoji: "🐬", svg: view(`<g filter="url(#s)"><path d="M14 52 Q50 18 86 46 Q70 66 46 62 Q30 60 24 72 Q20 80 14 52 Z" fill="#8fbfe0"/>
    <path d="M80 48 L94 40 L88 54 Z" fill="#6d9dc5"/>
    <circle cx="30" cy="50" r="3.5" fill="#3b2418"/><circle cx="31" cy="49" r="1.4" fill="#fff"/></g>`) },
  elephant: { emoji: "🐘", svg: view(`<g filter="url(#s)"><circle cx="50" cy="54" r="34" fill="#9aa7b0"/>
    <circle cx="26" cy="30" r="12" fill="#9aa7b0"/><circle cx="74" cy="30" r="12" fill="#9aa7b0"/>
    <circle cx="38" cy="54" r="5" fill="#3b2418"/><circle cx="62" cy="54" r="5" fill="#3b2418"/>
    <path d="M50 66 Q54 76 50 82 Q46 76 50 66 Z" fill="#7d8a96"/></g>`) },
  bird: { emoji: "🐦", svg: view(`<g filter="url(#s)"><ellipse cx="46" cy="52" rx="26" ry="22" fill="#5fad6a"/>
    <path d="M68 44 L86 40 L70 52 Z" fill="#ffb35c"/><circle cx="30" cy="48" r="4" fill="#fff"/>
    <circle cx="31" cy="47" r="2" fill="#3b2418"/><path d="M34 62 L42 58 L44 66 Z" fill="#ffb843"/>
    <path d="M58 30 L66 18 L72 30 Z" fill="#4f9760"/></g>`) },
  frog: { emoji: "🐸", svg: view(`<g filter="url(#s)"><circle cx="50" cy="54" r="32" fill="#5fad6a"/>
    <circle cx="24" cy="28" r="9" fill="#4f9760"/><circle cx="76" cy="28" r="9" fill="#4f9760"/>
    <circle cx="40" cy="52" r="7" fill="#fdf3dd"/><circle cx="60" cy="52" r="7" fill="#fdf3dd"/>
    <circle cx="42" cy="52" r="3.6" fill="#2a4a33"/><circle cx="58" cy="52" r="3.6" fill="#2a4a33"/>
    <path d="M44 70 Q50 78 56 70 Q50 72 44 70 Z" fill="#3c6e46"/></g>`) },
  lion: { emoji: "🦁", svg: view(`<g filter="url(#s)"><path d="M50 12 L58 24 L72 20 L70 34 L84 36 L72 46 L82 54 L66 54 L50 88 L34 54 L18 54 L28 46 L16 36 L30 34 L28 20 L42 24 Z" fill="#e8a24f"/>
    <circle cx="50" cy="50" r="22" fill="#f6c06a"/>
    <circle cx="42" cy="48" r="4.5" fill="#5a3416"/><circle cx="58" cy="48" r="4.5" fill="#5a3416"/>
    <ellipse cx="50" cy="62" rx="7" ry="4.5" fill="#8a5426"/></g>`) },
  butterfly: { emoji: "🦋", svg: view(`<g filter="url(#s)"><path d="M50 50 Q34 22 14 26 Q10 46 26 54 Q12 62 16 82 Q36 78 50 50 Z" fill="#c4b5fd"/>
    <path d="M50 50 Q66 22 86 26 Q90 46 74 54 Q88 62 84 82 Q64 78 50 50 Z" fill="#ff8fa3"/>
    <ellipse cx="50" cy="50" rx="7" ry="16" fill="#b5654b"/>
    <path d="M50 42 L44 30 M50 58 L56 70" stroke="#3b2418" stroke-width="2" fill="none" stroke-linecap="round"/></g>`) },
  turtle: { emoji: "🐢", svg: view(`<g filter="url(#s)"><ellipse cx="50" cy="56" rx="30" ry="22" fill="#4f9760"/>
    <path d="M34 56 Q28 34 50 28 Q72 34 66 56 Z" fill="#3c7a49"/>
    <circle cx="22" cy="58" r="8" fill="#6d9dc5"/><circle cx="78" cy="58" r="8" fill="#6d9dc5"/>
    <circle cx="18" cy="58" r="2.6" fill="#3b2418"/>
    <path d="M28 72 L44 76 L50 88 L56 76 L72 72 L56 72 L50 80 L44 72 Z" fill="#3c7a49"/></g>`) },
  deer: { emoji: "🦌", svg: view(`<g filter="url(#s)"><circle cx="50" cy="54" r="30" fill="#c9855a"/>
    <path d="M30 24 L22 6 L34 18 Z" fill="#8a5a2b"/><path d="M70 24 L78 6 L66 18 Z" fill="#8a5a2b"/>
    <path d="M22 6 L14 0 L26 4 Z" fill="#8a5a2b"/><path d="M78 6 L86 0 L74 4 Z" fill="#8a5a2b"/>
    <path d="M40 44 L60 44 L56 56 L44 56 Z" fill="#fdf3dd"/>
    <circle cx="42" cy="54" r="4" fill="#3b2418"/><circle cx="58" cy="54" r="4" fill="#3b2418"/>
    <ellipse cx="50" cy="66" rx="6" ry="4" fill="#3b2418"/></g>`) },
  /* Nova 2.0's plush star-owl — same character as the mascot, so the AnimalHome
     answer card and CountingSong's Nova all match the logo/room design. */
  owl: { emoji: "🦉", svg: view(`<defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#06122a" flood-opacity="0.3"/></filter>
  <linearGradient id="nb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a4e2a"/><stop offset="0.5" stop-color="#8a5c33"/><stop offset="1" stop-color="#a06a3a"/></linearGradient>
  <radialGradient id="ni" cx="0.42" cy="0.38" r="0.78"><stop offset="0" stop-color="#ffe37a"/><stop offset="0.5" stop-color="#f4ae3f"/><stop offset="0.85" stop-color="#d8871a"/><stop offset="1" stop-color="#b96b0f"/></radialGradient>
  <clipPath id="cc"><ellipse cx="50" cy="64" rx="20" ry="22"/></clipPath>
</defs>
<g filter="url(#s)">
  <ellipse cx="50" cy="92" rx="30" ry="6" fill="#06122a" opacity="0.18"/>
  <path d="M30 16 Q26 2 18 0 Q24 6 26 18 Z" fill="#5a3a20"/>
  <path d="M70 16 Q74 2 82 0 Q76 6 74 18 Z" fill="#5a3a20"/>
  <path d="M30 16 Q28 24 30 30 Q24 22 30 16 Z" fill="#7a4e2a"/>
  <path d="M70 16 Q72 24 70 30 Q76 22 70 16 Z" fill="#7a4e2a"/>
  <ellipse cx="24" cy="66" rx="10" ry="16" fill="#5a3a20"/>
  <ellipse cx="76" cy="66" rx="10" ry="16" fill="#5a3a20"/>
  <path d="M50 12 C 28 16 18 40 18 58 C 18 76 32 88 50 88 C 68 88 82 76 82 58 C 82 40 72 16 50 12 Z" fill="url(#nb)"/>
  <path d="M50 14 C 32 18 24 40 26 58 C 28 72 40 82 50 82 C 60 82 72 72 74 58 C 76 40 68 18 50 14 Z" fill="#f0e3c2"/>
  <path d="M38 40 a9 9 0 1 0 0.1 0 Z" fill="#f4ead0"/>
  <path d="M62 40 a9 9 0 1 0 0.1 0 Z" fill="#f4ead0"/>
  <g clip-path="url(#cc)">
    <ellipse cx="50" cy="64" rx="20" ry="22" fill="#ead9b0"/>
    <g fill="#7a4e2a" opacity="0.8"><path d="M30 50 q10 4 20 0 q-4 2 -10 2 q-6 0 -10 -2 Z"/><path d="M30 58 q10 4 20 0 q-4 2 -10 2 q-6 0 -10 -2 Z"/><path d="M30 66 q10 4 20 0 q-4 2 -10 2 q-6 0 -10 -2 Z"/><path d="M32 74 q9 3 18 0 q-4 2 -9 2 q-6 0 -9 -2 Z"/></g>
  </g>
  <ellipse cx="40" cy="40" rx="9" ry="9.5" fill="#3a2a1c"/>
  <ellipse cx="60" cy="40" rx="9" ry="9.5" fill="#3a2a1c"/>
  <circle cx="40" cy="40" r="7.5" fill="url(#ni)"/>
  <circle cx="60" cy="40" r="7.5" fill="url(#ni)"/>
  <circle cx="40" cy="40" r="3.9" fill="#1a1206"/>
  <circle cx="60" cy="40" r="3.9" fill="#1a1206"/>
  <circle cx="38.2" cy="38.2" r="1.5" fill="#fff" opacity="0.95"/>
  <circle cx="58.2" cy="38.2" r="1.5" fill="#fff" opacity="0.95"/>
  <path d="M46 48 Q 50 52 50 55 Q 50 52 54 48 Q 50 50 46 48 Z" fill="#3a3a34"/>
  <path d="M50 50 Q 53 52 52 54 Q 48 54 47 52 Q 47 50 50 50 Z" fill="#5a5a50"/>
  <g fill="#3a2a1c">
    <path d="M38 84 Q34 90 31 94 Q35 91 38 87 Z"/><path d="M44 85 Q42 90 39 95 Q44 92 46 88 Z"/>
    <path d="M56 85 Q58 90 61 95 Q56 92 54 88 Z"/><path d="M62 84 Q66 90 69 94 Q65 91 62 87 Z"/>
  </g>
</g>`) },
  penguin: { emoji: "🐧", svg: view(`<g filter="url(#s)"><ellipse cx="50" cy="52" rx="24" ry="36" fill="#3b3b3b"/>
    <ellipse cx="50" cy="60" rx="15" ry="24" fill="#fff"/>
    <circle cx="40" cy="42" r="5" fill="#fff"/><circle cx="60" cy="42" r="5" fill="#fff"/>
    <circle cx="42" cy="42" r="2.4" fill="#3b2418"/><circle cx="58" cy="42" r="2.4" fill="#3b2418"/>
    <path d="M50 70 L56 78 L50 86 L44 78 Z" fill="#ffb843"/></g>`) },
  rhino: { emoji: "🦏", svg: view(`<g filter="url(#s)"><ellipse cx="50" cy="54" rx="32" ry="26" fill="#8d99ae"/>
    <path d="M30 40 L10 44 L26 52 Z" fill="#6d7a86"/>
    <circle cx="36" cy="52" r="4" fill="#3b2418"/><circle cx="60" cy="52" r="4" fill="#3b2418"/>
    <path d="M58 40 L66 34 L64 44 Z" fill="#6d7a86"/></g>`) },
  bat: { emoji: "🦇", svg: view(`<g filter="url(#s)"><path d="M50 40 Q40 16 14 20 Q8 44 26 52 Q18 66 22 78 L38 66 L46 84 L50 76 L54 84 L62 66 L78 78 Q82 66 74 52 Q92 44 86 20 Q60 16 50 40 Z" fill="#4a3b6b"/>
    <circle cx="42" cy="44" r="3.4" fill="#ffd166"/><circle cx="58" cy="44" r="3.4" fill="#ffd166"/></g>`) },
  crocodile: { emoji: "🐊", svg: view(`<g filter="url(#s)"><path d="M18 58 Q34 40 52 50 Q70 40 84 52 Q88 60 80 62 L22 66 Q16 64 18 58 Z" fill="#4f9760"/>
    <path d="M20 60 L50 56 L30 68 Z" fill="#3c7a49"/>
    <circle cx="30" cy="54" r="3" fill="#fff"/><circle cx="31" cy="53" r="1.6" fill="#3b2418"/>
    <path d="M18 58 L8 54 L14 62 Z" fill="#fdf3dd"/>
    <path d="M82 60 L92 62 L82 66 Z" fill="#3c7a49"/></g>`) },
  camel: { emoji: "🐪", svg: view(`<g filter="url(#s)"><path d="M26 58 Q18 70 20 78 Q34 74 30 62 Q28 56 26 58 Z" fill="#e8a24f"/>
    <path d="M30 58 Q34 34 50 30 Q66 34 70 58 Q78 62 82 70 Q86 78 80 78 L36 78 Q30 74 30 58 Z" fill="#e8a24f"/>
    <circle cx="66" cy="52" r="3.6" fill="#3b2418"/>
    <path d="M70 58 L78 62 L72 66 Z" fill="#a86a40"/>
    <path d="M80 78 L88 84 L78 86 Z" fill="#a86a40"/></g>`) },
  parrot: { emoji: "🦜", svg: view(`<g filter="url(#s)"><ellipse cx="50" cy="52" rx="24" ry="30" fill="#5fad6a"/>
    <circle cx="42" cy="44" r="5" fill="#fff"/><circle cx="43" cy="43" r="2.4" fill="#3b2418"/>
    <path d="M50 66 Q60 74 54 80 Q48 74 50 66 Z" fill="#ff8fa3"/>
    <path d="M62 40 L78 36 L80 48 Z" fill="#4cc9f0"/>
    <path d="M64 30 L72 16 L80 30 Z" fill="#ff8fa3"/><path d="M34 28 L40 16 L48 30 Z" fill="#4cc9f0"/></g>`) },
  cat: { emoji: "🐱", svg: view(`<g filter="url(#s)"><path d="M50 16 L34 4 L36 24 Z" fill="#e8a24f"/><path d="M50 16 L66 4 L64 24 Z" fill="#e8a24f"/>
    <circle cx="50" cy="54" r="32" fill="#f4a261"/>
    <circle cx="40" cy="52" r="5.5" fill="#3b2418"/><circle cx="60" cy="52" r="5.5" fill="#3b2418"/>
    <path d="M44 66 Q50 72 56 66" stroke="#5a3416" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M50 60 L54 66 L50 72 L46 66 Z" fill="#ff8fa3"/></g>`) },
  dog: { emoji: "🐶", svg: view(`<g filter="url(#s)"><path d="M36 26 L28 8 L44 20 Z" fill="#8a5426"/><path d="M64 26 L72 8 L56 20 Z" fill="#8a5426"/>
    <ellipse cx="50" cy="50" rx="26" ry="30" fill="#c9855a"/>
    <ellipse cx="50" cy="58" rx="14" ry="12" fill="#fdf3dd"/>
    <circle cx="42" cy="46" r="4.5" fill="#3b2418"/><circle cx="58" cy="46" r="4.5" fill="#3b2418"/>
    <ellipse cx="50" cy="64" rx="5" ry="3.5" fill="#3b2418"/>
    <path d="M34 72 L38 66 L42 74 Z" stroke="#8a5426" stroke-width="2" fill="none" stroke-linecap="round"/></g>`) },
  cow: { emoji: "🐮", svg: view(`<g filter="url(#s)"><circle cx="50" cy="52" r="34" fill="#fdf3dd"/>
    <ellipse cx="50" cy="52" rx="20" ry="26" fill="#4a3b6b" opacity="0.28"/>
    <path d="M32 24 L28 8 L42 20 Z" fill="#3b3b3b"/><path d="M68 24 L72 8 L58 20 Z" fill="#3b3b3b"/>
    <circle cx="40" cy="50" r="5" fill="#3b3b3b"/><circle cx="60" cy="50" r="5" fill="#3b3b3b"/>
    <circle cx="42" cy="50" r="2" fill="#fff"/><circle cx="58" cy="50" r="2" fill="#fff"/>
    <ellipse cx="50" cy="64" rx="12" ry="8" fill="#ff8fa3"/>
    <ellipse cx="50" cy="64" rx="4" ry="3" fill="#e05c4e"/></g>`) },
  duck: { emoji: "🦆", svg: view(`<g filter="url(#s)"><ellipse cx="44" cy="56" rx="28" ry="22" fill="#fdf3dd"/>
    <circle cx="66" cy="42" r="10" fill="#fdf3dd"/>
    <circle cx="70" cy="40" r="3" fill="#3b2418"/>
    <path d="M74 42 L88 46 L74 50 Z" fill="#ffb843"/>
    <path d="M28 64 Q20 76 26 84 L40 78 Q34 70 34 66 Z" fill="#ffb843"/></g>`) },
  horse: { emoji: "🐴", svg: view(`<g filter="url(#s)"><ellipse cx="50" cy="54" rx="30" ry="34" fill="#8a5426"/>
    <path d="M60 34 L72 18 L78 34 Z" fill="#a86a40"/>
    <ellipse cx="70" cy="28" rx="12" ry="14" fill="#a86a40"/>
    <circle cx="76" cy="26" r="3.4" fill="#3b2418"/>
    <path d="M78 34 L88 38 L78 42 Z" fill="#6d4a26"/>
    <path d="M34 64 L24 76 L36 78 Q42 70 40 64 Z" fill="#c9855a"/></g>`) },
  goat: { emoji: "🐐", svg: view(`<g filter="url(#s)"><circle cx="50" cy="54" r="30" fill="#e8eef4"/>
    <path d="M30 26 L22 10 L34 22 Z" fill="#c2cdd6"/><path d="M70 26 L78 10 L66 22 Z" fill="#c2cdd6"/>
    <path d="M20 12 L16 4 L24 8 Z" fill="#9fb4c8"/><path d="M80 12 L84 4 L76 8 Z" fill="#9fb4c8"/>
    <ellipse cx="50" cy="60" rx="12" ry="9" fill="#fff"/>
    <circle cx="42" cy="52" r="4" fill="#3b2418"/><circle cx="58" cy="52" r="4" fill="#3b2418"/>
    <ellipse cx="50" cy="66" rx="4" ry="2.8" fill="#c9855a"/></g>`) },
  pig: { emoji: "🐷", svg: view(`<g filter="url(#s)"><circle cx="50" cy="54" r="34" fill="#ff8fa3"/>
    <path d="M34 26 L26 14 L38 22 Z" fill="#f78aa2"/><path d="M66 26 L74 14 L62 22 Z" fill="#f78aa2"/>
    <circle cx="40" cy="52" r="4" fill="#3b2418"/><circle cx="60" cy="52" r="4" fill="#3b2418"/>
    <ellipse cx="50" cy="66" rx="9" ry="6" fill="#f78aa2"/>
    <ellipse cx="44" cy="66" rx="2.4" ry="1.6" fill="#c9435f"/><ellipse cx="56" cy="66" rx="2.4" ry="1.6" fill="#c9435f"/></g>`) },
};

/* ────────────────────────────── food + things ────────────────────────────── */

const FOOD: Record<string, Asset> = {
  apple: { emoji: "🍎", svg: view(`<g filter="url(#s)"><circle cx="50" cy="56" r="28" fill="#e05c4e"/>
    <path d="M44 34 Q50 22 62 26 Q56 38 44 34 Z" fill="#4f9760"/>
    <rect x="49" y="20" width="4" height="12" rx="2" fill="#8a5426"/>
    <ellipse cx="40" cy="50" rx="5" ry="9" fill="#ff8a7a" opacity="0.5"/></g>`) },
  banana: { emoji: "🍌", svg: view(`<g filter="url(#s)"><path d="M28 18 Q16 46 34 78 Q42 88 58 84 Q70 80 72 72 Q40 78 40 56 Q42 34 28 18 Z" fill="#ffd166"/>
    <path d="M40 78 L28 86 L34 78 Z" fill="#8a5a2b"/>
    <path d="M30 30 Q24 44 30 60" stroke="#f4c542" stroke-width="3" fill="none" stroke-linecap="round"/></g>`) },
  grapes: { emoji: "🍇", svg: view(`<g filter="url(#s)"><circle cx="36" cy="62" r="11" fill="#8a63f0"/><circle cx="58" cy="62" r="11" fill="#8a63f0"/>
    <circle cx="47" cy="74" r="11" fill="#7c54e0"/>
    <circle cx="30" cy="46" r="10" fill="#a179f5"/><circle cx="47" cy="44" r="10" fill="#a179f5"/><circle cx="64" cy="46" r="10" fill="#a179f5"/>
    <path d="M47 24 Q40 32 42 40 M47 24 Q54 32 52 40" stroke="#4f9760" stroke-width="3" fill="none" stroke-linecap="round"/></g>`) },
  strawberry: { emoji: "🍓", svg: view(`<g filter="url(#s)"><path d="M50 26 C68 34 72 56 50 82 C28 56 32 34 50 26 Z" fill="#e05c4e"/>
    <path d="M40 24 Q50 18 60 24 Q58 30 50 30 Q42 30 40 24 Z" fill="#4f9760"/>
    <circle cx="44" cy="46" r="2" fill="#ffd166"/><circle cx="56" cy="52" r="2" fill="#ffd166"/><circle cx="48" cy="62" r="2" fill="#ffd166"/><circle cx="56" cy="66" r="2" fill="#ffd166"/></g>`) },
  orange: { emoji: "🍊", svg: view(`<g filter="url(#s)"><circle cx="50" cy="54" r="28" fill="#f4a261"/>
    <circle cx="50" cy="54" r="26" fill="none" stroke="#e8893a" stroke-width="2"/>
    <circle cx="50" cy="54" r="8" fill="#f78aa2"/>
    <path d="M40 30 L34 18 L46 26 Z" fill="#4f9760"/></g>`) },
  egg2: { emoji: "🥚", svg: view(`<g filter="url(#s)"><path d="M50 16 C68 24 72 40 68 54 C64 70 56 82 50 82 C44 82 36 70 32 54 C28 40 32 24 50 16 Z" fill="#fff3dc" stroke="#e8d3a8" stroke-width="2"/></g>`) },
  sun: { emoji: "☀️", svg: view(`<g filter="url(#s)"><circle cx="50" cy="50" r="22" fill="#ffd166"/>
    <g stroke="#ffd166" stroke-width="6" stroke-linecap="round"><path d="M50 12 V6 M50 88 V94 M12 50 H6 M88 50 H94"/><path d="M23 23 L19 19 M77 77 L81 81 M77 23 L81 19 M23 77 L19 81"/></g></g>`) },
  ball: { emoji: "⚽", svg: view(`<g filter="url(#s)"><circle cx="50" cy="50" r="32" fill="#fff"/>
    <path d="M50 50 L62 34 M50 50 L30 36 M50 50 L42 68 M50 50 L62 66 M50 50 L38 52" stroke="#3b3b3b" stroke-width="2.5"/>
    <circle cx="50" cy="50" r="12" fill="none" stroke="#3b3b3b" stroke-width="2.5"/></g>`) },
  hat: { emoji: "🎩", svg: view(`<g filter="url(#s)"><rect x="30" y="36" width="40" height="26" rx="4" fill="#3b3b3b"/>
    <path d="M34 36 L34 26 Q50 10 66 26 L66 36 Z" fill="#3b3b3b"/>
    <rect x="22" y="60" width="56" height="12" rx="6" fill="#4a3b6b"/>
    <rect x="28" y="20" width="44" height="8" rx="4" fill="#ff8fa3"/></g>`) },
  bed: { emoji: "🛏️", svg: view(`<g filter="url(#s)"><rect x="16" y="34" width="68" height="16" rx="6" fill="#8a5426"/>
    <rect x="18" y="44" width="40" height="24" rx="6" fill="#ff8fa3"/>
    <rect x="58" y="40" width="26" height="14" rx="5" fill="#5fb6e8"/>
    <rect x="58" y="50" width="26" height="12" rx="5" fill="#f4f6f8"/></g>`) },
  car: { emoji: "🚗", svg: view(`<g filter="url(#s)"><path d="M20 56 L28 34 Q30 28 36 28 L64 28 Q70 28 72 34 L80 56 Q82 60 78 62 L22 62 Q18 60 20 56 Z" fill="#e05c4e"/>
    <rect x="34" y="30" width="32" height="14" rx="6" fill="#5ee6ff"/>
    <circle cx="30" cy="62" r="8" fill="#3b3b3b"/><circle cx="70" cy="62" r="8" fill="#3b3b3b"/>
    <circle cx="30" cy="62" r="3" fill="#9aa7b0"/><circle cx="70" cy="62" r="3" fill="#9aa7b0"/></g>`) },
  bus: { emoji: "🚌", svg: view(`<g filter="url(#s)"><rect x="16" y="30" width="68" height="38" rx="10" fill="#ffb35c"/>
    <rect x="22" y="32" width="56" height="18" rx="6" fill="#5ee6ff"/>
    <circle cx="30" cy="66" r="7" fill="#3b3b3b"/><circle cx="70" cy="66" r="7" fill="#3b3b3b"/>
    <circle cx="30" cy="66" r="2.6" fill="#9aa7b0"/><circle cx="70" cy="66" r="2.6" fill="#9aa7b0"/></g>`) },
  flower2: { emoji: "🌸", svg: view(`<g filter="url(#s)"><circle cx="50" cy="24" r="11" fill="#ff8fa3"/><circle cx="74" cy="38" r="11" fill="#ff8fa3"/><circle cx="65" cy="62" r="11" fill="#ff8fa3"/><circle cx="35" cy="62" r="11" fill="#ff8fa3"/><circle cx="26" cy="38" r="11" fill="#ff8fa3"/><circle cx="50" cy="50" r="13" fill="#ffd166"/></g>`) },
};

/* ────────────────────────────── homes + EnLetters extras ────────────────────────────── */

const THINGS: Record<string, Asset> = {
  wave: {
    emoji: "🌊",
    svg: view(`<g filter="url(#s)"><path d="M10 46 Q24 32 38 46 T66 46 T94 46 L94 78 Q78 64 62 78 T34 78 T10 78 Z" fill="#5fb6e8"/>
      <path d="M10 34 Q24 20 38 34 T66 34 T94 34" stroke="#8fbfe0" stroke-width="8" fill="none" stroke-linecap="round"/></g>`),
  },
  tree: {
    emoji: "🌳",
    svg: view(`<g filter="url(#s)"><circle cx="34" cy="34" r="16" fill="#4f9760"/><circle cx="52" cy="24" r="18" fill="#5fad6a"/><circle cx="66" cy="36" r="16" fill="#4f9760"/><circle cx="48" cy="42" r="18" fill="#5fad6a"/>
      <rect x="45" y="52" width="10" height="28" rx="4" fill="#8a5a2b"/><circle cx="56" cy="26" r="5" fill="#ff8fa3"/></g>`),
  },
  cloud: {
    emoji: "☁️",
    svg: view(`<g filter="url(#s)"><circle cx="38" cy="52" r="18" fill="#ffffff"/><circle cx="56" cy="42" r="22" fill="#ffffff"/><circle cx="66" cy="56" r="14" fill="#ffffff"/><circle cx="28" cy="58" r="12" fill="#ffffff"/></g>`),
  },
  ice: {
    emoji: "🧊",
    svg: view(`<g filter="url(#s)"><rect x="30" y="22" width="28" height="28" rx="6" fill="#a9def0"/>
      <path d="M30 22 L58 50 M58 22 L30 50" stroke="#e8f7fc" stroke-width="5" stroke-linecap="round"/></g>`),
  },
  kite: {
    emoji: "🪁",
    svg: view(`<g filter="url(#s)"><path d="M50 18 L84 46 L50 70 L16 46 Z" fill="#ff8fa3"/>
      <path d="M50 18 L50 70 M16 46 L84 46" stroke="#fff" stroke-width="3"/>
      <path d="M50 46 L34 34 M50 46 L66 58" stroke="#c9435f" stroke-width="2.5"/>
      <path d="M50 70 L44 88 Q50 94 56 88 Z" fill="#ffb35c"/>
      <path d="M84 46 L94 40 L88 52 Z" fill="#5fb6e8"/></g>`),
  },
};

const THINGS2: Record<string, Asset> = {
  trophy: {
    emoji: "🏆",
    svg: view(`<g filter="url(#s)"><path d="M30 16 H70 V40 Q70 58 50 62 Q30 58 30 40 Z" fill="#ffd166"/>
      <rect x="44" y="62" width="12" height="14" rx="3" fill="#efb419"/>
      <path d="M38 80 L62 80 L58 90 L42 90 Z" fill="#efb419"/>
      <path d="M30 16 L20 20 Q16 32 26 38 L30 34 Z" fill="#ffb35c"/>
      <path d="M70 16 L80 20 Q84 32 74 38 L70 34 Z" fill="#ffb35c"/>
      <path d="M44 36 L50 28 L56 36 L50 34 Z" fill="#efb419"/></g>`),
  },
  rat: {
    emoji: "🐀",
    svg: view(`<g filter="url(#s)"><circle cx="50" cy="58" r="20" fill="#b0a8c0"/>
      <circle cx="38" cy="40" r="10" fill="#b0a8c0"/>
      <circle cx="38" cy="38" r="2.4" fill="#3b3b3b"/>
      <circle cx="52" cy="40" r="3.5" fill="#e05c4e"/>
      <path d="M42 42 Q38 35 44 34 Z" fill="#ff8fa3"/>
      <path d="M66 52 Q86 38 80 56 Q90 62 74 64 Z" fill="#b0a8c0"/>
      <path d="M50 78 Q52 88 50 92 M50 78 Q46 88 48 92" stroke="#b0a8c0" stroke-width="3" fill="none" stroke-linecap="round"/></g>`),
  },
  hen: {
    emoji: "🐔",
    svg: view(`<g filter="url(#s)"><circle cx="46" cy="58" r="22" fill="#f4a261"/>
      <circle cx="44" cy="48" r="6" fill="#fff"/><circle cx="46" cy="48" r="3" fill="#3b3b3b"/>
      <path d="M56 54 L72 58 L56 62 Z" fill="#e07b39"/>
      <path d="M50 52 L56 42 Q54 40 52 43 L48 47 Z" fill="#e05c4e"/>
      <path d="M38 70 Q26 64 32 56" stroke="#e05c4e" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M48 80 Q50 92 48 96" stroke="#e07b39" stroke-width="4" fill="none" stroke-linecap="round"/></g>`),
  },
  web: {
    emoji: "🕸️",
    svg: view(`<g filter="url(#s)"><circle cx="50" cy="50" r="30" fill="none" stroke="#cfd8dc" stroke-width="3"/>
      <circle cx="50" cy="50" r="20" fill="none" stroke="#cfd8dc" stroke-width="2.5"/>
      <circle cx="50" cy="50" r="10" fill="none" stroke="#cfd8dc" stroke-width="2"/>
      <path d="M50 50 L50 20 M50 50 L50 80 M50 50 L20 50 M50 50 L80 50 M50 50 L29 29 M50 50 L71 71 M50 50 L71 29 M50 50 L29 71" stroke="#cfd8dc" stroke-width="2"/>
      <circle cx="50" cy="50" r="4" fill="#90a4ae"/></g>`),
  },
};

/* ──────────────────────── family words (pure-emoji, no SVG) ──────────────────────── */

const FAMILY: Record<string, Asset> = {
  mom: { emoji: "👩" },
  dad: { emoji: "👨" },
  brother: { emoji: "👦" },
  sister: { emoji: "👧" },
  grandpa: { emoji: "👴" },
  grandma: { emoji: "👵" },
  uncle: { emoji: "👨‍🦰" },
  aunt: { emoji: "👩‍🦰" },
  cousin: { emoji: "🧒" },
};

export const ASSETS: Record<string, Asset> = {
  nova: { emoji: "🦉", svg: NOVA, aspect: 160 / 210 },
  ...AVATARS,
  ...WORLDS,
  ...SUBJECTS,
  ...SHAPES,
  ...ANIMALS,
  ...FOOD,
  ...THINGS,
  ...THINGS2,
  ...FAMILY,
};