# DFlow API Reference (research compilation)

Compiled 2026-08-22 for the My Tab DFlow integration.

**Sources.** Every fact below is cited to one of:

- `llms.txt` / `llms-full.txt` — `https://pond.dflow.net/llms-full.txt` (full prose docs dump, 4409 lines). Cited as the doc page it came from, e.g. *[spot/trading/sponsored-swaps]*.
- **OpenAPI** — `https://pond.dflow.net/resources/trading-api/openapi.json` (title "DFlow Aggregator", version 0.1.0, licence BUSL-1.1). This is the authoritative parameter reference; the doc site's `/resources/trading-api/**` pages are generated from it and contain almost no prose of their own. Cited as *[openapi]*.
- **Skills** — the three official skills installed in this repo at `.agents/skills/dflow-*/SKILL.md` (symlinked from `.claude/skills/`). Cited as *[skill:name]*.
- **VERIFIED** — facts I established by calling the live API from this machine on 2026-08-22, because the docs do not state them. Marked inline.

> **Marking convention.** Anything the docs do not answer is called out explicitly as **DOCS DO NOT SAY**. I have not guessed anywhere.

---

## 0. Executive summary of the answers you asked for

| Question | Answer | Confidence |
|---|---|---|
| Token list endpoint? | `GET /tokens` and `GET /tokens-with-decimals`. **Mints and decimals only — no symbol, name, logo, or liquidity.** 4.59M entries, 215-233 MB. | VERIFIED |
| Price without committing? | `GET /order` **without** `userPublicKey` → prices, no transaction. Plus two WebSocket streams. | Docs + VERIFIED |
| Sponsor fee payer | Sponsor is **always** transaction account[0] (fee payer) in both `sponsorExec` modes; exactly 2 signers. | VERIFIED |
| Devnet? | **No.** `dev-quote-api` is a rate-limit tier on **mainnet-beta**, not a cluster. | VERIFIED — see §9 |
| Rate limit (unkeyed) | `x-ratelimit-limit: 60`. Docs publish no numbers. | VERIFIED |
| Proof required to trade? | **No.** Spot trades need no KYC. | Docs, confirmed |
| Free tier? | Yes — dev endpoints, no key, no signup. | Docs |

---

## 1. Endpoints, hosts and access tiers

### 1.1 Hosts

*[get-started/endpoints]*

| Service | Developer (no API key) | Production (API key required) |
|---|---|---|
| Trade API | `https://dev-quote-api.dflow.net` | `https://quote-api.dflow.net` |
| Trade API WebSocket | `wss://dev-quote-api.dflow.net` | `wss://quote-api.dflow.net` |

Developer endpoints are described as "rate-limited and intended for testing only". Production endpoints have "higher rate limits and are suitable for live applications". The OpenAPI `servers` block lists only `https://quote-api.dflow.net` *[openapi]*.

Separate hosts, not on the Trade API:

| Service | Host | Auth |
|---|---|---|
| Proof verification API | `https://proof.dflow.net` | none (public) |
| Proof hosted user flow | `https://dflow.net/proof` | n/a (browser redirect) |
| Docs MCP server | `https://pond.dflow.net/mcp` | none |
| CLI installer | `https://cli.dflow.net` | none |

### 1.2 Authentication

*[resources/recipes/api-keys]*

- Header: `x-api-key: <key>` on **all** requests to production endpoints.
- WebSockets authenticate **the same way** — `x-api-key` as a header on the HTTP upgrade request, **not** a URL query parameter. This is explicit in the docs and matters because browser `WebSocket` cannot set headers (see §6.4).
- One key covers everything: REST and WebSocket alike *[skill:dflow-spot-trading]*.
- Dev endpoints accept requests with no key at all.

### 1.3 Getting a key and the free tier

*[get-started/api-key]*

> "Developer endpoints work without an API key, however they are rate limited and not suitable for production use. For production use, [fill out this form](https://forms.gle/eX3cghbMF8VBB9qa9) to receive an API key with higher rate limits. We will get back to you within 2-5 days."

- **Free tier: yes, effectively.** The dev endpoints are open, keyless, feature-complete and require no signup at all. The skill confirms dev is "same features, rate-limited, for testing only" *[skill:dflow-spot-trading]*.
- Turnaround for a production key is **2-5 days** — plan around this for a hackathon deadline.
- There is no self-serve dashboard; the key arrives by human process off a Google Form.

### 1.4 Rate limits

**DOCS DO NOT SAY** — no numeric rate limit is published anywhere in the docs for either tier. The only documented statement is the 429 row in the error table: "Too many requests in a short window → Retry with backoff, reduce request rate, or use an API key" *[resources/error-codes]*.

**VERIFIED (2026-08-22).** The dev endpoint returns rate-limit headers on every response:

```
x-ratelimit-limit: 60
x-ratelimit-remaining: 59
```

The window unit is not stated in the headers and is not documented; 60/minute is the natural reading but is **not confirmed**. Read `x-ratelimit-remaining` at runtime rather than hardcoding a budget. Whether production keys expose the same headers with a higher limit is **DOCS DO NOT SAY**.

---

## 2. Complete REST endpoint inventory

From `openapi.json`. 16 operations across 14 paths.

| Method | Path | Purpose |
|---|---|---|
| GET | `/order` | **The core call.** Quote + optionally a ready-to-sign transaction. |
| GET | `/order-status` | Order status. **Prediction market orders only.** |
| GET | `/quote` | Quote for an imperative swap (legacy; `/order` preferred). |
| POST | `/swap` | Build a swap transaction from a `/quote` response (legacy). |
| POST | `/swap-instructions` | Same, but returns raw instructions instead of a transaction. |
| GET | `/intent` | Quote for a declarative (intent) swap. |
| POST | `/submit-intent` | Submit the signed intent open transaction. |
| GET | `/priority-fees` | Global priority fee estimates. |
| GET | `/tokens` | All supported mints. |
| GET | `/tokens-with-decimals` | All supported mints + decimals. |
| GET | `/venues` | Supported liquidity venues. |
| GET | `/health-check` | Health. |
| GET | `/healthz` | Health (alias). |
| GET | `/quote-stream` | WebSocket upgrade — top-of-book quotes. |
| GET | `/book-stream` | WebSocket upgrade — 10-level depth. |
| GET | `/priority-fees/stream` | WebSocket upgrade — priority fee estimates. |

Plus, on a different host:

| Method | Path | Purpose |
|---|---|---|
| GET | `https://proof.dflow.net/verify/{address}` | Is this wallet KYC-verified? |

