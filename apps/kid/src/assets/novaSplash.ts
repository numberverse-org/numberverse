/** #117/#1323 — Nova splash SVG kept in its own tiny module so the boot
 *  chunk can draw the splash mascot WITHOUT importing the full ASSETS sticker
 *  library (assets/svgs.ts). The same art also lives in ASSETS.nova for Phaser;
 *  keeping this copy isolated keeps every SVG except Nova out of the boot
 *  graph on mid-range Android cold starts.
 */
export const NOVA_SPLASH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 210">
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
