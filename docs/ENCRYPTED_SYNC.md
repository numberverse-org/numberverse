# 🔐 Sync encryption design note (#94)

> **Decision:** sync payloads are NOT encrypted end-to-end with a parent-held
> key. This document records why, and what IS in place instead.

## What sync carries

Progress/stories sync over `api.ts` to the parent's OWN account on the
family's self-hosted box (FastAPI). The kid app is local-first: full mastery +
outbox live on-device; the API receives round records, Kotha stories, and
identity mappings.

## Why not end-to-end with a parent-held key

The parent portal MUST read this data server-side to render progress, weekly
reports, wrong-answer history, and the data export (#273). An E2E payload
encrypted with a parent-held key that never leaves the parent's browser would
make the portal blind to its own data — it would decrypt nothing. The portal
and the device are the same privacy boundary: both are the parent's own
property.

## What is actually in place

| Layer | Mechanism |
|---|---|
| Transport | All sync over HTTPS (Cloudflare edge → tunnel → box); no plaintext on the wire |
| Storage | Device-side localStorage (outbox, stories); server-side Postgres on the family box |
| Retention | On-device data deletable via the parent portal (#262); server history deletable via roster/export (#273) |
| Scoping | Sync is per-parent-account; API scopes all reads/writes to owned kids (`get_current_profile` + `_owned_kids`) |
| Rate / abuse | Write endpoints rate-limited (#274/#96), PII-scrubbed (#266) |

## If the threat model changes

If the box were to hold data NOT owned by the operator's own family (multi-
tenant), or an external host were used, E2E encryption with a client-held key
becomes the right call — the current homelab, single-operator model does not
require it. Revisit if hosting changes.
