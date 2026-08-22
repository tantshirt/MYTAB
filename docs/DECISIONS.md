# My Tab — Decision Log

**This file is binding. Read it before any planning artifact.**

Where a document in `_bmad-output/planning-artifacts/`, `README.md`, `PRODUCT.md`, `DESIGN.md`, `EXPERIENCE.md`, `POLISH-SPEC.md` or `docs/project-context.md` conflicts with an entry here, **this file wins**. Those documents are the historical record; their reasoning is still worth reading, and each superseded one now carries an amendment banner pointing here.

Each entry states what the binding documents said, what is true now, *why it changed*, and what that forces. The "why" is the point. A bare statement of current state loses an argument with a confident, well-written, out-of-date specification — the evidence does not.

D-21 through D-31 were decided in the 2026-08-22 planning session and first written in `docs/FLOWS.md`. D-32 and the U-9 surface were decided on 2026-08-22 during the remaining-phases execution plan. They are recorded here so a later agent cannot re-litigate them from a planning artifact.

**Two standing caveats, true of everything below.**

1. **Nothing in this repository has touched a live cluster.** Every integration is unit-tested with injected transports. The gates are real; what is behind them is unproven. `docs/MAINNET-CUTOVER.md` is the checklist that changes that.
2. Some decisions are still landing in code as this is written (D-11 in particular). Where that is so, the entry says which parts are done and which are in flight.

Current branch at time of writing: `feat/devnet-hardening`, HEAD `a663882`. The branch name is a fossil of D-01 and should not be read as a statement of intent.

---

## D-01 · The cluster is mainnet, and the cluster is configuration

**Originally:** `docs/project-context.md` — *"Solana mainnet via private RPC"* — while `lib/solana/cluster.ts` shipped with `SOLANA_CLUSTER` *defaulting to devnet*, `README.md` §"Required first milestone" described a devnet-first Day 0 gate, and the branch doing the work is still called `feat/devnet-hardening`. The plan of record was: build and prove on devnet, flip to mainnet at cutover.

**Now:** the product targets **mainnet-beta**. The cluster is a configuration value read through `lib/solana/cluster.ts`, and no verification rule anywhere contains a cluster literal.

