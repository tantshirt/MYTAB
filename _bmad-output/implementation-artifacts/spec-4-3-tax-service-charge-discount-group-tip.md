---
title: 'Story 4.3: Tax, service charge, discount, and group tip'
type: feature
created: '2026-08-21'
status: done
---

## Intent

Four adjustment kinds, fixed or percentage with explicit bases, canonical order, visible running total.

## Code Map

- `convex/schema.ts` — `adjustments` with `percentageBase`, `position`
- `convex/adjustments.ts` — `upsertAdjustment`, `removeAdjustment`
- `lib/domain/bill.ts` — `computeBillBreakdown`, `CANONICAL_ADJUSTMENT_ORDER`
- `features/bills/AdjustmentsPanel.tsx`, `BillTotals.tsx`

## Verification

- `tests/lib/bill-totals.test.ts`
- `tests/features/bill-authoring.test.tsx`