**Deprecation posture.** `/quote`, `/swap` and `/swap-instructions` all carry the same banner: "We recommend using the `/order` endpoint for new integrations. This endpoint is still available but `/order` is the preferred approach" *[resources/trading-api/imperative/*]*. Build on `/order`.

---

## 3. `GET /order` — the core endpoint

Returns a quote, and — **if and only if `userPublicKey` is supplied** — a base64 transaction to sign. *[openapi]*, *[spot/trading/trade-api-data-model]*

### 3.1 Request parameters (all query string, verbatim names)

**Required**

| Param | Type | Notes |
|---|---|---|
| `inputMint` | string | Base58 input mint address. |
| `outputMint` | string | Base58 output mint address. |
| `amount` | integer (int64) | Input amount as a **scaled integer**. "For example, 1 SOL is 1000000000." |

**Core optional**

| Param | Type | Notes |
|---|---|---|
| `userPublicKey` | string | Base58 swapper wallet. "If specified, the response will include a transaction allowing the user to submit the order." Omit for a pure quote. |
| `slippageBps` | `SlippageTolerance` = u16 \| `"auto"` | **Default is `"auto"`** (stated explicitly on `/order`). |
| `perLegSlippage` | boolean | "If true or unspecified, per-leg slippage checks are enabled. If false, per-leg slippage checks are disabled." |
| `priceImpactTolerancePct` | integer (int32) | Error if route price impact exceeds this. "For example, 10 is 10% and 100 is 100%." Server picks a default if unspecified. |

**Routing controls**

| Param | Type | Notes |
|---|---|---|
| `dexes` | string | Comma-separated include list. |
| `excludeDexes` | string | Comma-separated exclude list. |
| `onlyDirectRoutes` | boolean | Single-leg routes only. |
| `maxRouteLength` | integer | Max legs. Ignored if `onlyDirectRoutes` is true. |
| `onlyJitRoutes` | boolean | Every leg uses the JIT router. |
| `forJitoBundle` | boolean | Only routes compatible with Jito bundles. Default false. "Should only be specified as true if the swap will be executed in a Jito bundle." |

**Execution mode**

| Param | Type | Notes |
|---|---|---|
| `allowSyncExec` | boolean | Default **true**. |
| `allowAsyncExec` | boolean | Default **true**. |
| `restrictRevertMint` | boolean | Input mint must be the revert mint for async orders. Default false. |

**Fees and fee accounts**

| Param | Type | Notes |
|---|---|---|
| `platformFeeMode` | enum `outputMint` \| `inputMint` | Default `outputMint`. |
| `platformFeeBps` | integer | "This should only be nonzero if the swap will collect the platform fee." |
| `platformFeeScale` | integer | Prediction-market only, 3 decimals, `>= 0 && < 1000`. "a value of 50 means 0.050". |
| `feeAccount` | string | Token account receiving the platform fee. Mint must match the fee mint. "Must be specified if the platform fee is nonzero." |
| `positiveSlippageFeeAccount` | string | **Must be a token account for the output mint, regardless of platform fee mode.** If it can't receive at execution time the transfer is silently skipped. |
| `positiveSlippageLimitPct` | integer | Cap: lesser of (1) excess out-amount above quote and (2) this % of actual out-amount after platform fee. |

**Sponsorship** — see §5.

| Param | Type | Notes |
|---|---|---|
| `sponsor` | string | Base58 sponsor wallet. |
| `sponsorExec` | boolean | Default **true**. |

**Destination routing**

| Param | Type | Notes |
|---|---|---|
| `destinationTokenAccount` | string | Destination token account, or for native SOL output the destination **wallet**. Must already exist for non-native-SOL. Mutually exclusive with `destinationWallet`. |
| `destinationWallet` | string | Destination wallet; **ATA is created if missing at execution time.** Mutually exclusive with `destinationTokenAccount`. |
| `outputCloseAuthority` | string | Idempotently init the output token account and set its close authority. Cannot be used with SOL output, `destinationTokenAccount`, or `destinationWallet`. |
| `revertWallet` | string | Receives the revert mint if an async order reverts. |

**Transaction shaping**

| Param | Type | Notes |
|---|---|---|
| `wrapAndUnwrapSol` | boolean | "If false, the order will use wrapped SOL." |
| `prioritizationFeeLamports` | u32 \| `auto` \| `medium` \| `high` \| `veryHigh` \| `disabled` | Default `"auto"`. Mutually exclusive with `computeUnitPriceMicroLamports`. |
| `prioritizationFeeMaxLamports` | integer | Cap on the server-chosen fee. |
| `computeUnitPriceMicroLamports` | integer (int64) | Mutually exclusive with `prioritizationFeeLamports`. |
| `dynamicComputeUnitLimit` | boolean | Server simulates to size the CU limit. |
| `includeJitoSandwichMitigationAccount` | boolean \| base58 string | `true` = default account, `false` = omit, or a specific address. |
| `includeAddressLookupTables` | boolean | Default false. Returns the ALT entries the tx references so you can recompile **without an RPC round-trip**. Very useful if you append instructions. |
| `maxAccounts` | integer | Mutually exclusive with `reserveAccounts`. |
| `maxTransactionSize` | integer | Mutually exclusive with `reserveTransactionSize`. |
| `reserveAccounts` | integer | Server ensures tx uses at most `TRANSACTION_MAX_ACCOUNTS - reserveAccounts`. "specify only the unique accounts your additions will introduce, not accounts already in the transaction." |
| `reserveTransactionSize` | integer | Server ensures size at most `TRANSACTION_MAX_SIZE - reserveTransactionSize`. |

**Prediction markets / Pump.fun**

| Param | Type | Notes |
|---|---|---|
| `predictionMarketSlippageBps` | u16 \| `"auto"` | Must be `>= slippageBps` if numeric. Not used in routing. |
| `predictionMarketInitPayer` | string | Pays market init. **Cannot be specified alongside `sponsor`.** |
| `outcomeAccountRentRecipient` | string | Receives rent from closing an empty outcome account. |
| `skipPumpfunCashbackClaim` | boolean | Default false. **Cannot be used with sponsor-executed swaps.** |
| `allowBondingCurveUnderconsumption` | boolean | Default false. **Cannot be used with sponsor-executed swaps.** |

### 3.2 `OrderResponse` fields

*[openapi]* — `*` = always present.

| Field | Type | Notes |
|---|---|---|
| `inputMint`* / `outputMint`* | string | Echo. |
| `inAmount`* | string | **Maximum** input amount, scaled integer. |
| `outAmount`* | string | Expected output after all fees. |
| `otherAmountThreshold`* | string | **Minimum** output after all fees. Transaction fails below this. |
| `minOutAmount`* | string | "Same as `other_amount_threshold`" — duplicate. |
| `slippageBps`* | integer | Resolved value (after `auto`). |
| `priceImpactPct`* | string | "0.01" means 1%. |
| `contextSlot`* | integer | Slot at evaluation. |
| `executionMode`* | `sync` \| `async` | |
| `platformFee` | `PlatformFee` \| null | |
| `routePlan` | array | "Specified if and only if the route plan is known at order opening time. This will be specified for all synchronous orders." |
| `revertMint` | string | Async orders only. |
| `transaction` | string | **Base64. Only if `userPublicKey` was supplied.** |
| `lastValidBlockHeight` | integer | Only with `userPublicKey`. |
| `computeUnitLimit` | integer | Only with `userPublicKey`. |
| `prioritizationFeeLamports` | integer | Only with `userPublicKey`. Resolved lamports. |
| `prioritizationType` | object | e.g. `{"computeBudget":{"microLamports":134,"estimatedMicroLamports":134}}` (VERIFIED). |
| `addressLookupTables` | array | Only if `includeAddressLookupTables=true` **and** `userPublicKey` present. |
| `destinationWalletMustSign` | boolean | |
| `predictionMarketInitPayerMustSign` | boolean | |
| `initPredictionMarketCost` | integer | Lamports, only if the tx initialises a market. |
| `isNativePredictionMarketOutput` | boolean | |
| `predictionMarketSlippageBps` | integer | Prediction orders only. |

The skill adds a practical warning: fields marked "if and only if the request included the user's public key" (`transaction`, `lastValidBlockHeight`, `computeUnitLimit`, `prioritizationFeeLamports`) "are absent on quote-only calls, so check before using them" *[skill:dflow-spot-trading]*.

### 3.3 Verified live response

**VERIFIED** — `GET /order?inputMint=SOL&outputMint=USDC&amount=10000000&userPublicKey=…` on the dev host:

```json
{
  "inputMint": "So11111111111111111111111111111111111111112",
  "inAmount": "10000000",
  "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "outAmount": "928220",
  "otherAmountThreshold": "926364",
  "minOutAmount": "926364",
  "slippageBps": 20,
  "platformFee": null,
  "priceImpactPct": "0",
  "routePlan": [{
    "venue": "BisonFi",
    "marketKey": "8FnX3xo2yYw3EUE6w3nQA4GfXGS9wpK6oj3veJpbFzLo",
    "inputMint": "So111...112", "outputMint": "EPjFW...Dt1v",
    "inAmount": "10000000", "outAmount": "928220",
    "inputMintDecimals": 9, "outputMintDecimals": 6
  }],
  "contextSlot": 440907166,
  "executionMode": "sync",
  "lastValidBlockHeight": 418956691,
  "prioritizationFeeLamports": 27,
  "computeUnitLimit": 200000,
  "prioritizationType": {"computeBudget": {"microLamports": 134, "estimatedMicroLamports": 134}}
}
```

Note `slippageBps: 20` — that is `auto` resolving to 0.20% for this pair and size.

### 3.4 The quickstart flow

*[spot/recipes/quickstart]*

```ts
const params = new URLSearchParams({
  inputMint: SOL_MINT,
  outputMint: DFLOW_SETTLEMENT_MINT,
  amount: AMOUNT.toString(),
  slippageBps: SLIPPAGE_BPS.toString(),
  userPublicKey: keypair.publicKey.toBase58(),
});
const orderResponse = await fetch(`${DFLOW_TRADE_API_URL}/order?${params}`, { headers })
  .then((r) => r.json());

const tx = VersionedTransaction.deserialize(
  Buffer.from(orderResponse.transaction, "base64")
);
tx.sign([keypair]);
const signature = await connection.sendTransaction(tx);
const { value } = await connection.confirmTransaction(signature, "confirmed");
```

---

## 4. Getting a market price without committing

Three ways, in order of practicality for a UI.

### 4.1 `/order` with no `userPublicKey` — the documented answer

*[resources/faqs — "How do I get a price quote without a connected wallet?"]*

> "Call `/order` **without** `userPublicKey`. It returns the price fields (`inAmount`, `outAmount`, `priceImpactPct`) and no transaction, so you can show a price before the user has connected a wallet. A separate `/quote` endpoint still works, but `/order` is preferred for new integrations."

The Proof integration page repeats this: "To show order quotes to unverified users, omit `userPublicKey` from `/order` requests" *[proof/partner-integration]*.

**Is it free/unlimited?** DFlow charges **no protocol fee** on spot trades *[spot/introduction]*, and a quote is just an HTTP call — there is no per-quote charge. It is **not unlimited**: it is governed by the same rate limit as everything else (`x-ratelimit-limit: 60` on dev, VERIFIED). There is no separate cheaper price endpoint. **DOCS DO NOT SAY** whether quote calls are weighted differently from order calls against a production key's quota.

### 4.2 There is no dedicated "price" endpoint

**DOCS DO NOT SAY** / confirmed absent from the OpenAPI: there is no `/price`, no `/ticker`, no OHLC/candles endpoint, and no historical data endpoint. Spot price comes from `/order` or from the quote stream. If you need a chart, you must build it from the stream yourself.

### 4.3 Quote stream — `wss://…/quote-stream`

*[resources/trading-api/websockets/quote-stream]*, *[spot/trading/market-data-streams]*

**Coverage:** direct **and one-hop** routes. **Access is gated** — see §6.4.

Subscribe / unsubscribe:

```json
{ "op": "subscribe",   "base_mint": "So111...112", "quote_mint": "EPjFW...Dt1v" }
{ "op": "unsubscribe", "base_mint": "So111...112", "quote_mint": "EPjFW...Dt1v" }
```

Message — a batch per slot:

```json
{
  "u": 425218378,
  "ts": 1780964565,
  "subscribe": [{ "sb": "So111...112", "sq": "EPjFW...Dt1v", "auto": false }],
  "updates": [{
    "sb": "So111...112", "sq": "EPjFW...Dt1v",
    "b": "66.46416041", "B": "9.99791400",
    "a": "66.46410253", "A": "9.99791400"
  }]
}
```

| Field | Type | Meaning |
|---|---|---|
| `u` | number | Slot the quotes were computed at. May be `0` before the chain Clock loads *[openapi]*. |
| `ts` | number | Unix seconds (Solana `Clock`). May be `0` before Clock loads. |
| `updates` | array | Per-pair quote updates for this slot. |
| `subscribe` / `unsubscribe` | array | Server acknowledgements of subscription changes. |
| `sb` / `sq` | string | Base mint / quote mint. |
| `b` / `a` | string | Best **b**id / best **a**sk price, quote per base, 8 decimals. |
| `B` / `A` | string | Best bid / ask **quantity**, quote-denominated ($10 USDC equivalent). |
| `e` | string | Per-pair error code (e.g. `no_route`) **instead of** prices. |

**Update frequency:** one batch **per slot** (~400 ms on Solana). The docs say "Per-tick a `Batch` frame is emitted"; there is no configurable throttle. **DOCS DO NOT SAY** whether an explicit ping/keepalive is required.

**Two important caveats, verbatim from the OpenAPI description:**

1. "`B` and `A` are **base-denominated**. In this server's pair convention the base side is typically the stable (USDC/CASH), so depth is expressed in dollar-equivalents and is directly comparable across pairs."
2. "`B` and `A` typically carry the **same value** — both report the probe notional that drove the round-trip pricing. **They are not independent depths.** For independent per-side depth, use `/book-stream`."

The single-letter keys "mirror Binance's `bookTicker` WS schema so CEX-style clients can consume the stream with minimal changes" *[openapi]*.

**How the price is derived:** "DFlow builds each quote by routing a **$10 USDC equivalent** trade through the best path in each direction, so the bid and ask are the rates that trade would execute at" *[spot/trading/market-data-streams]*. So the stream price is a $10-notional probe, **not** the price for your user's actual size.

Also on this stream, privileged ops (require `enable_quote_stream_auto_subscribe`) *[openapi]*:

- `{ "op": "subscribe_all_prediction_markets" }` — subscribes to `(outcome_mint, CASH)` for every tradable native prediction-market outcome mint, where CASH is `CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH`.
- `{ "op": "unsubscribe_all_prediction_markets" }`

Batches on this stream may then carry `pm_start` / `pm_stop` arrays for world-event transitions.

### 4.4 Book stream — `wss://…/book-stream`

*[resources/trading-api/websockets/book-stream]*

**Coverage:** **direct routes only.** Ten levels per side. **Access is gated.**

Same `subscribe` / `unsubscribe` op shape as the quote stream.

```json
{
  "u": 425218519, "ts": 1780964621,
  "subscribe": [{ "sb": "So111...112", "sq": "EPjFW...Dt1v" }],
  "updates": [{
    "sb": "So111...112", "sq": "EPjFW...Dt1v",
    "mid": 66.287, "tick": 0.0066287, "crossed": false,
    "b": [ { "price": 66.2803713, "cumulative_size_human": 11.275078961 } ],
    "a": [ { "price": 66.2936287, "cumulative_size_human": 727.767025378 } ]
  }]
}
```

| Field | Type | Meaning |
|---|---|---|
| `u` | number | Slot the book was computed at. |
| `ts` | number | Unix seconds. |
| `skipped` | number | "Slots skipped before this batch under load. `0` when the stream kept up." |
| `mid` | number | Mid price, quote per base (human units, decimals applied). |
| `tick` | number | Tick width, quote per base. |
| `crossed` | boolean | Whether the aggregated book was crossed before being uncrossed. **OpenAPI says: "currently always `false`… the field is kept for forward compat."** |
| `b` / `a` | array | Ten bid / ask levels, **nearest to spot outward**. |
| `e` | string | Per-pair error code (e.g. `no_market`) instead of a book. |
| `price` | number | Level price, quote per base. |
| `cumulative_size_human` | number | **Cumulative** base size from the spot out to this level — not the size at that level. |

OpenAPI adds the precise definition: "Each level is the largest cumulative base size whose average execution price equals the level price."

### 4.5 Accuracy warning (applies to both streams)

*[spot/trading/market-data-streams]*

> "Quotes and book levels are **approximations**. DFlow computes them at runtime from current routes, so they may differ from the quote you receive at order time. Treat them as a live read on the market, **not a guaranteed execution price**."

And from the recipe: "Quotes are approximations and **can briefly cross (bid above ask) between slots**" *[spot/recipes/stream-quotes]*.

**Practical rule:** stream for the ticker, `/order` for the number you commit to.

---

## 5. Sponsored swaps — full detail

This is the highest-value section for My Tab, since the product already has a sponsor fee-payer wallet.

*[spot/trading/sponsored-swaps]*, *[openapi]*, plus VERIFIED live decoding.

### 5.1 What it is

> "Use sponsored swaps to build gasless trading features where users swap tokens without holding SOL for fees. A **sponsor** pays the transaction fee and token account creation costs on the user's behalf. To create a sponsored swap, pass the `sponsor` parameter with the sponsor's wallet address on a Trade API request. **Both the user and sponsor must sign the resulting transaction.**"

### 5.2 The three parameters, verbatim

**`sponsor`** — *[openapi, /order]*

> "Base58-encoded address of the sponsor's wallet. If specified, the sponsor will pay the transaction fee and for token account creation, and both the user and the sponsor must sign the swap transaction. This can be used to implement gasless swaps. **Cannot be specified alongside `predictionMarketInitPayer` parameter.**"

**`sponsoredSwap`** — boolean

> "Set to `true` to indicate the swap will be sponsored. This ensures the quote accounts for the correct transaction structure and fees based on the execution mode. **Not needed on `/order` or `/swap` — those endpoints infer sponsorship from the `sponsor` parameter.**"

OpenAPI, on `/quote` only: "This should be specified as true if and only if the quote will be used for a sponsored swap. If true, then the quote will account for any additional **token 2022 transfer fees** that apply to the input and output mints for a sponsored swap."

So: **`sponsoredSwap` exists only on `/quote`.** It is not an `/order` parameter. On `/order` you pass `sponsor` and DFlow infers the rest.

**`sponsorExec`** — boolean, **default `true`**

| Value | Executor | Description (verbatim) |
|---|---|---|
| `true` (default) | Sponsor | "Sponsor executes the swap using their token accounts" |
| `false` | User | "User executes the swap using their own token accounts" |

Where each is accepted *[spot/trading/sponsored-swaps]*:

- `GET /order` — query parameter, used when `sponsor` is specified.
- `GET /quote` — query parameter, used when `sponsoredSwap` is `true`.
- `POST /swap` — **request body field**, used when `sponsor` is specified.

### 5.3 The two execution modes

**Sponsor executes (default, `sponsorExec=true`)** — three onchain steps:

1. User transfers input tokens to sponsor.
2. Sponsor executes the swap using **their** token accounts.
3. Sponsor transfers output tokens to user.

**User executes (`sponsorExec=false`)** — the user swaps directly from their own token accounts. The sponsor still pays the transaction fee and token account creation costs.

The docs explicitly recommend the *user-executed* mode, under the heading "Why Use User-Executed Sponsored Swaps":

> - "**Smaller transactions.** Eliminates the input transfer to the sponsor and output transfer back to the user, reducing overall transaction size."
> - "**Simpler transaction structure.** The user swaps directly from their own token accounts in a single step."

**Recommendation for My Tab: use `sponsorExec=false`.** It avoids the sponsor wallet ever custodying user funds mid-transaction, which is materially better for a non-custodial posture, and it produces a smaller transaction. Note this is the **non-default** — you must pass it explicitly.

### 5.4 What exactly the sponsor signs — VERIFIED

The docs say only "both the user and the sponsor must sign". They do **not** state who the fee payer is or the signer ordering. I decoded real transactions from the live API to establish it.

**VERIFIED 2026-08-22**, same order in three configurations, decoding the v0 message header and static account keys:

| Configuration | Sig slots | `numRequiredSignatures` | Account[0] = fee payer | Signer list (in order) |
|---|---|---|---|---|
| No sponsor | 1 | 1 | **user** | `[user]` |
| `sponsor=S` (default `sponsorExec=true`) | 2 | 2 | **sponsor** | `[sponsor, user]` |
| `sponsor=S&sponsorExec=false` | 2 | 2 | **sponsor** | `[sponsor, user]` |

**Conclusions:**

1. **The sponsor is always account[0], i.e. the Solana fee payer**, in *both* execution modes. `sponsorExec` changes the swap mechanics, **not** who pays the fee.
2. The signature array has exactly **2** slots, ordered **sponsor first, then user**. When you co-sign server-side, you are filling signature index **0**.
3. The transaction is a **v0 (versioned) transaction** (`0x80` version prefix) with an address lookup table, so use `VersionedTransaction`, not `Transaction`.
4. `outAmount` was byte-identical across all three configurations for this pair/size, so sponsorship did not degrade pricing here (not a guarantee in general — the docs note Token-2022 transfer fees can differ).

### 5.5 Constraint on who the fee payer may be

**The fee payer is the `sponsor` address you pass — full stop.** There is no separate `feePayer` parameter anywhere in the API. Documented constraints on the sponsor:

- Must be a valid base58 address, else `invalid_sponsor` *[openapi, OrderBadRequestCode]*.
- **Cannot be combined with `predictionMarketInitPayer`** → `both_sponsor_and_prediction_market_init_payer_specified`.
- `skipPumpfunCashbackClaim` cannot be used with sponsor-*executed* swaps → `skip_pumpfun_cashback_claim_with_sponsor_executor`.
- `allowBondingCurveUnderconsumption` cannot be used with sponsor-executed swaps → `allow_bonding_curve_underconsumption_with_sponsor_executor`.
- On `POST /swap`: `sponsored_swap_cannot_create_fee_account` — a sponsored swap **cannot** also create the platform fee account. If you take a platform fee on a sponsored swap, the `feeAccount` ATA must already exist.
- **DOCS DO NOT SAY** whether the sponsor must hold any minimum SOL balance, whether DFlow validates the sponsor is fundable at quote time, or whether there is any allowlist/registration for sponsor wallets. Empirically, an arbitrary address I supplied was accepted with no registration.

Both of the last two bullets bite specifically when combining sponsorship with platform fees — worth testing early.

### 5.6 Code

```ts
// GET /order — sponsored, user-executed
const params = new URLSearchParams({
  inputMint: "So11111111111111111111111111111111111111112",
  outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  amount: "1000000000",
  userPublicKey: userKeypair.publicKey.toBase58(),
  sponsor: SPONSOR_ADDRESS,
  sponsorExec: "false", // user executes; omit or "true" for sponsor execution
});

const orderResponse = await fetch(`${API_BASE_URL}/order?${params}`, { headers })
  .then((x) => x.json());

// Both user and sponsor must sign
const tx = VersionedTransaction.deserialize(
  Buffer.from(orderResponse.transaction, "base64")
);
tx.sign([userKeypair, sponsorKeypair]);

const signature = await connection.sendRawTransaction(tx.serialize());
await connection.confirmTransaction(signature, "confirmed");
```

`POST /swap` takes `sponsor` and `sponsorExec` as **body fields** and returns `swapTransaction` (not `transaction`) *[spot/trading/sponsored-swaps]*.

**The CLI does not support sponsorship** *[skill:dflow-spot-trading]*.

---

## 6. Market data, streams and WebSocket mechanics

### 6.1 Stream inventory

*[resources/trading-api/websockets/overview]*

| Stream | Path | Description | Gated? |
|---|---|---|---|
| Quote stream | `/quote-stream` | Top-of-book bid and ask for token pairs | **Yes** |
| Book stream | `/book-stream` | Ten levels of order book depth | **Yes** |
| Priority fees | `/priority-fees/stream` | Real-time priority fee estimates | **No** *[skill:dflow-market-data]* |

All three are paths on the Trade API WebSocket host. One connection multiplexes many pairs.

### 6.2 Priority fees stream

*[resources/trading-api/websockets/priority-fees-stream]*

**No subscribe message required.** Connect and read. Each message is the same shape as `GET /priority-fees`:

```json
{ "mediumMicroLamports": 100000, "highMicroLamports": 150000, "veryHighMicroLamports": 220000 }
```

**VERIFIED** live values on 2026-08-22: `{"mediumMicroLamports":119,"highMicroLamports":200000,"veryHighMicroLamports":3353657}` — note the enormous spread between levels; do not assume they are close together.

Units are **micro-lamports per compute unit** *[resources/trading-api/priority-fees/priority-fees]*.

### 6.3 Stream access is gated per API key

This is an easy-to-miss operational trap. *[resources/faqs]*:

> "**My API key works for /order but the stream rejects it. Why?** Access to the quote and book streams is granted **per API key**; it's a separate permission, not automatic with a valid or production key. A key that trades fine on `/order` can still be refused on the stream until the team enables stream access on that specific key… request stream access from the team."

The recipes repeat it: "Access to the quote stream in production is gated: request an API key with quote stream access, or have an existing key upgraded" *[spot/recipes/stream-quotes]*.

**On the dev endpoint the streams are open** (the recipes' own code samples use `wss://dev-quote-api.dflow.net/quote-stream` with no key).

### 6.4 You cannot connect to streams from the browser

*[resources/faqs]*:

> "**Can I connect to the market-data streams from the browser?** No. As a security best practice, your DFlow API key belongs on the backend… Stream through a backend proxy that holds the key, connects to DFlow, and relays messages to the browser."

This is reinforced by mechanics: auth is an `x-api-key` **header** on the upgrade request, and the browser `WebSocket` constructor cannot set headers. The Node `ws` library can:

```ts
const ws = new WebSocket(
  `${DFLOW_TRADE_API_WS_URL}/quote-stream`,
  DFLOW_API_KEY ? { headers: { "x-api-key": DFLOW_API_KEY } } : undefined
);
ws.on("open", () => {
  ws.send(JSON.stringify({ op: "subscribe", base_mint: SOL_MINT, quote_mint: USDC_MINT }));
});
```

`dflow-market-data` ships a complete backend relay implementation — reproduced here since it is directly usable:

```js
import { WebSocketServer, WebSocket } from "ws";
const wss = new WebSocketServer({ server });          // same origin as your app
wss.on("connection", (client) => {
  const up = new WebSocket(`${process.env.DFLOW_TRADE_API_WS_URL}/book-stream`,
    { headers: { "x-api-key": process.env.DFLOW_API_KEY } });
  const q = [];
  up.on("open", () => { q.forEach((m) => up.send(m)); q.length = 0; });
  up.on("message", (d) => client.readyState === 1 && client.send(d.toString()));
  client.on("message", (m) => up.readyState === 1 ? up.send(m.toString()) : q.push(m.toString()));
  client.on("close", () => up.close()); up.on("close", () => client.close());
});
```

Note the queue `q` — client subscriptions that arrive before the upstream socket opens must be buffered, not dropped.

### 6.5 Reconnect discipline

*[skill:dflow-market-data]*: "WebSockets drop; on reopen, resend every subscription with a backoff. Track the slot `u` (and `skipped`, which is 0 when the stream kept up) to detect gaps."

There is no server-side subscription persistence — a reconnect starts with zero subscriptions.

---

## 7. Token discovery — and its big caveat

### 7.1 `GET /tokens`

*[openapi]*: "Returns a list of supported token mints, specifically any mints that a pool for trading was available at least once in the lifetime of the server."

Response schema is `Vec` = `array<string>`. **Bare base58 mint strings.**

### 7.2 `GET /tokens-with-decimals`

*[openapi]*: same description plus decimals. Schema `TokensWithDecimalsDoc` = `array<array>`. Each entry is a 2-tuple `[mint, decimals]`.

**VERIFIED** sample: `["6s9VVDobQee2C1wbV8wnEVrUkmaoX7JdC4KjkCVcWray", 6]`

### 7.3 What you asked specifically: does it return symbol, name, decimals, mint, logo, liquidity?

**Only mint and decimals. Nothing else.**

| Field | Available? |
|---|---|
| mint | Yes |
| decimals | Yes (`/tokens-with-decimals` only) |
| symbol | **No** |
| name | **No** |
| logo | **No** |
| liquidity / volume | **No** |

There is **no token search endpoint and no token metadata endpoint** anywhere in the API. The FAQ is blunt about the consequence *[resources/faqs]*:

> "**Can I use token symbols like "USDC" with the API?** No. The Trading API accepts **base58 mint addresses only**; there's no symbol resolver. (The `dflow` CLI resolves a small set of common symbols, but the API does not.)"

### 7.4 Size warning — VERIFIED, and this matters

I called both endpoints. They are far larger than the docs suggest:

| Endpoint | Entries | Payload |
|---|---|---|
| `/tokens` | **4,590,857** | **215 MB** |
| `/tokens-with-decimals` | **4,590,619** | **234 MB** |

There is **no pagination, no filtering, no `?search=`, and no `?limit=` parameter** — the OpenAPI defines zero parameters on both endpoints. You get all 4.6 million mints or nothing.

**Practical implication for My Tab:** do not call these at request time, and never from a serverless function with a memory cap. These are "download once, process offline" endpoints. For a product token picker you need your own curated list, and you must source symbols, names and logos elsewhere (Jupiter's token list, Solana token registry, Helius/Birdeye metadata, or the Metaplex metadata account on-chain). Alternatively, hardcode the handful of mints My Tab settles in and validate against `/tokens-with-decimals` offline at build time.

Note also the two endpoints disagree by 238 entries — they are evidently generated separately, so don't assume set equality.

### 7.5 `GET /venues`

*[openapi]*: "Returns a list of venues supported for swapping." Schema `Vec` = `array<string>`. No parameters.

**VERIFIED** — 43 venues on 2026-08-22:

```
Whirlpools, Raydium AMM, Raydium CLMM, Raydium CP, Raydium Launchlab, AlphaQ, Byreal,
HumidiFi, Meteora, Meteora DAMM v2, FluxSwap, Dynamic Bonding Curve, Meteora DLMM,
PancakeSwap, Phoenix, Pump.fun, Gamma, Pump.fun AMM, SolFi, Stabble Stable Swap,
Stabble Weighted Swap, Tessera V, ZeroFi, Saros, SolFi V2, Obric V2, Aquifer, Manifest,
BisonFi, BisonFi Predictions, JanusFi, Sanctum Infinity, Zora, KDEX, Deriverse, MetaDAO,
Ghost, Doppler Launch, Doppler CPMM, Sanctum, Triangle, GatorSwap, JupLend AMM
```

These exact strings are what `dexes` / `excludeDexes` accept; a wrong string yields `invalid_dex`.

---

## 8. Fees

### 8.1 Platform fees (your revenue cut)

*[spot/trading/platform-fees]*, *[spot/recipes/platform-fees]*

**DFlow charges no protocol fee on spot trades.** The platform fee is entirely the builder's own.

**How specified — two parameters plus an account:**

| Param | Values | Notes |
|---|---|---|
| `platformFeeBps` | integer, basis points | 1 bps = 0.01%; `50` = 0.5%. |
| `platformFeeMode` | `outputMint` (default) \| `inputMint` | Which token the user pays the fee in. |
| `feeAccount` | base58 token account | **Required whenever the fee is nonzero.** |

**What are the limits?** **DOCS DO NOT SAY** — no maximum `platformFeeBps` is documented anywhere, and the OpenAPI declares no `maximum` on the field. There is an `invalid_platform_fee_bps` error code, so a cap exists server-side, but its value is unpublished. **Test empirically before relying on a high fee.** (The related `platformFeeScale`, for prediction markets only, *does* have a documented range: `>= 0 && < 1000`, 3 decimals.)

**What account receives them?** A **builder-controlled SPL token account**, passed as `feeAccount`. Requirements *[spot/trading/platform-fees]*:

- "Be a valid SPL token account for the token being collected."
- "**Already exist before the trade executes.**" DFlow will not create it.
- Mint must match the mode: input token account for `inputMint`, output token account for `outputMint`.
- "You need a separate token account (ATA) for each token you collect fees in." Collecting in both USDC and SOL means two ATAs.

**Intent flow restriction:** "For the intent flow (`/intent` + `/submit-intent`), fees can currently only be paid in the `outputMint`" *[spot/trading/platform-fees]*.

**The critical warning — repeated in three places, so heed it** *[spot/trading/platform-fees]*:

> "Only specify a nonzero platform fee if you will actually collect the fee at execution time. When the API receives a nonzero `platformFeeBps`, it **factors the fee into slippage tolerance calculations**. If the fee is declared in the request but not collected onchain, the slippage budget is effectively wasted on a fee that never gets taken, resulting in **suboptimal pricing for your users**."

And the FAQ: "**Should I set platformFeeBps if I'm not collecting a fee?** No."

**Response shape** — `PlatformFee` on `/order` and `/quote`:

```json
{ "amount": "...", "feeBps": 50, "mode": "outputMint" }
```

`amount` semantics differ by mode *[openapi]*: "For output mint fees, this is the **expected** amount… but the exact amount will vary depending on how much output the swap produces. For input mint fees, this is the **exact** amount that will be paid."

The intent flow uses a richer `IntentPlatformFee` with `feeAccount`, plus `segmenterFeeAmount` and `segmenterFeePct` — a "segmenter fee" concept that appears **nowhere in the prose docs**. **DOCS DO NOT SAY** what a segmenter fee is or who receives it.

**Behavioural guarantees:** "Users pay platform fees only when a trade completes successfully. Platform fees do not affect quoting, routing, slippage checks, or execution behavior." Routing, slippage enforcement and execution timing all stay the same. Failed trades charge nothing.

### 8.2 Positive slippage fees

An under-documented monetisation lever, present only in the OpenAPI. DFlow itself does **not** take positive slippage — the FAQ says "Does DFlow take positive slippage? **No**" *[resources/faqs]* — but it lets *you* capture it.

- `positiveSlippageFeeAccount` — "must be a token account for the **output mint, regardless of the platform fee mode**." If it can't receive at execution time, "the positive slippage fee transfer is **skipped**" (silently, not a failure).
- `positiveSlippageLimitPct` — the fee is "limited to the lesser of (1) the excess actual out amount above the quoted amount and (2) this percentage of the actual out amount after platform fee."
- Interaction rule: "If the platform fee mode is `outputMint` and the platform fee account is specified, then this must be unspecified (in which case the platform fee account will be used) or match the platform fee account. Otherwise, this must be specified."

### 8.3 Priority fees

*[spot/trading/priority-fees]*

> "Priority fees affect **when** a trade executes, not **how** it executes."

They "do **not**: change routing decisions, bypass slippage checks, alter trade execution logic, guarantee execution success."

**Two modes:**

**Max Priority Fee** (recommended default for user-facing flows) — server picks adaptively, capped:
- A priority level: `medium`, `high`, `veryHigh`.
- A cap: `maxLamports` / `prioritizationFeeMaxLamports`.
- "DFlow selects the lowest fee likely to achieve the requested priority, capped by your maximum."
- **"If no priority fee parameters are provided, DFlow defaults to automatic priority fees capped at 0.005 SOL."**

**Exact Priority Fee** — fixed lamports, applied regardless of conditions. "If the network requires higher fees than the amount specified, the trade may be delayed or fail." Best for "automation, testing, or environments with strict fee constraints."

**On `/order`**, `prioritizationFeeLamports` accepts: a u32 lamport value, or `auto` | `medium` | `high` | `veryHigh` | `disabled`.

**On `POST /swap`**, the same field is a richer object *[openapi, `PrioritizationFeeLamports`]*:
- `"auto"` — capped at 0.005 SOL
- `"disabled"`
- a u32 (fixed lamports)
- `{ "priorityLevelWithMaxLamports": { "priorityLevel": "medium"|"high"|"veryHigh", "maxLamports": <int> } }`
- `{ "autoMultiplier": <u32> }` — multiplies the auto fee; "The total prioritization fee will be capped at 0.005 SOL."

`prioritizationFeeLamports` and `computeUnitPriceMicroLamports` are **mutually exclusive** (`both_priority_fee_params_specified`).

**For the intent flow** priority fees work completely differently — via `feeBudget`, and *[spot/recipes/priority-fees]*:

> "set `feeBudget` on the `/intent` request to your desired priority fee **plus the 10,000 lamport base processing fee**."

```ts
const feeBudget = desiredPriorityFeeLamports + 10_000;
```

`maxAutoFeeBudget` caps the auto-determined budget; "If unspecified, the limit defaults to **0.002 SOL**."

### 8.4 What fees apply overall

*[resources/faqs]*: "Network fees, optional priority fees, optional platform fees if you set them, and any DEX fees baked into the route. Slippage depends on market liquidity and trade size."

---

## 9. Which Solana clusters are supported — the devnet question

### 9.1 What the docs say

**DOCS DO NOT SAY.** This is a genuine gap. The word "devnet" does not appear anywhere in `llms-full.txt` or `openapi.json`. The Endpoints page describes `dev-quote-api` purely in terms of rate limiting and testing suitability — never in terms of a cluster *[get-started/endpoints]*.

Two supporting hints that it is mainnet:
- The quickstart defaults `SOLANA_RPC_URL` to `https://api.mainnet-beta.solana.com` *[spot/recipes/quickstart]* while defaulting the Trade API to the **dev** host — i.e. the docs pair the dev API with a **mainnet** RPC.
- The CLI's default RPC is also `https://api.mainnet-beta.solana.com` *[ai/agent-cli]*.
- The skill states dev is "same features, rate-limited, for testing only" — a quota distinction, not a network one *[skill:dflow-spot-trading]*.

### 9.2 Definitive empirical answer — VERIFIED

I resolved this by decoding a transaction the **dev** endpoint produced and testing its recent blockhash against both clusters.

Transaction from `https://dev-quote-api.dflow.net/order?...&userPublicKey=...`:
- blockhash `2bWXuW9Le25r7NPBqZxFrusVm3GcKtLwxj7i2LjppjEr`
- response `contextSlot`: `440907166`

`isBlockhashValid` results:

| Cluster | Result | Cluster slot at time of test |
|---|---|---|
| `api.mainnet-beta.solana.com` | **`true`** | 440,907,211 |
| `api.devnet.solana.com` | **`false`** | 486,563,792 |

The mainnet slot (440,907,211) matches the response `contextSlot` (440,907,166) to within ~45 slots. The devnet slot is ~45 million slots away.

The decoded transaction also invokes program `DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH` — the aggregator program you identified.

**Conclusion, stated plainly:**

> **`dev-quote-api.dflow.net` is a rate-limit tier, NOT a cluster. It serves mainnet-beta.** DFlow's Trading API supports **mainnet-beta only**. There is no devnet Trading API endpoint, documented or otherwise.

Your RPC observation that the aggregator program is *deployed* on devnet is correct but does not help: the program being on devnet does not mean DFlow's off-chain routing/quoting service indexes devnet liquidity. It does not — there are no devnet pools in its AMM map, so it could not quote there even if an endpoint existed.

### 9.3 What this means for a devnet demo

**A devnet demo of DFlow trading is not possible through the Trading API.** Options:

1. **Demo on mainnet with tiny amounts.** The dev endpoint needs no API key, and 0.001-0.01 SOL trades cost cents. This is the realistic path and is what every DFlow doc example does.
2. **Quote-only on mainnet, execute nowhere.** `/order` without `userPublicKey` gives real mainnet prices with zero funds and zero risk — good for a UI demo.
3. **Fixture/replay mode for devnet.** Capture real mainnet `/order` responses and replay them against a devnet-signed flow. This matches the fixture-mode approach already in this repo, but the transaction DFlow returns will not execute on devnet.
4. **Hybrid:** mainnet for DFlow quoting/pricing, devnet for your own settlement program. Viable only if the two are decoupled in your architecture.

Note also that **Proof is enforced on both dev and prod** *[skill:dflow-proof-kyc]*: "Many agents assume dev is unprotected; it isn't."

---

## 10. Slippage and price protection

*[spot/trading/slippage-tolerance]*

**Definition:** "Slippage is the difference between the quoted price and the final execution price." Distinguished from price impact *[resources/faqs]*: "Slippage is the price drift between quote and execution. Price impact is the gap between market price and your effective fill, caused by your trade's size relative to available liquidity."

### 10.1 Parameters and defaults

| Param | Type | Default | Applies to |
|---|---|---|---|
| `slippageBps` | u16 \| `"auto"` | **`"auto"`** on `/order` | `/order`, `/quote`, `/intent` |
| `perLegSlippage` | boolean | **true** ("if true or unspecified") | `/order`, `POST /swap` |
| `priceImpactTolerancePct` | integer | server-determined | `/order`, `/quote`, `/intent` |
| `predictionMarketSlippageBps` | u16 \| `"auto"` | `"auto"` | `/order` |

**Auto slippage:** "DFlow determines the optimal slippage based on market conditions so trades have a high probability of success while maintaining price protection… calculated server-side by the DFlow Aggregator and **updates continuously** based on current onchain conditions."

**VERIFIED:** `auto` resolved to `slippageBps: 20` (0.20%) for SOL→USDC at 0.01 SOL. The resolved value is always echoed in the response, so you can display it.

**Custom slippage:** a non-negative u16 in basis points. Warning: "Setting slippage too low can cause trades to fail during high volatility or when liquidity is thin."

### 10.2 What DFlow guarantees vs estimates

This distinction is the one that matters for a deny-by-default validation gate.

**Guaranteed (enforced onchain — the transaction fails if violated):**

- `otherAmountThreshold` / `minOutAmount` — *[openapi]*: "Minimum output amount after all fees as a scaled integer. **If the swap transaction doesn't produce at least this amount of the output token, the transaction will fail.**" This is a hard onchain floor, not a promise.
- Per-leg slippage checks, when `perLegSlippage` is enabled (default).
- The sequence *[spot/trading/slippage-tolerance]*: "DFlow validates the execution price against your tolerance. If the tolerance is met, the trade executes; **otherwise it fails safely**."

**Estimated (no guarantee):**

- `outAmount` — "**Expected** output amount after all fees."
- `inAmount` — "**Maximum** input amount" (note: maximum, not exact).
- `priceImpactPct` — "This is an **estimate** of the percentage difference between the expected price for the swap and the price for the same swap with the smallest input amount possible."
- All quote-stream and book-stream values — explicitly "approximations".

**For your validation gate: `otherAmountThreshold` is the field to assert on.** It is the only number DFlow will let the chain enforce. Validate that the transaction DFlow returned encodes a threshold consistent with the quote you showed the user before the sponsor co-signs.

**Price impact rejection:** `price_impact_too_high` fires when "the effective price during routing is worse than the allowed threshold. If unspecified, the server determines the default" *[resources/error-codes]*. The default threshold value is **DOCS DO NOT SAY**.

---

## 11. JIT routing

*[spot/jit-routing]*

**What it is:** "JIT Routing (Just-in-Time Routing) re-optimizes a trade's route at execution time, so the fill reflects current onchain prices instead of a stale quote."

The problem it solves: "Some onchain venues, especially **prop AMMs** (proprietary automated market makers), update their prices fast enough that the route DFlow picks at quote time can be outdated by the time the transaction lands. JIT routing closes that gap by **moving the routing decision onchain**."

**How it works:**
1. "**Quote time.** DFlow computes an initial route from current market data and embeds it in a transaction built so the route can be updated onchain."
2. "**Execution time.** JIT routing re-checks prop AMM prices just before executing each leg onchain. If a better path exists, it reroutes inside the same transaction."

### 11.1 Does it change what a client must do?

**No.** Verbatim: "**No builder configuration or extra parameters required.**"

It engages automatically when both are true:
- "The trade goes through the Trading API (`/order` or `/quote`)."
- "The route includes a prop AMM leg. Routes without one execute as static paths."

Optional opt-in override: `onlyJitRoutes=true` forces every leg to use the JIT router (error `cannot_exclude_jit_router_for_jit_route` if you also exclude it via `excludeDexes`, and `invalid_max_route_length_for_jit_route` if `maxRouteLength` conflicts).

**One consequence that does affect clients:** with JIT routing, `routePlan` is a *prediction*, not a commitment. The response schema hedges accordingly — `routePlan` is "Specified if and only if the route plan is known at order opening time" — and legs may be `DynamicRoutePlanLeg` (carrying an opaque `data` field) rather than `SingleMarketRoutePlanLeg`. **If your UI displays a route, label it as expected, not final.**

**Benefits claimed:** lower realized slippage, higher success rates, and "tighter slippage limits — less need for wide buffers to absorb pre-execution drift."

---

## 12. Request signing — verify responses came from DFlow

*[resources/request-signing]* — **high priority for My Tab's deny-by-default sponsor co-signing gate.**

### 12.1 What it is and whether it's required

**Opt-in, off by default.** Not required. You enable it per-request.

> "Ask DFlow to cryptographically sign its API responses so you can confirm a response came from DFlow and was not altered in transit. Signatures follow **RFC 9421 (HTTP Message Signatures)** and use **ed25519**."

**Scope limit:** "Signing applies only to **REST** requests, **not WebSocket** connections."

### 12.2 How to request a signature

Two request headers:

```
x-sign-request: true
x-request-id: 0f8c2b1a-...    # optional
```

On `x-request-id`: "It is **included in the signed content** and echoed back in the response, so you can tie a response to your request and **guard against replay**. If you omit it, DFlow generates one."

**Always send your own `x-request-id`.** A DFlow-generated one gives you no replay protection, because you'd have nothing to compare it against.

### 12.3 Response headers

| Header | Description |
|---|---|
| `signature-input` | "The signed components and metadata: `keyid`, algorithm, and `created` timestamp" |
| `signature` | "The signature, base64-encoded" |
| `content-digest` | "SHA-256 digest of the response body" |
| `x-request-id` | "Your `x-request-id`, or one DFlow generated" |

"These headers are exposed via CORS (`access-control-expose-headers`), so they are readable from the browser."

### 12.4 What exactly is signed

> "The signature covers the response `@status`, `content-type`, `content-digest`, and your `x-request-id`."

**VERIFIED live** on 2026-08-22 against the dev endpoint with `x-request-id: mytab-test-123`:

```
content-digest: sha-256=:8KUGovC8/zSC1ALSws7Q+lvEq/e4XRne+uKDXlAxZ5Q=:
signature-input: sig1=("@status" "content-type" "content-digest" "x-request-id";req);created=1787396355;keyid="EZKxYr7bbXHaKAGw2MEpVUU9He3hwXGejSpCsdsZCmiF";alg="ed25519"
signature: sig1=:sjvPF0b42Ztk3stn0qX6h0P8i/2n7qMNezobzrya9bglDUR64JMtub8wWJI8UjZoQR2VAMw8O3PQMm1pYaxlAg==:
access-control-expose-headers: signature,signature-input,content-digest
x-request-id: mytab-test-123
```

Confirmed: signing works on the **dev endpoint with no API key**, the component set is exactly as documented, and the `;req` marker on `x-request-id` means the value is taken from the **request**, not the response.

### 12.5 DFlow's public key

Base58, carried as `keyid`:

```
EZKxYr7bbXHaKAGw2MEpVUU9He3hwXGejSpCsdsZCmiF
```

**VERIFIED** — the live `keyid` matches the documented key exactly.

### 12.6 How to verify

> "Verify the `signature` against the public key above using an RFC 9421 library, which handles rebuilding the signature base from the signed components and checking the `content-digest`."

The CLI implements exactly this and its checklist is the best available spec for a correct verifier *[ai/agent-cli]*. It checks, **before using the response**:

- "the ed25519 `signature` validates against DFlow's **pinned** public key (baked into the binary, so a swapped key can't be substituted)";
- "the `content-digest` matches the response body (**integrity**)";
- "the echoed `x-request-id` matches the per-request id the CLI sent (**anti-replay**)";
- "the signed component set **actually covers** `content-digest` and `x-request-id` (**no downgrade**)".

"If any check fails, the CLI returns a `RESPONSE_SIGNATURE_INVALID` error and **discards the response without acting on it**."

The CLI enables this via `DFLOW_VERIFY_SIGNATURES=1` (truthy: `1`, `true`, `yes`).

### 12.7 Threat model — read this before relying on it

*[ai/agent-cli]*, verbatim:

> "This defends against a tampered network path (TLS MitM with a mis-issued certificate, BGP hijack, or a compromised intermediary between you and DFlow's edge). **It does not attempt to defend against DFlow's own backend, which is the entity producing the signature.**"

### 12.8 Recommendation for My Tab

This maps well onto your gate, with one important limit.

**Do:** set `x-sign-request: true` and a fresh unique `x-request-id` on every `/order` call; verify all four properties above server-side; pin `EZKxYr7bbXHaKAGw2MEpVUU9He3hwXGejSpCsdsZCmiF` in config, not fetched at runtime; refuse to co-sign if verification fails.

**But understand what it does and does not prove.** It proves *"this JSON is byte-for-byte what DFlow's edge sent in reply to my request id."* It does **not** prove the embedded transaction is safe or economically sound — DFlow's backend is trusted to produce the signature, so a signature cannot attest to anything about DFlow's own correctness.

**So keep your independent transaction checks.** Signature verification is a strong *authenticity* layer that removes the network as an attack surface; it is not a substitute for decoding the transaction and asserting on it before the sponsor key touches it. Concretely, still verify: the fee payer is your sponsor wallet and nothing else; `numRequiredSignatures == 2`; the program invoked is `DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH`; the destination account is the user's; `otherAmountThreshold` matches the quote you displayed; and no unexpected instruction (notably no SystemProgram transfer draining the sponsor). Because the sponsor is account[0], a malicious or buggy transaction spends *your* SOL — which is exactly the risk the gate exists to stop.

---

## 13. Error codes — the complete list

The docs page *[resources/error-codes]* is thin: one HTTP row and two trading errors. The **OpenAPI carries the full enumerations**, reproduced below. All error responses share the shape `{ "code": <string>, "msg": <string> }` (both required); `QuoteBadRequestResponse` and `QuoteInternalServerErrorResponse` additionally carry `contextSlot` and `routingSlot`.

### 13.1 General HTTP

| Code | Title | When | Fix |
|---|---|---|---|
| 429 | Rate limit exceeded | Too many requests in a short window | "Retry with backoff, reduce request rate, or use an API key" |

### 13.2 The two documented in prose

**`route_not_found`** — "most common in two situations":
1. "**Incorrect `amount` units.** The `amount` parameter is the `inputMint` amount in atomic units (scaled by decimals). If you pass standard (human-readable) units (for example `8` instead of `8_000_000`), the router will not find a viable route."
2. "**No available route.** The router found no viable route… This can happen for illiquid pairs or when the trade size exceeds available liquidity. Try a smaller amount or a different pair."

**`price_impact_too_high`** — "The effective price during routing is worse than the allowed threshold. If unspecified, the server determines the default. To set your own threshold, pass `priceImpactTolerancePct`."

### 13.3 `GET /order` — `OrderBadRequestCode` (400), 53 codes

```
invalid_user_public_key, invalid_sponsor, invalid_revert_wallet,
invalid_prediction_market_init_payer, requested_input_amount_is_zero,
invalid_input_mint, invalid_output_mint, same_input_and_output_mint,
invalid_slippage_bps, prediction_slippage_bps_above_max,
prediction_slippage_bps_below_routing_slippage, invalid_platform_fee_bps,
invalid_platform_fee_scale, invalid_fee_account, platform_fee_account_not_specified,
platform_fee_account_not_specified_for_platform_fee_scale,
invalid_positive_slippage_fee_account, cannot_disable_sync_and_async_execution,
invalid_dex, invalid_max_route_length_for_jit_route,
cannot_exclude_jit_router_for_jit_route, route_not_found, zero_out_amount,
price_impact_too_high, invalid_max_outcome_absolute_price_impact,
both_priority_fee_params_specified, both_destination_params_specified,
both_sponsor_and_prediction_market_init_payer_specified,
invalid_destination_token_account, invalid_destination_wallet,
destination_token_account_not_supported, invalid_output_close_authority,
output_close_authority_with_native_sol_output,
output_close_authority_with_destination_token_account,
init_settlement_ata_with_destination_token_account, invalid_payout_receiver,
payout_receiver_with_destination_token_account,
invalid_input_mint_for_restrict_revert_mint,
invalid_jito_sandwich_mitigation_account, invalid_outcome_account_rent_recipient,
unverified_wallet_not_allowed, wallet_restricted,
unsupported_prediction_market_sponsor_mode, invalid_price_impact_tolerance_pct,
skip_pumpfun_cashback_claim_with_sponsor_executor,
allow_bonding_curve_underconsumption_with_sponsor_executor,
both_max_accounts_and_reserve_accounts_specified,
both_max_transaction_size_and_reserve_transaction_size_specified,
max_accounts_too_small, max_transaction_size_too_small,
reserve_accounts_too_large, reserve_transaction_size_too_large
```

> ⚠️ **`unverified_wallet_not_allowed` and `wallet_restricted` are notable.** These are the only hooks that connect **Proof/KYC and compliance screening to the trading path**. They appear nowhere in the prose docs. Their existence means DFlow *can* refuse an order for a wallet that is unverified or restricted — presumably per-API-key policy or sanctions screening. **DOCS DO NOT SAY** when either fires or whether it can affect a default key. Handle both explicitly rather than letting them fall into a generic error branch. See §14.5.

- `OrderInternalServerErrorCode` (500): `failed_to_compute_route`, `failed_to_construct_order`
- `OrderServiceUnavailableCode` (503): `amm_map_not_initialized`, `amm_map_lagging`

### 13.4 `GET /quote` — `QuoteBadRequestCode` (400)

```
requested_input_amount_is_zero, invalid_input_mint, invalid_output_mint,
same_input_and_output_mint, invalid_slippage_bps, invalid_platform_fee_bps,
invalid_dex, invalid_max_route_length_for_jit_route,
cannot_exclude_jit_router_for_jit_route, route_not_found,
use_order_endpoint_for_prediction_markets, price_impact_too_high,
invalid_price_impact_tolerance_pct
```

- 500: `failed_to_compute_route` · 503: `amm_map_not_initialized`, `amm_map_lagging`

### 13.5 `POST /swap` — `SwapBadRequestCode` (400)

```
invalid_out_amount, invalid_user_public_key, invalid_sponsor,
sponsored_swap_cannot_create_fee_account, invalid_platform_fee_amount,
invalid_fee_account, invalid_positive_slippage_fee_account,
invalid_referral_account, invalid_destination_token_account,
invalid_destination_token_account_for_native_sol, invalid_output_close_authority,
output_close_authority_with_native_sol_output,
output_close_authority_with_destination_token_account,
both_priority_fee_params_specified, route_is_empty, route_too_long,
invalid_route_plan_leg, invalid_jito_sandwich_mitigation_account,
skip_pumpfun_cashback_claim_with_sponsor_executor
```

- 500: `failed_to_compute_swap`

### 13.6 `GET /intent` — `IntentBadRequestCode` (400)

```
requested_input_amount_is_zero, invalid_input_mint, invalid_output_mint,
invalid_slippage_bps, invalid_platform_fee_bps, invalid_user_public_key,
same_input_and_output_mint, invalid_fee_account, invalid_referral_account,
requested_fee_budget_too_low, invalid_max_auto_fee_budget, route_not_found,
price_impact_too_high, invalid_price_impact_tolerance_pct
```

- 500: `failed_to_compute_route`, `failed_to_construct_intent`
- 503: `amm_map_not_initialized`, `amm_map_lagging`
- 504: `request_timed_out` (`TimeoutCode`)

### 13.7 `POST /submit-intent` — `SubmitIntentBadRequestCode` (400)

```
invalid_input_mint, invalid_output_mint, same_input_and_output_mint,
invalid_in_amount, invalid_out_amount, invalid_fee_account,
invalid_open_instruction_fee_budget_too_low, invalid_open_transaction,
invalid_open_instruction_data, failed_to_simulate_open_transaction,
open_transaction_simulation_failed
```

### 13.8 `GET /order-status`

- 400 `invalid_signature` · 404 `not_found` · 500 `internal_server_error`

### 13.9 `GET /tokens`, `/tokens-with-decimals`

- 503 `mint_info_not_initialized`

### 13.10 Health

`HealthCheckServiceUnavailableCode` (503): `amm_map_not_initialized`, `amm_map_lagging`, `mint_info_not_initialized`, `reference_price_map_not_initialized`, `blockhash_unavailable`, `internal`

### 13.11 Per-pair stream error codes

Delivered inline as `e` on a per-pair update, **not** as a connection error: `no_route` (quote stream), `no_market` (book stream). Handle these without tearing down the socket. Protocol-level errors arrive as an untagged frame: `{ "type": "bad_request", "message": "..." }` *[openapi]*.

### 13.12 Operational note on 503s

`amm_map_lagging` and `amm_map_not_initialized` recur across nearly every endpoint. They mean DFlow's internal market-state map is cold or behind — a **transient, retryable, DFlow-side** condition, not a client bug. Retry with backoff; do not surface as a user error.

---

## 14. DFlow Proof (identity / KYC)

### 14.1 What it is

*[proof/introduction]*

> "Proof is an identity verification service on Solana. It enables partner applications to verify that a wallet belongs to a KYC'd individual without handling identity verification themselves."

**Who provides the KYC:** **Stripe Identity** *[resources/faqs]*, confirmed by *[skill:dflow-proof-kyc]*.

**Model:** users authenticate once, verify once, then link **multiple wallets** to that one identity. Partners query the resulting identity graph. "One verified identity → unlimited wallets. **No cap.**" *[skill:dflow-proof-kyc]*

### 14.2 What it proves — and what it does not

**Verified information** *[proof/introduction]*:

| Verified Information | Description |
|---|---|
| Name | Full legal name from government ID |
| Address | Residential address |
| Contact Information | Email address (used for authentication) |
| Government Identification | Government-issued ID document |

Mechanisms: email OTP auth; document verification; **biometric liveness / selfie matching**; cryptographic signature proof of wallet ownership.

**What it does NOT do** *[skill:dflow-proof-kyc]* — all three of your coordinator's points confirmed:

- ❌ **Does not verify age.** "Stripe Identity captures name, address, email, and government-issued ID, but Proof does **not** currently check or expose date-of-birth. Don't use Proof for age gating."
- ❌ **Is not geoblocking.** "KYC ≠ jurisdictional restriction; they are separate concerns."
- ❌ **Is not required for spot swaps.** ✅ **CONFIRMED** — three independent sources:
  - *[proof/introduction]*: "**Spot trading on DFlow does not require Proof.**"
  - *[resources/faqs]*: "**Do users need to KYC to trade?** Spot trades are non-custodial and don't require KYC."
  - *[skill:dflow-proof-kyc]*: "Proof is not required for DFlow spot swaps. Don't state 'all DFlow trades need KYC' — they don't."

**Verdict for My Tab: Proof is optional garnish, not a dependency.** You can integrate it as a differentiator (it is free and genuinely easy — one public GET plus a redirect), but nothing in the trading path requires it. Caveat: see §14.5 on `unverified_wallet_not_allowed`.

### 14.3 What it costs

**Free.** *[resources/faqs]*: "**Is there a fee to use Proof?** No." The skill confirms: "No fee to builders or users."

### 14.4 How a partner integrates it

**Step 1 — check status.** Public, no auth, no API key:

```
GET https://proof.dflow.net/verify/{address}
→ { "verified": true }
```

`address` is a path param, "Solana wallet address (32-44 characters)". Single boolean field `verified`.

**Step 2 — if unverified, deep link to the hosted flow.**

```
https://dflow.net/proof?wallet={address}&signature={signature}&timestamp={timestamp}&redirect_uri={encodedRedirectUri}&email={encodedEmail}
```

| Parameter | Required | Description |
|---|---|---|
| `wallet` | **Yes** | The Solana wallet address to link |
| `signature` | **Yes** | Pre-signed ownership proof (base58 encoded) |
| `timestamp` | **Yes** | Unix timestamp in **milliseconds** when signature was created |
| `redirect_uri` | **Yes** | URL to redirect the user after verification |
| `email` | No | Email address to prefill in the authentication step |
| `projectId` | No | Your project identifier for tracking |

**Step 3 — the signature.** Message format, exactly:

```
Proof KYC verification: {timestamp}
```

"Where `{timestamp}` is the Unix timestamp in **milliseconds** (13 digits)."

```ts
import bs58 from "bs58";
const timestamp = Date.now();                                   // Unix ms, 13 digits
const messageBytes = new TextEncoder().encode(`Proof KYC verification: ${timestamp}`);
const signatureBytes = await wallet.signMessage(messageBytes);
const signature = bs58.encode(signatureBytes);                  // base58 — NOT hex, NOT JSON.stringify
```

**Step 4 — handle the return.** Re-query `/verify/{address}`. "When verification succeeds, Proof also sends an 'Identity Verification Complete' email to the user."

### 14.5 The compliance hook you should know about

Although Proof is not required to trade, the `/order` endpoint has two error codes — **`unverified_wallet_not_allowed`** and **`wallet_restricted`** *[openapi]* — that can refuse an order based on wallet identity or restriction status. These are undocumented in prose. It is plausible they apply only to specific API keys or jurisdictions/sanctions screening, but **DOCS DO NOT SAY**. If either ever fires in production it would be the one way Proof becomes load-bearing, so handle them as distinct, user-surfaceable states rather than generic failures.

### 14.6 Is there a sandbox?

**DOCS DO NOT SAY** — no Proof sandbox, test mode, or mock verification endpoint is documented anywhere. There is a single production host, `proof.dflow.net`, and a single hosted flow at `dflow.net/proof`.

Worse for testing, *[skill:dflow-proof-kyc]*: "**Enforced on both dev and prod.** Many agents assume dev is unprotected; it isn't."

**Practical consequence:** testing a Proof integration end-to-end means a real person completing a real Stripe Identity flow with a real government ID. There is no way to fake a verified wallet. For a hackathon demo, verify one wallet for real ahead of time and demo with it; and build your gate so `verified: false` is the graceful path, since that is what every other wallet will return.

### 14.7 Proof gotchas worth carrying into code

*[skill:dflow-proof-kyc]*

- **Redirect scheme restriction.** Only `https:`, `chrome-extension:` and `moz-extension:` work. "Custom schemes (`myapp://callback`) **fail silently** — no redirect, no error." Native mobile must use universal links (iOS) / app links (Android). *(Note: the prose page lists `https:` and `chrome-extension:`; the FAQ and skill add `moz-extension:`.)*
- **The public endpoint is booleanized.** "`/verify/{address}` returns `{ verified: true | false }`. There's no `pending` / `failed` / `unverified` distinction — everything non-verified collapses to `false`." The four states in *[proof/user-journeys]* (`unverified`, `pending`, `verified`, `failed`) are **internal to Proof's own UI** and are **not exposed** by the API. Infer them from your own session state.
- **Cache `true`, never cache `false`.** "Once verified, a wallet stays verified… But unverified is volatile — it flips the moment the user completes the flow."
- **Verify server-side.** "If your backend is the thing enforcing a KYC-gated feature, don't trust a client's cached status."
- **Embedded wallets work fine.** Privy/Turnkey need only raw `signMessage` over bytes: `signMessage: (message: Uint8Array) => Promise<Uint8Array>`. "There's **no separate Proof path for embedded wallets**." The one prerequisite: "the provider must expose **raw message signing** over bytes. If the SDK only signs transactions (no `signMessage`), it can't produce the ownership proof."
- **Signature expiration:** "Generate fresh signatures close to redirect time" *[proof/partner-integration]*. The validity window is **DOCS DO NOT SAY**.

---

## 15. The intent / declarative flow (sandwich resistance)

An opt-in alternative to `/order`. *[resources/faqs]*:

> "Most builders use `/order` (imperative): the app signs a fully constructed transaction and submits through its own RPC. The intent flow (`GET /intent` + `POST /submit-intent`) gives **stronger sandwich resistance** on standard SPL pairs: the user signs an **open order without a fixed route**, and DFlow submits the open order and fill **atomically as a Jito bundle**."

### 15.1 The hard limitation

**"Token-2022 mints aren't supported on `/intent`."** Stated in four separate places. Use `/order` for those.

### 15.2 `GET /intent` parameters

Required: `inputMint`, `outputMint`, `amount`. Optional: `userPublicKey`, `slippageBps`, `priceImpactTolerancePct`, `platformFeeBps`, `feeAccount`, `referralAccount`, `wrapAndUnwrapSol`, `feeBudget`, `maxAutoFeeBudget`.

Notable differences from `/order`:

- **No `sponsor` parameter.** Sponsorship is **not available on the intent flow.** For My Tab, this alone rules `/intent` out if gasless is a requirement.
- **No routing controls** (`dexes`, `onlyDirectRoutes`, etc.) — the whole point is that the route is not fixed at quote time.
- `feeBudget` replaces `prioritizationFeeLamports`: "Maximum amount that the user is willing to pay to have the intent processed in lamports. This includes all transaction fees and tips for the open transaction and all transaction fees and tips for the fill and close transactions."
- `maxAutoFeeBudget`: "If unspecified, the limit defaults to **0.002 SOL**. The final fee budget used is `min(max_auto_fee_budget, auto_fee_budget_determined_by_server)`."
- `referralAccount`: ties to the Referral program `REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3`, with fee account PDA seeds `["referral_ata", referral_account, mint]`. "If specified, the intent opening transaction will create the `fee_account` if it doesn't already exist. **The user pays for the creation of the fee account.**" — this is the one way to get a fee account auto-created.

### 15.3 `IntentQuoteResponse`

Same price fields as `/order` (`inAmount`, `outAmount`, `otherAmountThreshold`, `minOutAmount`, `priceImpactPct`, `slippageBps`) plus:

| Field | Notes |
|---|---|
| `feeBudget`* | Resolved lamport budget. |
| `openTransaction` | Base64 open transaction. Only if `userPublicKey` supplied. |
| `expiry` | "After expiry, the intent cannot be filled and can only be closed." Expressed in **slots since the open transaction was processed**. |
| `lastValidBlockHeight` | For the open transaction. |
| `platformFee` | `IntentPlatformFee` (includes `feeAccount`, `segmenterFeeAmount`, `segmenterFeePct`). |

### 15.4 `POST /submit-intent`

Body (`IntentSwapRequest`), both required:

```json
{
  "quoteResponse": { /* the full IntentQuoteResponse */ },
  "signedOpenTransaction": "<base64, signed by the user>"
}
```

Response (`IntentSwapResponse`), all required: `openTransactionSignature`, `orderAddress`, `programId`.

Note DFlow submits it — **you do not send this through your own RPC**, unlike `/order`.

---

## 16. Data model and other endpoints

### 16.1 `POST /swap` and `POST /swap-instructions`

Both take `SwapRequest`; both are legacy relative to `/order`.

`SwapRequest` required: `quoteResponse` (a full `QuoteResponse` from `/quote`), `userPublicKey`.

Optional: `computeUnitPriceMicroLamports`, `createFeeAccount` (`{ referralAccount }`), `destinationTokenAccount`, `dynamicComputeUnitLimit`, `feeAccount`, `includeJitoSandwichMitigationAccount`, `outputCloseAuthority`, `perLegSlippage`, `positiveSlippage` (`{ feeAccount, limitPct }`), `prioritizationFeeLamports` (rich object form), `sponsor`, `sponsorExec`, `wrapAndUnwrapSol`.

`destinationTokenAccount` here is polymorphic *[openapi]*: either a base58 string, **or** `{ "associatedTokenAccount": { "owner": "<base58>" } }` — the object form makes DFlow create the ATA if missing. FAQ gotcha: "In `POST /swap`, what should `destinationTokenAccount.address` be for native SOL output? Use the **destination wallet address**, not the wallet's WSOL associated token account address."

`SwapResponse`: `swapTransaction` (base64), `computeUnitLimit`, `lastValidBlockHeight`, `prioritizationFeeLamports`, `prioritizationType`.

`SwapInstructionsResponse` returns unassembled pieces — useful if you must compose with your own instructions and cannot use `reserveAccounts`/`reserveTransactionSize` on `/order`:

`swapInstruction`, `setupInstructions[]`, `cleanupInstructions[]`, `computeBudgetInstructions[]`, `otherInstructions[]`, `addressLookupTableAddresses[]`, `blockhashWithMetadata` (`{ blockhash, lastValidBlockHeight }`), `computeUnitLimit`, `prioritizationFeeLamports`, `prioritizationType`.

Each `InstructionResponse` = `{ programId, accounts: [{ pubkey, isSigner, isWritable }], data }`.

### 16.2 `GET /order-status`

**Prediction market orders only** — stated in the summary and repeated on the `signature` parameter. Not usable for tracking normal spot swaps; use your own RPC `confirmTransaction` for those.

| Param | Required | Notes |
|---|---|---|
| `signature` | Yes | Base58 tx signature from `/order`. "Only prediction market order signatures are supported." |
| `lastValidBlockHeight` | No | int64 or null. |

`OrderStatusResponse`: `status` (`pending` \| `expired` \| `failed` \| `open` \| `pendingClose` \| `closed`), `inAmount`, `outAmount`, `fills[]` (`{ signature, inputMint, outputMint, inAmount, outAmount }`), `reverts[]` (`{ signature, mint, amount }`).

### 16.3 Route plan legs

`RoutePlanLeg` = `DynamicRoutePlanLeg` | `SingleMarketRoutePlanLeg`. Shared fields: `venue`, `marketKey`, `inputMint`, `outputMint`, `inAmount`, `outAmount`, `inputMintDecimals`, `outputMintDecimals`. `DynamicRoutePlanLeg` adds `data` (opaque string) — "Present only on dynamic legs" *[spot/trading/trade-api-data-model]*, i.e. JIT-routed legs.

### 16.4 Sync vs async execution

`executionMode` is `sync` or `async`. Async orders can **revert**, returning a `revertMint` to `revertWallet`. `restrictRevertMint` forces the input mint to be the revert mint. Both modes are allowed by default (`allowSyncExec` / `allowAsyncExec` default true); `cannot_disable_sync_and_async_execution` if you disable both.

**DOCS DO NOT SAY** when the server chooses async for a normal SPL swap. In practice async appears tied to prediction markets — my live SOL→USDC order returned `"executionMode": "sync"`. If you want to be certain of sync behaviour, pass `allowAsyncExec=false`.

---

## 17. AI tooling: MCP server and Claude Code skills

### 17.1 MCP server

*[ai/mcp]* — hosted at:

```
https://pond.dflow.net/mcp
```

**Install command for Claude Code (exact):**

```bash
claude mcp add --transport http DFlow https://pond.dflow.net/mcp
```

Or `.mcp.json` in the project root:

```json
{
  "mcpServers": {
    "DFlow": {
      "type": "http",
      "url": "https://pond.dflow.net/mcp"
    }
  }
}
```

Verify with `claude mcp list`. Configs for Cursor, VS Code, Windsurf and claude.ai Connectors are also given on the page.

**What it provides:** searchable access to Trading API endpoints with parameters and examples; code recipes; concept docs (routing, slippage, priority fees, platform fees); and — the genuinely valuable part — "a large FAQ library that is continuously updated based on real integration questions from builders, so your AI tool can troubleshoot issues using the same answers our team gives in support channels."

Tool names referenced by the skills: `search_d_flow` and `query_docs_filesystem_d_flow` (the latter cats/heads `.mdx` files directly).

"The MCP server is automatically generated from this documentation and stays in sync as pages are updated."

**Status in this repo (VERIFIED):** there is **no `.mcp.json`** at `/Users/dre/Desktop/MYTAB/.mcp.json`, and no DFlow MCP tools were resolvable in my tool registry during this research. **The MCP server is not currently connected to this project.** Running the `claude mcp add` command above would connect it.

**Should you install it? Yes, cheaply.** It is a hosted, keyless, docs-only server — no credentials, no write access, no supply-chain surface beyond an HTTP endpoint. Its practical edge over this document is the live FAQ corpus, which is the one part that changes and is not in `llms-full.txt`. Caveat: it is a *documentation* server. It cannot quote, trade, or reach the Trading API, so it helps you write the integration but is not part of it.

### 17.2 Claude Code skills

*[ai/agent-skills]* — **exact install command:**

```bash
npx skills add DFlowProtocol/dflow-skills
```

Three skills:

| Skill | Description |
|---|---|
| `dflow-spot-trading` | "Swap any pair of Solana tokens via the DFlow CLI or Trading API, including builder platform fees (`platformFeeBps`), sponsored swaps, and priority-fee tuning." |
| `dflow-market-data` | "Stream real-time quotes, order-book depth, and priority-fee estimates over WebSocket." |
| `dflow-proof-kyc` | "Integrate Proof identity verification to gate app features by wallet KYC and check verification status." |

A separate, fuller-stack skill for web apps:

```bash
npx skills add https://github.com/DFlowProtocol/dflow_phantom-connect-skill
```

"Teaches Claude Phantom's wallet SDKs alongside DFlow's Trading API. Covers wallet connection, transaction signing, token swaps, and real-time market-data streaming."

**Status in this repo (VERIFIED): all three are already installed.** They live at `/Users/dre/Desktop/MYTAB/.agents/skills/dflow-{spot-trading,market-data,proof-kyc}/SKILL.md`, symlinked from `.claude/skills/`. No action needed. Their content is folded throughout this document (cited as *[skill:…]*) — notably the backend WebSocket relay (§6.4), the embedded-wallet Proof signing snippet (§14.4), and a set of gotchas that appear nowhere in the official docs.

The skills are also usefully honest about their own limits — each says "this skill is the recipe; the MCP is the reference", and each repeatedly instructs the agent to load the real schema rather than guess field names. That is a reason to install the MCP alongside them.

---

## 18. The `dflow` Agent CLI

*[ai/agent-cli]* — probably not on My Tab's path (it is a local-keypair tool, not a server SDK), but worth knowing.

```bash
curl -fsS https://cli.dflow.net | sh
dflow setup
```

Single self-contained binary, **macOS and Linux only**. Setup requires a **DFlow API key** (not optional). Config at `~/.config/dflow/config.json`; wallets at `~/.ows/wallets/` in Open Wallet Standard format (`ows-lib` v1.4.2). Every command returns JSON: `{ "ok": true, "data": {...} }` or a classified error with `error_code`, `category`, `recoverable`, `suggestion`.

Key commands: `dflow quote|trade <atomic-amount> <FROM> <TO>` (`--slippage <bps>`, `--confirm`), `dflow positions`, `dflow send`, `dflow fund` (MoonPay fiat on-ramp for USDC/SOL), `dflow wallet import|export|list|delete|rename`, `dflow skills install|update`.

**Guardrails** — a genuinely interesting design worth stealing conceptually: client-side policy limits an agent can *read* but not *change*. `guardrails show` needs no password; `set`/`remove`/`reset` require the vault password **typed in the terminal** (keychain and env var are deliberately bypassed "so a human must be present to change policy"). Keys: `max_trade_size_usd`, `max_daily_volume_usd`, `max_wallet_value_usd`, `allowed_tokens` (buy-side whitelist; "Sells are unrestricted"), `rate_limit`, `sweep_address`. Stored HMAC-signed at `~/.ows/guardrails.json`.

**CLI limitations relative to the API:** no sponsorship support, no platform-fee flags, no priority-fee tuning flag ("`dflow trade` always uses the server-side default") *[skill:dflow-spot-trading]*.

Observability headers sent on every request: `X-Dflow-Caller` (`human`/`agent`/`unknown`), `X-Dflow-Agent` (`cursor`, `claude-code`, …), `X-Dflow-Model`. Registered via `dflow agent --model <name>`, cached 48h.

---

## 19. Notable things you did not ask about

1. **Prediction markets are a first-class, entirely undocumented product surface.** The OpenAPI is full of it — `platformFeeScale`, `predictionMarketSlippageBps`, `predictionMarketInitPayer`, `outcomeAccountRentRecipient`, `isNativePredictionMarketOutput`, `initPredictionMarketCost`, a `BisonFi Predictions` venue, a `CASH` settlement mint (`CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH`), and a privileged `subscribe_all_prediction_markets` stream op. **`/order-status` exists only for prediction market orders.** There is **no prose documentation for any of it**. If DFlow is your hackathon sponsor, this is the most obvious "builds on something they clearly care about but nobody has read about" opportunity in the entire API.

2. **`includeAddressLookupTables` removes an RPC round-trip.** "enabling clients to deserialize and recompile the transaction with additional instructions **without fetching ALTs from RPC**." If you compose DFlow's swap with your own instructions — which My Tab does, given settlement — this is a direct latency win.

3. **`reserveAccounts` / `reserveTransactionSize` are the right way to compose.** Rather than guessing whether your added instructions will fit, tell DFlow how much room to leave and it sizes the route accordingly. Note the precise semantics: "specify only the **unique** accounts your additions will introduce, not accounts already in the transaction."

4. **`outputCloseAuthority`** idempotently initialises the output token account and assigns a close authority — a clean way to reclaim rent later on accounts your app creates on users' behalf. Restrictions: no SOL output, not with `destinationTokenAccount`/`destinationWallet`.

5. **Positive slippage capture** (§8.2) is a monetisation lever that is arguably more user-friendly than a platform fee — you only take upside above the quoted amount, and it is capped. DFlow takes none itself.

6. **Pump.fun coverage is deep**, including the bonding curve. FAQ: "Yes. Both on the bonding curve and after graduation to PumpSwap." Plus `skipPumpfunCashbackClaim` and `allowBondingCurveUnderconsumption` — note **both are incompatible with sponsor-executed swaps**, which is a real constraint if you sponsor Pump.fun trades. Use `sponsorExec=false`.

7. **`includeJitoSandwichMitigationAccount`** gives MEV protection on the imperative path without moving to the full intent flow.

8. **No CORS — but the observed headers disagree.** The FAQ says "The Trading API doesn't set CORS headers, so browser requests are blocked. Proxy `/order` through your backend; most builders use an edge function (Cloudflare Workers, Vercel Edge Functions) to keep added latency low." **VERIFIED contradiction:** the live dev endpoint *did* return `access-control-allow-origin: *` alongside `access-control-expose-headers`. Either CORS was enabled since the FAQ was written, or it differs between dev and prod. **Do not rely on either behaviour** — proxy through your backend regardless, which you must do anyway to keep the API key server-side.

9. **Limit orders are on the roadmap** with no timeline *[resources/faqs]*.

10. **`/tokens` disagrees with `/tokens-with-decimals` by 238 entries** (VERIFIED) — they are generated independently. Don't assume set equality.

11. **Two health endpoints** (`/health-check`, `/healthz`) return 503 with a specific `code` when DFlow's market state is cold. Cheap upstream health signal for your own status page.

12. **`segmenterFee`** appears in `IntentPlatformFee` (`segmenterFeeAmount`, `segmenterFeePct`) and is **completely undefined in the docs**. Worth asking DFlow directly if you go near the intent flow.

13. **Dev notifications Telegram group** *[resources/dev-notifications]*: `https://t.me/+GubbVyulzDFjZTkx` — the only announcement channel for API changes. Given how much of this API is undocumented and evolving, joining it is the cheapest available hedge.

