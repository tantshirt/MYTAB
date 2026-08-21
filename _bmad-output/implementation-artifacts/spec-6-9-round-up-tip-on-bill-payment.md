---
title: 'Story 6.9: Round-up tip attached to a bill payment'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** Payers want a one-tap thank-you to the organizer without a second payment flow.

**Approach:** Optional round-up on `ObligationPaymentSheet` defaults off; when enabled, same settlement intent carries separate disclosed obligation + tip `amount-pair` lines; recipient from server wallet record.

## Code Map

- `components/settlement-sheet/RoundUpControl.tsx` — round-up toggle + amount preview
- `convex/lib/settlementObligationSync.ts` — `roundUpTipAtomic` on intent create
- `convex/schema.ts` — `roundUpTipAtomic`, `roundUpRecipientUserId` on `settlementIntents`
- `features/settlement/ObligationPaymentSheet.tsx` — canonical content order, separate amount pairs
- `tests/features/epic-6-ui.test.tsx`
- `tests/convex/obligation-settlement.test.ts`

## Acceptance Criteria

- AC1: Round-up control appears after obligation lines, defaults off
- AC2: Tip rides same intent; obligation and round-up shown as separate labelled `amount-pair`s
- AC3: Round-up recipient resolved from Convex wallet record of bill recipient, never request body

## Verification

- `npm test` — `epic-6-ui.test.tsx`, `obligation-settlement.test.ts`
- `npm run build`

</intent-contract>
