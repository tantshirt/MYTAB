---
title: 'Story 6.2: DFlow order with the sponsor as fee payer and a server-owned recipient'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** SOL holders need swap-routed settlement without trusting client-built transactions.

**Approach:** Convex Node action requests a sync-only DFlow order (fixture when `DFLOW_API_KEY` absent), validates with Zod, runs AD-10 checklist, stores message hash; fixture path uses `buildExactUsdcTransfer` with `skipMemo: true`.

## Code Map

- `convex/internal/dflow.ts` — `buildDflowSettlementAction`, sponsor params, Zod boundary
- `lib/dflow/schema.ts` — Zod schemas for DFlow response
- `lib/dflow/fixture.ts` — fixture order when API key missing
- `lib/dflow/constants.ts` — sync-only flags, wrapped SOL mint
- `lib/solana/validateTransactionMessage.ts` — `dflow_sync` routing, byte hash check
- `lib/solana/sponsorPolicyManifest.ts` — WRAPPED_SOL + DFlow fixture program allowlist
- `convex/lib/settlementObligationSync.ts` — `normalizeInputMint`, USDC vs SOL routing
- `tests/convex/dflow.test.ts`

## Acceptance Criteria

- AC1: Server-side order with sponsor, `sponsorExec=false`, sync-only, server-owned `destinationWallet`
- AC2: Zod validation; `otherAmountThreshold` as min output; sync mode; LUTs resolved
- AC3: Full AD-10 checklist before client; message hash stored; substituted recipient/mint/amount fails
- AC4: Byte-identical re-parse after partial sign; altered byte rejected
- AC5: Input mint allowlist: mainnet USDC or canonical wrapped SOL only
- AC6: DFlow path has no on-chain memo; `billSnapshotHash` stored on settlement record; gap documented

## Verification

- `npm test` — `dflow.test.ts`, `solana-policy.test.ts`
- `npm run build`

</intent-contract>
