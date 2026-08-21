---
title: 'Story 4.1: New Tab — title, currency, payer, recipient, FX snapshot'
type: feature
created: '2026-08-21'
status: done
---

## Intent

Organizer sets tab title, merchant, display currency, payer, recipient, and a fixture FX snapshot before item entry.

## Code Map

- `convex/schema.ts` — `tabs`, `fxSnapshots`
- `convex/tabs.ts` — `saveTabSetup`, `beginItemEntry`, `listTabMemberOptions`, `getTabAuthoring`
- `convex/lib/tabAuth.ts` — `requireBillOrganizer`
- `convex/lib/fxSnapshotSync.ts` — `createFixtureFxSnapshot`
- `features/bills/NewTabForm.tsx` — setup UI
- `features/bills/BillAuthoringSurface.tsx` — pinned “Add items” action

## Verification

- `tests/convex/tab-authoring.test.ts`
- `tests/features/bill-authoring.test.tsx`
