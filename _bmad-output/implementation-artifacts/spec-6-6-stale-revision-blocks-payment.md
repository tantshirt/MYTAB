---
title: 'Story 6.6: Stale revision blocks payment'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** A bill reopen must block in-flight payments priced against an old revision.

**Approach:** Intent stores locked revision; AD-10 checklist compares tab revision at sign/co-sign; UI shows stale banner with single refresh action.

## Code Map

- `convex/lib/settlementObligationSync.ts` — binds `obligationRevision` on create
- `lib/solana/validateTransactionMessage.ts` — revision stale check in validation context
- `convex/internal/solana.ts` — passes revision into build/validate
- `components/settlement-sheet/RoundUpControl.tsx` — `StaleRevisionBanner`
- `features/settlement/ObligationPaymentSheet.tsx` — stale state + refresh via `refreshObligationIntent`
- `tests/convex/obligation-settlement.test.ts`

## Acceptance Criteria

- AC1: Intent stores locked revision at creation
- AC2: Stale revision fails AD-10 at sign/co-sign; payment blocked
- AC3: Sheet shows "This bill changed. Refresh to see your new amount." with one action; no silent repricing
- AC4: Refresh creates new intent bound to current revision and obligation

## Verification

- `npm test` — `obligation-settlement.test.ts`, `epic-6-ui.test.tsx`
- `npm run build`

</intent-contract>
