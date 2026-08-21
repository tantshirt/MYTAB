---
title: 'Story 6.7: A confirmed payment settles in place and advances group progress'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** Group members need calm, in-place feedback when a payment confirms — not a full-screen takeover.

**Approach:** `ClaimBoard` row transitions to `settled` with ~400ms check draw; settlement ring advances on confirmed-only counts; stepper moves on submit, ring on confirm.

## Code Map

- `features/settlement/ClaimBoard.tsx` — in-place settled row, progress ring, confirmed-only counter
- `convex/lib/paymentConfirmationNotify.ts` — `countTabSettlementProgress`
- `convex/lib/claimBoardQuery.ts` — confirmed-only progress data
- `components/settlement-sheet/SettlementStepper.tsx` — live region announcements
- `components/settlement-sheet/PaymentProgress.tsx` — stepper vs group progress split
- `tests/features/claim-board.test.tsx`
- `tests/features/epic-6-ui.test.tsx`

## Acceptance Criteria

- AC1: Payer row swaps to `settled` in place (~400ms check); ring advances; no full-screen takeover
- AC2: Success haptic once on own confirmation only
- AC3: Submitted-but-unconfirmed does not move ring/"n of 5 settled"; stepper moves, group progress does not
- AC4: Reduce Motion: instant state change, no draw animation, no haptic
- AC5: Stepper transitions announced once via live region; confirmation is primary announcement

## Verification

- `npm test` — `claim-board.test.tsx`, `epic-6-ui.test.tsx`
- `npm run build`

</intent-contract>