---

## 20. Quick reference card

```
HOSTS
  dev  https://dev-quote-api.dflow.net    (no key, x-ratelimit-limit: 60, MAINNET)
  prod https://quote-api.dflow.net        (x-api-key header)
  ws   wss://{same host}/{quote-stream|book-stream|priority-fees/stream}
  proof https://proof.dflow.net/verify/{address}    (public)

CLUSTER: mainnet-beta ONLY. "dev" is a rate tier, not devnet. (VERIFIED)

QUOTE ONLY        GET /order?inputMint&outputMint&amount              (omit userPublicKey)
QUOTE + TX        GET /order?...&userPublicKey=<pk>                   → transaction (base64, v0)
GASLESS           GET /order?...&sponsor=<pk>&sponsorExec=false       → 2 signers [sponsor, user]
                  sponsor is ALWAYS account[0] = fee payer            (VERIFIED)
BUILDER FEE       &platformFeeBps=50&platformFeeMode=outputMint&feeAccount=<ata>
                  (ATA must pre-exist; never declare a fee you don't collect)
PRIORITY          &prioritizationFeeLamports=auto|medium|high|veryHigh|disabled|<lamports>
                  default auto, capped 0.005 SOL
SLIPPAGE          &slippageBps=auto|<u16>       default auto
COMPOSE           &reserveAccounts=N&reserveTransactionSize=N&includeAddressLookupTables=true
VERIFY RESPONSE   headers: x-sign-request: true, x-request-id: <uuid>
                  ed25519 RFC 9421, keyid EZKxYr7bbXHaKAGw2MEpVUU9He3hwXGejSpCsdsZCmiF

ENFORCED ONCHAIN  otherAmountThreshold  (== minOutAmount)   ← assert on this
ESTIMATES ONLY    outAmount, priceImpactPct, all stream prices

MINTS   SOL  So11111111111111111111111111111111111111112
        USDC EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
        CASH CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH   (prediction settlement)
PROGRAM DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH        (aggregator)
REFERRAL REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3

MCP     claude mcp add --transport http DFlow https://pond.dflow.net/mcp
SKILLS  npx skills add DFlowProtocol/dflow-skills            (already installed here)
```

