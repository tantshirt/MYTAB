---
title: 'Story 3.4: The transaction validation checklist'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** No client or router may substitute a different transaction between quote and sponsorship.

**Approach:** Single shared `validateTransactionMessage` in `lib/solana/validateTransactionMessage.ts` backed by immutable `sponsor-v1` manifest in `lib/solana/sponsorPolicyManifest.ts`. Wrapped by `convex/internal/solanaPolicy.ts` for Convex callers. Runs at pre-client and pre-sponsor gates.

## Code Map

- `lib/solana/sponsorPolicyManifest.ts` — `SPONSOR_POLICY_V1` program/mint/discriminator allowlists
- `lib/solana/validateTransactionMessage.ts` — FR-S6 / AD-10 checklist
- `convex/internal/solanaPolicy.ts` — `buildValidationContext`, `runDualGateValidation`
- `tests/convex/solana-policy.test.ts`

## Acceptance Criteria

- AC1: Single reusable gate with full manifest predicates
- AC2: Message hash stored before client bytes (`applyQuotedTransactionInternal`)
- AC3: Validator runs before client bytes and before sponsor co-sign
- AC4: Table-driven mutation tests reject tampered transactions
- AC5: Platform fee zero asserted
- AC6: Semantic predicates tested independently of stored hash

## Verification

- `npm test` — `solana-policy.test.ts`
- `npm run build`

</intent-contract>
