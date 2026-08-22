# Mainnet cutover runbook

Everything that must be true before real money moves, consolidated from the
security, settlement, FX, Privy, Telegram and DFlow workstreams.

**Nothing in this repo has touched a live cluster yet.** Every integration is
unit-tested with injected transports. The gates are real; what is behind them
is unproven.

---

## 0. Rotate these first

They were printed in plaintext during development and must be treated as
compromised:

- `PRIVY_APP_SECRET` — signs server wallet operations, including sponsor co-sign
- `TELEGRAM_BOT_TOKEN` — posts as the bot in every group it is in, reads every
  message it receives
- `TELEGRAM_WEBHOOK_SECRET`

`PRIVY_VERIFICATION_KEY` is the public half and is harmless.

---

## 1. Secrets and configuration

All Convex-dashboard only, never Vercel (`lib/env/contract.ts` enforces the
split, and `npm run check:env-contract` asserts it).

| Key | Value at cutover |
|---|---|
| `SOLANA_CLUSTER` | `mainnet-beta` |
| `SOLANA_RPC_URL` | a mainnet host — `assertClusterRpcAgreement()` throws on a mismatch, and refuses to guess when the host carries no cluster marker |
| `PRIVY_APP_ID` / `PRIVY_APP_SECRET` | rotated |
| `PRIVY_SPONSOR_WALLET_ID` / `PRIVY_SPONSOR_WALLET_ADDRESS` | the funded fee payer |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` | rotated |
| `DFLOW_API_KEY` | production key — **2–5 day lead time via Google Form**; stream access is a separate per-key permission and must be requested explicitly |
| `MYTAB_ALLOW_FIXTURES` | **must be unset everywhere** |

Vercel side: `NEXT_PUBLIC_PRIVY_APP_ID`, and `CONVEX_DEPLOY_KEY` per environment.
`NEXT_PUBLIC_CONVEX_URL` is injected by `convex deploy --cmd` at build time.
There is deliberately no `NEXT_PUBLIC_CONVEX_SITE_URL` — the `.site` host is
derived from the `.cloud` host so the two can never point at different
deployments.

Privy dashboard: add the production origin to **allowed domains**. It is
currently empty, which is permissive rather than broken — but it means any
origin can use the app id.

---

## 2. Bump the policy version

`SPONSOR_POLICY_VERSION` must increase at the flip, so reservations made against
the devnet manifest cannot be honoured against the mainnet one.

---

## 3. Re-audit the sponsor manifest against mainnet

This file guards a funded wallet. Read it by hand; do not assume.

- No fixture program ids. `assertNoFixtureProgramIds` fails module load if one
  returns, on any cluster.
- **System program must not be present.** A top-level
  `SystemProgram.transfer{from: sponsor}` drains the fee payer in one
  instruction the sponsor is already signing.
- **Token-2022 must not be present.** Transfer hooks and transfer fees change
  what the recipient actually receives.
- USDC mint resolves to `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
- Re-run the ATA-derivation parity test in the deployed environment.

---

## 4. Fund and cap the sponsor wallet

- Fund at the AD-17 ceiling (≤ 1 SOL in production).
- Re-verify all six caps against the real balance.
- Confirm `SPONSOR_PAUSE` is operator-reachable **without a deploy** — a kill
  switch that needs a deploy is not a kill switch.
- Confirm a cap breach and a paused state both write nothing: no bucket
  increment, no reservation row.

---

## 5. Prove the direct USDC path — cent-sized, in this order

The expensive branches are the ones people skip.

1. Confirm the fixture gate is shut: no `FIXTURE_*` value appears in a build
   response.
2. **Recipient WITHOUT an ATA first.** Assert `ataCreates=1` and
   `sponsorExposureLamports ≈ priority fee + 2,039,280`.
3. Verify the persisted blockhash is real (not `111…1`) and
   `lastValidBlockHeight` is near live chain height.