---

## Appendix: open questions the docs do not answer

Worth asking DFlow directly — several are load-bearing for My Tab.

1. **Rate limits**, numerically, for both dev and production keys, and the window unit for `x-ratelimit-limit: 60`.
2. **Maximum `platformFeeBps`** — a cap exists (`invalid_platform_fee_bps`) but is unpublished.
3. **Default `priceImpactTolerancePct`** applied when unspecified.
4. When do **`unverified_wallet_not_allowed`** and **`wallet_restricted`** fire? Are they per-key policy, or global sanctions screening? *(Determines whether Proof can become mandatory for you.)*
5. **Sponsor wallet constraints** — minimum balance, quote-time validation, registration/allowlist?
6. **Proof signature validity window** for the deep-link ownership proof.
7. Any **Proof sandbox** or test-mode wallet.
8. What is a **`segmenterFee`** in the intent flow?
9. When does the server select **`executionMode: async`** for a standard SPL swap?
10. **WebSocket keepalive/ping** requirements and idle timeout.
11. Is **CORS** actually enabled now? (Observed `access-control-allow-origin: *` contradicts the FAQ.)
12. Is there any **token metadata source** DFlow recommends, given `/tokens` carries none?
13. Do **production keys** expose `x-ratelimit-*` headers, and is stream access visible on the key?
```
