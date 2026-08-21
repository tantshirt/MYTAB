---
title: 'Story 3.8: Sponsorship caps, allowlists, and a kill switch'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/docs/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-MYTAB-2026-08-21/ARCHITECTURE-SPINE.md'
---

<intent-contract>

## Intent

**Problem:** The sponsor wallet's exposure must be bounded and stoppable on mainnet so quote spam or ATA cycling cannot drain it during a public demo.

**Approach:** Implement `sponsor-v1` in `convex/sponsorPolicy.ts` with six lamport budget dimensions, fixture allowlists, atomic reservation in `convex/lib/sponsorReservation.ts`, and `SPONSOR_PAUSE` kill switch rechecked before co-sign.

## Boundaries & Constraints

**Always:** Integer lamport caps only. Reserve worst-case debit across user/wallet/group/daily/global dimensions before co-sign. Stable failure codes on rejection. Reads remain available when paused.

**Never:** Co-sign or broadcast when any cap or allowlist fails. Increase caps without a policy-version bump.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Under cap | usage at limit−1 | Reservation succeeds | ok |
| At cap | usage at limit | Reservation rejected | SPONSOR_CAP_* |
| Over cap | usage at limit+1 | Reservation rejected | SPONSOR_CAP_* |
| Kill switch | SPONSOR_PAUSE=true | No new sponsorship | SPONSOR_PAUSED |
| Bad mint | non-allowlisted mint | Rejected | SPONSOR_ALLOWLIST_MINT |
| Idempotent reserve | retry same intent | Reuses active reservation | ok |

</intent-contract>

## Code Map

- `convex/sponsorPolicy.ts` — sponsor-v1 caps, allowlists, pause, pure evaluation
- `convex/lib/sponsorReservation.ts` — atomic bucket reservation/release
- `convex/schema.ts` — `sponsorUsageBuckets`, `sponsorReservations`
- `convex/settlements.ts` — reservation at `ready_for_signature`, recheck before co-sign
- `tests/convex/sponsor-policy.test.ts` — limit−1/limit/limit+1 and pause tests

## Tasks & Acceptance

**Acceptance Criteria:**
- AC1: Six budget dimensions enforced with stable failure codes
- AC2: Program/mint/instruction allowlists enforced (fixture manifest)
- AC4: `SPONSOR_PAUSE` blocks sponsorship; reads unaffected
- AC6: Atomic reservation before co-sign; release on pre-broadcast failure
- AC7: Boundary tests at limit−1, limit, limit+1

## Verification

- `npm test` — sponsor-policy + settlements tests
- `npm run build`

## Spec Change Log

- 2026-08-21: Initial spec and fixture-mode implementation
