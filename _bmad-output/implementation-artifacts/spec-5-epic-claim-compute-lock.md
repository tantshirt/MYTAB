---
title: 'Epic 5: Claim, compute, lock (Stories 5.1–5.11)'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

Everyone claims items on a live board, sees inspectable shares, and the organizer locks immutable per-person obligations.

## Code Map

- `lib/domain/allocation.ts` — largest-remainder split, proportional adjustments, lock invariant (FR-M4, FR-M5, FR-M6)
- `lib/domain/revision.ts` — monotonic revision, stale rejection (FR-B4, FR-C3)
- `lib/domain/obligations.ts` — obligation snapshots, fixture FX
- `convex/schema.ts` — `allocations`, `adjustmentAllocations`, `billLockSnapshots`, `obligationEvents`
- `convex/lib/allocationSync.ts` — persist computed shares
- `convex/lib/claimSync.ts` — toggle claim, organizer override, allocation modes
- `convex/lib/lockSync.ts` — lock + reopen transactions (FR-B5, FR-B7, FR-M7, FR-M8)
- `convex/allocations.ts` — public mutations and claim board queries
- `features/claims/` — ClaimBoard + BillReview UI stubs with fixtures
- `tests/domain/allocation.test.ts`, `tests/convex/allocations.test.ts`, `tests/features/claim-board.test.tsx`

## Stories

| Story | Summary |
| --- | --- |
| 5.1 | Revision increments on draft edits; stale mutations reject with `STALE_REVISION` |
| 5.2 | Equal split via integer division + largest remainder; persisted shares |
| 5.3 | Proportional tax/service/tip/discount with disclosed rounding lines |
| 5.4 | Additive claim/release mutations; revision-aware |
| 5.5 | Presence stack fixture on claim board header |
| 5.6 | Sticky footer with running personal subtotal and state-driven action |
| 5.7 | Unassigned items warn; organizer override; lock blocked server-side |
| 5.8 | Bill Review read-only for all participants |
| 5.9 | Lock verifies FR-M6, writes snapshot + obligations in one transaction |
| 5.10 | Reopen supersedes safe intents and obligations; blocks in-flight money |
| 5.11 | Quantity, percentage, fixed modes on proven allocation kernel |

## Verification

- `npm test`
- `npm run build`

</intent-contract>
