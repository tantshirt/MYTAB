---
title: 'Story 3.9: Quote expiry and retry on the Convex scheduler'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** Stale quotes must expire automatically and be refreshable without duplicating tips.

**Approach:** Convex cron sweeps expirable intents every minute; mutate paths expire on read; `refreshTipIntent` creates a new intent against the same tip after expiry/failure.

## Code Map

- `convex/crons.ts` — interval cron → `expireStaleIntents`
- `convex/internal/settlementScheduler.ts` — cron handler
- `convex/lib/intentExpiry.ts` — expire + sweep helpers
- `convex/settlements.ts` — `syncIntentExpiry`, `refreshTipIntent`, expiry guard on `recordUserSigned`, virtual expiry in `getIntent`
- `convex/lib/settlementIntentSync.ts` — `refreshTipIntentCore`
- `tests/convex/intent-expiry.test.ts`

## Acceptance Criteria

- AC1: Convex scheduler/crons only (no Vercel Cron)
- AC2: `created`/`quoting`/`ready_for_signature` past expiry → `expired`; cannot sign expired
- AC3: Confirmation polling stub deferred — submitted/unknown never expire via quote sweep
- AC4: `refreshTipIntent` reuses tip record with new idempotency key

## Verification

- `npm test` — `intent-expiry.test.ts`
- `npm run build`

</intent-contract>
