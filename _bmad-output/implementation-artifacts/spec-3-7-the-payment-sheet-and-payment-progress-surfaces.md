---
title: 'Story 3.7: The Payment Sheet and Payment Progress surfaces'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** Payers must inspect every figure before approving spend.

**Approach:** `components/settlement-sheet/` provides Payment Sheet (fixed content order, collapsed disclosure, quote countdown) and Payment Progress with a server-driven `SettlementStepper` mapped from settlement status.

## Code Map

- `components/settlement-sheet/PaymentSheet.tsx` — review sheet + disclosure row
- `components/settlement-sheet/PaymentProgress.tsx` — in-flight progress + failure actions
- `components/settlement-sheet/SettlementStepper.tsx` — four-step indicator
- `components/primitives/amount-pair.tsx` — labelled tabular amounts
- `lib/settlement/stepperCopy.ts` — status → step copy (UX-DR36)
- `lib/settlement/quoteCountdown.ts` — countdown helpers
- `tests/components/settlement-sheet.test.tsx`, `tests/lib/stepper-copy.test.ts`

## Acceptance Criteria

- AC1: Fixed sheet order; no address/mint/bytes first
- AC2: Disclosure collapsed on every open; network fee copy; no platform fee line
- AC3: `amount-pair` labels; bill and token amounts on separate lines
- AC4: Quote countdown + expired state with Refresh quote CTA
- AC5: Stepper advances on server status only; failure in-place with Try again / Back to tab
- AC6: Progress surface stub (non-dismissible behavior wired at sheet host in later story)
- AC7: Banned vocabulary absent from rendered copy

## Verification

- `npm test` — `settlement-sheet.test.tsx`, `stepper-copy.test.ts`
- `npm run build`

</intent-contract>
