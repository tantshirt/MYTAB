---
title: 'Story 4.2: Add, edit, duplicate, and remove items'
type: feature
created: '2026-08-21'
status: done
---

## Intent

Organizer manages receipt lines while the tab is unlocked; participants see a waiting empty state.

## Code Map

- `convex/schema.ts` — `items` with `source: manual | receipt`
- `convex/items.ts` — `addItem`, `updateItem`, `duplicateItem`, `removeItem`
- `lib/domain/bill.ts` — line total computation
- `features/bills/ItemRow.tsx`, `ItemEditor.tsx`, `BillEmptyState.tsx`

## Verification

- `tests/lib/bill-totals.test.ts`
- `tests/convex/tab-authoring.test.ts`
- `tests/features/bill-authoring.test.tsx`
