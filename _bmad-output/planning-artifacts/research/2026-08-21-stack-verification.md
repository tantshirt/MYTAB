---
title: My Tab — Stack Verification Research Note
type: technical-research
status: final
created: '2026-08-21'
updated: '2026-08-21'
scope: >-
  Verify the load-bearing external assumptions in Brief v1.3 and the architecture
  spec against current vendor documentation. Findings R-1..R-13.
---

# Stack Verification — 2026-08-21

Thirteen assumptions from Brief v1.3, the architecture spec, and the readiness audit were checked against current first-party documentation. **Six are confirmed, six require binding corrections, and one remains a Day 0 proof.** Nothing removes product scope; the corrections close unsafe ingress, settlement, and storage behavior.

## Verdict table

| # | Assumption | Verdict |
| --- | --- | --- |
| R-1 | Convex accepts `issuer: 'privy.io'` for Privy tokens | ⚠️ **Needs Day 0 proof** |
| R-2 | Privy publishes no JWKS endpoint; the app must supply the key | ✅ Confirmed |
| R-3 | A hosted Vercel JWKS route is required | ⚠️ **Correction — avoidable** |
| R-4 | DFlow returns an order ID and quote expiry | ❌ **Correction — it does not** |
| R-5 | Astryx is real, React 19, usable in the App Router | ✅ Confirmed, with a build caveat |
| R-6 | Privy supports user-sign + backend fee-payer co-sign on Solana | ✅ Confirmed — it is Privy's documented pattern |
| R-7 | DFlow `sponsor` / `sponsorExec` / `destinationWallet` behave as designed | ✅ Confirmed |
| R-8 | Privy supports zero-click Telegram Mini App login | ✅ Confirmed |
| R-9 | A Convex HTTP Action can be the single authenticated Telegram/provider ingress | ✅ Confirmed; architecture changed |
| R-10 | Telegram launch data alone proves current group membership | ❌ Correction — bot-admin membership checks are required |
| R-11 | DFlow defaults are safe for a single-transaction settlement state machine | ❌ Correction — async is enabled by default |
| R-12 | DFlow transactions can be fully inspected without explicit v0/ALT handling | ❌ Correction — request and verify lookup-table entries |
| R-13 | Convex storage URLs can provide short-lived receipt access | ❌ Correction — URLs remain bearer-accessible until deletion |

---

## R-1 — Convex issuer matching (⚠️ Day 0 blocker)

Convex's custom JWT provider requires that `issuer` **exactly match** the token's `iss` claim, and `applicationID` exactly match `aud`. Privy access and identity tokens carry `iss: "privy.io"` — a bare hostname, not a URL. Convex documentation examples all show URL-format issuers, and community reports indicate the Convex backend prefixes a protocol-less issuer with `https://`, which would produce `https://privy.io` and fail the exact-match check against a bare `privy.io`.

**This is unresolved from documentation alone.** It is the single highest-risk item in the plan and matches the brief's own Day 0 gate.

**Action:** On Day 0, decode a real Privy access token (jwt.io or `jose`), read the literal `iss` string, and try both `'privy.io'` and `'https://privy.io'` in `convex/auth.config.ts` until `ctx.auth.getUserIdentity()` returns non-null. If neither works, ship the AD-5 Vercel token-bridge fallback that day. Do not spend Day 0 on UI.

## R-2 — Privy verification key (✅ confirmed)

Privy access tokens are standard **ES256** JWTs. Privy does **not** document a public per-app JWKS URL. The verification key is retrieved from the Privy dashboard under *Configuration → App settings*, or fetched by the Node SDK's `verifyAccessToken` at runtime. The architecture's premise — that My Tab must convert Privy's public key into JWK format itself — is correct.

Claims confirmed: `iss` = `privy.io` · `aud` = Privy app ID · `sub` = Privy DID · plus `sid`, `iat`, `exp`.

## R-3 — JWKS delivery (⚠️ simplification available)

Convex's custom JWT provider accepts a **`data:` URI** for the `jwks` field (`"data:text/plain;charset=utf-8;base64,ey..."`), explicitly to avoid calling an external service.

**This removes the need for `GET /.well-known/privy-jwks.json` on Vercel entirely.** The Privy app verification key is static per app, so a base64 data URI in the Convex env is simpler, removes a network hop from the auth path, and removes a Vercel route from the surface area. The architecture spine adopts this as AD-5's primary path; the hosted route drops to unused.

**Caveat:** if Privy ever rotates the app verification key, the data URI must be updated by hand. Acceptable for a 10-day build.

## R-4 — DFlow order response shape (❌ correction)

The DFlow order response documents:

- `transaction` — base64 transaction, user must sign before sending
- `outAmount` — expected output after fees
- `otherAmountThreshold` — **the minimum output**; the transaction fails below it
- `contextSlot` — slot at which the request was evaluated
- `executionMode` — `"sync"` or `"async"`

There is **no `orderId` and no `expiry` field.**

