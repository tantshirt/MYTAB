---
title: 'Story 6.4: My Tab owns quote TTL and idempotency'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** DFlow responses carry no reliable expiry or order id; My Tab must own deduplication and TTL.

**Approach:** Extend Story 3.9 `intentQuoteTtl` + cron sweep to obligation intents; idempotency on intent key; AD-10 rejects expired at every gate.

## Code Map

- `convex/lib/intentQuoteTtl.ts` — `computeIntentExpiresAt` (60s cap vs blockhash window)
- `convex/lib/settlementObligationSync.ts` — persists `expiresAt` on create
- `convex/lib/intentExpiry.ts` — `expireIntentIfPastDue`, cron transition
- `convex/crons.ts` — intent expiry sweep
- `lib/solana/validateTransactionMessage.ts` — expiry rejection at sponsor gate
- `tests/convex/quote-ttl-obligation.test.ts`
- `tests/convex/intent-expiry.test.ts`

## Acceptance Criteria

- AC1: My Tab-owned `expiresAt` (ms), min(60s, blockhash safety window); never from DFlow
- AC2: Dedup keyed on intent `idempotencyKey`, never DFlow order ID
- AC3: Expired intents rejected at sign, co-sign, broadcast (AD-10)
- AC4: Cron sweeps to `expired`; read path treats unswept expired as expired
- AC5: Tests cover create, expiry, refresh, rejection at each gate

## Verification

- `npm test` — `quote-ttl-obligation.test.ts`, `intent-expiry.test.ts`
- `npm run build`

</intent-contract>
