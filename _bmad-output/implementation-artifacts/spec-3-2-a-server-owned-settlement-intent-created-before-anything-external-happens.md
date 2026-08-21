---
title: 'Story 3.2: A server-owned settlement intent, created before anything external happens'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** Money flows must never exist only inside an in-flight HTTP request.

**Approach:** `settlements.createTipIntent` mutation inserts a durable `settlementIntents` row in `created`, then schedules `internal.solana.buildExactUsdcTransferAction` via `scheduler.runAfter(0, ...)`.

## Code Map

- `convex/schema.ts` — `tips`, `settlementIntents`, indexes including `by_idempotency_key`, `by_tip_id`
- `convex/lib/settlementIntentSync.ts` — `createTipIntentCore`, idempotency, target lock
- `convex/lib/intentAuth.ts` — `requireIntentOwner`
- `convex/settlements.ts` — public `createTipIntent` mutation
- `tests/convex/settlement-intent.test.ts`

## Acceptance Criteria

- AC1: Mutation writes intent then schedules internal action; browser never calls a public action first
- AC2: Intent binds user, wallet, tip target, recipient, mints, amounts, idempotency key, expiry
- AC3: Recipient address from Convex `wallets`, not request body
- AC4: Terms immutable after creation (enforced by later stories / no update mutation)
- AC5: `requireIntentOwner` shared helper
- AC6: Idempotent on `idempotencyKey`; one nonterminal intent per tip target lock

## Verification

- `npm test` — `settlement-intent.test.ts`
- `npm run build`

</intent-contract>
