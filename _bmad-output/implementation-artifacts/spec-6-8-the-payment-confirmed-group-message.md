---
title: 'Story 6.8: The payment-confirmed group message'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** The group should see settlement progress without exposing individual payment details.

**Approach:** On confirmation, edit the existing tab status message with group-fact progress; bill-completed updates same message when final obligation clears.

## Code Map

- `convex/lib/paymentConfirmationNotify.ts` — `queuePaymentProgressUpdate`, group-fact copy
- `convex/lib/telegramNotify.ts` — edit-in-place status message
- `convex/settlements.ts` — `applyConfirmedInternal` queues progress update
- `convex/schema.ts` — `telegramStatusMessages` progress fields
- `tests/convex/telegram-notify.test.ts`
- `tests/convex/obligation-settlement.test.ts`

## Acceptance Criteria

- AC1: Edits existing status message, never posts a new one
- AC2: Nothing published until confirmation (not on submit)
- AC3: Group facts only — progress counts; no payer identity, amounts, addresses, or tx links
- AC4: Bill-completed event updates same message; server-derived completion

## Verification

- `npm test` — `telegram-notify.test.ts`, `obligation-settlement.test.ts`
- `npm run build`

</intent-contract>
