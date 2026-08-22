# Implementation Readiness Handoff

> ## ⚠ Superseded in part — read `docs/DECISIONS.md` first
>
> This handoff describes the Day 0 gate, which has been passed; broad feature implementation
> happened. Item **4** (*"The bot must be an administrator in supported groups"*) is scoped to
> group-origin tabs (**D-06**). Item **6** (*"SOL is the one non-USDC P0 DFlow input"*) is
> superseded — any token the payer holds, subject to verification (**D-05**); the sync-only
> rule stands and `allowAsyncExec=false` must be asserted present in the serialised query
> (**D-04**). Item **8** stands, amended for photography and the all-square wash (**D-13**,
> **D-16**). The cluster is mainnet (**D-01**) and no fixture data ships (**D-11**).


Status: **ready to begin the Day 0 implementation gate; broad feature implementation remains gated on that proof**.

This handoff preserves the complete eight-epic, seventy-story product. The pre-implementation review changed sequencing and strengthened contracts; it did not reduce the intended product.

## Accepted architecture decisions

1. Convex remains the sole owner of product truth and ledger state.
2. Telegram uses one Convex HTTP Action ingress. It verifies the Telegram webhook secret, validates supported input, persists idempotency by update ID, and invokes internal Convex functions. There is no parallel live Vercel webhook.
3. Mini App `initData` is validated server-side with Telegram's signed data contract and freshness checks. Browser claims are never identity evidence.
4. The bot must be an administrator in supported groups. Membership is bootstrapped and refreshed through verified launch context, `chat_member` updates, and server-side `getChatMember` checks before privileged actions.
5. Authenticated mutations are Telegram-context-bound. Outside Telegram, the P0 fallback is read-only unless a later story introduces an explicitly reviewed alternate authentication flow.
6. SOL is the one non-USDC P0 DFlow input. DFlow execution is synchronous only; asynchronous responses are rejected.
7. The complete feature set remains scheduled. The Day 0 gate and story dependencies limit unsafe parallelism, not product scope.
8. The final cool-paper `DESIGN.md` palette and Instrument Sans type system are authoritative.
9. Waivers and manual cash settlements remain supported through authorized immutable offset events with audit history.
10. AD-24 resource budgets protect tab creation, receipt upload/extraction, and provider calls without removing any feature. Quotas reserve atomically; invalid receipt blobs are deleted; operational pauses preserve reads and manual entry.
11. Receipt extraction uses the OpenAI Responses API through a Convex-only adapter and key. The exact vision-capable model is pinned by the Thai/English fixture evaluation before the story is accepted.

## Non-negotiable implementation gates

### Identity and ingress

- Prove real Privy JWT → Convex authentication in a deployed environment.
- Verify Telegram launch-data signature and freshness.
- Prove Privy DID ↔ Telegram user binding cannot be selected by the browser.
- Prove silent shared-link participants can establish current group membership without trusting forwarded-link claims.
- Exercise unauthenticated, wrong-user, wrong-group, expired-session, revoked-session, and stale-membership cases.

### Settlement safety

- Persist a server-owned intent before any provider call.
- Enforce one nonterminal intent per obligation or tip.
- Resolve versioned transactions and address lookup tables before semantic validation.
- Enforce the exact signer set, fee payer, recipient, mints, programs, instructions, writable accounts, maximum input, minimum output, priority fee, compute budget, and ATA-creation policy at both validation gates.
- Reject any DFlow response whose `executionMode` is not `sync`.
- Never turn an unobserved submitted signature into a retriable terminal failure. Reconcile persisted `unknown` intents until confirmation or provable blockhash expiry.
- Apply ledger changes only after parsed chain confirmation, exactly once.
- Reopening is forbidden while any prior-revision intent may still land. Superseded immutable obligations are offset by explicit reversal events rather than overwritten.

### Sponsorship

- Store cap values and reset windows as reviewed configuration.
- Atomically reserve sponsorship budget before signing; settle or release reservations only through defined terminal transitions.
- Recheck the emergency pause immediately before sponsor signing and broadcast.
- Keep development, preview, and production sponsor wallets isolated and minimally funded.

### Accounting

- Use integer fiat minor units and crypto atomic units exclusively.
- Persist the complete FX snapshot as an integer rational rate, direction, source, timestamp, and freshness policy.
- Use deterministic rounding and largest-remainder allocation where required.
- Keep bill completion separate from group net-zero.
- Represent waivers and manual cash as authorized append-only offset events.

### Privacy and external effects

- Serve receipt bytes only through an authenticated authorization check; do not treat a reusable bearer URL as short-lived.
- Enforce concrete abandoned and completed receipt-retention deadlines.
- Preview and test environments must fail closed against real Telegram egress and sponsor spending.
- Structured logs must exclude credentials, access tokens, signed transactions, bot tokens, receipt contents, and wallet private material.
- Enforce AD-24 upload validation, active-object limits, provider budgets, concurrency caps, and global pauses before any resource-consuming side effect.
- Enforce the AD-24 ticket/lease lifecycle: ten-minute one-use upload tickets, orphan cleanup, explicit active states, provider-attempt settlement, heartbeat/timeout recovery, and terminal release paths.

## Required verification before each story can be called done

- Unit tests cover pure integer-money and allocation boundaries, including negative inputs, overflow, zero denominators, rounding ties, and adjustment precedence.
- Authorization tests exercise unauthenticated, wrong-scope, and correct-scope access for every public Convex function.
- Transaction-validator tests independently construct pre-hash violations for every semantic predicate; changing the stored message hash is not sufficient coverage.
- Confirmation-parser tests include wrong recipient account, wrong mint, insufficient recipient delta, excessive payer debit, unexpected fee, failed transaction, duplicate signature, late confirmation, and reorg/finality scenarios.
- Sponsorship tests cover every limit at `limit - 1`, `limit`, and `limit + 1`, plus concurrent reservation and pause races.
- Receipt tests use representative image fixtures through the real provider adapter in an isolated test environment.
- Abuse-control tests cover every AD-24 limit at `limit - 1`, `limit`, and `limit + 1`, concurrent reservations, rejected-blob deletion, retry-after behavior, and pause recovery.
- Preview-isolation tests prove both Telegram and sponsor egress are disabled.
- Accessibility, 320px viewport, keyboard-open, reduced-motion, missing-avatar, long-name, and offline/reconnect behaviors are tested against the UX contract.

## Development starting sequence

1. Create the Next.js/React/TypeScript/Convex scaffold and pin exact dependency versions.
2. Add environment validation with development, preview, and production separation.
3. Implement and pass all five deployed Day 0 checks.
4. Freeze the canonical schema, status enums, failure codes, security manifests, policy constants, and fixture dataset.
5. Proceed through the complete sprint backlog in dependency order, retaining every planned feature.
6. Before Epic 6 routing work proceeds, pass the separate deployed native-SOL→USDC DFlow sync/ALT gate defined by the architecture spine.

No application implementation was performed as part of this readiness pass.
