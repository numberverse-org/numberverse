# 🛡️ Content safety & no-ads — CI gates (#91 + #92)

Numberverse ships to young children. Two dedicated gates keep the tree safe on
every PR, **fail-closed** (a hit → the PR cannot merge).

## ① Content safety (`scripts/content-safety.mjs` → CI job `content-safety`)

Every skill title (`packages/core/src/skills.ts`) and every quoted display
string in `apps/kid/src/game/*Scene.ts` is scanned for words a child should
never see in an educational app: violence, horror, insults (`kill`, `blood`,
`bomb`, `weapon`, `ghost`, `demon`, `dead`, `stupid`, `liar`, `die`, `gun`,
…). Word boundaries make it safe: `skills` never trips `kill`, `diet` never
trips `die`.

This mirrors the Oracle's `l1_safety()` standup check but as a fast,
self-contained gate **with an allowlist** the Oracle lacks.

### Adding to the allowlist

Only words that are **both** legitimate-in-context AND kid-safe belong here.
Edit the `ALLOWLIST` map at the top of `scripts/content-safety.mjs`:

```js
const ALLOWLIST = new Map([
  ["die", "math game uses 'roll the die' (singular of dice)"],
]);
```

The value is a **reason** — a bare entry with no reason will be rejected in
review. Prefer renaming the content over allowlisting; the allowlist is for
the rare legitimate collision, not a way around the gate.

## ② No-ads (`scripts/tracker-scan.mjs` → CI job `tracker-scan`)

Numberverse is **100% ad-free** — no ads, no analytics, no trackers, ever.
The gate checks two layers:

1. **Dependencies** — every workspace `package.json` against a blocklist of
   ad/analytics/tracker SDK names (`adsbygoogle`, `google-analytics`, `ga-4`,
   `mixpanel`, `segment`, `amplitude`, `posthog`, `fullstory`, `hotjar`,
   `fathom`, `plausible`, `facebook-pixel`, `googlesyndication`, …). Exact
   match — `react-admin` can never trip `admin`.
2. **Endpoints** — shipped source (`apps/kid/src`, `apps/parent/app`,
   `apps/admin/src`, `packages/core/src`) against SDK call shapes and domains
   (`adsbygoogle`, `doubleclick.net`, `googletagmanager.com`, `mixpanel.com`,
   `fbq(`, `analytics.google`, `branch.io`, …).

A hit fails CI with the offending package/file + fingerprint named, so the fix
is obvious. This mirrors the Oracle's `AD_SDKS` list so both gates agree.

### Adding a dependency

`pnpm add` → run `node scripts/tracker-scan.mjs` (or just push the PR — the
gate runs it). If the new package is legitimately needed and **not** an
ad/tracker, it won't match the blocklist and the gate stays green. If it does
match, it's an ad/tracker and must not be added.

## Why dedicated gates (and not just the Oracle)

The Oracle (`oracle` CI job) already runs `l1_safety()` and `l1_privacy()` on
every PR. These dedicated jobs add:
- **Clear, actionable errors** — the exact file + line + word/SDK, instead of
  an opaque "oracle gate CLEAN".
- **The allowlist mechanism** — a sanctioned, reviewed path for legitimate
  collisions (the Oracle has none).
- **Fail-fast parallelism** — they run in seconds, in parallel with the other
  gates, so a contributor sees the specific problem immediately.
