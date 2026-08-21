---
title: 'Story 1.8: Wallet record synced with one default receiving wallet'
type: feature
created: '2026-08-21'
status: done
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-verified-telegram-identity-bound-to-the-privy-did.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** My Tab must persist one server-owned receiving address per user from the Privy embedded Solana wallet, without storing key material.

**Approach:** Add a `wallets` table, authenticated `syncEmbeddedWallet` upsert, Privy server sync action stub with fixture fallback, client wallet sync after auth, and guards that keep exactly one default receiving wallet per user.

## Boundaries & Constraints

**Always:** Store only `privyWalletId` and `solanaAddress` plus type/default flags. Resolve receiving addresses from Convex records only. Match returning wallets by Privy wallet id. Fixture Privy sync when server credentials are absent.

**Never:** Store private keys, seed phrases, mnemonics, or exported key material. Trust client-supplied receiving addresses in later flows.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First login sync | Auth + embedded wallet | Wallet inserted, default receiving | 200 mutation OK |
| Restore login | Existing privyWalletId | Record patched, no duplicate | Idempotent upsert |
| External already default | User has external default | Embedded inserted non-default | Single default preserved |
| Duplicate defaults | Corrupted two defaults | Resolution throws | DUPLICATE_DEFAULT_RECEIVING |
| Fixture Privy | No PRIVY_APP_ID/SECRET | Fixture wallet snapshot | Offline tests pass |
| Unauthenticated sync | No Privy JWT | No write | UNAUTHORIZED |

</intent-contract>

## Code Map

- `convex/schema.ts` — `wallets` table + indexes
- `convex/lib/walletSync.ts` — upsert/default-receiving helpers
- `convex/wallets.ts` — syncEmbeddedWallet mutation + defaultReceiving query
- `convex/internal/privy.ts` — syncWalletFromPrivy action stub + fixture resolver
- `features/auth/useWalletSync.ts` — client sync after Privy auth
- `features/auth/WalletSyncGate.tsx` — wired in AuthGate after Telegram bootstrap
- `features/auth/AuthGate.tsx` — wallet sync gate wiring
- `tests/convex/wallets.test.ts` — wallet sync unit tests

## Tasks & Acceptance

**Execution:**
- Schema with wallets (userId, privyWalletId, solanaAddress, isEmbedded, isDefaultReceiving, timestamps)
- Authenticated upsert mutation with single-default guard
- Privy action stub with fixture fallback
- Client hook using Privy `useWallets` embedded address
- Unit tests

**Acceptance Criteria:**
- AC1: Only Privy wallet id and Solana address stored; no key material
- AC2: Exactly one default receiving wallet; embedded vs external distinct; duplicate default rejected
- AC3: Receiving address resolved from Convex `wallets` record only
- AC4: Returning users matched by Privy wallet id without duplicate records
- AC5: You surface deferred — receiving preference UI lands with Story design work

## Verification

**Commands:**
- `npm test` — wallets + existing convex/auth tests
- `npm run build` — Next.js build succeeds

**Manual (Day 0 gate):**
- Authenticate in Telegram Mini App
- Confirm `wallets` row exists with embedded default receiving address in Convex dashboard

## Spec Change Log

- 2026-08-21: Initial spec and implementation