**Why it changed:** the DFlow Trading API has no devnet. This was not inferred from documentation — the documentation does not mention devnet at all — it was resolved empirically and is recorded in `docs/dflow-api-reference.md` §9.2. A transaction fetched from `https://dev-quote-api.dflow.net/order` carried blockhash `2bWXuW9Le25r7NPBqZxFrusVm3GcKtLwxj7i2LjppjEr` and `contextSlot` 440,907,166. `isBlockhashValid` returned **`true` on `api.mainnet-beta.solana.com`** (cluster slot 440,907,211 — within ~45 slots of the response's own `contextSlot`) and **`false` on `api.devnet.solana.com`** (cluster slot 486,563,792 — roughly 45 million slots away). `dev-quote-api.dflow.net` is a **rate-limit tier on mainnet**, not a cluster. The aggregator program *is* deployed on devnet, which is the fact that made the original assumption look safe, but DFlow's off-chain router indexes no devnet pools, so it could not quote there even if an endpoint existed.

**Consequences:**
- The routed settlement path fails closed on devnet *before any budget is spent*, rather than producing a quote that cannot execute.
- Every cluster-dependent value — USDC mint, wrapped-SOL mint, DFlow aggregator program id — is derived from `lib/solana/cluster.ts`. An unrecognised `SOLANA_CLUSTER` throws; it never falls back.
- `assertClusterRpcAgreement()` (`lib/solana/cluster.ts` L163) refuses to *guess* when an RPC host carries no cluster marker — `RPC_UNVERIFIED`, distinct from `RPC_MISMATCH` — so a devnet mint can never be validated against a mainnet RPC. Its only production caller is `convex/internal/solana.ts` L211, and it is skipped in fixture mode; if you add a second RPC entry point, call it there too.
- Devnet is still a supported configuration for the direct exact-USDC path, and a **deployed devnet counts as a real deployment** for fixture purposes (D-11). A fixture wallet address in a devnet settlement is money sent nowhere just as surely as on mainnet.
- Jupiter (D-09) indexes mainnet only; on devnet, token metadata falls back to cluster pins plus chain reads.

**Status:** binding · supersedes `README.md` §"Required first milestone" (devnet-first sequencing), `docs/project-context.md` §Stack, and the default in the original `cluster.ts`. Consistent with `docs/MAINNET-CUTOVER.md` §6.

---

## D-02 · Address lookup tables: rejected outright → resolved at `contextSlot` and validated, on the routed path only

**Originally:** brief §1 and the AD-10 validation checklist required that unresolved accounts never reach a sponsor's signature, and commit `f495400` implemented that as *"Address lookup tables are rejected outright; unresolved accounts must never be signed."* The plan was to constrain DFlow routes until none needed a table.

**Now:** the **direct** exact-USDC path still rejects lookup tables outright. The **routed** DFlow path resolves every table against the chain at the response's returned `contextSlot`, and the *expanded* account set then faces the identical rule set — same allowlists, same role checks, same manifest.

**Why it changed:** the plan to avoid tables entirely was tested against the live API and did not survive. **Every** `/order` response carries **exactly two** address lookup tables — including with `onlyDirectRoutes=true` on a single-venue route — and one of them is DFlow's own structural table, present regardless of route shape. A sweep of `maxAccounts` from 24 to 64 and `maxTransactionSize` from 400 to 1000 found **no lookup-free configuration** (commit `17bab64`). "Constrain the route" was therefore not an available option; the only choices were to resolve the tables or to abandon routed settlement.

**Consequences:** the gate got **stricter**, never more permissive. Specifically:
- Routed `allowedPrograms` went 4 → 2: **ComputeBudget and the DFlow aggregator, nothing else**. Token and ATA programs had been top-level-legal, which permitted a bare transfer riding alongside the swap inside the same signature. (The direct path keeps ComputeBudget + Token + ATA + Memo, because it *is* a token transfer.) `maxInstructions` went 8 → 4 on the routed path (`lib/solana/sponsorPolicyManifest.ts` L129–136, `maxInstructions: isDflow ? 4 : 5` L163).
- The direct path rejects an ALT with `ADDRESS_TABLE_LOOKUP_PRESENT`; the routed path rejects a transaction whose tables were *not* resolved with `DFLOW_ROUTED_VALIDATION_INCOMPLETE` (`lib/solana/validateTransactionMessage.ts` L478–489). Resolution itself is `resolveAddressTableLookups` in `lib/solana/addressLookupTable.ts` L198, which takes `contextSlot` and fails `SLOT_TOO_OLD` rather than resolving against a newer table state, plus `assertDeclaredTablesMatch` L319.
- A `routedAccountsResolved: boolean` flag was **deleted**. Resolution is now *derived* from chain reads, never asserted by a caller who may never have performed one. A boolean a caller can set is not evidence.
- `isWritable` / `isSigner` now close over the resolved set, so an ALT-supplied writable account is no longer invisible to the role checks. This was the actual danger: the tables do not just add accounts, they add accounts with roles.
- Sponsor exposure charges **worst-case ATA rent**. The aggregator creates token accounts by CPI, so zero top-level ATA instructions are visible while the sponsor still pays — budgeting the observed zero understated the exposure.
- A routed backstop asserts exactly one aggregator instruction, and that the recipient's USDC account is present and writable. That converts `destinationWallet` from a request we hoped was honoured into a verified fact.

**Status:** binding · supersedes AD-10 as applied to the routed path only, and the "reject outright" language in `docs/MAINNET-CUTOVER.md` §6 (which already anticipated this alternative: *"either constrain the route or resolve the table at `contextSlot` and validate the expanded account set under the identical rules. Never relax the gate."*).

---

## D-03 · DFlow is the settlement path for every non-USDC payer, not a demo swap — and the UI stays anti-swap-UI

**Originally:** brief §6.1 and the PRD framed DFlow as a proof point — *"DFlow proof | At least one payment converts an allowlisted input token into recipient USDC"* (PRD line 62). One token, one demonstration.

**Now:** the routed path is how any payer who does not hold USDC settles. It is **one transaction, not two**: `/order` is called with the server-owned recipient as `destinationWallet`, so the swap output goes directly to the recipient and there is **no intermediate custody hop**.

**Why it changed:** two things. First, the single-token restriction was never a technical constraint, only a scope reduction, and it produced a bad product answer — a payer holding one non-allowlisted token would be told to go and acquire a different one (see D-05). Second, `destinationWallet` removes the mechanism that would have made routing risky: with the output landing on the recipient's own account, My Tab never holds the funds between the swap and the payment, and there is no second transaction that can fail after the first one succeeded.

**Consequences:**
- The mechanism does not get a *swap* screen. `DESIGN.md` and `EXPERIENCE.md` remain the authority on the anti-patterns: no route diagram, no price-impact warning, no slippage slider, no "swap" in copy. **D-22 amends the "does not get a screen" sentence** — a token picker with balances, a live quote and a plainly stated price-protection figure is now a first-class surface. The banned-copy list is unchanged and applies with full force: never *swap*, *route*, *execute*, *approve*, *broadcast*, *slippage*. Say **price protection**.
- The one figure a payer is shown as a *guarantee* is the minimum the recipient receives — "Maya receives at least 8.25 USDC" — which is `otherAmountThreshold` (D-08), not an estimate. `outAmount` may appear only if labelled as an estimate, or not at all.

**Status:** binding · supersedes brief §6.1 / PRD §"DFlow proof" as a scope statement. Strengthens the anti-swap-UI position. The "no screen" clause is amended by **D-22**.

---

## D-04 · DFlow order parameters: `sponsorExec=false`, `allowAsyncExec=false` stated explicitly, platform fee **omitted**, positive-slippage params **omitted**

**Originally:** PRD **FR-S4** — *"Orders are requested in a Convex Node action with the sponsor address as `sponsor`, `sponsorExec=false`, `allowSyncExec=true`, `allowAsyncExec=false`…"* — and PRD **FR-S6**, which requires the validation gate to check that *"platform fee amount is exactly zero and no fee account exists for the judged build."* Brief decision 10: *"No platform-fee account is sent to DFlow."*

**Now:** as implemented in `lib/dflow/orderRequest.ts`:
- `sponsorExec: false` — the user swaps from their own accounts, so the sponsor wallet never custodies funds mid-transaction and the transaction is smaller. The sponsor is `account[0]` and pays the fee in either mode regardless.
- `allowAsyncExec: false` is **asserted present in the serialised query string**, not merely absent from the request object.
- `platformFeeBps` is **omitted entirely** — not set to zero.
- Positive-slippage parameters are **omitted entirely**.

**Why it changed:** three separate reasons, each an implementation finding rather than a preference.

1. **`allowAsyncExec`.** The DFlow API default is `true`. Omitting the parameter therefore *silently inherits* asynchronous execution — which violates brief binding decision 7 and PRD FR-S4 while looking, in the source, exactly like compliance. So the assertion is on the serialised query, where absence is detectable.
2. **The platform fee.** "Exactly zero" and "omitted" are not the same request. A **declared** fee — including a declared zero — is factored into the slippage budget by the router. Declaring one without a funded `feeAccount` spends part of the payer's price protection on nothing and measurably worsens their execution. The PRD's FR-S6 wording ("exactly zero") describes a check that would pass on a request that is worse for the payer than the one we send.
3. **Positive slippage.** The excess between the guaranteed minimum and what the route actually returns is the **payer's money**. With output routed to the recipient (D-03), that excess lands on the recipient — which is precisely the round-up tip `EXPERIENCE.md` already models. Claiming it back would have meant building a mechanism to take money from a payer in order to hand it to ourselves, on a product whose platform fee is zero.

**Consequences:**
- The request omits the fee fields (`lib/dflow/constants.ts` `DFLOW_ORDER_PARAMS` L47–52, with the omission rationale recorded at L38 and L42); the *manifest* separately asserts `platformFeeBps: 0` on the validation side (`lib/solana/sponsorPolicyManifest.ts` L169, enforced in `assertManifestSane` L194). Omitted in the request, asserted zero in the gate — those are two different jobs and both are required.
- The positive-slippage position is recorded as a named constant, `DFLOW_POSITIVE_SLIPPAGE_DECISION = "payer-keeps-upside"` (`lib/dflow/constants.ts` L86), so it cannot be flipped by someone adding a parameter without reading why it is absent.
- Routing bounds live alongside them: `maxAccounts: 64`, `maxRouteLength: 3` (`DFLOW_ROUTING_BOUNDS` L66–69). `maxAccounts: 64` is the top of the sweep range in D-02 — it is a ceiling chosen because nothing below it removed the lookup tables.
- Any future decision to charge a platform fee is a change to the payer's execution quality, not just a revenue switch, and must be re-argued here.

**Status:** binding · supersedes PRD FR-S6's "platform fee amount is exactly zero" phrasing; refines PRD FR-S4 and brief decision 10.

---

## D-05 · Any token the payer holds — the single-allowlisted-input rule is superseded

**Originally:** brief §1, binding decision 7 — *"**SOL is the single routed P0 input.** Native SOL is normalized only inside the server to wrapped-SOL mint `So111…112`; the UI calls it 'Solana.'"* PRD **OQ-2**, marked resolved: *"Resolved 2026-08-21: native SOL, normalized to the wrapped-SOL mint only inside validated DFlow transactions."* PRD **FR-S4**: *"P0 DFlow orders support one non-USDC input: native SOL."*

**Now:** a payer may settle in **any token they hold**, subject to verification. The recipient still always receives USDC; the output mint is still fixed to the cluster's USDC mint and is still server-owned.

**Why it changed:** the SOL-only rule bought exactly one thing — a small, statically-known set of mints to validate against — and DFlow gives that up for free anyway, because it accepts any mint it can route. Meanwhile the rule produced a product dead end: a payer at a dinner table holding a stablecoin that is not USDC, or any other liquid token, would be told to acquire SOL first. That is a wallet app's answer, and this product exists to not be one. The safety property the restriction was standing in for — *is this token what it claims to be* — is a **verification** question, not an allowlist question, and it is now answered per-mint by D-09: a curated registry's `isVerified` flag (tested as `=== true`, never `!== false`), disqualifying tags, decimals proven against the mint account rather than trusted from a list, and cluster pins that outrank the registry absolutely.

**Consequences:**
- Token metadata becomes a hard dependency (D-09) — the payer must be able to tell one token from a lookalike, and DFlow returns bare mints.
- Wrapped-SOL normalization stays exactly as specified: server-side only, inside the validated transaction, and the UI still says "Solana".
- The output side is unchanged and is **not** open: USDC only, mint pinned per cluster, recipient server-derived.

**Status:** binding · supersedes brief §1 decision 7, PRD OQ-2, and PRD FR-S4's "one non-USDC input".

---

## D-06 · Invite flow: one roster, two doors — bot-admin becomes an upgrade, not a prerequisite

**Originally:** brief §1, binding decision 2 — *"Telegram membership is authoritative. **The bot must be a group administrator.** Convex consumes membership updates and refreshes `getChatMember` before join and whenever a privileged-action cache is older than five minutes."* `EXPERIENCE.md` §Foundation — *"Membership is live trust, not a link possession check. The bot must be a group administrator."* Every artifact begins at *"the organizer types `/tab` in a group where our bot is already an admin."*

**Now:** **`tabParticipants` is the single authoritative membership object. The token admits; the roster authorizes.** Two doors write *identical* rows into it: a group door (`origin: "chat"`, bounded by the Telegram chat's own membership, gated on `botIsAdmin` and live `getChatMember` exactly as decision 2 says) and an invite door (`origin: "personal"`, bounded by a **seat count** the organizer set, admitted on verified `initData` + Privy identity + an unconsumed seat). Nothing downstream branches on which door a person came through. Bot-administrator status is an **upgrade path** for group-origin tabs, not a precondition for using the product.

**Implementation status — read this before assuming the door exists.** The *roster half* is real and load-bearing: `tabParticipants` is in `convex/schema.ts` (L516), `requireTabParticipant` (`convex/lib/tabAuth.ts` L21) gates allocations, the completion share and the claim board query, and the admission row is written in `convex/lib/sessionTokenOps.ts` L492. The *seat half* is real: `seatPolicy: { kind: "chat" } | { kind: "fixed"; seats: number }` is in the schema (L356–364), checked by `seatAvailable` (L268–276) and **re-counted inside the writing transaction** (L481–491, `TAB_FULL`). The *invite door itself is not built*: there is **no `origin` field anywhere** in `convex/`, `lib/` or `features/`, and `botIsAdmin` is still a hard refusal on both join (`TAB_ADMISSION_FAILURE.BOT_NOT_ADMIN`, `sessionTokenOps.ts` L425–426) and invite mint (`INVITE_MINT_FAILURE.BOT_NOT_ADMIN`, L599–600). Today the product still cannot create a tab without a group chat with an admin bot. This entry is the decision that governs the work; it is not a description of the tree.

**Why it changed:** stated in one sentence in `INVITE-FLOW.md` §1.1 — *"`getChatMember` authorizes speaking to a group. `tabParticipants` authorizes acting on a bill. These were conflated."* The security instinct behind decision 2 is right; the **unit** is wrong. `getChatMember` proves one fact — this person is currently in that chat — and it is a loose proxy for the question the product cares about, *was this person at the dinner*, in **both** directions: in a twelve-person chat where five people ate, all twelve can write to a five-person bill; and a colleague who was at the table but is not in the chat cannot be on the bill at all.

There was also a structural finding. `lib/telegram/webhook.ts` dropped every private message (`if (!isGroupChat(chat)) return null;`), and the schema made `tabs.groupId` a required `v.id("groups")` — so a tab could not exist without a Telegram group chat. The front door of the product was **silence**: a person who found the bot in search and typed `/start` got no reply. Onboarding was four steps — find the bot → add it to a group → promote it to administrator → type `/tab`. `INVITE-FLOW.md` removes three of them and makes the fourth optional.

**Consequences:**
- The invite door **structurally cannot** cause a bot message to a chat (`INVITE-FLOW.md` §1.7), so it cannot be used to spam.
- A user id already on the roster revisits **unconditionally — including after the token has expired or been revoked**. An existing participant gets in on a dead link; a stranger does not get in on a live one.
- Forwarding is bounded by **seats**, not by a chat roster. Only the organizer may mint an invite or add a seat.
- The invite door was **strictly stronger** than the group door until amendment 2c landed: the Mini App join path never performed the live `getChatMember` refresh that decision 2 already required. See D-16 hole H8.
- The organizer must be inserted into `tabParticipants` at tab creation on both doors — previously they joined only by tapping their own link, which does not exist on an invite-origin tab (`INVITE-FLOW.md` §9.11 B7).
- **Amendment 2b is proposed, not accepted.** The Bot API documents `getChatMember` as available to any bot that is a member of the chat, with administrator rights needed for `chat_member` **push updates** rather than for the on-demand lookup. If that holds in a real production supergroup, administrator status is a freshness optimization. **This has not been verified against a real supergroup.** Hidden-member and privacy configurations are the risk. If it fails, group-origin tabs keep the administrator requirement and organizers use the invite door instead — the design does not depend on the outcome.

**Status:** binding · supersedes brief §1 decision 2 (scoped, per `INVITE-FLOW.md` §9.1 amendment 2a) and decision 4 / §2.8 (seat policy, §9.2), `EXPERIENCE.md` §Foundation (§9.4), `EXPERIENCE.md` §IA and §State Patterns (§9.5), and epics Story 2.6 (new AC7, §9.9). `INVITE-FLOW.md` is the authority on ingress; `EXPERIENCE.md` remains the authority from the Claim Board onward.

---

## D-07 · A debt survives the chat

**Originally:** brief §1 decision 2, by implication — *"A membership or bot-admin failure leaves the tab readable but disables mutations with an organizer repair message."*

**Now:** after lock, a `tabParticipants` row alone authorizes settling **your own** obligation. Loss of group membership or bot-administrator status disables authoring, claiming, locking, reopening, waiver and cash acknowledgement — but never blocks a person from paying what they already owe. Before lock, decision 2 applies unchanged.

**Why it changed:** the original rule made the continued existence of a Telegram chat a precondition of a debt. If the bot is removed from a group after a bill is locked, five people holding real obligations to a named person lose the ability to pay them. The chat is where the coordination happened; it is not the thing that owes anyone money.

**Consequences:** the settlement authorization path must not call any group-membership check for a post-lock own-obligation payment. Anything that does is a regression.

**Status:** binding · supersedes brief §1 decision 2's consequence clause, per `INVITE-FLOW.md` §9.3.

---

## D-08 · The quote solver brackets on `otherAmountThreshold` only

**Originally:** research finding R-4, recorded in `docs/project-context.md` — *"the DFlow order response has no order ID and no expiry. My Tab owns quote TTL and idempotency; `otherAmountThreshold` is the minimum-output field to check."* Correct as written, and the implementation did not follow it.

**Now:** the bounded target-output solver brackets on `otherAmountThreshold` and nothing else, through a single accessor so it cannot be got wrong at a second call site.

**Why it changed:** two real bugs found while wiring the routed path (commit `17bab64`). The solver set `low = high = minimumOutputAtomic` in **OUTPUT** units while passing the guess as an **INPUT** amount — meaningless across a 9-decimal and a 6-decimal mint. And `applyDflowQuoteInternal` was handed the output value stored in the input-cap field. `otherAmountThreshold` is the sole figure the chain enforces; `outAmount` and `priceImpactPct` are explicitly estimates in DFlow's own documentation, and bracketing on an estimate produces a guarantee that is not one.

**Consequences:** the "Maya receives at least …" line on the payment sheet is `otherAmountThreshold` and must stay so. Any future display of `outAmount` must be labelled as an estimate or not shown.

**Status:** binding · refines R-4 / PRD FR-S4 into an implementation rule.

---

## D-09 · Token metadata comes from Jupiter — a new third-party dependency with an attribution obligation

**Originally:** no artifact named a token-metadata source. The PRD's single-token rule (D-05) meant one hardcoded mint, so the question never arose.

**Now:** `lib/tokens/jupiter.ts` calls the **Jupiter Token API V2**, server-side only, cached, batch-by-mint, and never shipped to the client. `convex/tokens.getTokenMetadata` is authenticated and scoped to specific mints.

**Why it changed:** D-05 made "what is this token" a live question, and DFlow does not answer it. DFlow's `/tokens` and `/tokens-with-decimals` return **mints and decimals only — no symbol, name, logo or liquidity** — and are **4,590,857 entries / 215 MB** and **4,590,619 / 234 MB** respectively (`docs/dflow-api-reference.md` §7, verified). They are download-once-and-process-offline endpoints, unusable at request time and impossible inside a memory-capped serverless function. DFlow's own reference note says as much and directs you to source symbols and names elsewhere. The alternatives were rejected on record in the module header:

- **`solana-labs/token-list`** is a dead registry; Jupiter's icon URLs still point at its GitHub assets, which is the clearest sign it survives as a CDN rather than a source of truth.
- **Metaplex on-chain metadata** is authoritative about what an issuer *claims* and silent on whether the claim is legitimate — anyone can mint a token whose metadata reads `symbol: "USDC"`. For a payment sheet, "who vouches for this" is the entire question. It is also one RPC round trip per mint.
- **Jupiter** publishes a curated registry with an explicit `isVerified` flag and `verified`/`strict` tags, and decisively, a **batch-by-mint** endpoint — so we ask about exactly the mints a payer holds instead of downloading a list. That property is what makes the ban on client-side fetching cheap to keep.

**Consequences:**
- **`isVerified` is tested `=== true`.** Verified tokens carry `isVerified: true`; unverified ones **omit the field entirely** rather than sending `false`. A `!== false` check would have marked every lookalike verified. This is the single most dangerous line in the module.
- `/search` is a *search*: `?query=USDC` returns twenty tokens, several of them lookalikes on different mints. Only entries whose `id` is in the requested set survive.
- `duplicate` and `deprecated` tags disqualify a token even when `isVerified` is true.
- Labels are stripped of zero-width and bidi characters before the reserved-symbol check.
- **Cluster pins in `cluster.ts` outrank the registry absolutely**, and decimals are proven against the mint account (`lib/tokens/mintAccount.ts`) rather than trusted from a list.
- `JUPITER_MAX_MINTS_PER_REQUEST = 100` caps a batch. A long wallet silently truncated at the API would surface much later as "unknown token" on a payment sheet; the cap plus `fetchJupiterTokensChunked` is the only thing standing between that and the payer.
- The cache lives in Convex, keyed `(cluster, source: "jupiter")`, filled by an `ensureTokenMetadata` **action**; `getTokenMetadata` is a **query that performs no network call** (`convex/tokens.ts`).
- **Attribution is contractual.** Jupiter's SDK & API License Agreement requires attribution wherever the data is surfaced, and forbids re-serving Jupiter content as our own API — which is why `getTokenMetadata` is authenticated and mint-scoped rather than a public token-list endpoint. `JUPITER_ATTRIBUTION = "Powered by Jupiter"` exists in `lib/tokens/jupiter.ts` and is returned by `convex/tokens.ts`. **U-1 is resolved (2026-08-22):** the string ships as a footer on the D-22 picker — an approved exception to the banned-copy list for a contractual string, not a licence to use "powered by" anywhere else. Token logos ship on that picker. See D-22.

**Status:** binding · new dependency, no prior artifact to supersede. Interacts with `DESIGN.md` §Components (`token-chip`: *"No token logos"*) — see Unresolved U-1.

---

## D-10 · "Share to group" is Telegram's native share sheet, not a sixth bot event

**Originally:** `EXPERIENCE.md` §The Telegram Surface — *"**Only five events ever post:** tab opened · bill ready to settle · payment confirmed · bill completed · tip confirmed. Nothing else."* And `EXPERIENCE.md` §IA lists "Share to group" as the primary action of the All Square surface. Those two statements were in tension and nothing resolved it.

**Now:** `convex/completionShare.ts` **posts nothing.** It mints a prepared inline message (Bot API 8.0 `savePreparedInlineMessage`) and hands the id to the Mini App, which passes it to `WebApp.shareMessage`. Telegram opens its own share sheet and the *person* picks the chat.

**Why it changed:** the bot is never the author, never chooses a destination and never sends anything — so the five-event rule stays intact with no exception carved into it. It also avoids duplicating the automatic `bill_completed` card, which has already posted by the time the completion card is on screen. And a message sent *by the person* is the honest representation of what is happening: someone showing their friends a finished tab.

**Consequences:**
- Authorization is load-bearing, because minting a prepared message is minting a piece of the product's voice: the caller must pass `requireTabParticipant` **and** the bill must actually be complete (`computeBillCompletion`, the same arithmetic the completion card subscribes to). A stranger holding a tab id gets nothing.
- NFR-7 holds by construction: the words are `renderCompletionShare`, the group's own `bill_completed` card verbatim — tab name, total, people, share count. No individual amounts, no names of who paid what, no addresses, no links.
- Channels and bots are blocked as destinations; group and DM only.
- `USER_DECLINED` produces **no copy at all**. A bare `false` with no reason waits for `shareMessageFailed` to explain itself rather than inventing an error.
- The same argument licenses the invite message in D-06: Telegram sends it as the organizer, so it is not a bot event either.

**Status:** binding · resolves the tension in `EXPERIENCE.md` §The Telegram Surface and §IA; scopes the five-event rule to *group chats* per `INVITE-FLOW.md` §9.6.

---

## D-11 · All fixture and demo data is removed from source; fixture *auth* survives, behind a fail-closed guard

**Originally:** `docs/project-context.md` and the epics assumed a fixture-driven build throughout — commit `90504dc` is literally *"Complete remaining epics 4–8 with fixture-mode implementation."* `EXPERIENCE.md` §Interaction Primitives: *"The single exception is the demo-mode 'Use sample receipt' affordance, which is deliberately hidden from judges."* Epics Story 8.6 / 7.10 carried demo affordances.

**Now:** fixture **data** is being removed from the application source. Fixture **auth** — the harness that lets CI render every route without a live Privy credential — stays. The distinction is: a stand-in *identity* cannot move money; a stand-in *amount* is fabricated money on a real screen.

**Why it changed:** the pattern behind almost every serious defect found in this codebase was **silent degradation**. Every integration fell back to a fixture when its secret was absent, with no throw and no log. That produced, in production Convex: a validation function that returned `{ ok: true }` unconditionally; a "signature verification" that string-matched a marker format instead of doing cryptography; a Privy wallet resolver that returned a fixture address *even with credentials present*; a co-sign that returned a fabricated transaction signature, reporting settlements as sent when nothing had been broadcast; and a bill lock that stamped every obligation with a hardcoded **32 THB/USD** rate — the exact point where a fake number becomes what a real recipient is paid, frozen at lock and unfixable afterward.

Two specific fixture faults were on the ingress path and would have been visible to a user: `TabDeepLinkSurface.tsx` rendered the Sukhumvit Dinner fixture when a query returned `fixture` **or `error`**, so a genuine failure painted fabricated money behind an error status; and `lib/dflow/fixture.ts` fabricated an exact-USDC transfer masquerading as a router response, while `isDflowFixtureMode()` wrongly equated "no API key" with "fixture mode" — when a missing DFlow key actually means the **developer rate tier**, a real endpoint (D-01).

**Consequences:**
- One shared guard, `lib/solana/runtimeGuard.ts`, requires an **explicit opt-in** (`MYTAB_ALLOW_FIXTURES=true`, or an automated test runner) **and** a non-deployed runtime. A missing secret is never sufficient. The assert raises a named error rather than returning a boolean, so an unguarded `if` cannot swallow it.
- **A deployed devnet counts as real.** See D-01.
- `MYTAB_ALLOW_FIXTURES` must be unset everywhere at cutover (`docs/MAINNET-CUTOVER.md` §1).
- `lib/dflow/fixture.ts` is deleted. `convex/demo.ts` (`DEMO_PROTAGONISTS`, `resetDemoData`) is deleted. Fixture datasets are moving out of `features/**` into `tests/fixtures/**`.
- On mainnet, a missing or fixture bot token is a **hard configuration failure at boot**, not a silently disabled feature. A production deployment that cannot mint an invite cannot onboard anyone, and must fail loudly rather than render a First Screen whose only button does nothing (`INVITE-FLOW.md` §9.7). The same applies to `FIXTURE_TELEGRAM_WEBHOOK_SECRET` — a publicly known constant accepted as a webhook secret by an unconfigured deployment (§9.11 B2) — and to the `mytab_fixture_bot` deep-link host (B3).
- The demo-mode "Use sample receipt" affordance and its sentence in `EXPERIENCE.md` are deleted.
- **In flight at time of writing, and moving fast.** `convex/demo.ts` is deleted; the `features/**/fixture.ts` datasets have been relocated into `tests/fixtures/`; the UI-surface fixture fallbacks (`FIXTURE_TAB`, `FIXTURE_CLAIM_BOARD`) are gone from `features/`, replaced by real `use*Data` hooks. Still present in application source at the time of writing: `lib/solana/fixture.ts` (with `FIXTURE_BLOCKHASH` / `FIXTURE_SPONSOR_WALLET_ADDRESS` in `lib/solana/constants.ts`), `lib/domain/receiptFixture.ts` (`FIXTURE_SAMPLE_EXTRACTION` — a pure module with no guard, because it cannot see the environment), `lib/domain/fxFixture.ts`, `lib/privy/fixtures.ts` and `convex/lib/solanaFixture.ts` (now mostly real cryptography with a few guarded constants). **Do not read that list as current — re-check it.** Read this entry as the rule that decides what is allowed to remain: a stand-in *identity* behind an explicit opt-in on a non-deployed runtime is permitted; a stand-in *amount, wallet, rate or receipt* that can reach a deployment is not.
- `lib/domain/fxFixture.ts` still holds a **32 THB/USD** manual rational. That is not the H1-class bug described above: it is always persisted with `isFixture: true` and `provider: "manual:non-production"`, and brief decision 6 permits *"a visibly badged manual rational … only outside production."* The bug was that a hardcoded rate reached a **lock**, where it becomes what a real recipient is paid. Keep the badge, keep the guard, and keep it out of `lockSync`.

**Status:** binding · supersedes `EXPERIENCE.md` §Interaction Primitives (demo affordance), epics Story 8.6 / 7.10, and the fixture-mode framing throughout `docs/project-context.md` and the epics.

---

## D-12 · A green `next build` is not a passing gate; CI executes the bundle

**Originally:** no artifact specified a CI gate. `README.md` states *"Build, lint, unit-test, and end-to-end commands are deliberately marked as pending until the application scaffold creates the corresponding package scripts."*

**Now:** five gates — `npx tsc --noEmit`, `npm test`, `npx next build`, `npm run smoke`, `npm run sweep`. CI (`.github/workflows/ci.yml`) runs the first four; `npm run sweep` is local-only today.

**Why it changed:** production went down on every route with a **green build**. `config.externals` is an array in Next 15, and the original code assigned string keys onto it, which webpack never reads — so the externals were inert and nobody noticed. Turning them into a real `push` exposed the reason: Next runs the same webpack config for the server and client builds, and a `commonjs` external emits `require("@solana/kit")` — correct on the server, a hard `ReferenceError: require is not defined` in a browser. React never hydrated; every route rendered a blank paper screen (commit `fc8fd93`).

**`next build` compiles and typechecks the bundle. It never executes it.** That is the whole gap. `scripts/smoke.mjs` boots the real production `next start`, discovers routes by walking `app/`, opens each in headless Chrome over CDP with zero dependencies, and fails on five conditions: an uncaught exception, any `console.error`, a browser error log entry, a failed or ≥400 Document/Script request, or a route that renders no text. It is **proven against the real fault**: reverting the `isServer` webpack guard produces a green `next build` and 10/10 smoke failures.

`scripts/sweep.mjs` is **6 checks × 3 viewport configs × 13 surfaces**: horizontal scroll, truncation, sub-44px touch targets, clipping dressed up as handling, inert sticky elements, and dynamic type at 200%; across `320×568`, `390×844` and `320×568 @200%`; over 10 discovered routes plus 3 variants (payment sheet, new tab from group, tip composer). It builds its own fixture-mode bundle into a separate `distDir` with Privy and Convex unset, so it never needs a credential.

`npm run sweep` covers the same blindness on the layout axis — see D-14 for why the obvious overflow check cannot see a broken page.

**Consequences:** "the build is green" is not a report of success. Say which of the five gates ran. CI is deliberately given **no secrets**: without `NEXT_PUBLIC_PRIVY_APP_ID` and `NEXT_PUBLIC_CONVEX_URL` the app falls back to fixture *auth* (D-11) and every route still renders, hydrates and runs its client code, which is all a crash smoke test needs — and no live credential enters a fork's PR run.

**Status:** binding · fills a gap in `README.md` §"Planning validation".

---

## D-13 · Photography on Launch and first-run; paper primary action; monochrome lockup; Schibsted Grotesk wordmark

**Originally:** `DESIGN.md` as first written had no photographic surface, one type family (Instrument Sans), and one primary-action treatment (Tab Blue) everywhere.

**Now:** `DESIGN.md` already carries these as amendments — §Colors "Photographic surfaces — Launch and first run only", and §Typography. They are recorded here because the reasoning is what stops them being undone.

- **A photograph is permitted on Launch and first run, and nowhere else.** These are the two screens with no money on them. The cool-paper system withholds warmth from the ledger *on purpose*; it belongs here instead. **No photograph appears on any surface carrying an amount** — this is not a stylistic preference, it is the trust argument.
- **The primary action on a photographic surface is `paper` on `ink`, never Tab Blue.** Blue over a photograph is the one element that visibly did not come from the image; `paper` is the exact canvas colour of every screen behind it, so the button reads as the app *arriving* rather than a control dropped onto a picture. It also keeps blue meaning exactly one thing.
- **The lockup is monochrome white over an image.** The two-colour mark is correct on paper, where the blue tear is a colour boundary against a light ground; over an image it reads as a sticker.
- **A navy scrim, never a black one** — `rgba(10,32,56,…)`. Black scrim over navy ink is the one place the "never black" rule is most visible.
- **Schibsted Grotesk SemiBold sets the wordmark and nothing else** — not a heading, not a label, not a single line of UI text. A warmer grotesque than the UI face, with enough character to work as a mark and enough shared DNA that the two read as relatives. Loaded on Launch only.

**Why it changed:** the product needed an emotional register somewhere, and every candidate surface that carries a figure is disqualified by the trust argument. Launch and first run are the only two that carry none.

**Consequences:** anyone adding a photographic treatment to a third surface must first show that the surface carries no amount. Anyone using Schibsted Grotesk for UI text has broken the mark.

**Status:** binding · already reflected in `DESIGN.md` §Colors and §Typography; recorded here for the reasoning.

---

## D-14 · `overflow-x: hidden` → `overflow-x: clip`

**Originally:** the CSS reset in `lib/theme/globalStyles.ts` set `overflow-x: hidden` on `html` and `body`. `POLISH-SPEC.md` §2.3 flagged the pattern as a symptom mask but proposed a dev-only assertion, not a replacement.

**Now:** `overflow-x: clip` on `html` and `body`, and `overflowX: "clip"` on the AppShell content column.

**Why it changed:** **`hidden` makes an element a scroll container.** CSS then computes the other axis from `visible` to `auto`. On `body` — whose height is its content — that produces a scrollport that can never scroll, and **every `position: sticky` descendant resolves against it instead of the viewport.** Every sticky element in the product was inert.

Measured in Chrome at a 700px viewport: the tab bar sat at 1259–1324 and moved **1:1 with a 200px scroll**. The sticky claim footer, the discrepancy card and the tip action bar were equally unpinned. With `clip`: 635–700, pinned. `clip` is not a scroll container, leaves `overflow-y` alone, and clips identically.

**Consequences:**
- Worth recording *how it hid*: with `html` and `body` clipped, `scrollingElement.scrollWidth` **can never exceed the viewport** however badly the layout breaks — so the obvious horizontal-overflow check reports clean on a broken page. This is why `npm run sweep` measures element rectangles geometrically instead, and why it now carries a dedicated inert-sticky check.
- `POLISH-SPEC.md` §2.3's proposed `html, body { overflow-x: hidden }` guard must not be reinstated.

**Status:** binding · supersedes `POLISH-SPEC.md` §2.3's overflow guidance.

---

## D-15 · Layout: `maxColumnWidth` 390px → `min(100%, 480px)`

**Originally:** `DESIGN.md` §Layout — *"Single column, always. Design width 390px; the layout must survive 320px and never scroll horizontally. On Telegram Desktop the same column centers on the paper canvas."* Implemented as `MYTAB_LAYOUT.maxColumnWidth = "390px"` on every device.

**Now:** `maxColumnWidth: "min(100%, 480px)"` (`lib/theme/tokens.ts`).

**Why it changed:** 390px is a **design** width, not a layout cap. Applied as a cap it left 40px of dead paper on each side of a 430px phone and shrank the amount budget for no reason — while `BalanceHero`'s `8vw` sizing kept growing the glyphs against a column that did not grow. `DESIGN.md` asks for a centred single column on Desktop; it does not ask for a 390px letterbox on a large phone. `min(100%, 480px)` means the cap only bites above 480px: a phone gets its whole screen, Desktop still gets a centred single column.

**Consequences:** the 320px floor is unchanged and still binding. Anything sized from `vw` must be re-checked against the wider column.

**Status:** binding · supersedes `POLISH-SPEC.md` §2.10 item 5 / §8 item 8 as implemented; refines `DESIGN.md` §Layout.

---

## D-16 · All-square wash 40% → 46%, and two tokens `DESIGN.md` does not have

**Originally:** `DESIGN.md` §Components, `all-square-card` — *"`colors/tip` wash fading into `colors/paper` across the top 40%."*

**Now:** `linear-gradient(180deg, #F6E9DC 0%, #F7EFE7 45%, #F4F7FA 100%)` over `height: 46%` (`features/balances/AllSquareCard.tsx`, tokens `tipWashTop` / `tipWashMid` in `lib/theme/tokens.ts`).

**Why it changed:** two things. The height: `POLISH-SPEC.md` §5 and the approved artboard both specify 46% and supply the exact three stops; 46% wins over the 40% in the component table. The colours: `colors/tip` is a 4.5:1 terracotta — far too dark to sit behind 42px ink. `DESIGN.md`'s own description ("`tip` fading into `paper`") is not paintable at the contrast the accessibility floor requires, so the artboard's apricot tints were promoted to tokens.

**Consequences:** `tipWashTop` and `tipWashMid` are the only two values in `lib/theme/tokens.ts` that belong to exactly one component. The gradient they form with `paper` remains **the only gradient in the system**; `DESIGN.md`'s ban on every other gradient is unamended.

**Status:** binding · supersedes `DESIGN.md` §Components `all-square-card`, per `POLISH-SPEC.md` §5 / §8 item 5.

---

## D-17 · Telegram context renewal — the 5-minute context expired mid-meal and every write failed silently

**Originally:** brief §1 decision 1 and `docs/project-context.md` rule 11 — authenticated `/telegram/bootstrap` *"creates or refreshes a five-minute server-side context."* No artifact said how or when the client renews it.

**Now:** `features/telegram/useTelegramBootstrap.ts` renews at **60% of the server TTL** (`REFRESH_INTERVAL_MS = Math.floor(TELEGRAM_CONTEXT_TTL_MS * 0.6)` — derived from the server value, not hardcoded), again on `visibilitychange` and Telegram's `activated` event when the context is half-spent, and backs off on failure rather than spinning.

**Why it changed:** the hook posted exactly once, guarded by `lastInitData === initData`. But `initData` is **constant for a launch**, so the guard was permanent and nothing ever re-posted. The server context expires after five minutes and every mutation is gated on it through `requireTabParticipant`. Five minutes in, reads kept working and **every write silently failed**. That is the most confusing failure this product can produce: the bill is on screen, claiming an item does nothing, and nothing says why. **A dinner takes longer than five minutes.**

**Consequences:**
- A Mini App is routinely backgrounded mid-meal and timers are throttled while hidden, which is why `visibilitychange` and `activated` are load-bearing rather than belt-and-braces.
- The resume threshold is separate from the interval: `STALE_ON_RESUME_MS` is 50% of TTL, so returning to a backgrounded app renews only when the context is genuinely half-spent rather than on every tab focus.
- A regression test asserts the `initData` guard cannot come back (`tests/features/telegram-context-renewal.test.ts`).
- General rule: a "has this changed" guard on a value that cannot change is a permanent off switch. Look for the class, not the instance.

**Status:** binding · fills a gap in brief §1 decision 1 and `docs/project-context.md` rule 11.

---

## D-18 · Nine authorization and correctness holes closed — and the pattern behind them

**Originally:** brief §1 decisions and PRD FR-S6 specified the checks. The implementations did not perform them, and in several cases were passing.

**Now:** closed. Summary only — read the code and the commit bodies, not a paraphrase.

| # | Hole | What it allowed | Closed in | Code |
|---|---|---|---|---|
| H1 | `SystemProgram` on the sponsor allowlist | A top-level `SystemProgram.transfer{from: sponsor}` drains the entire fee-payer wallet in one instruction the sponsor is already signing. It was rejected only **by accident** — an empty-discriminator manifest entry that happened not to match System's 4-byte discriminator. | `f495400` | `lib/solana/sponsorPolicyManifest.ts` |
| H2 | Recipient token account never checked | An attacker-controlled client points the transfer at its own ATA; the payer signs blind, the sponsor pays the fee, the obligation is marked settled. | `f495400` | `lib/solana/pda.ts`, `lib/solana/tokenAccount.ts` |
| H3 | `.find()` took the first token instruction and ignored the rest | A second transfer to an attacker ATA rides along inside the same signature. | `f495400` | `lib/solana/validateTransactionMessage.ts` |
| H4 | Amount checked with `>=` rather than exact equality | Overpayment accepted silently. | `f495400` | `lib/solana/validateTransactionMessage.ts` |
| H5 | Two compute-budget fee bypasses | `SetComputeUnitPrice` placed *before* `SetComputeUnitLimit` prices against zero CUs; omitting the limit makes the computed fee zero while the chain prices against its own default. | `f495400` | `lib/solana/validateTransactionMessage.ts` |
| H6 | `void context.lastValidBlockHeight` | AD-10's blockhash-validity rule was **accepted and never enforced**. A single `void` disabled a named requirement while the code around it read as compliant. Now `BLOCKHASH_STALE` / `BLOCKHASH_EXPIRED` are enforced in phase 11 of the gate against a real `rpc.getBlockHeight("finalized")` read taken before signing. **A second `void lastValidBlockHeight;` still sits in `convex/lib/intentQuoteTtl.ts` L19** — a different concern (the TTL estimator, not the gate), but look at it before you assume it is fine. | `0fe1f7b` | `lib/solana/validateTransactionMessage.ts` L903–921; `convex/internal/privy.ts` L625–641 |
| H7 | `POST /telegram/deep-link` took `tabId` **and** `groupId` and checked them against each other | Two request arguments agreeing is not an authorization check. Any signed-in caller who could name a tab id got back a raw `tab_session` token, which opens the tab. Now organizer-only, `groupId` ignored entirely, every party read off stored rows, refusals as 403 so a stranger learns nothing. | `a663882` | `convex/http.ts`, `convex/sessionTokens.ts` |
| H8 | `resolveTabSession` admitted on a cached `groupMembers` row of **unbounded age** | Those rows are written from an unverified webhook payload with `membershipStatus: "active"` — so posting once in a chat was a permanent credential for opening any tab in it. Webhook- and bootstrap-sourced provenance is now not proof at any age; a check older than five minutes is refreshed rather than trusted, and the admission mutation cannot refresh, so it refuses with `MEMBERSHIP_UNPROVEN` rather than falling back to the cache. | `a663882` | `convex/lib/tabAuth.ts`, `convex/lib/sessionTokenOps.ts` |
| H9 | `useTabData` swallowed every `TOKEN_*` error into a readable empty board | Every failure string in the design was unreachable code. **Eleven** distinct refusal codes now surface, mapped to seven distinct messages and two actions, because the next action differs: expired means ask for a new link, full means ask for a seat, revoked means the tab moved on. `refusedTab` has no branch that can return `ready`. | `a663882` | `features/tabs/useTabData.ts` L36–48, L173; copy pinned by `tests/features/tab-refusal-copy.test.ts` |

Also fixed in the same window, and worth knowing about: a hardcoded 32 THB/USD lock rate replaced with the real Frankfurter Bank-of-Thailand series, extracted from the raw response **by regex** because `JSON.parse` would coerce the rate to a double before anyone saw it, kept as an exact integer rational and rounded upward so the recipient is never short; a Privy wallet resolver returning a fixture address even with credentials present; a co-sign returning a fabricated signature; and a Tip Composer double-submit guard that minted a fresh idempotency key on every press, so server idempotency could not distinguish a double-tap from two deliberate tips.

**Why it changed:** two recurring patterns, and they are the two things to look for in any new code here.
1. **Silent degradation** — see D-11.
2. **A check that reads as a check.** `void x`, `.find()`, `>=`, "these two arguments agree", "the caller told us the accounts were resolved". Every one of these passed review because the *shape* of a verification was present. Verify against a stored row or a chain read, or you have verified nothing.

**Consequences:** every change to the validation gate so far has tightened it; none has relaxed it. Do not weaken it to make a flow pass. `INVITE-FLOW.md` §9.11 lists B1–B9 as ingress-path mainnet blockers; B1 and B4 are H7 and H9 above, B6 (`convex/demo.ts`) is deleted under D-11, and the rest remain open work.

**Status:** binding · implements PRD FR-S6 and AD-10 as written; supersedes nothing.

---

## D-19 · `NEXT_PUBLIC_CONVEX_SITE_URL` is derived, never configured

**Originally:** a repository audit concluded the variable was missing from Vercel and that `useTelegramBootstrap` therefore silently no-ops in production, and recommended adding it.

**Now:** it does not exist and must not be added. `getConvexSiteUrl()` derives the `.site` host from `NEXT_PUBLIC_CONVEX_URL`, which `convex deploy --cmd` injects at build time.

**Why it changed:** the audit's conclusion was checked against the live production deployment and was wrong. All 15 client chunks were downloaded; `NEXT_PUBLIC_CONVEX_URL` is present and correctly injected; the derived `.site` endpoint answers 401 — router live, auth enforced. Bootstrap works. **The recommended fix would have created a second source of truth that can drift from the first** — and the copy already sitting in `.env.local` points at the *dev* deployment while the app runs against prod, which is precisely the drift the derivation prevents. No application code reads the variable; only the local `scripts/setup-telegram.mjs` does.

**Consequences:** comments were added at both places someone would look before reaching the same wrong conclusion. This entry is the third.

**Status:** binding · recorded in commit `0b91f1f` and `docs/MAINNET-CUTOVER.md` §1.

---

## D-20 · Astryx is a theme layer, not the component system

**Originally:** AD-20 and `docs/project-context.md` rule 10 — *"Astryx is the only component system. No shadcn/ui."* `EXPERIENCE.md` §Foundation — *"Astryx supplies controls, cards, forms, sheets, avatars, progress, badges, skeletons, and empty states; this spine specifies only the behavioral delta. **Five components are custom** because no system ships them: `claim-row`, `sticky-claim-footer`, `payment-sheet`, `settlement-stepper`, `all-square-card`."*

**Now, as observed in the tree:** `@astryxdesign/*` is imported in exactly four places — `app/layout.tsx` (the stylesheet), `components/theme/MyTabThemeProvider.tsx` (`Theme`), and `lib/theme/myTabTheme.ts` (`defineTheme`, `neutralTheme`). Every UI primitive the product uses is custom: `components/primitives/` alone contains `amount-pair`, `disclosure-row`, `empty-state`, `error-state`, `list-card`, `list-row`, `notice-bar`, `participant-chip`, `skeleton`, `visually-hidden` and more, on top of the five named custom components and `components/` directories for `balance-banner`, `breakdown-row`, `presence-stack`, `settlement-receipt`, `settlement-sheet`, `tab-card` and `brand`.

**Why it changed:** this is reported, not decided — I found no commit that argues it. The plausible reading is that `DESIGN.md`'s token system is specific enough (tabular numerals on every figure, a reserved amount column, 44px floors, a named elevation scale, one gradient in the whole system) that theming a general-purpose component library to it costs more than writing the primitive. The prohibition that AD-20 was actually protecting — **do not add a second component system, and specifically not shadcn/ui** — is intact and should stay.

**Consequences:**
- The AD-20 prohibition still binds: no shadcn/ui, no second component library, and do not add `@stylexjs/babel-plugin` to the App Router app (it disables SWC and breaks `next/font`).
- `EXPERIENCE.md`'s "five components are custom" is a count to ignore, not a budget to enforce. Do not delete a custom primitive because it is not on that list.
- **Unproven:** whether Astryx should remain a dependency at all. That is a real question and nobody has answered it. See Unresolved U-4.

**Status:** binding as a description of the tree · supersedes `EXPERIENCE.md` §Foundation's component-ownership sentence · does **not** supersede AD-20's prohibition.

---

## D-21 · External wallets are the primary door

**Originally:** PRD **FR-A1** — *"Privy is the canonical authentication provider; Telegram seamless login is enabled so the Mini App authenticates with zero clicks inside Telegram."* PRD **FR-W1** — *"One Privy embedded Solana wallet is created or restored on first successful login."* `lib/privy/config.ts` L32 — *"No external wallet connectors in P0 (FR-A1, FR-W1)."* `createOnLogin: "users-without-wallets"` provisions an embedded wallet the first time someone opens the Mini App. `PRODUCT.md` principle 6 and `EXPERIENCE.md` §Foundation: there is no login screen, no "connect wallet", and no wallet-selection step inside Telegram. The user arrives already authenticated with a wallet that already exists.

**Now:** **Connect Phantom / Solflare / Backpack first.** A Privy embedded wallet is created only for a payer who has none, or who chooses "Use a My Tab wallet." Telegram login still authenticates *identity*. It no longer silently provisions a wallet.

**Why it changed:** FR-W1 bought zero-click settlement for the Andre persona — someone who *"has never owned a crypto wallet, and does not intend to start now"* (`PRODUCT.md` §Users). That persona is revised (D-26). Creating an embedded wallet for someone who already holds Phantom is the wallet-app anti-pattern in reverse: a second wallet they did not ask for, funded from nowhere, that they will not use. The product settles on Solana mainnet through DFlow. The people who arrive already have wallets. Embedded remains the fallback so someone without one is not blocked (D-27).

**Consequences:**
- `wallets.privyWalletId` is required today (`convex/schema.ts` L28). An external wallet has no Privy wallet id. The field becomes optional, or the row becomes a discriminated shape — `{ kind: "embedded", privyWalletId }` versus `{ kind: "external", provider }`. `isEmbedded` already exists at L30; the table was built expecting this.
- **`linkExternalWallet` requires a signed challenge verified in Convex. It never accepts a wallet address as a request argument.** `syncEmbeddedWallet` is safe only because Privy vouches server-side; an external address has no voucher. Accepting one is the exact pattern that shipped hole H7 (D-18): *two request arguments agreeing with each other is not an authorization check.* An unproven link would let anyone name someone else's address as their own.
- A second, client-signed path enters the transaction validation gate. It faces the **identical** rule set. The gate is never weakened to let the external path pass — the path is constrained to what the gate already accepts. Every change to the gate so far has tightened it; keep that record.
- Sponsored fees survive (D-04). The sponsor is `account[0]` and pays the fee regardless. An external wallet signs as a second signer. Nobody sees a network fee either way.
- `createPrivyConfig` must admit external connectors. `createOnLogin` fires only when the person chooses the My Tab wallet, not on every first launch.
- FR-A1's identity half — Telegram seamless login, Privy as the identity provider — holds. FR-W1's "one embedded wallet on first login" does not.

**Status:** binding · supersedes FR-W1 and the "no external wallet connectors" sentence in `lib/privy/config.ts`. Scopes FR-A1 to identity, not wallet provisioning. Forces D-25's connect gate. Recorded from the 2026-08-22 planning session (`docs/FLOWS.md`).

---

## D-22 · DFlow gets a screen

**Originally:** D-03 — *"The mechanism does not get a screen. `DESIGN.md` and `EXPERIENCE.md` remain the authority on this and are unamended: no route diagram, no price-impact warning, no slippage slider, no token logos as navigation, no 'swap' in copy. Mechanism lives behind the single collapsed disclosure row on the payment sheet."* `DESIGN.md` §Components, `token-chip`: **"No token logos."** Jupiter attribution (`JUPITER_ATTRIBUTION = "Powered by Jupiter"`) was contractual and unrendered — Unresolved U-1.

**Now:** **DFlow gets a screen.** A token picker with balances, a live quote, and price protection stated plainly. Logos, an `isVerified === true` badge, and `Powered by Jupiter` as a picker footer. The one *guaranteed* figure remains "Maya receives at least 8.25 USDC" — `otherAmountThreshold` (D-08), never `outAmount`.

**Why it changed:** D-03's "no screen" was written when DFlow was a proof point for one token. D-05 opened any token the payer holds, and D-09 made "what is this token" a live question with Jupiter metadata. Without a picker a payer cannot choose among holdings, cannot see a balance, and cannot see the guarantee. The original fear was a swap UI — a route diagram, a slippage slider, the word *swap*. The screen is not that. It is the payment sheet grown into a chooser. The banned-copy list applies at full force: say **price protection**, never *swap*, *route*, *execute*, *slippage*.

**Consequences:**
- Token logos ship on the picker. `DESIGN.md` §Components `token-chip` *"No token logos"* is superseded for this surface.
- `Powered by Jupiter` ships as a footer on the picker — an **approved exception** to the banned-copy list for a contractual string, not a licence to use "powered by" anywhere else. U-1 is resolved.
- The quote shown as a guarantee is `otherAmountThreshold` only. `outAmount` is an estimate in DFlow's own documentation; if it appears at all it is labelled as one.
- Post-payment detail may show what actually routed. That is a receipt, not a route diagram.
- The rest of D-03's anti-swap-UI position is unamended: no slippage slider, no price-impact warning, no route diagram, no banned words.

**Status:** binding · amends D-03's "the mechanism does not get a screen" sentence. Supersedes `DESIGN.md` §Components `token-chip` "No token logos" on the picker. Resolves U-1. Recorded from the 2026-08-22 planning session (`docs/FLOWS.md`).

---

## D-23 · Quantity-aware claiming — *k*-of-*n*

**Originally:** `PRODUCT.md` principle 4 — *"Claiming is additive, never exclusive. Two people tapping the same dish get 'Split 2 ways', not a conflict dialog."* `EXPERIENCE.md` §The Claim Board: a tap toggles the viewer's own claim on the whole line; a second person joining produces an equal split. Receipt parse already stores an integer `quantity` on the line (`lib/domain/receiptParse.ts`, `lib/domain/bill.ts` `assertItemQuantity`), and `lib/domain/allocation.ts` already has a `quantity` mode. The board does not expose it. A qty-3 line is claimed as one atomic row.

**Now:** **An item with quantity *n* can be claimed *k*-of-*n*.** Equal split among claimers remains the default for a shared *unit*. Principle 4 is extended, not replaced: two people tapping the same beer still share that beer; they do not automatically split the whole round.

**Why it changed:** *"We ordered three beers, I had two"* is a real dinner and the current board cannot say it. Equal-splitting a qty-3 line among two people produces one-and-a-half beers each, which is not what happened. The allocation math already knows how to weight by integer quantity. The gap is the surface, not the arithmetic.

**Consequences:**
- Allocation math stays in `lib/domain/` as pure functions with unit tests. It never imports Convex and never performs I/O.
- D-29 refines this: counts are integer only.
- The remainder surface stays at zero — that is the point of integer *k*-of-*n*, not a hope.

**Status:** binding · extends `PRODUCT.md` principle 4 and `EXPERIENCE.md` §The Claim Board. Does not replace additive claiming. Recorded from the 2026-08-22 planning session (`docs/FLOWS.md`).

---

## D-24 · QR is a third admission door, through the same seat check

**Originally:** `INVITE-FLOW.md` §1.5 — two doors write identical `tabParticipants` rows: `origin: "chat"` bounded by the Telegram chat, `origin: "personal"` bounded by a seat count. No third carrier. The invite is a link the organizer sends through Telegram's share sheet (D-10).

**Now:** **A QR code is a third admission door.** It carries the same `tab_session` token and faces the same seat check as the link. Same token, different carrier — no second admission path.

**Why it changed:** the person sitting across the table should not need a forwarded message. A QR is the invite door pointed at a camera. A second admission path would be a second authorization path, and that is how holes get shipped (D-18).

**Consequences:**
- One token type, one roster write, one refusal matrix. `LINK_NOT_FOUND` / `LINK_EXPIRED` / `LINK_REVOKED` / `TAB_FULL` / `NOT_GROUP_MEMBER` apply identically whether the token arrived in a URL or in a QR payload.
- `INVITE-FLOW.md` §1.5 must absorb the QR as a carrier, not as a new door with its own rules.
- The invite door itself is still unbuilt (D-06 implementation status). QR cannot ship before the door it rides on.

**Status:** binding · new. Does not supersede D-06; it adds a carrier to the invite door D-06 already specified. Recorded from the 2026-08-22 planning session (`docs/FLOWS.md`).

---

## D-25 · Launch is an explicit connect gate

**Originally:** `PRODUCT.md` principle 6 — *"Authentication is invisible, and so is admission. No login screen, no 'connect wallet', no wallet selection inside Telegram — and no onboarding chore before a first tab."* `EXPERIENCE.md` §Foundation, same words, citing FR-A1 / FR-W1. Launch (`Authenticating`) is the wordmark, an indeterminate indicator, and "Getting your tab ready…" — no buttons, no login affordance, no elapsed timer.

**Now:** **Launch is an explicit connect gate.** The app loads. A first-timer sees the first-run screen (photograph, one sentence — D-13), then chooses: connect your own wallet, or use a My Tab wallet. A returning person whose wallet is already linked passes straight through. Declining is allowed (D-27).

**Why it changed:** D-21 requires a choice that principle 6 forbade showing. Invisible auth still applies to *Telegram identity* — `initData` verifies, Privy resolves, there is no login form. The new screen is wallet *provenance*, not identity. Showing it to a returning person would be the onboarding chore principle 6 was right to ban.

**Consequences:**
- First-run and the connect screen carry no figure, so they sit inside D-13's photographic rule.
- The load is honest work: verify `initData`, resolve identity, read the roster, read balances. It is not a delay inserted to feel substantial, and it must never become one.
- A returning person sees no prompt and no screen. Anything else is a regression of principle 6's still-binding half.

**Status:** binding · supersedes `PRODUCT.md` principle 6 and `EXPERIENCE.md` §Foundation's "no connect wallet / no wallet selection" sentences. Does **not** supersede invisible Telegram identity, and does not supersede "Start a tab always works, from anywhere." Recorded from the 2026-08-22 planning session (`docs/FLOWS.md`).

---

## D-26 · The audience is crypto-native

**Originally:** `PRODUCT.md` §Users — *"**Andre**, 28 — in the group, has never owned a crypto wallet, and does not intend to start now. He is the participant: taps a link, taps his dishes, taps pay."* `EXPERIENCE.md` Flow 2 is titled *"Andre joins and claims (same table, 8% battery, no idea what Solana is)"* and climaxes on *"Andre has never once been asked to install, connect, fund, or understand anything."* `PRODUCT.md` §The job — *"settle a shared bill without an argument and without anyone installing anything."*

**Now:** **The audience is crypto-native.** People arriving here know what a wallet is. Privy is the fallback for someone who has none, not the default for someone who has never held one.

**Why it changed:** the product settles on Solana mainnet through DFlow, in whatever token the payer holds (D-05). The Andre who has never held a wallet and will not start is who justified invisible embedded-only auth (FR-A1 / FR-W1) and made every connect surface a defect. That person is not who arrives at a Telegram Mini App that pays in tokens. Designing for them produced a product that creates a wallet for someone who already has one (the D-21 defect) and hides the token choice that D-05 opened (the D-22 defect).

**Consequences:**
- The Andre persona in `PRODUCT.md` §Users is revised. He still claims at the table with 8% battery; he is no longer someone who has never heard of a wallet.
- *"Without anyone installing anything"* still holds for claiming (D-27). It does not hold for settlement in an external wallet the person already installed.
- This does not make the product a wallet app. The anti-references in `PRODUCT.md` — balance-first home, token list as navigation, portfolio chrome — still bind. D-22's picker lives on the payment sheet, not on Tabs.

**Status:** binding · revises `PRODUCT.md` §Users (Andre) and `EXPERIENCE.md` Flow 2's premise. Recorded from the 2026-08-22 planning session (`docs/FLOWS.md`).

---

## D-27 · A wallet is not required to participate

**Originally:** FR-W1 created an embedded wallet on first login, so everyone who reached the board already had one. `EXPERIENCE.md` §Foundation assumed *"the user arrives already authenticated with a wallet that already exists."* A wallet-less participant was not a representable state.

**Now:** **Browse the bill, claim your items, be part of the tab with no wallet at all.** The gate is at payment, not at the board. D-25's connect screen is a prompt, not a wall.

**Why it changed:** forcing a wallet to claim recreates the four-step onboarding D-06 deleted, just with a different door. The board is a social document — several hands marking one shared tab. Money is a later act. A person who skipped connect, or whose wallet app failed to return, must still be able to say "the green curry is mine."

**Consequences:**
- Pay is where a wallet is required. A wallet-less participant reaching `/pay/:intentId` is sent to connect, not shown a broken sheet.
- The recipient still needs a wallet before lock — `RECIPIENT_WALLET_REQUIRED` already exists and is unchanged. Someone has to be able to receive.
- The skip path in `docs/FLOWS.md` Map B is load-bearing, not a convenience. Removing it re-litigates this entry.

**Status:** binding · qualifies D-25. Does not weaken D-21: the primary door is still an external wallet, when the person is ready to pay. Recorded from the 2026-08-22 planning session (`docs/FLOWS.md`).

---

## D-28 · Wallet support: wallet-standard first, three named

**Originally:** no external wallets. `lib/privy/config.ts` L32 forbade connectors in P0. Nothing in the tree speaks wallet-standard, Mobile Wallet Adapter, or a named Phantom / Solflare / Backpack integration.

**Now:** **Wallet-standard first, three named.** Phantom, Solflare and Backpack are first-class. Anything else that speaks the standard is admitted.

**Why it changed:** naming three is product; speaking the standard is the admission rule, so a fourth wallet is not a feature request. The three are first-class because they are what the audience (D-26) actually holds, and because on iOS the practical path may be per-wallet universal links rather than a generic standard — Mobile Wallet Adapter is Android-oriented. If that holds, the three named wallets are load-bearing on iOS, not a convenience layer. **That is unverified. Verify it before trusting the Phase 2 estimate in `docs/FLOWS.md`.**

**Consequences:**
- Do not build a curated allowlist that rejects an unknown standard wallet.
- Do not treat "wallet-standard" as a solved iOS problem until it has been checked on a real device.
- Linking still requires the D-21 signed challenge. Detecting a wallet is not proving ownership of it.

**Status:** binding · new, forced by D-21. Open question on iOS remains open — do not resolve it silently. Recorded from the 2026-08-22 planning session (`docs/FLOWS.md`).

---

## D-29 · *k*-of-*n* is integer only

**Originally:** `lib/domain/allocation.ts` already has `percentage` and `fixed` modes, and a `quantity` mode that takes an integer weight. The claim board exposes none of them. A shared line is equal-split (weight 1 per claimant) and largest-remainder hands leftover satang to the first participant in a stable sort.

**Now:** **Counts either sum to *n* or the board shows the shortfall.** No fractional shares, ever. That is what keeps the remainder surface at zero.

**Why it changed:** fractional shares — "I had one and a half beers" — reintroduce the remainder problem the equal-split + largest-remainder design already solved at the satang level, and they do it in units a dinner table does not speak. Integer *k*-of-*n* maps onto the existing `quantity` mode. Percentage and fixed remain available to the allocator for tax, service, discount and tip. They are not a claim-board control.

**Consequences:**
- The board shows "1 of 3 claimed", never "50%" and never 1.5.
- If claimed counts sum to less than *n*, the shortfall is visible and lock still refuses `UNASSIGNED_ITEMS`.
- If they would sum to more than *n*, the write is refused. Two people cannot each take 2 of 3.
- Math stays in `lib/domain/`. No Convex import, no I/O, unit tests for every shortfall and overflow.

**Status:** binding · refines D-23. Recorded from the 2026-08-22 planning session (`docs/FLOWS.md`).

---

## D-30 · `unknown` intents get both halves

**Originally:** `docs/MAINNET-CUTOVER.md` §7, copied into Unresolved U-5 — *"No operator surface for a finalized-but-mismatched transaction. If a transaction finalizes successfully but fails one of the eight confirmation checks, the intent stays `unknown` and polling stops — correct, because `failed` would tell the payer nothing happened while their money is gone. It needs a reconciliation-incident table and an alert. **This is the one gap I would close before real money.**"* Intent states are `submitted · unknown · confirmed · failed · expired` (`convex/schema.ts` L158–162). Confirmation moves the ledger, not submission (AD-11).

**Now:** **`unknown` intents get both halves:** a payer-facing held state, and an operator resolution surface. Implemented 2026-08-23. The display layer maps `unknown` → `held` (never `submitted`, never `failed`); Payment Progress and Payment Sheet keep the last figure at 40% opacity. `reconciliationIncidents` is written when polling stops on a finalized-but-mismatched observation. Operators read the list through `internal.reconciliation.listIncidentsInternal` or `GET /reconciliation` on the Convex `.site` host with `OPERATOR_RECONCILIATION_SECRET`. The public query always 403s. It does not block a demo. It blocks a cutover until the secret is set.

**Why it changed:** `failed` is a lie when the money moved. Silence is the other lie — polling stops and the payer stares at a spinner that will never resolve. A payer-only message without an operator path strands the money. An operator-only path leaves the person who paid with no words. Both halves, or the gap is not closed.

**Consequences:**
- A payer whose intent is `unknown` sees a held state that keeps the last known figure at 40% opacity (the stale-figure rule). It never becomes a dash, it is never blanked, and it is never labelled `failed`.
- An operator surface — a reconciliation-incident table and an alert — is required before real funds move. `docs/MAINNET-CUTOVER.md` §7's "one gap" sentence is the work item this entry governs.
- Partial payment remains a separate U-5 item. This entry does not make a confirmed chain payment mean anything other than a full clear.

**Status:** binding · decides and implements U-5's unknown-intent half. Recorded from the 2026-08-22 planning session (`docs/FLOWS.md`); landed 2026-08-23.

---

## D-31 · Generated imagery is a photo header on the tab status card

**Originally:** D-13 — a photograph is permitted on Launch and first run, and nowhere else, because those are the two screens with no money on them. The five Telegram posting events (`lib/telegram/messages.ts` L20–35) render as **one status card edited in place**. Inline keyboard buttons are typed `{ text: string; url: string }` (`lib/telegram/api.ts` L217) — text and emoji, nothing else. That is the Bot API's shape, not a repo limitation. The Menu button takes no custom icon either.

**Now:** **Generated imagery lives in three places, and buttons get none.** (1) A photo header on the tab status card, sent with `sendPhoto` and a caption. (2) The bot's avatar. (3) Launch and first run in the Mini App, already permitted by D-13. One image per tab, chosen at `tab_opened`, because the card is edited in place through `bill_ready`, `payment_confirmed` and `bill_completed`.

**Why it changed:** no amount of image generation puts a picture on a Telegram button. The obvious place — the **Open tab** button, the Menu button — cannot carry one. A photo header is the remaining chat surface that can. Re-generating per card state would mean deleting and re-posting, which breaks the one-card-per-dinner property that keeps a group chat clean.

**Consequences:**
- The delivery path switches from `editMessageText` to `editMessageCaption` (`convex/internal/telegramDelivery.ts` L184, L192). The caption cap drops from 4096 characters to 1024. Every card renderer must fit.
- The generation key is a **server secret** in Convex env. Never `NEXT_PUBLIC_`, never a committed file. Ask the owner for it; do not go looking in the transcript or the tree.
- D-13's Mini App rule is unchanged: no photograph on any Mini App surface carrying an amount. A chat card is outside that rule. The same reasoning still applies — keep the image atmospheric, never let it sit behind a number.
- **What the image depicts is not decided.** Derived from tab name and merchant, or one house style repeated. Do not resolve that silently.

**Status:** binding · new. Does not amend D-13's Mini App photography rule. Recorded from the 2026-08-22 planning session (`docs/FLOWS.md`).

---

## D-32 · Receipt extraction goes through Vercel AI Gateway

**Originally:** AD-18 / OQ-3 — the `receiptExtraction` adapter calls the **OpenAI Responses API** with image input and a strict schema from a Convex Node action; `OPENAI_API_KEY` is Convex-only. The vision-capable model ID is pinned after the Thai/English fixture evaluation. [convex/internal/receiptExtraction.ts](../convex/internal/receiptExtraction.ts) is still a placeholder; [convex/lib/receiptExtraction.ts](../convex/lib/receiptExtraction.ts) is fixture-only.

**Now:** extraction still runs in a Convex Node action with image in, strict JSON out, organizer confirm, and every amount re-parsed to integer minor units in `lib/domain/receiptParse.ts`. The HTTP target is **Vercel AI Gateway** (`https://ai-gateway.vercel.sh/v1`), OpenAI Responses-compatible, not `api.openai.com` directly. The secret is `AI_GATEWAY_API_KEY` in Convex env only. The first-candidate model is `google/gemini-2.0-flash`; if Thai/English restaurant fixtures fail, fall back to `openai/gpt-4o-mini`. The model ID is pinned only after that fixture rerun.

**Why it changed:** a raw OpenAI key locks the product to one vendor's list price and one model family. The gateway charges **no markup** on tokens, speaks the same Responses API AD-18 already specified, and lets the cheapest vision model that passes the fixtures win. Self-hosting PaddleOCR or Donut would be a second backend (AD-2): Python/GPU, always-on cost, and — for Paddle — text boxes rather than line items. CORD's field *shape* (`name`, integer `quantity`, `unitPriceRaw`, optional `merchant`) is borrowed; the models are not vendored.

**Consequences:**
- Convex calls `https://ai-gateway.vercel.sh/v1` with `fetch`. Do not add an `openai` or `ai` SDK unless `fetch` is shown to be insufficient.
- `AI_GATEWAY_API_KEY` is Convex-only (AD-19). Never `NEXT_PUBLIC_`. Never duplicated onto Vercel "because the gateway is a Vercel product" — extraction is a Convex action (AD-1).
- `ai-gateway.vercel.sh` is on the preview egress block list next to `api.openai.com`. Preview never burns credits on a real scan.
- Missing key is a hard fail, never permission to run `runFixtureExtraction` on a deployment (D-11).
- Copy stays **Scan receipt**. Never AI, magic, or sparkle.
- A provider or model change still requires an architecture decision plus a Thai/English fixture rerun (AD-18, unchanged).

**Status:** binding · amends AD-18 and OQ-3 on the *transport and billing path only*. Advisory-input, integer re-parse, organizer confirm, and Convex-only secret placement are unchanged. Recorded 2026-08-22.

---

## Unresolved

Listed rather than invented. Do not resolve one of these silently.

**U-1 · Jupiter attribution vs. the banned-copy list and the token-logo ban. · resolved 2026-08-22**
Token logos ship on the D-22 picker. `Powered by Jupiter` ships as a footer on that picker — an approved exception to the banned-copy list for a contractual string, not a licence to use "powered by" anywhere else. See D-22. The collision is no longer latent; do not re-open it by adding logos or the string to a second surface.

**U-2 · Amendment 2b — is bot-administrator status actually required for `getChatMember`?**
`INVITE-FLOW.md` §9.1 proposes demoting administrator status to *recommended* on the strength of the Bot API documenting `getChatMember` as available to any member bot, with admin rights needed only for `chat_member` push updates. **This has not been tested against a real production supergroup**, and hidden-member and privacy configurations are the risk. Until it is, group-origin tabs keep the administrator requirement. Nothing depends on the outcome.

**U-3 · `npm run sweep` is the fifth gate and is not in CI.**
`.github/workflows/ci.yml` runs typecheck, test, build and smoke. Sweep — the only check that can see an inert sticky element or a truncated amount (D-14) — runs locally or not at all. Either add it to CI or accept that layout regressions ship.

**U-4 · Should Astryx remain a dependency?**
See D-20. Four import sites, two packages, and the component system it was chosen to provide is not being used. No decision has been made either way and none should be made incidentally.

**U-5 · The known gaps at cutover are still gaps.**
`docs/MAINNET-CUTOVER.md` §7 lists them and remains accurate as a *work* list. D-30's unknown-intent half is implemented (payer-facing held state + `reconciliationIncidents`). Still open as work, and still undecided as design: partial payment is not representable; `obligations.displayAmountThbMinor` is THB-named while holding any currency; `obligationLedgerEvents.obligationId` is typed `v.string()` so nothing at the schema level prevents a dangling reference; `USDC_DECIMALS = 6` is defined in two places; and the Thai bank-holiday table expires 2027-01-01. Set `OPERATOR_RECONCILIATION_SECRET` in Convex env before real funds move.

**U-6 · `INVITE-FLOW.md` §9.11 items B2, B3, B7, B8, B9 remain open.**
B1 and B4 are closed (D-18 H7, H9). B5 is closed: `TabDeepLinkSurface` no longer has a fixture branch. B6 is deleted (D-11). B7 is closed: organizer is inserted into `tabParticipants` at creation on both doors. B8 is closed: `publishTabOpenedCard` reuses `deepLinkToken`. B9 is closed: `revokeToken` has callers on the invite sheet and You (U-9); `consumeToken` remains for single-use action tokens. Remaining: the fixture webhook secret and the fixture bot username.

**U-7 · Nothing has run against a live cluster.**
Repeated because it is the single most load-bearing caveat in this file. Every claim above about DFlow behaviour comes from live probes of the quote API; every claim about settlement comes from unit tests with injected transports. `docs/MAINNET-CUTOVER.md` §5 and §6 are the sequences that would change that, and neither has been executed.

**U-8 · What the tab-card image depicts.**
D-31 settles where generated imagery goes (photo header on the status card, plus the bot avatar, plus D-13's two Mini App screens). It does not settle what the image shows: derived from tab name and merchant, or one house style repeated. Delivery plumbing (`sendPhoto` / `editMessageCaption`, 1024-character caption, optional `photoFileId`) is in the tree and stays idle until this is decided. Do not pick one to generate a photo without an owner decision.

**U-9 · Where an organizer revokes a leaked link. · resolved 2026-08-22**
Revoke from the **invite sheet** (next to Share + QR) **and** from a live-links list under **You**. Organizer-on-roster only; a stranger still gets 403, not 404-with-detail. `revokeToken` is the one mutation; do not invent a second revoke API. `consumeToken` stays for single-use action tokens.

**U-10 · Wallet-standard on iOS. · documented 2026-08-22; device unproven**
Solana Mobile's own docs state MWA is **unsupported on all iOS surfaces** (app and browser) because iOS suspends backgrounded apps and kills the local-socket session MWA needs. Safari Web Extensions can expose wallet-standard *inside Safari*; a Telegram Mini App is a WebView, so those extensions do not apply. **Consequence for Phase 2:** wallet-standard first where it exists (desktop, Android Chrome); on iOS, Phantom / Solflare / Backpack **universal links are load-bearing**, not a convenience layer (D-28). Do not invent a fourth named wallet. Return-to-Telegram after a universal-link sign has **not** been proven on a physical iPhone — that remaining check is still required before calling the iOS path done.
