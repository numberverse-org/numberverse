# 🌍 Multi-language scaffold — Arabic/Hindi research (#131)

> Status: **architected + shipped** (locale-pack system live in 0.27.x).
> This is the spike doc: what it costs to add a language+country, and the
> design that makes it a CONFIG addition, not a code rewrite. Bengali ships
> today; the same registry carries any future language/country.

## The design: one `LocalePack` per language+country

`packages/core/src/locale.ts` is the single registry. A locale is ONE object:

```ts
{
  code: "ar",            // nv_lang value + i18n DICTS key
  nativeName: "العربية", // shown in the language picker
  dir: "rtl",            // RTL flips the whole document
  digits: "arabic-indic",// ٠١٢٣… — the UI maps 0-9 through this
  localeTag: "ar-SA",    // Intl + grouping
  curriculum: "saudi-arabia", // country-based content pack key
  voice: "ar-SA",        // TTS voice hint
  status: "planned",     // shipped locales are audit-enforced
}
```

Shipped today: **en** (early-years UK) and **bn** (NCTB Bangladesh). Planned
scaffolds already registered: **ar** (ar-SA, RTL, Arabic-Indic digits) and
**hi** (hi-IN, Devanagari digits). Adding a country = adding this object +
a dictionary + a content pack.

## What a new language touches (cost estimates)

| Area | ar (Arabic) | hi (Hindi) | Effort |
|---|---|---|---|
| **LocalePack** | done (registered) | done (registered) | trivial |
| **i18n dictionary** (~200 keys) | translate → `DICTS.ar` | translate → `DICTS.hi` | ~1-2 days per language (native reviewer needed for kids' phrasing) |
| **RTL layout** | `documentElement.dir = "rtl"` (wired) + CSS mirror pass | none (LTR) | ar: 0.5-1 day CSS audit |
| **Digits** | Arabic-Indic via `formatNumber` (done) | Devanagari via `formatNumber` (done) | trivial |
| **TTS voice** | ar-SA neural voice → voice pack | hi-IN neural voice → voice pack | ar: on-device model ~80-150MB; hi: similar. Piped through the existing `/voice/` CacheFirst runtime cache |
| **Curriculum/content** | Saudi curriculum pack (content-first) | NCERT India pack | the REAL cost — new skills/games per country's curriculum (weeks, content work) |
| **Audit parity** | auto — audit iterates shipped locales | auto | trivial |

**Bottom line:** the ENGINE cost of a new language is 1-3 engineering days
(translation + RTL + voice). The CONTENT cost (that country's curriculum) is
the dominant term and is deliberately data-driven — a curriculum pack feeds
the existing catalog/band/sequence system without touching app code.

## How content stays country-based

- Every `LocalePack` carries a `curriculum` key (`nctb-bangladesh` today).
- Skills/games live in the catalog and can be tagged by curriculum; a country
  ships with its own pack of skills aligned to ITS syllabus (Saudi, NCERT…).
- The existing **band + sequence guards** (audit-enforced) apply identically
  to any curriculum — a count-to-10 game never asks for 12, in any country.

## RTL plan (Arabic)

1. `documentElement.dir = "rtl"` when an RTL pack is active — **wired in App.tsx**.
2. CSS: the game uses flexbox/grid layout (direction-agnostic); a focused
   mirror pass on paddings/margins + a few absolute-positioned HUDs.
3. Phaser scenes: text objects align left/right per `text.align`; the scene
   scaffolding already reads locale, so a `dir`-aware alignment helper covers
   the HUD.

## What shipped with this scaffold (0.27.x)

- `packages/core/src/locale.ts` — registry + `formatNumber` + `isRtl` + `shippedLocales()`
- `apps/kid/src/game/locale.ts` — `getLocale()` returns the active pack
- `apps/kid/src/game/i18n.ts` — `DICTS` table; `t()` resolves by locale code
- `apps/kid/src/App.tsx` — RTL `dir` applied on language change
- `apps/kid/scripts/audit.mjs` — i18n parity now iterates EVERY shipped locale
- `scripts/test-locale.mjs` — CI gate (18 checks: registry, digits, RTL, fallback, parity)

## Guardrail: never scope-creep a language

A language ships when it has a **full dictionary + TTS + a real curriculum
pack** — not before. `status: "planned"` is the honest in-between: the scaffold
exists, the content doesn't yet. The audit only enforces parity for
`status: "shipped"` locales, so a partial translation can never quietly ship.
