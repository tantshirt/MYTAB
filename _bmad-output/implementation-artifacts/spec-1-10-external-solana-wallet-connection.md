---
title: 'Story 1.10: External Solana wallet connection'
type: feature
created: '2026-08-21'
status: stub
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** Some users want to receive into an existing Solana wallet instead of the embedded wallet.

**Approach:** P1 UI stub behind `NEXT_PUBLIC_FEATURE_EXTERNAL_WALLET` (off by default). Embedded wallet remains the default path; wallet-standard connect and verified `wallets` records ship when dependency gate passes.

## Code Map

- `features/auth/ExternalWalletConnect.tsx` — gated connect stub
- `lib/features/flags.ts` — `isExternalWalletEnabled()`
- `lib/env/contract.ts` — allowlisted public flag key
- `tests/features/external-wallet.test.tsx`

## Acceptance Criteria

- AC1: Sequenced after embedded path (stub only; no schema changes)
- AC2: Stub hidden unless feature flag enabled
- AC3: Sponsorship re-check deferred to full implementation

## Verification

- `npm test` — `external-wallet.test.tsx`
- `npm run build`

</intent-contract>