**Impact:** `settlementIntents.dflowOrderId` cannot be populated from the response and must not be load-bearing for idempotency. My Tab owns freshness and deduplication itself:

- Idempotency keys on the My Tab settlement intent, never a DFlow-issued ID.
- Quote expiry derived from the transaction's recent blockhash validity plus a My Tab-side TTL written onto the intent at creation.
- `otherAmountThreshold` is the value to check against the obligation in the AD-10 "minimum output meets the obligation" step.
- `contextSlot` is useful as a staleness signal — log it.

## R-5 — Astryx (✅ confirmed, one build rule)

Astryx is Meta's open-source React design system (`facebook/astryx`, MIT), currently **Beta**, with 150+ accessible components and `@astryxdesign/theme-neutral` available as documented. Install set: `@astryxdesign/core`, `@stylexjs/stylex`, `@astryxdesign/theme-neutral`, `@astryxdesign/cli`, then `npx @astryxdesign/cli init`.

- **React 19+ is a hard peer dependency** of `@astryxdesign/core` — consistent with the plan.
- Ships pre-built CSS; no build plugin or PostCSS config needed.
- StyleX is internal; components can be overridden with `className`.
- **Build rule:** do **not** add `@stylexjs/babel-plugin` to a Next.js App Router app — it disables SWC and breaks `next/font`. This constraint is now AD-20.
- **Risk:** Beta status. Pin exact versions on Day 0 and run the component smoke test the risk register already requires.

## R-6 — Privy Solana sponsorship (✅ confirmed — it is the documented pattern)

Privy's Solana gas-sponsorship documentation describes exactly the architecture's flow: prepare a transaction with a custom fee payer → sign with the user's wallet → send the partially signed transaction to your backend → verify it → sign with the managed fee-payer wallet → broadcast. Privy documents creating a dedicated Solana wallet as the fee payer and funding it with SOL, and provides a backend example that adds the fee-payer signature and broadcasts.

The "explicit two-signature path" is therefore **Privy's own recommended pattern**, not a My Tab invention. AD-9 is well-founded and defensible to judges.

## R-7 — DFlow sponsorship parameters (✅ confirmed)

- **`sponsor`** — base58 sponsor wallet address. When set, the sponsor pays the transaction fee **and token-account creation**, and **both user and sponsor must sign**. This is DFlow's documented gasless-swap mechanism.
- **`sponsorExec`** — controls who executes the swap. Default `true` (sponsor executes); **`false` makes the user the executor**, which is what My Tab needs so the user's signature authorizes their own swap.
- **`destinationWallet`** — base58 address receiving the output token; mutually exclusive with `destinationTokenAccount`; supports automatic ATA creation.
- **`platformFeeBps` / `feeAccount`** — fee account is required when the fee is non-zero, and its mint must match the fee mint. Ties directly to OQ-4.

Note that sponsor-paid **token-account creation** is exactly the ATA-abuse surface AD-17 caps.

## R-8 — Privy Telegram authentication (✅ confirmed)

Privy supports two Telegram flows: standard login via the Telegram login widget, and **seamless (zero-click) login** when the app is opened inside a Telegram bot or Mini App. Seamless is enabled in the Privy dashboard under Telegram settings, or per-client via the app-client Telegram override; the app does not call `login` from `usePrivy`.

**Setup requirements to schedule on Day 0:**

- Enable Telegram auth in the Privy dashboard.
- Run `/setdomain` in BotFather for the bot.
- Add `web.telegram.org` to Privy allowed domains for the Telegram web client.

Privy's docs also note that Telegram's in-app browser limits login methods to email, SMS, and embedded wallets — which is consistent with the plan (embedded wallet, no external wallet in P0) but is a hard reason external wallets stay P1.

## R-9 — Convex HTTP Actions as trusted ingress (✅ confirmed; adopted)

Convex HTTP Actions are public HTTP endpoints that can validate request headers and payloads, then call internal queries, mutations, and actions. Internal functions cannot be called directly by clients. This is the clean trust boundary the prior Vercel-webhook design lacked: Telegram calls Convex directly; the HTTP Action verifies the Telegram secret or launch data; only then does it invoke an internal mutation.

**Architecture correction:** AD-14 now makes `convex/http.ts` the single Telegram webhook and bootstrap ingress. Vercel no longer calls a privileged public Convex mutation. Provider webhooks follow the same pattern. The optional AD-5 Vercel token bridge remains isolated to minting a short-lived client JWT and performs no domain write.

## R-10 — Telegram identity is not membership (❌ correction)

Telegram requires raw Mini App `initData` to be validated before its fields are trusted, and `auth_date` must be freshness-checked. Valid launch data proves Telegram supplied the user/launch context; it does not establish an ongoing group-membership lifecycle. The Bot API only guarantees `getChatMember` for other users when the bot is an administrator, and `chat_member` updates about other members likewise require bot-admin status.

**Architecture correction:** the bot must be administrator in every bound group. Bootstrap and stale privileged operations call `getChatMember`; `chat_member`/`my_chat_member` updates maintain joins, leaves, bans, roles, and bot-admin loss; daily reconciliation repairs missed updates. A signed `chat_instance` is recorded as launch evidence but never substitutes for the membership check.

