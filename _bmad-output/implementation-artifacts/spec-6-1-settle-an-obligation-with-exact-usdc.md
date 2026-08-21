---
title: 'Story 6.1: Settle an obligation with exact USDC'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** Bill obligations need the same durable settlement spine as tips, without a parallel payment path.

**Approach:** `createObligationIntent` binds a locked obligation + revision, schedules Epic 3 build/validate/sign/confirm, and applies a ledger offset exactly once on confirmation.

## Code Map

- `convex/settlements.ts` — `createObligationIntent`, `refreshObligationIntent`, `applyConfirmedInternal`
- `convex/lib/settlementObligationSync.ts` — `createObligationIntentCore`, target lock, duplicate-settlement guard
- `convex/lib/settlementLedger.ts` — `applySettlementOffset`, `isTargetAlreadySettled`
- `convex/lib/billSnapshot.ts` — bill snapshot hash for obligation binding
- `lib/solana/buildExactUsdcTransfer.ts` — obligation memo with `billSnapshotHash`
- `lib/solana/memoHash.ts` — `computeBillSnapshotHash`, `computeObligationCommitmentHash`
- `features/settlement/ObligationPaymentSheet.tsx` — exact obligation amount display
- `tests/convex/obligation-settlement.test.ts`

## Acceptance Criteria

- AC1: Intent targets locked obligation with revision + server-resolved recipient
- AC2: Reuses Epic 3 state machine, AD-10 validator, sign-only, sponsor co-sign, confirmation parser
- AC3: One Convex txn confirms, offsets obligation once, emits activity, queues Telegram — no paid flag on obligation
- AC4: Second intent/payment for confirmed obligation blocked; double-tap test asserts one confirmation
- AC5: Payment sheet shows exact obligation amount (e.g. ฿291.74) with no rounding in copy
- AC6: USDC memo carries bill-snapshot hash; same hash on settlement record; never user-facing

## Verification

- `npm test` — `obligation-settlement.test.ts`
- `npm run build`

</intent-contract>
