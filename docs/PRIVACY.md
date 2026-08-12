# 🔒 Numberverse — data-minimization audit (#90)

_Every piece of data stored on-device or on the API, with a justification for
each. Zero analytics. Reviewed by the Oracle Privacy Steward (l1_privacy)._

Last audited: **2026-08-13** (against 0.26.14 + guardrail sweep).

## Guiding rules

1. **No analytics, no trackers, ever** — enforced by the `tracker-scan` CI
   gate (#92) and the Oracle's `l1_privacy`.
2. **PII-shaped data is redacted at every exit path** — the `#266` log scrubber
   and the `#270` story-context redaction run *before* anything is written.
3. **Aggregates are opt-in** — the `nv_parent_aggregate_opt_in` flag (#330)
   is off by default.
4. **Every field exists to make the app work** — nothing is collected "just in
   case".

## On-device storage (browser localStorage, kid PWA)

| Key | What | Why | Minimization |
|---|---|---|---|
| `nv_parent_token` | parent session token | authenticated parent API (gate + syllabus) | hashed server-side; parent-initiated |
| `nv_parent_name` | display name | shown on the gate + syllabus header | only what the parent entered |
| `nv_kid_id` | currently selected kid | which kid is active | id only, no profile data |
| `nv_device_id` / `nv_device_secret` | device auth identity | offline-capable sync identity | random, device-local |
| `nv_device_token` / `nv_device_profile_id` | server device session | authenticated progress sync | scoped to the anonymous device profile |
| `nv_kid_map` | `{ localKidId: serverKidId }` | map offline kid ↔ server kid | ids only |
| `nv_kids` | cached kid roster | offline access to the kid switcher | cached copy of server data |
| `nv_kid_settings` | per-kid prefs | offline settings (subjects, band, limits) | cached copy |
| `nv_play_minutes` | today's minutes | parent-facing daily-goal nudges (#80) | single number, reset daily |
| `nv_lang`, `nv_music`, `nv_reduced_motion` | UI prefs | remember choices | booleans/one value |
| `nv_seen_welcome` | onboarding flag | don't re-show welcome | 0/1 |
| `nv_cache_metric` | cached display metric | instant stat render | single number |
| `nv_parent_aggregate_opt_in` | aggregate opt-in (#330) | explicit consent, off by default | "1"/"0" |
| `nv_parent_pin` | salted FNV-1a hash of the parent-area PIN (#86) | 4-digit gate so kids can't open the parent panel | hash only — the raw PIN never leaves the device and is never stored |

Nothing on-device stores a photo, contacts, location, or browsing data.

## API storage (Postgres, `apps/api/app/models.py`)

| Table | Fields | Why | PII? |
|---|---|---|---|
| `profiles` | email, password_hash, display_name, is_admin, aggregate_opt_in, timestamps | auth + parent identity | **yes — email**; hashed password; display_name is parent-chosen |
| `kids` | name, avatar, birth_year | per-kid profile (parent's own kids) | **yes — name**; parent-created, no photos stored |
| `kid_settings` | enabled_subjects, max_band, daily_limit_min, tts_enabled, music_enabled | parent controls | no |
| `sessions` | token_hash, user_agent, ip, timestamps, revoked_at | auth session security + device detection | **yes — ip, user_agent**; justified for rate-limiting/abuse (#274) and device trust |
| `subjects`, `skills` | content catalog | curriculum | no |
| `skill_mastery` | mastery, correct, attempts, streak, last_practice, last_decay | BKT adaptive learning | no |
| `learning_stories` | kid_id, skill_id, game_id, error_kind, misconception_code, action, outcome, difficulty, response_ms, wrong_streak, **context**, created_at | Kotha adaptive reasoning (Moni's diagnosis) | **context is PII-REDACTED server-side (#270)** before storage; envelope is learning-diagnosis only (`reason/message/source/fingerprint/wrongAnswer`) |
| `progress_events` | kid_id, skill_id, game_id, correct, response_ms, difficulty, created_at | per-day progress + wrong-answer history (parent panel #78) | no |
| `subscriptions` | plan, store, store_ref, status, period_end | monetization (free tier today) | no |
| `content_items`, `story_embedding_model` | content + story vectors | catalog + RAG retrieval | vectors of the (already-redacted) stories |

## Parent data export (#273)

A parent can download **their own family's** data at `GET /api/v1/export`
(readable JSON, versioned) or `GET /api/v1/export.csv` (round history for
spreadsheets). Rules:

- **Auth-protected** like every parent route — a valid, unrevoked session token
  is required; each kid is ownership-checked against the calling profile.
- **Family data only** — kid profiles, settings, mastery, every round, every
  learning story. The payload deliberately omits account internals
  (`password_hash`, sessions/tokens, `is_admin`), enforced by a CI unit test
  (`tests/test_export.py`).
- **Your data, your hands** — nothing is shared, telemetrized, or cached; the
  export is a plain file download with a `Content-Disposition` attachment.

## What the audit found

- **Every field is either required for the app's function or already
  minimized.** No field is stored without a purpose.
- **Two fields are PII and are kept deliberately:** `profiles.email`
  (auth identity) and `kids.name` (parent-created profile). Both are
  parent-entered, owned by the parent, and deletable (kid records cascade on
  profile delete).
- **`sessions.ip` + `sessions.user_agent`** are the only "nice-to-have" PII.
  Justified for abuse rate-limiting (#274) and device-trust; flagged for
  possible bounded retention if the box ever grows.
- **`learning_stories.context`** is the highest-risk surface and is already
  mitigated twice: the client only sends learning-diagnosis fields, and the
  server redacts any PII-shaped strings before storage (#270).
- **Zero analytics** — the `tracker-scan` gate (#92) fails CI on any
  ad/tracker dependency or endpoint; the Oracle Privacy Steward re-checks
  own-API-only fetches on every standup.

## Oracle Privacy Steward review

The Oracle's Privacy Steward role (`l1_privacy`) checks "no trackers /
own-API only" across the kid app. Verified CLEAN 2026-08-13:

```
python3 scripts/team/oracle_team.py --ci --no-page
```

(reported alongside the dedicated `tracker-scan` CI gate).