## R-11 — DFlow execution mode (❌ correction)

DFlow documents `allowSyncExec=true` **and** `allowAsyncExec=true` as defaults, and the order response reports `executionMode` as `sync` or `async`. My Tab's one-transaction confirmation/ledger model has no asynchronous fill or revert state, so accepting the defaults is unsafe.

**Architecture correction:** every request must send `allowSyncExec=true` and `allowAsyncExec=false`; the response is rejected unless `executionMode === 'sync'`. This preserves routed input-token payments without adding a second asynchronous settlement protocol.

## R-12 — DFlow v0/address lookup tables and fee surface (❌ correction)

DFlow can return versioned transactions using address lookup tables. `includeAddressLookupTables` defaults false; when true, the response includes the referenced table entries. The response may also declare `destinationWalletMustSign`, `lastValidBlockHeight`, compute-unit limit, and prioritization fee. Sponsorship also pays token-account creation.

**Architecture correction:** request lookup-table entries, resolve every v0 account against RPC at/after the quote context slot, compare it to DFlow's entries, and reject unresolved, deactivated, mismatched, or unexpected writable accounts. The exact signer set is payer+sponsor and `destinationWalletMustSign` must be false. AD-10 now binds compute, priority-fee, ATA, total sponsor, program, instruction, and writable-role caps.

## R-13 — Convex receipt URL security (❌ correction)

Convex documents that anyone holding a `storage.getUrl()` URL can reuse it without another application authorization check; revocation requires deleting the file. Convex recommends an HTTP Action when authorization must be checked on every request, and an alternate storage component when automatically expiring URLs are required.

**Architecture correction:** My Tab never returns `storage.getUrl()` for receipts. An authenticated Convex HTTP Action checks group access and streams the bytes with no-store caching. Original images/provider payload are retained no longer than 30 days after upload or 7 days after tab completion; abandoned uploads are removed after 24 hours.

---

## What changed in the plan

1. **AD-5** now prefers a base64 `data:` URI JWKS in Convex over a hosted Vercel JWKS route (R-3).
2. **AD-20** gained the "no `@stylexjs/babel-plugin` in App Router" rule (R-5).
3. **Settlement intent** must not depend on a DFlow order ID or DFlow-supplied expiry; My Tab owns both (R-4).
4. **PRD risk register** gained the DFlow-response-shape row and the Astryx-Beta row.
5. **AD-14** moved Telegram webhook/bootstrap from Vercel to one authenticated Convex HTTP boundary (R-9, R-10).
6. **AD-10, AD-11, AD-17, and AD-21** now force sync-only DFlow, resolve v0/ALTs, bind sponsor caps, and prevent timeout retries from duplicating a payment (R-11, R-12).
7. **AD-23** replaces reusable receipt storage URLs with per-request authorization and fixed retention (R-13).

## What did not change

The identity model, durable-intent pattern, two-signature sponsorship path, DFlow's routing role, Convex-owns-truth boundary, and full product scope remain unchanged. The former Vercel-ingress-only rule is intentionally retired by R-9.

## Sources

- [Convex — Custom JWT Provider](https://docs.convex.dev/auth/advanced/custom-jwt)
- [Convex — Debugging Authentication](https://docs.convex.dev/auth/debug)
- [Privy — Access tokens](https://docs.privy.io/authentication/user-authentication/access-tokens)
- [Privy — JWT-based auth](https://docs.privy.io/authentication/user-authentication/jwt-based-auth)
- [Privy — Telegram login](https://docs.privy.io/authentication/user-authentication/login-methods/telegram)
- [Privy — Sponsoring transactions on Solana](https://docs.privy.io/wallets/gas-and-asset-management/gas/solana)
- [Privy — Building Telegram apps](https://privy.io/blog/building-telegram-apps)
- [DFlow — Order endpoint](https://pond.dflow.net/resources/trading-api/order/order)
- [Astryx — Getting Started](https://astryx.atmeta.com/docs/getting-started)
- [Astryx — Theme System](https://astryx.atmeta.com/docs/theme)
- [facebook/astryx on GitHub](https://github.com/facebook/astryx)
- [Convex — HTTP Actions](https://docs.convex.dev/functions/http-actions)
- [Convex — Internal Functions](https://docs.convex.dev/functions/internal-functions)
- [Convex — File Storage security model](https://docs.convex.dev/file-storage/overview)
- [Telegram — Mini Apps data validation](https://core.telegram.org/bots/webapps)
- [Telegram — Bot API membership methods and updates](https://core.telegram.org/bots/api)
- [Solana — getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses)
- [Solana — isBlockhashValid](https://solana.com/docs/rpc/http/isblockhashvalid)
- [Frankfurter — v2 API](https://frankfurter.dev/)
- [Frankfurter — Bank of Thailand provider](https://frankfurter.dev/providers/bot/)
