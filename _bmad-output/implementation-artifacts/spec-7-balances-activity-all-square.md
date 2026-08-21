---
title: 'Epic 7: Balances, activity, and all square'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** People need one sentence for where they stand, an immutable activity record, confirmed-only progress, and a single completion moment.

**Approach:** `features/balances/` renders balance hero, tabs home, activity feed, payment states, all-square card, and loading/offline shells. `lib/domain/balance.ts` and `debtCompression.ts` derive within-group positions and greedy transfer suggestions. `convex/activity.ts` appends immutable events.

## Code Map

- `features/balances/BalanceHero.tsx` — Story 7.1
- `features/balances/TabsHomeSurface.tsx` — Story 7.2
- `features/balances/ActivityFeed.tsx` — Story 7.3
- `features/balances/PaymentStateBadge.tsx` — Story 7.4
- `lib/domain/balance.ts` — Story 7.5
- `features/balances/AllSquareCard.tsx` — Story 7.6
- `lib/domain/a11yAmount.ts` — Story 7.7
- `features/balances/LoadingStates.tsx` — Stories 7.8–7.9
- `convex/demo.ts` — Story 7.10
- `lib/domain/debtCompression.ts` — Story 7.11
- `convex/activity.ts`, `convex/lib/activitySync.ts`

## Verification

- `npm test` — domain/balance, debt-compression, a11y-amount, features/*, convex/activity-receipts
- `npm run build`

</intent-contract>
