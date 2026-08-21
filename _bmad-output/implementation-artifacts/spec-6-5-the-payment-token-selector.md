---
title: 'Story 6.5: The payment-token selector'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** Payers need to choose USDC vs SOL with clear affordances and honest routing copy.

**Approach:** `PaymentTokenSelector` chip row — name + balance, no logos, 44px touch target; disabled (not hidden) when unaffordable; separate bill-currency vs token amount lines.

## Code Map

- `components/settlement-sheet/PaymentTokenSelector.tsx` — token chips, single-select styling
- `features/settlement/ObligationPaymentSheet.tsx` — integrates selector + amount lines
- `components/settlement-sheet/index.ts` — exports
- `tests/features/epic-6-ui.test.tsx`

## Acceptance Criteria

- AC1: Chips show token name in `label`, balance in `meta`; no logos; single-select `primary-soft` + 1px `primary` border
- AC2: Unaffordable tokens shown disabled with balance visible
- AC3: Obligation in bill currency; token figures on separate labelled lines
- AC4: Routed minimum receive uses "at least" wording; no guaranteed exact output
- AC5: Chips ≥ 44px tappable dimension

## Verification

- `npm test` — `epic-6-ui.test.tsx`, `settlement-sheet.test.tsx`
- `npm run build`

</intent-contract>
