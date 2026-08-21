---
title: 'Story 6.3: A bounded target-output quote solver'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** Swap-routed payments must cover the exact USDC obligation without unbounded router calls.

**Approach:** `lib/dflow/quoteSolver.ts` binary-searches input for covering `otherAmountThreshold`, hard-capped at 4 requests and 3s; AD-24 budget reserved before first request.

## Code Map

- `lib/dflow/quoteSolver.ts` — bounded solver (4 requests, 3s deadline)
- `lib/dflow/fixture.ts` — fixture quote responses for tests/dev
- `convex/internal/dflow.ts` — integrates solver into build action
- `convex/lib/providerBudget.ts` — AD-24 attempt reservation/settlement + concurrency leases
- `convex/settlements.ts` — `reserveDflowBudgetInternal`, `settleDflowBudgetInternal`, `applyDflowQuoteInternal`
- `tests/convex/dflow-solver.test.ts`

## Acceptance Criteria

- AC1: Solver targets obligation USDC minimum output via `otherAmountThreshold`
- AC2: Hard bounds: 4 router requests, 3s wall-clock; stable failure code on exhaustion
- AC3: Sheet shows plain-language failure + retry action
- AC4: Retries bounded, reuse intent idempotency key, expire with quote
- AC5: Logs carry `intentId`, request count, `durationMs`, outcome — no payloads/secrets
- AC6: Excess output persisted as `excessOutputAtomic`; belongs to recipient; no balance credit
- AC7: Four AD-24 tokens reserved atomically before first request; settle actual usage; lease release on all exits

## Verification

- `npm test` — `dflow-solver.test.ts`
- `npm run build`

</intent-contract>
