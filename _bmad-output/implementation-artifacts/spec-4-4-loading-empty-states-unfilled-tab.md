---
title: 'Story 4.4: Loading and empty states for an unfilled tab'
type: feature
created: '2026-08-21'
status: done
---

## Intent

First paint uses geometry-matched skeletons; participants see waiting copy; offline is a single inline bar.

## Code Map

- `features/bills/BillSkeleton.tsx` — first-load skeleton rows
- `features/bills/BillEmptyState.tsx` — organizer vs participant empty states
- `features/bills/OfflineBar.tsx` — offline notice
- `features/bills/BillAuthoringSurface.tsx` — load-state orchestration

## Verification

- `tests/features/bill-authoring.test.tsx`
