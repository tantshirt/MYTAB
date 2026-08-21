---
title: 'Story 3.5: Sign-only through Privy, re-verify, sponsor co-sign, broadcast'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/docs/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-8-sponsorship-caps-allowlists-and-a-kill-switch.md'
---

<intent-contract>

## Intent

**Problem:** Payers should approve once in Privy while Convex owns verification, sponsor co-sign, and broadcast — the client never sends the transaction.

**Approach:** Public `settlements.recordUserSigned` mutation stores partially signed bytes, re-parses the message hash, rejects duplicates, and schedules `internal/settlementPipeline.processUserSignedPipeline` which re-verifies, checks sponsor policy, calls `coSignAndBroadcast` fixture, and marks the intent submitted.

## Boundaries & Constraints

**Always:** Privy sign-only on client; Convex broadcasts. Re-parse and full checklist before sponsor co-sign. Kill switch rechecked in pipeline.

**Never:** Client-side broadcast or `signAndSendTransaction({ sponsor: true })`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid sign | matching partial bytes | user_signed → submitted | schedules pipeline |
| Tampered message | hash mismatch | Rejected | MESSAGE_HASH_MISMATCH |
| Duplicate user sig | same userSignature | Rejected | DUPLICATE_USER_SIGNATURE |
| Sponsor pause | SPONSOR_PAUSE during pipeline | failed, reservation released | SPONSOR_PAUSED |
| Policy fail | cap exceeded at co-sign | failed | SPONSOR_CAP_* |

</intent-contract>

## Code Map

- `convex/settlements.ts` — `recordUserSigned`, `markSubmittedInternal`, status machine
- `convex/internal/solanaPolicy.ts` — message hash re-verification fixture
- `convex/internal/privy.ts` — `coSignAndBroadcast` fixture
- `convex/internal/settlementPipeline.ts` — Node pipeline action
- `convex/lib/settlementState.ts` — AD-21 transitions
- `convex/lib/intentAuth.ts` — `requireIntentOwner`
- `tests/convex/settlements.test.ts` — re-verify and co-sign fixture tests

## Tasks & Acceptance

**Acceptance Criteria:**
- AC1: User signs without broadcasting; bytes submitted via `recordUserSigned`
- AC2: Convex re-parses and rejects message changes
- AC3: Sponsor co-signs only after policy pass
- AC4: Convex broadcasts; client never broadcasts

## Verification

- `npm test`
- `npm run build`

## Spec Change Log

- 2026-08-21: Initial spec and fixture-mode implementation
