---
title: 'Story 3.3: An exact USDC transaction built with the sponsor as fee payer'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** Senders must never need SOL or see gas; the sponsor pays network fees server-side.

**Approach:** Convex Node action `internal.solana.buildExactUsdcTransferAction` builds an exact USDC transfer using `@solana/kit` address validation and `@solana/web3.js` compilation, with `PRIVY_SPONSOR_WALLET_ADDRESS` (fixture when absent). Result is persisted via `applyQuotedTransactionInternal`.

## Code Map

- `lib/solana/buildExactUsdcTransfer.ts` — pure build + memo commitment hash
- `lib/solana/fixture.ts` — fixture RPC/sponsor resolution
- `convex/internal/solana.ts` — Node action, structured logging (no secrets/bytes)
- `convex/settlements.ts` — `markQuotingInternal`, `applyQuotedTransactionInternal`
- `tests/convex/solana-build.test.ts`

## Acceptance Criteria

- AC1: Built in Convex Node action; sponsor is fee payer
- AC2: Single sponsorship path; fixture sponsor per environment
- AC3: ATA creation bounded; exceeding limit fails intent
- AC4: Bytes written through internal mutation, not action return to client
- AC5: Logs carry identifiers only
- AC6: Memo instruction with hash-only tip commitment; memo program allowlisted

## Verification

- `npm test` — `solana-build.test.ts`
- `npm run build`

</intent-contract>