4. Sign without broadcasting; confirm the intent reaches `user_signed`.
5. Co-sign: confirm **exactly one** `sendTransaction`, and that the returned
   signature equals the one persisted *before* the send.
6. On the explorer: fee payer is the sponsor, payer lamports unchanged,
   recipient ATA created, exact USDC delta, no third token account.
7. Confirm `finalized` → intent `confirmed`, one `settlements` row, obligation
   offset once, Telegram card edited in place.
8. **Idempotency**: re-invoke the confirmation pipeline with the same signature
   — must return `alreadyConfirmed` and insert nothing.
9. Repeat with a recipient that already has an ATA (`ataCreates=0`).
10. **Expiry**: build a quote, wait past `lastValidBlockHeight`, then sign.
    Expect `failed` `BLOCKHASH_EXPIRED` with **no** Privy call.
11. **Unknown**: black-hole the RPC for the send only. Expect `unknown` — never
    `failed` — reservation held, reconcile scheduled. Restore and confirm the
    late confirmation completes to `confirmed`.
12. **Kill switch**: pause mid-flight, confirm `SPONSOR_PAUSED` and the
    reservation released.

---

## 6. Then the DFlow routed path

DFlow is **mainnet-only** — `dev-quote-api` is a rate-limit tier on mainnet, not
a devnet cluster. Verified empirically: a transaction from the dev host carried
a blockhash valid on mainnet and invalid on devnet.

- `allowSyncExec=true`, **`allowAsyncExec=false` explicitly** — the default is
  `true` and would silently violate binding decision 7. Any asynchronous
  response is rejected.
- `sponsorExec=false` — the user swaps from their own accounts, so the sponsor
  wallet never custodies funds mid-transaction, and the transaction is smaller.
  The sponsor is `account[0]` and pays in both modes regardless.
- Bracket the solver against **`otherAmountThreshold`** — the only figure
  enforced onchain. `outAmount` and `priceImpactPct` are explicitly estimates.
- Omit `platformFeeBps` entirely. A declared fee is factored into the slippage
  budget, so declaring one without a funded `feeAccount` spends that budget on
  nothing and worsens the payer's price.
- Verify the RFC 9421 response signature (ed25519, keyid
  `EZKxYr7bbXHaKAGw2MEpVUU9He3hwXGejSpCsdsZCmiF`) with our own `x-request-id`
  as a replay guard — before the sponsor co-signs anything. Note it proves
  **authenticity, not soundness**: DFlow's own backend produces it. Keep every
  independent check, especially that `account[0]` is our sponsor.
- Address lookup tables are rejected outright. If a route needs one, either
  constrain the route or resolve the table at `contextSlot` and validate the
  expanded account set under the identical rules. Never relax the gate.

---

## 7. Known gaps at cutover

- **No operator surface for a finalized-but-mismatched transaction.** If a
  transaction finalizes successfully but fails one of the eight confirmation
  checks, the intent stays `unknown` and polling stops — correct, because
  `failed` would tell the payer nothing happened while their money is gone. It
  needs a reconciliation-incident table and an alert. **This is the one gap I
  would close before real money.**
- **Partial payment is not representable.** `settlementLedgerEvents` carries no
  amount; a confirmed chain payment is a full clear.
- **`obligations.displayAmountThbMinor` is THB-named but holds any currency.**
  The cross-currency guard is real and tested; the column name is a lie waiting
  to happen.
- **`obligationLedgerEvents.obligationId` is `v.string()`**, so nothing at the
  schema level prevents a dangling reference.
- **`USDC_DECIMALS = 6` is defined in two places** and they agree today.
- **The Thai bank holiday table expires 2027-01-01** — fails closed, but tabs
  would start refusing to price on holidays.

---

## 8. Rollback

`SPONSOR_PAUSE` stops new payments while leaving reads working (AD-17, NFR-4).
It does not affect payments already `user_signed`, `submitted` or `unknown` —
those must resolve, because they may already be on chain. Do not "roll back" by
reverting a deploy while intents are in flight; pause first, let them settle,
then deploy.
