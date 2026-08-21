---
title: 'Story 3.6: Parsed on-chain confirmation moves the ledger exactly once'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/docs/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-5-sign-only-through-privy-re-verify-sponsor-co-sign-broadcast.md'
---

<intent-contract>

## Intent

**Problem:** Balances and tip/obligation offsets must change only after parsed finalized confirmation, exactly once per signature.

**Approach:** `convex/internal/confirmations.ts` parses fixture confirmation against AD-11 predicates; `applyConfirmedInternal` writes settlement record, appends ledger offset event, and marks tip/obligation settled idempotently.

## Boundaries & Constraints

**Always:** Signature alone changes nothing. Duplicate transaction signatures produce no second offset. Terminal states never transition back.

**Never:** Optimistic ledger updates on submit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pre-confirmation | submitted intent | No ledger offset | unchanged |
| Valid confirmation | fixture parse ok | confirmed + one offset | activity stub deferred |
| Duplicate signature | same tx sig twice | Second apply no-op | alreadyApplied |
| Failed tx fixture | execution failure | failed intent | CONFIRMATION_TX_FAILED |
| Wrong hash | message mismatch | failed parse | CONFIRMATION_MESSAGE_HASH |

</intent-contract>

## Code Map

- `convex/internal/confirmations.ts` — fixture parser + expectation builder
- `convex/internal/settlementPipeline.ts` — `processConfirmationPipeline`
- `convex/settlements.ts` — `applyConfirmedInternal`
- `convex/lib/settlementLedger.ts` — tip/obligation offset stub
- `convex/schema.ts` — `settlements`, `settlementLedgerEvents`, `tips`, `obligations`
- `tests/convex/settlements.test.ts` — parser and idempotent offset tests

## Tasks & Acceptance

**Acceptance Criteria:**
- AC1: Submitted signature alone does not offset ledger
- AC2: Confirmation parsed against fixture AD-11 contract
- AC3: Atomic once-only settlement offset
- AC4: Terminal states never transition back
- AC5: Duplicate target settlement blocked at intent seed

## Verification

- `npm test`
- `npm run build`

## Spec Change Log

- 2026-08-21: Initial spec and fixture-mode implementation
