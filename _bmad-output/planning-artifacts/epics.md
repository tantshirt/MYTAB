---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
status: final
validated: '2026-08-21'
inputDocuments:
  - '_bmad-output/planning-artifacts/prds/prd-MYTAB-2026-08-21/prd.md'
  - '_bmad-output/planning-artifacts/architecture/architecture-MYTAB-2026-08-21/ARCHITECTURE-SPINE.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-MYTAB-2026-08-21/DESIGN.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-MYTAB-2026-08-21/EXPERIENCE.md'
---

# My Tab - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for My Tab, decomposing the requirements from the PRD, UX Design and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**FR-A — Authentication and identity (6)**

- **FR-A1** Privy is the canonical authentication provider; Telegram seamless login is enabled so the Mini App authenticates with zero clicks inside Telegram.
- **FR-A2** The Privy DID from the verified JWT is the external authentication subject. The Convex document `_id` is the internal foreign key. The Solana address is never a primary key.
- **FR-A3** Privy access tokens flow into `ConvexProviderWithAuth`; every public Convex function that exposes private data checks `ctx.auth.getUserIdentity()`.
- **FR-A4** Telegram identity is bound only after server-side validation of raw Telegram Mini App `initData`. `initDataUnsafe` is never trusted.
- **FR-A5** No browser-supplied Privy DID, Telegram ID, chat ID, wallet ID, or wallet address is ever trusted.
- **FR-A6** Opaque tokens are typed. A reusable `tab_session` token may be opened by multiple verified members until its TTL or revocation; a single-use `action_token` is consumed atomically and rejects reuse. Both map to server-owned scope in Convex and reject expired, revoked, wrong-group, or unauthorized use.

**FR-W — Users and wallets (4)**

- **FR-W1** One Privy embedded Solana wallet is created or restored on first successful login.
- **FR-W2** Convex stores the Privy wallet ID and Solana address only. No private keys, seed phrases, or exported material.
- **FR-W3** Exactly one default receiving wallet per user; embedded and external wallets are marked distinctly.
- **FR-W4** External Solana wallets are P1 only.

**FR-G — Groups (5)**

- **FR-G1** A My Tab group is created or resolved from the Telegram chat recorded by the bot webhook.
- **FR-G2** The group carries display name, avatar, member join state, role, and wallet readiness.
- **FR-G3** Group default currency and recipient asset are visible.
- **FR-G4** Multiple open tabs are supported; the UI optimizes for one active tab.
- **FR-G5** Telegram group membership is never inferred from client claims.

**FR-B — Bills (7)**

- **FR-B1** Create a draft bill with title, merchant, display currency, payer, recipient, and FX snapshot.
- **FR-B2** Add, edit, duplicate, and remove items while unlocked.
- **FR-B3** Add tax, service charge, discount, and group-tip adjustments (fixed or percentage).
- **FR-B4** The bill carries a monotonically increasing revision; every draft edit increments it.
- **FR-B5** The organizer must lock a revision before any settlement intent can exist.
- **FR-B6** Any revision change expires every quote created from an older revision.
- **FR-B7** Post-lock edits require an explicit reopen-and-recalculate action; a bill with a confirmed payment cannot silently return to open.

**FR-C — Item allocation / claim board (5)**

- **FR-C1** P0 allocation modes: one participant, or equal split across selected participants.
- **FR-C2** P1 allocation modes: quantity consumed, custom percentage, custom fixed amount.
- **FR-C3** Every claim mutation is atomic, authorized, revision-aware, and visible through Convex realtime subscriptions.
- **FR-C4** A participant can release their own allocation; the organizer can override any allocation.
- **FR-C5** Unassigned items surface a warning state and block lock until resolved.

**FR-M — Calculation and ledger (9)**

- **FR-M1** Fiat amounts are signed 64-bit integers in minor units. THB stores satang even when the UI shows whole baht.
- **FR-M2** Crypto amounts are atomic-unit integers carried as `bigint` or decimal string across JSON boundaries. Mint decimals are stored with every quote and settlement record.
- **FR-M3** JavaScript floating point is never used for persisted money.
- **FR-M4** Equal item split uses integer division plus largest-remainder allocation in stable participant order, preserving the exact item total.
- **FR-M5** Proportional tax, service charge, tip, and discount are computed per participant, floored, then remainders distributed by largest fractional remainder. Final allocated shares are persisted, not only the formula.
- **FR-M6** The lock invariant must hold or the server rejects the lock: `sum(item shares) + sum(tax) + sum(service) + sum(tip) - sum(discount) = locked bill total`.
- **FR-M7** Locking persists an immutable snapshot: revision, items, allocations, adjustment policy, FX, per-participant obligation, target settlement asset, recipient.
- **FR-M8** Obligations and settlements are immutable ledger events. An obligation is never overwritten to mark it paid; a settlement event offsets it.
- **FR-M9** Debt compression (P1) computes net positions and greedily matches debtors to creditors, guaranteeing at most `n - 1` transfers. It is not claimed to be the mathematical minimum.

**FR-L — Balances and activity (6)**

- **FR-L1** Show bill-level obligation and group net position in plain language: "You owe THB 291.74" / "You are owed 42.10 USDC" / "All square".
- **FR-L2** Persisted `quoting`, `ready_for_signature`, `user_signed`, `submitted`, `unknown`, `confirmed`, `failed`, `expired`, and `superseded` states have distinct sanctioned UI projections. Awaiting-wallet and verifying are UI stages, not persisted states. `unknown` is nonterminal and never enables replacement payment.
- **FR-L3** Confirmed debt is never reduced by a merely submitted transaction.
- **FR-L4** Every balance preserves a link back to its source bill.
- **FR-L5** Immutable activity events are emitted for claims, edits, locks, tips, payments, waivers, and manual cash settlement.
- **FR-L6** P0 derives balances across bills within one group. No cross-group netting.

**FR-T — Tipping (7)**

- **FR-T1** Direct tip to a verified group participant, with presets and a custom amount.
- **FR-T2** Optional message and reaction.
- **FR-T3** Round-up tip attachable to a bill payment.
- **FR-T4** Recipient receives USDC in P0; sender pays USDC or one allowlisted DFlow input token.
- **FR-T5** The recipient address comes from the Convex wallet record, never the request body.
- **FR-T6** After quote creation, the sender cannot alter recipient, amount, output mint, or sponsor.
- **FR-T7** The same intent cannot be paid twice; a failed or expired quote can be recreated without duplicating the tip record.

**FR-S — Settlement (10)**

- **FR-S1** A server-owned settlement intent is created before any transaction is requested.
- **FR-S2** The intent binds user, wallet, bill revision, obligation or tip, recipient, input mint, output mint, maximum input, minimum output, idempotency key, and expiry.
- **FR-S3** Exact USDC transfers are built in a Convex Node action with the Privy sponsor wallet as fee payer.
- **FR-S4** DFlow orders are requested in a Convex Node action with the sponsor address as `sponsor`, `sponsorExec=false`, `allowSyncExec=true`, `allowAsyncExec=false`, and the server-owned recipient as `destinationWallet`; any response whose `executionMode` is not `sync` is rejected before client exposure.
- **FR-S5** The serialized transaction is validated against the full checklist (FR-S6) and its message hash stored before any bytes reach the client.
- **FR-S6** Validation checklist, enforced before returning bytes and again immediately before sponsor co-signing: authenticated payer owns the intent - payer wallet matches the Privy record - fresh Telegram context/membership - intent belongs to the active locked revision - recipient matches the server-side record and is not the payer - mints match the immutable intent and allowlist - maximum input has not increased - minimum output meets the obligation - fee payer is the expected sponsor wallet - platform fee is zero and `feeAccount` absent - signer set is exactly payer plus sponsor and no destination signature is required - routed requests/responses satisfy every AD-10 sync/ALT predicate - versioned-message address lookup tables are fetched and resolved - programs, instruction discriminators, writable roles, compute budget, 250,000 priority-fee cap, one ATA/2,500,000 rent cap, and 3,000,000 total sponsor cap match `sponsor-v1` - blockhash and `lastValidBlockHeight` are valid - message hash matches stored hash - sponsor pause and an owned atomic reservation still pass - intent is exactly `ready_for_signature` or `user_signed` as appropriate.
- **FR-S7** The user signs through Privy without broadcasting; the partially signed bytes return to Convex for re-verification.
- **FR-S8** The Privy fee-payer wallet co-signs only intents that pass server policy; Convex broadcasts through the configured RPC.
- **FR-S9** The ledger changes only after parsed on-chain confirmation: transaction success, correct recipient token account, correct mint, recipient increase at or above target, payer debit within maximum input, platform fee exactly zero with no `feeAccount` for the judged build, signature not previously applied.
- **FR-S10** Duplicate payment, stale-revision payment, and concurrent payment are blocked. At most one nonterminal intent may exist per obligation or tip. A broadcast intent remains nonterminal through ambiguous RPC outcomes and cannot be replaced until chain evidence proves the blockhash expired and the signature is absent.

**FR-R — Receipt scan, P1 (7)**

- **FR-R1** Receipt images upload through Convex file storage; extraction runs in a Convex action against a strict schema.
- **FR-R2** Raw extraction, per-field confidence, reconciliation status, and model metadata are stored.
- **FR-R3** Every extracted amount is parsed to integer minor units and line totals recalculated deterministically before display.
- **FR-R4** Mismatches and low-confidence fields are flagged; organizer confirmation is required before bill items are created.
- **FR-R5** Model output never becomes a final obligation without deterministic recalculation.
- **FR-R6** A "Use sample receipt" path is available under demo mode; receipt failure never blocks the demo.
- **FR-R7** Target a tested Thai/English restaurant receipt subset (baht symbols, VAT and service-charge rows, whole-baht and two-decimal formats). Universal OCR is not promised.

**FR-N — Telegram integration (6)**

- **FR-N1** Commands: `/tab` (primary), `/splitbill` (alias), `/tip`, `/balance`.
- **FR-N2** The single Convex HTTP Action verifies `X-Telegram-Bot-Api-Secret-Token`, normalizes the update, invokes internal mutations, and returns fast.
- **FR-N3** Deep links carry only an opaque token: `https://t.me/<bot>/<miniapp>?startapp=<opaque-token>`. No database IDs, chat IDs, Telegram IDs, addresses, amounts, or recipients.
- **FR-N4** Bot posts only high-value events: tab opened, bill ready to settle, payment confirmed, bill completed, tip confirmed. Prefer editing one status message over flooding the group.
- **FR-N5** Telegram updates are idempotent by update ID.
- **FR-N6** Telegram-native affordances (safe areas, viewport events, back button, haptics, expanded mode) are used where they beat an in-app sheet.

### NonFunctional Requirements

- **NFR-1 Determinism.** Every money transition is recorded as durable Convex state before any external API call runs.
- **NFR-2 Idempotency.** Required for Telegram update handling, bill creation from a command, tip creation, settlement-intent creation, quote creation, submitted-transaction recording, confirmation application, and bot status publishing. Keys and results persist in Convex, never in function-instance memory.
- **NFR-3 Authorization.** Convex public functions enforce authorization; the UI never does. Shared helpers: `requireIdentity`, `getCurrentUser`, `requireGroupMember`, `requireBillOrganizer`, `requireParticipant`, `requireIntentOwner`.
- **NFR-4 Sponsorship safety.** Concrete lamport caps from the Implementation Readiness Contract are atomically reserved before co-sign, settled from actual confirmed spend, and released only on a proven non-broadcast failure. Per-user, per-wallet, per-group, per-transaction, UTC-day, and global-epoch limits - executable program/mint/recipient/instruction/writable-account manifests - ATA and priority-fee limits - separate dev and prod sponsor wallets - mainnet emergency pause rechecked immediately before co-sign without disabling reads.
- **NFR-5 Observability.** Every settlement intent exposes a readable status. Structured logs carry `tabId`, `intentId`, `userId`, `transactionSignature`, `statusTransition`, `durationMs`, `failureCode` — never secrets, tokens, signed transactions, or bot tokens.
- **NFR-6 Retry.** DFlow quote: at most four router requests and three seconds total, with a My Tab TTL capped at 60 seconds and blockhash validity. Telegram notification: retry or recreate a deleted status message without rolling back money state. RPC confirmation: scheduled retry through persisted `unknown` until confirmed or conclusively failed; timeout alone is never failure. Receipt extraction: manual-entry fallback. Privy auth: reload and token-refresh recovery.
- **NFR-7 Privacy.** Store only required Telegram profile data. Never store raw Privy access tokens or wallet private material. Receipt bytes are streamed only through an authenticated Convex HTTP Action. Originals/provider payload delete at the earlier of 30 days after upload or 7 days after bill completion; failed/abandoned uploads delete after 24 hours; normalized confirmed items delete after 365 days, leaving only non-sensitive tombstone/audit IDs. Authorized deletion may shorten, never extend, retention. No personal bill detail appears in public group confirmations unless the sender explicitly chooses the social tip announcement.
- **NFR-8 Secrets.** No server secret carries a `NEXT_PUBLIC_` prefix. Preview and production credentials stay separate.
- **NFR-9 Performance.** Claim mutations reflect across devices without manual refresh. Bounded DFlow quote solver with a hard request count and deadline.
- **NFR-10 Accessibility and device floor.** 44px minimum touch targets, 320px width, keyboard-open layout, long Telegram names, missing avatars, reduced motion, light-theme contrast.
- **NFR-11 Abuse and resource bounds.** Convex atomically enforces reviewed per-actor, per-group, concurrency, time-window, and global quotas before tab creation, receipt upload/extraction, and provider quoting. Uploads require a one-use authorization ticket plus byte, magic-type, decoded-dimension, and pixel-count validation. Rejected blobs are deleted immediately, and operational pauses preserve reads and manual entry.

### Additional Requirements

Derived from the Architecture Spine (AD-1…AD-24), its conventions table, structural seed, and Day 0 Gate.

**Scaffold and starter template**

- **No third-party starter template is specified.** The Architecture Spine defines a hand-built greenfield scaffold: a single Next.js App Router repository with a colocated `convex/` directory (AD-2), matching the Structural Seed tree (`app/`, `components/primitives/`, `features/`, `lib/domain/`, `convex/`, `convex/internal/`, `tests/`). **Epic 1 Story 1 creates this scaffold**, not a template clone.
- Stack floors are hard: React/React DOM 19.x (Astryx peer-dep floor), TypeScript 5.x strict, Next.js current stable App Router, Convex current stable, `@solana/kit`, `@privy-io/react-auth` + `@privy-io/node`, Zod for boundary validation only.
- Package versions must be locked on Day 0 because Astryx is Beta.

**Deployment and environments**

- Two deployment targets, one build command (AD-3): Vercel deploys Next.js + Route Handlers; Convex Cloud deploys database, functions, storage, scheduler, realtime. Vercel build command is `npx convex deploy --cmd 'npm run build'` with `CONVEX_DEPLOY_KEY` set in Vercel.
- Preview deployments must never send real Telegram messages or spend real sponsor funds; a visible non-production badge is required.
- Secret placement follows the consuming runtime (AD-19). Convex holds: DFlow API key, Telegram bot token and webhook secret, `OPENAI_API_KEY` for receipt extraction, Privy app secret + sponsor wallet ID, server RPC key, and provider-webhook secrets. Vercel holds only `CONVEX_DEPLOY_KEY` plus, if the AD-5 fallback is activated, Privy verification credentials and the fallback token-bridge signing key. No `NEXT_PUBLIC_` on any server secret.

**Layering and dependency direction**

- Convex owns product truth (AD-1). Route Handlers are ingress adapters only — verify, normalize, invoke Convex, return. No calculation, authorization, orchestration, or ledger write in `app/api/`.
- Forbidden edges: the shell never calls a Convex action directly or an external service directly; adapters never contain domain logic; a mutation never performs I/O.
- Money and allocation logic lives in `lib/domain/` as pure, I/O-free, unit-tested functions (AD-6).
- Client Components for every live surface; no authenticated SSR (AD-15). Fixed provider order: `TelegramRuntimeProvider` → `PrivyProvider` → `PrivyConvexProvider` (wrapping `ConvexProviderWithAuth`) → theme. No TanStack Query for Convex data.

**Identity and auth adapter**

- Three identifiers stay distinct and are never collapsed (AD-4): `privyDid`, `telegramUserId`, `walletAddress`/`privyWalletId`. The `users` document links them only after both Privy and Telegram verification succeed.
- Primary Convex auth path (AD-5): `convex/auth.config.ts` with `type: 'customJwt'`, `issuer: 'privy.io'`, `applicationID: <Privy app ID>`, `algorithm: 'ES256'`, and a **base64 `data:` URI JWKS**. Bounded fallback: a Vercel Route Handler verifies the Privy token with `@privy-io/node`, mints a 5-minute My Tab JWT, and publishes `/.well-known/jwks.json`. Falling back to client-supplied user IDs is forbidden.

**Durable-intent orchestration**

- Fixed sequence for every money flow (AD-8): client mutation → validate and insert durable intent → `scheduler.runAfter(0, internalAction)` → external API call → internal mutation stores result → subscribed client updates.
- One sponsorship path only (AD-9). No client-side `signAndSendTransaction({sponsor: true})`, no raw-keypair sponsor, shipped alongside it.
- The AD-10 validation checklist runs twice — before returning bytes and again before sponsor co-signing.
- Confirmation, not submission, moves the ledger (AD-11). Obligations are immutable ledger events; activity is append-only (AD-12).
- Convex scheduler and crons are the only job runner (AD-16): quote expiration, confirmation polling, failed-action retry, reminders, inactive `draft|open` tab archival, abandoned-upload cleanup, demo-data reset. Locked/settling bills with unresolved obligations never expire or archive. No Vercel Cron in P0.
- A Convex HTTP Action is the single Telegram ingress. It verifies `X-Telegram-Bot-Api-Secret-Token`, validates the exact update schema, deduplicates `update_id`, and calls internal mutations. No public mutation accepts a Vercel-asserted identity and no parallel Vercel Telegram webhook exists.
- Receipt extraction is advisory input only (AD-18). No model assigns participants, resolves disputes, produces final totals, or signs/submits.

**Sponsorship safety controls**

- Per-user, per-wallet, per-group, per-transaction, daily and global budgets; program/mint/recipient/instruction allowlists; ATA-creation limits; one idempotency key per settlement intent; separate dev and prod sponsor wallets with small capped SOL balances; an emergency pause that stops new sponsored transactions **without** disabling read access (AD-17).
- Resource-consuming non-payment operations use the concrete AD-24 quotas. Reservations are atomic, quota failures create no durable object or bot message, upload tickets are single-use, invalid receipt blobs are deleted immediately, and global pauses retain reads plus manual bill entry.

**Data and naming conventions**

- Convex tables (camelCase plural): `users`, `wallets`, `groups`, `groupMembers`, `tabs`, `tabParticipants`, `items`, `allocations`, `adjustments`, `obligations`, `tips`, `settlementIntents`, `settlements`, `activityEvents`, `receiptImports`.
- Functions: `<module>.<verb><Noun>`. Internal functions live under `convex/internal/` and are never publicly exported.
- Indexes: `by_<field>` / `by_<field>_and_<field>`.
- Every integer money field ends in `Minor` (fiat) or `Atomic` (crypto). A field without that suffix is not money.
- Timestamps are integer milliseconds: `createdAt`, `updatedAt`, `lockedAt`, `completedAt`, `expiresAt`, `confirmedAt`.
- `v.int64()` for fiat minor units; decimal strings only where an external SDK requires them.
- Convex validators at every public boundary; Zod only for external payload shapes (DFlow, vision, Telegram).
- Canonical persisted settlement states are `created | quoting | ready_for_signature | user_signed | submitted | unknown | confirmed | failed | expired | superseded`. Awaiting-wallet and verifying are UI stages derived from `ready_for_signature` and `user_signed`. Only `created|quoting|ready_for_signature` may expire or become superseded. `user_signed` blocks reopen and resolves only to submitted or proven pre-broadcast failed. `submitted` and `unknown` are nonterminal, cannot be retried as a new payment, and reconcile late confirmation.
- `"use node"` only in action files that genuinely need Node packages.
- Failure codes are stable string enums persisted on the settlement record and mapped to product copy in the shell. Raw provider errors are never surfaced.

**Day 0 Gate — full-stack UI work is blocked until all five pass in a deployed Telegram Mini App**

1. Next.js App Router loads inside Telegram from Vercel.
2. Privy performs seamless Telegram authentication and creates a Solana embedded wallet.
3. A Privy access token authenticates a Convex query through the selected JWT path (inspect real token `kid`, `alg`, `aud`, `iss`, refresh behavior — OQ-1 / research R-1). On failure, implement the AD-5 fallback immediately.
4. Raw Telegram `initData` verifies and binds the correct Telegram user to the Privy DID.
5. One exact USDC transaction: user signs through Privy without broadcasting, Convex verifies, the Privy fee-payer wallet co-signs, Convex broadcasts and confirms the recipient balance change.

**Execution order.** Story numbers remain stable for traceability, but implementation follows this dependency order: **1.1 → 1.3 → 1.4 → 1.5 (then 1.6 only if its recorded trigger fires) → 1.7 → 1.8 → 2.1 → 2.2 → 3.2 → 3.3 → 3.4 → 3.8 → 3.5 → 3.6**. These stories deliver and test all five direct-USDC Day 0 items, with sponsor policy active before broadcast. Story 1.2 and every full-surface UI story are blocked until the gate passes in a deployed Telegram Mini App. Before Epic 6 begins, Stories 6.2–6.4 must also pass the separate deployed native-SOL→USDC DFlow sync/ALT routing gate. Passing either gate does not remove or defer any story; it prevents later work from hiding a broken trust, sponsorship, or routing seam.

### Implementation Readiness Contract

These constants and invariants are acceptance criteria wherever the related capability appears. They replace prose placeholders and may be changed only through an explicit architecture decision plus fixture and test updates.

**Telegram trust and membership**

- The bot webhook terminates at one authenticated Convex HTTP Action. The HTTP Action owns the bot token, verifies the secret header with constant-time comparison, validates the update, and invokes internal mutations only.
- Mini App mutations are Telegram-only. A caller needs both a valid Privy identity and a current server-verified Telegram binding for the exact group/session. Outside Telegram, cached and authenticated reads may render, but every claim, authoring, waiver, manual-cash, tip, and payment mutation is disabled and rejected server-side with `TELEGRAM_CONTEXT_REQUIRED`.
- Raw `initData` is verified in Convex using Telegram's HMAC procedure, including `auth_date` no older than 5 minutes, before binding `telegramUserId`, `chat_instance`, and the Privy DID. `initDataUnsafe` is display-only.
- The bot must be an administrator in an activated group. On first open, and before every privileged mutation when the membership proof is older than 5 minutes, Convex calls `getChatMember`. Allowed states are creator, administrator, member, and restricted with `is_member=true`. Left, kicked, unknown, or unverifiable membership revokes write scope while preserving authorized reads. Bot-admin loss pauses new group mutations and exposes recovery copy.
- Silent members are bootstrapped on their first verified Mini App open; they do not need to have sent a bot-visible message. `groupMembers` records carry `verifiedAt`, `membershipStatus`, and `verificationSource`, and webhook membership updates eagerly refresh or revoke them.

**Typed sessions and canonical settlement states**

- `tab_session` links are reusable by verified current members for 24 hours, rotate when a tab is completed, and can be revoked by the organizer. `action_token` links are single-use, subject-bound, expire after 10 minutes, and are consumed atomically.
- The persisted state enum is exactly `created`, `quoting`, `ready_for_signature`, `user_signed`, `submitted`, `unknown`, `confirmed`, `failed`, `expired`, `superseded`. Awaiting-wallet and verifying are UI stages only.
- Only `created`, `quoting`, and `ready_for_signature` may expire. Safe revision invalidation uses `superseded`. Once broadcast may have happened, an RPC timeout transitions to `unknown`, not `failed` or `expired`. The same signature is polled until confirmation or until both blockhash expiry and signature absence are proven. Late confirmation is always reconciled.
- A unique target lock permits at most one nonterminal settlement intent for each obligation or tip. The target is released only on confirmed settlement or a conclusively terminal pre-/non-broadcast failure.

**P0 asset and FX contract**

- The recipient asset is Solana mainnet USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` with 6 decimals. The one routed P0 input is native SOL represented at the router boundary by wrapped-SOL mint `So11111111111111111111111111111111111111112` with 9 decimals. USDC exact transfer remains supported. No other mint is accepted until added by a reviewed manifest change.
- THB→USDC uses Frankfurter v2 `USD/THB` filtered to the Bank of Thailand provider, treating one USDC as one USD for product accounting. The reduced snapshot stores `direction:'USDC_ATOMIC_PER_THB_MINOR'`, `numeratorAtomic`, `denominatorMinor`, `provider:'frankfurter:BOT'`, provider date, fetched timestamp, expiry, and policy version. Required output is `ceil(obligationMinor × numeratorAtomic / denominatorMinor)` with checked integer math and no JavaScript-number parse. It is fresh for 36 hours from provider date on weekdays and 96 hours across weekends/Thai bank holidays. Production fails closed when unavailable/stale; only non-production may use a visibly badged manual rational.
- A locked revision stores its FX snapshot immutably. Requote changes SOL maximum input but never changes the locked USDC minimum output. Any output above the target belongs to the recipient and is recorded as `excessOutputAtomic`; it never creates a hidden credit or changes the fiat obligation.
- DFlow requests set `allowSyncExec=true`, `allowAsyncExec=false`, `sponsorExec=false`, and request/include address lookup tables. Responses with `executionMode != sync`, `destinationWalletMustSign=true`, an unexpected mint/program/signer/writable account, or missing ALT state are rejected. The solver makes at most four requests within three seconds. My Tab quote TTL is `min(60 seconds, lastValidBlockHeight safety window)`.

**Sponsor production policy, version `sponsor-v1`**

| Dimension | Production cap | Development cap | Window |
|---|---:|---:|---|
| Per transaction | 3,000,000 lamports | 3,000,000 lamports | one intent |
| Per user | 15,000,000 lamports | 6,000,000 lamports | UTC day |
| Per wallet | 15,000,000 lamports | 6,000,000 lamports | UTC day |
| Per group | 75,000,000 lamports | 20,000,000 lamports | UTC day |
| Daily aggregate | 250,000,000 lamports | 50,000,000 lamports | UTC day |
| Global epoch | 1,000,000,000 lamports | 100,000,000 lamports | until operator reset |

- A sponsorship mutation atomically reserves the worst-case sponsored cost against all six dimensions before any co-sign request. Confirmation settles actual fee plus ATA rent and releases the unused reservation. Only a proven non-broadcast failure releases the full reservation; ambiguous submission keeps it reserved. The kill switch and all caps are rechecked immediately before sponsor signature.
- One recipient ATA may be created per intent. Priority fee is capped at 250,000 lamports and the total sponsor debit remains under the per-transaction cap. The executable manifest pins System, Compute Budget, SPL Token, Associated Token Account, Memo, and the reviewed DFlow program/instruction set; exact addresses and writable-account roles live in the versioned manifest fixture and are asserted at both validation gates.

**Domain safety and lifecycle**

- Every public numeric boundary accepts integer strings or integers only, uses checked signed-64-bit arithmetic for fiat and checked bigint arithmetic for crypto, and rejects overflow before persistence. Titles are 1–80 Unicode characters; item names 1–120; item quantity 1–999; a line and bill total must be greater than zero and at most THB 10,000,000.00; a tip is THB 1.00–100,000.00; percentages are 0–10000 basis points. Split/allocation denominators must be greater than zero.
- Adjustments apply in canonical order: item subtotal → service charge → tax → fixed/percentage discount → group tip → largest-remainder disclosure. Each percentage names its base in the snapshot. A payer cannot be the recipient of their own obligation/tip. A recipient must have a verified, current default USDC receiving wallet before lock or tip intent creation.
- Reopen requires organizer authorization, no confirmed settlement, and no `user_signed`, `submitted`, or `unknown` intent. It atomically marks only `created`, `quoting`, and `ready_for_signature` intents `superseded`, appends obligation-supersession events for the old locked revision, opens a new draft revision, and never mutates old obligations. A `user_signed` intent never expires or becomes superseded; it resolves to `submitted` or to proven pre-broadcast `failed`. Late confirmation blocks reopen and is reconciled first.
- A **bill is complete** when every active obligation for that bill is fully offset by confirmed on-chain settlement, recipient-authorized waiver, or dual-acknowledged manual cash settlement. **Group net zero** is a separate derived cross-bill state and never controls bill completion or the once-per-bill All Square moment.
- A waiver is an immutable offset authorized only by the obligation recipient. A manual-cash offset requires immutable proposal and acknowledgement events from both payer and recipient. Neither may exceed the outstanding obligation; both are idempotent, audited, and unavailable while a nonterminal on-chain intent exists for the target.

**Offline, receipts, and verification**

- Offline claims use an IndexedDB outbox carrying `operationId`, target, requested effect, base revision, and created time. Replay is serial; Convex persists `operationId` results for deduplication. A stale-revision rejection is never blindly retried: the client refreshes, recomputes whether the requested effect is still applicable, asks for a new tap when intent changed, and removes the entry only after a persisted success or explicit cancellation. Money, authoring, lock/reopen, waiver, and manual-cash actions are never queued.
- Receipt media is never exposed through a permanent `storage.getUrl()` link. An authenticated Convex HTTP Action checks identity and organizer/group scope on every request and streams at most 10 MB with `Cache-Control: private, no-store`. Original bytes and provider payload delete at the earlier of 30 days after upload or 7 days after bill completion; failed/abandoned uploads delete after 24 hours. Normalized organizer-confirmed items remain 365 days, then only non-sensitive tombstone/audit IDs remain. Authorized deletion may shorten, never extend, those periods.
- Required security suites are table-driven: every public Convex function has unauthenticated, wrong-group/role, outside-Telegram, and correct-scope cases; every transaction predicate gets an independently constructed pre-hash invalid transaction at both validator gates; confirmation fixtures cover wrong account/mint/delta/debit/fee, failed transaction, duplicate signature, late confirmation, and reorg observation with no premature ledger effect; sponsorship tests cover limit−1/equal/+1 and concurrent reservations; preview tests prove real Telegram, sponsor, DFlow, receipt-provider, and production RPC egress are denied.

**Testing baseline set by the spine**

- `lib/domain/` is pure and unit-tested. Convex integration tests cover auth, concurrency, and idempotency. Per-story test strategy is owned by the test-design pass, not this document.

### UX Design Requirements

Extracted from `DESIGN.md` (visual identity, tokens, component visual specs) and `EXPERIENCE.md` (IA, behavior, states, concurrency, accessibility, platform).

**Foundation and tokens**

- **UX-DR1** Implement the My Tab token set as an Astryx theme extension over `@astryxdesign/theme-neutral` with forced `mode="light"` and no dark variant: 21 color tokens (`paper #F4F7FA`, `surface #FFFFFF`, `sunk #EDF2F7`, `ink #0A2038`, `ink-muted #55677D`, `ink-subtle #61748B`, `border #DFE7EF`, `border-strong #C6D2DE`, `primary #1E51D2`, `primary-soft #E7EDFC`, `primary-deep #17409F`, `tip #A85F2E`, `tip-soft #F8EDE4`, `settled #0B7561`, `settled-soft #E1F0EC`, `owed #B32B44`, `owed-soft #FBE9EC`, `warning #9A6209`, `warning-soft #FBF1E0`, plus `avatar-1…5`), 4 radius tokens (sm 10 / md 12 / lg 20 / full), and the 8-step spacing scale (4/8/12/16/20/24/32/48).
- **UX-DR2** Implement the 9-role type scale in Instrument Sans with the system fallback stack: `micro-label` (11/600/0.07em/uppercase/ink-subtle), `amount-hero` (42/600/-0.032em), `amount-lg` (34/600/-0.028em), `amount-md` (24/600/-0.02em), `amount-row` (15/500), `title` (20/600/-0.018em), `body` (15/400), `label` (13/500), `meta` (13/400/muted), all at a base tracking of `-0.006em`. Line height must accommodate Thai ascenders and descenders alongside Latin in the same string.
- **UX-DR3** Enforce tabular numerals on every numeral in the product, in every state, including skeleton placeholders. Amounts must align on the decimal down the right edge of every list. A proportional figure anywhere is a defect.
- **UX-DR4** Implement the border-led elevation model: card = `surface` on `paper` + 1px `border` + `0 1px 2px rgba(10,32,56,0.045)`; primary button = `inset 0 -1px 0 rgba(10,32,56,0.24)`; a real shadow plus dimmed scrim exists only for floating sheets (payment sheet, token picker). No hover lift, no pressed elevation, no layered card stacks, no shadow used for hierarchy.
- **UX-DR5** Implement the layout frame: single column always, 390px design width, hard 320px floor with no horizontal scroll, 16px gutters, 20px card padding, related elements at 8px and unrelated sections at 24–32px, one dominant action per screen pinned to a bottom `surface` bar with a top `border` above the safe area — never floating, never a FAB. Telegram Desktop centers the same column on `paper`; there is no wide layout.

**Custom components (15 named in DESIGN.md; each needs visual spec + behavioral rules)**

- **UX-DR6** `balance-hero` — `amount-hero` colored by state (`owed` / `settled` / `ink`), `meta` sub-line beneath, sitting directly on `paper` with no container. Non-interactive, state-driven only, never shows a token amount.
- **UX-DR7** `tab-card` — `surface`, `rounded/md`, 1px border, 20px padding, title in semibold `body`, `meta` sub-line, 4px progress bar, right-aligned `amount-row`. Whole card is one tap target routing to the Claim Board. The progress bar reflects **settled** obligations only, never submitted ones (FR-L3).
- **UX-DR8** `claim-row` — full-bleed row inside a bordered list; item name in `body`, right-aligned `amount-row` price, avatar stack beneath the name; unclaimed carries a 3px `warning` left edge; viewer-owned takes a `primary-soft` fill. Tapping the row body toggles the viewer's own claim; tapping the avatar stack opens a who-has-this sheet; long-press is unbound; the organizer gets an extra overflow control for override (FR-C4).
- **UX-DR9** `participant-chip` — `rounded/full` avatar at 28px in stacks and 40px in selectors, `label` name beneath, selected state is a 2px `primary` ring and never a fill. Single-select in Tip Composer and New Tab.
- **UX-DR10** `presence-stack` — overlapping 24px avatars at -8px offset, max 3 plus a `+n` counter, 6px `settled` dot. Shows people currently subscribed to the tab, updates live, never shows the viewer, and is absent when the viewer is alone (no "1 person here"). The stack is one touch target; individual avatars are decorative.
- **UX-DR11** `sticky-claim-footer` — `surface` with a top 1px border, two lines: a `meta` reconciliation line then an `amount-md` personal subtotal paired with a full-height `primary` action. Always visible above the safe area. Action label is state-driven: "Claim yours" → "Finish claiming" → disabled with "2 items need an owner" for the organizer only. Participants are never blocked by someone else's unclaimed item.
- **UX-DR12** `breakdown-row` — name left, `amount-row` right; expands in place to reveal indented `meta` sub-lines with their own right-aligned amounts; multiple rows may be open simultaneously. This is the "explain the math" affordance and must never be behind a separate screen.
- **UX-DR13** `payment-sheet` — `surface`, `rounded/lg` top corners, grab handle, soft shadow over a scrim, fixed 52px `primary` bottom action. Dismissible by scrim tap or swipe-down **only before Pay is tapped**; after that it transitions to Payment Progress and cannot be dismissed backward. Content order is fixed: obligation in bill currency → recipient and destination asset → token selector → maximum sender spend → minimum recipient receive → optional round-up tip → collapsed disclosure row → bottom action.
- **UX-DR14** `token-chip` — `rounded/full`, `primary-soft` fill with a 1px `primary` border when selected, otherwise `surface` with `border`; token name in `label`, balance in `meta`; **no token logos ever**. Single-select. An unaffordable token is shown disabled with its balance visible, never hidden.
- **UX-DR15** `disclosure-row` — full-width row, `body` label, right chevron, 1px border top and bottom, contents in `meta` on `paper`. Collapsed on every open including repeat visits; it never remembers its expanded state.
- **UX-DR16** `settlement-stepper` — vertical, 4 steps, 2px `border` connector; complete = filled `settled` circle with check, active = animated `primary` ring, pending = hollow `border` circle, failed = `owed` circle. Steps advance only on server-confirmed transitions (AD-11), never optimistically; a step never moves backward; a failure replaces the active step in place.
- **UX-DR17** `all-square-card` — full screen, `tip` wash fading into `paper` across the top 40%, centered check in a ring, `amount-hero` headline, `presence-stack`, `primary` action. Fires exactly once per bill, only on the transition to all-square, only for people with the app open at that moment, and is never replayed on revisit.
- **UX-DR18** `activity-row` — 32px `rounded/full` icon tinted by event type, `body` sentence, right-aligned `amount-row` where applicable, `meta` relative timestamp. Taps expand in place to reveal detail plus the explorer link. Rows are immutable — never edited or removed after the fact (AD-12).
- **UX-DR19** `amount-pair` — the universal money line: `label` left, `amount-row` right, decimal-aligned. Every disclosed figure in the product uses it, so no amount ever appears without a label.
- **UX-DR20** `discrepancy-card` — `warning` text and 1px border on a 6%-opacity amber fill, `rounded/md`, 20px padding, sticky at the top of Receipt Review while a mismatch exists. Dismisses itself when the numbers reconcile; never manually dismissible.

**Navigation and information architecture**

- **UX-DR21** Implement the 13 surfaces (Launch, Tabs, Group, New Tab, Receipt Review, Claim Board, Bill Review, Payment Sheet, Payment Progress, All Square, Tip Composer, Activity, You) with a three-item bottom tab bar (**Tabs · Activity · You**), no drawer and no hamburger. Receipt Review, Bill Review, Payment Progress and All Square are consequences of an action, never navigable destinations. Sheets stack one level deep, never two.
- **UX-DR22** A deep-linked Claim Board hides the tab bar entirely; the only exit is the header back control, which lands on Tabs.
- **UX-DR23** Bill Review is **read-only for every participant**, with identical layout, expandable rows, and reconciliation line for all. Only the footer action differs: organizer gets "Lock bill"; a participant gets "Settle up", disabled pre-lock with the stated reason ("Waiting on Maya to lock") and enabled after. No amount is editable on this surface.

**States**

- **UX-DR24** Implement the full state catalogue — every one has designed copy and none may be skipped: Authenticating · Auth recovering · Empty (no groups / no activity / no items) · Loading first paint · Loading subsequent · Unassigned items · Claim conflict · Locked · Pre-lock participant · Quote live · Quote expired · Awaiting wallet · Submitting · Confirmed · Failed · Stale revision · Sponsorship paused · Offline · All square.
- **UX-DR25** First-paint loading uses skeleton rows matching final geometry with **tabular-width numeral placeholders** so nothing shifts on arrival. Subsequent loading renders nothing — a spinner over already-correct data is a defect.
- **UX-DR26** Recoverable-state behavior is specific: an expired quote holds its last amounts at 40% opacity and swaps the action to "Refresh quote"; a dismissed Privy sheet returns to the Payment Sheet unchanged with no error; a stale revision blocks payment rather than silently repricing; sponsorship pause keeps all reads available; offline queues claims and disables money actions with cached state still readable. No time limit is ever punitive.

**Money legibility**

- **UX-DR27** Every amount is attributable via `amount-pair`; the breakdown is always one tap away and never one screen away; bill currency and token amounts never share a line; token amounts appear only inside the payment sheet's disclosed lines, labelled by token name and never a symbol or logo.
- **UX-DR28** Rounding is disclosed as its own breakdown line ("Rounding +THB 0.01") wherever largest-remainder allocation gives someone an extra minor unit (FR-M4, FR-M5). Reconciliation is stated positively on Bill Review ("Everyone's shares add up to THB 1,840.00 ✓" in `settled`); on failure, lock is blocked and the shortfall named exactly (FR-M6).
- **UX-DR29** "At least" is the required word for a swap output ("Maya receives at least 8.25 USDC") — never a projected exact output presented as a guarantee. The sponsored network fee is stated once, inside the disclosure row, as "Network fee · Covered by My Tab" — a statement, not a zero. **No platform-fee line appears anywhere**, and no placeholder is designed for one (OQ-4 resolved: zero).
- **UX-DR30** Every ring, bar, and "n of 5 settled" counts confirmed money only. A submitted transaction moves the stepper and never the group's progress.

**Concurrency behavior**

- **UX-DR31** Claiming is additive, not exclusive: a second claimant joins the avatar stack and the row becomes "Split 2 ways · THB 120.00 each" with no error, no dialog, and no loser. Releasing recalculates the remaining claimants' per-head amount in place, silently, with no notification.
- **UX-DR32** A remote claim animates the avatar into the stack over ~200ms and ticks the footer reconciliation line. An organizer edit that removes a claimed item shows affected people an inline footer note ("Maya removed an item you claimed.") that does not steal focus. A rejected stale mutation corrects the board and shows one line: "That changed a moment ago." No modals anywhere in this set.
- **UX-DR33** Lock confirmation copy reads "Locking creates each person's final amount. Editing after this needs a reopen." Every other client's board transitions to locked live, with the footer becoming "Settle up" and a quiet "See the full bill" text link beside it.

**Voice and microcopy**

- **UX-DR34** Enforce the microcopy contract in every string: plain, specific, never apologetic, never celebratory about ordinary events; failures name the next action in the same breath. **Banned from all user-facing copy:** execute, swap, route, approve, broadcast, transaction, signature, mint, ATA, gas, lamports, slippage, blockhash, RPC, wallet address, AI, powered by, seamless, magic, sparkle framing.
- **UX-DR35** Numbers are never rounded in copy. If the obligation is THB 291.74, every surface says THB 291.74. "About THB 292" is a defect.
- **UX-DR36** Map persisted states to sanctioned UI: `created`/`quoting` → resolving sheet · `ready_for_signature` → quote plus an awaiting-wallet UI stage while Privy is open · `user_signed` → "Verifying" · `submitted` → "Sending to Maya" · `unknown` → "Still checking — don't pay again" · `confirmed` → "Confirmed" · `failed` → named cause and next action · `expired` → refresh quote · `superseded` → bill-changed state.

**The Telegram surface**

- **UX-DR37** Design and implement the bot's group messages as a product surface: **one status message per tab, edited in place**, showing tab name, people count, total, and claim progress with a single `[Open tab]` button that always lands on that tab's Claim Board, already authenticated and scoped.
- **UX-DR38** Only five events ever post: tab opened · bill ready to settle · payment confirmed · bill completed · tip confirmed. **Never in a group message:** who owes what, individual amounts, wallet addresses, transaction links, or anything a person would not say out loud at the table. Tip confirmations are the one warm message and name both people and the amount.

**Interaction primitives and motion**

- **UX-DR39** Tap to act — one tap claims, one tap pays, one tap tips. Long-press is unbound throughout (sole exception: the deliberately hidden demo-mode "Use sample receipt" affordance). Swipe-down dismisses a sheet only before it commits. **Pull-to-refresh is banned.**
- **UX-DR40** Exactly three sanctioned animations: avatar arriving in a stack (~200ms), a check drawing on confirmation (~400ms), and the all-square wash (~600ms, once per bill). Everything else is an instant state swap. **Banned:** carousels, parallax, hero animations on open, skeleton shimmer, toast stacks, badge counts, confetti, sound, and any gradient except the all-square wash.
- **UX-DR41** Haptics fire at exactly three moments: light on claim/unclaim, medium on lock, success on confirmed payment. Nothing else vibrates. All haptics are suppressed under Reduce Motion.

**Accessibility floor**

- **UX-DR42** Semantic color never travels alone. Every state carried by `owed`, `settled`, or `warning` also carries a word or glyph ("Paid" with a check, "2 items need an owner" as text, "You owe" as a label). All touch targets are ≥44px, including claim rows, token chips, and avatar chips.
- **UX-DR43** Screen-reader support: every interactive element announces role and state; `claim-row` announces item, price, and current claimants ("Green Curry, 180 baht, claimed by you"); the `settlement-stepper` announces each transition once as a live region. Amounts read as money, not digits — "291 baht 73", never "two nine one point seven three". Focus order follows reading order on every surface, with the sticky footer action last in traversal.
- **UX-DR44** Reduce Motion removes all three animations and all haptics; states change instantly and the all-square card still appears without washing in. Dynamic type scales body with the platform setting; `amount-hero` may compress but never truncates and never wraps mid-figure; layout holds at 320px at the largest supported size.

**Responsive and platform**

- **UX-DR45** Honor Telegram platform behavior per target: iOS safe-area insets top and bottom with the sticky footer above the home indicator and Telegram's back control used; Android system back gesture mapped to the header back with keyboard resize never detaching the sticky footer; Desktop centering the same 390px column. Telegram's native back control and the in-app header chevron never both appear.
- **UX-DR46** Handle the content edge cases: at 320px there is no horizontal scroll and amount columns compress before item names truncate; long Telegram names truncate at the name with ellipsis and **amounts are never truncated anywhere**; a missing avatar renders an initial on a deterministic tint derived from the user id, never a generic silhouette; keyboard-open surfaces scroll their field into view and the claim footer yields to the keyboard rather than overlapping it.
- **UX-DR47** The standalone-browser fallback works unstyled by Telegram, with presence, claiming, and all reads functional — this is the demo fallback if a Mini App client misbehaves.

**Anti-patterns to enforce in review**

- **UX-DR48** Reject on sight in any implementation: a dark variant, glass panel, or neon accent · black text where navy is required · large type at default tracking · a token logo, price chart, portfolio value, or network selector anywhere · a sparkle/wand/robot icon for receipt scanning · each section wrapped in its own rounded card · shadow used for hierarchy on anything that is not a floating sheet · a payment surface led by an address, a mint, or transaction bytes · celebration on every payment · reminder pings, nudges, or badge counts.

### FR Coverage Map

Every one of the 72 FRs maps to exactly one owning epic. Priority labels affect sequencing, not inclusion: every mapped story remains in the complete build.

| FR | Epic | Coverage |
| --- | --- | --- |
| FR-A1 | Epic 1 | Privy as canonical auth provider, Telegram seamless login enabled |
| FR-A2 | Epic 1 | Privy DID as external subject, Convex `_id` as internal FK |
| FR-A3 | Epic 1 | Privy tokens into `ConvexProviderWithAuth`; identity check on every private function |
| FR-A4 | Epic 1 | Server-side raw `initData` validation before Telegram binding |
| FR-A5 | Epic 1 | No browser-supplied identifier ever trusted |
| FR-A6 | Epic 1 | Opaque `startapp` token resolution and rejection rules |
| FR-W1 | Epic 1 | Embedded Solana wallet created or restored on first login |
| FR-W2 | Epic 1 | Wallet ID and address stored; no key material |
| FR-W3 | Epic 1 | One default receiving wallet per user |
| FR-W4 | Epic 1 | External Solana wallets, sequenced after embedded-wallet gate |
| FR-M1 | Epic 1 | Fiat as int64 minor units in `lib/domain/` |
| FR-M2 | Epic 1 | Crypto as atomic-unit integers with persisted mint decimals |
| FR-M3 | Epic 1 | No JS float on persisted money — enforced by the domain module and its tests |
| FR-N1 | Epic 2 | `/tab`, `/splitbill`, `/tip`, `/balance` |
| FR-N2 | Epic 2 | Convex HTTP Action secret verification, normalization, internal mutation, fast return |
| FR-N3 | Epic 2 | Opaque-token deep links only |
| FR-N4 | Epic 2 | Five high-value events, one status message edited in place |
| FR-N5 | Epic 2 | Update-ID idempotency |
| FR-N6 | Epic 2 | Telegram-native affordances (safe areas, viewport, back, haptics, expand) |
| FR-G1 | Epic 2 | Group created or resolved from the webhook-recorded chat |
| FR-G2 | Epic 2 | Group name, avatar, join state, role, wallet readiness |
| FR-G3 | Epic 2 | Group default currency and recipient asset visible |
| FR-G4 | Epic 2 | Multiple open tabs, UI optimized for one active tab |
| FR-G5 | Epic 2 | Membership never inferred from client claims |
| FR-T1 | Epic 3 | Direct tip to a verified group participant, presets and custom amount |
| FR-T2 | Epic 3 | Optional message and reaction |
| FR-T3 | Epic 6 | Round-up tip attached to a bill payment |
| FR-T4 | Epic 3 | Recipient receives USDC; sender pays USDC or one allowlisted token |
| FR-T5 | Epic 3 | Recipient address from the Convex wallet record only |
| FR-T6 | Epic 3 | Post-quote immutability of recipient, amount, output mint, sponsor |
| FR-T7 | Epic 3 | No double-pay; failed or expired quote recreatable without duplicating the tip |
| FR-S1 | Epic 3 | Server-owned settlement intent created before any transaction request |
| FR-S2 | Epic 3 | Intent binds user, wallet, revision, target, mints, bounds, idempotency key, expiry |
| FR-S3 | Epic 3 | Exact USDC transfer built in a Convex Node action with the sponsor as fee payer |
| FR-S4 | Epic 6 | DFlow order with `sponsor`, `sponsorExec=false`, server-owned `destinationWallet` |
| FR-S5 | Epic 3 | Validate and store the message hash before bytes reach the client |
| FR-S6 | Epic 3 | The AD-10 checklist, run twice — established here, reused unchanged by Epic 6 |
| FR-S7 | Epic 3 | Sign-only through Privy; partially signed bytes return for re-verification |
| FR-S8 | Epic 3 | Sponsor co-sign on policy pass, then Convex broadcasts |
| FR-S9 | Epic 3 | Parsed on-chain confirmation before any ledger change |
| FR-S10 | Epic 3 | Duplicate and stale-revision payment blocked |
| FR-B1 | Epic 4 | Draft bill with title, merchant, currency, payer, recipient, FX snapshot |
| FR-B2 | Epic 4 | Add, edit, duplicate, remove items while unlocked |
| FR-B3 | Epic 4 | Tax, service charge, discount, group-tip adjustments (fixed or percentage) |
| FR-B4 | Epic 5 | Monotonic revision incremented on every draft edit |
| FR-B5 | Epic 5 | Organizer must lock a revision before any settlement intent exists |
| FR-B6 | Epic 5 | Revision change expires every quote from an older revision |
| FR-B7 | Epic 5 | Explicit reopen-and-recalculate; no silent return to open after a confirmation |
| FR-C1 | Epic 5 | P0 allocation modes — one participant, or equal split |
| FR-C2 | Epic 5 | Quantity, percentage, and fixed-amount modes |
| FR-C3 | Epic 5 | Atomic, authorized, revision-aware claims over Convex realtime |
| FR-C4 | Epic 5 | Self-release and organizer override |
| FR-C5 | Epic 5 | Unassigned items warn and block lock |
| FR-M4 | Epic 5 | Equal split via integer division plus largest-remainder allocation |
| FR-M5 | Epic 5 | Proportional adjustments floored then remainder-distributed; shares persisted |
| FR-M6 | Epic 5 | Lock invariant enforced server-side or the lock is rejected |
| FR-M7 | Epic 5 | Immutable lock snapshot |
| FR-M8 | Epic 5 | Obligations and settlements as immutable ledger events |
| FR-M9 | Epic 7 | Greedy debt compression over net positions |
| FR-L1 | Epic 7 | Plain-language obligation and group net position |
| FR-L2 | Epic 7 | Six visually distinct payment states |
| FR-L3 | Epic 7 | Confirmed debt never reduced by a merely submitted transaction |
| FR-L4 | Epic 7 | Every balance links back to its source bill |
| FR-L5 | Epic 7 | Immutable activity events for every domain action |
| FR-L6 | Epic 7 | Within-group balance derivation; no cross-group netting |
| FR-R1 | Epic 8 | Convex file-storage upload, extraction action against a strict schema |
| FR-R2 | Epic 8 | Raw extraction, per-field confidence, reconciliation status, model metadata stored |
| FR-R3 | Epic 8 | Deterministic re-parse to integer minor units and line-total recalculation |
| FR-R4 | Epic 8 | Mismatch and low-confidence flagging; organizer confirmation required |
| FR-R5 | Epic 8 | Model output never becomes an obligation without deterministic recalculation |
| FR-R6 | Epic 8 | "Use sample receipt" demo path; receipt failure never blocks the demo |
| FR-R7 | Epic 8 | Tested Thai/English receipt subset; no universal-OCR promise |

**NFR ownership.** NFR-1, NFR-2 and NFR-8 are established in Epic 1 and enforced by every epic thereafter. NFR-3 is established in Epic 1 (shared helpers) and applied at every public function. NFR-4 and NFR-5 land in Epic 3 with the sponsor path and extend in Epic 6. NFR-6 spans Epics 2, 3, 6 and 8 at each retry boundary. NFR-7 lands in Epics 1, 2 and 8. NFR-9 lands in Epics 5 and 6. NFR-10 lands in Epic 7 as the accessibility and device floor, with per-surface obligations in every UI epic.

## Epic List

Eight epics cover the complete product. Story identifiers remain stable, while the execution order is governed by the Day 0 dependency gate above; an epic may depend on a prior gate and is not assumed independently deployable.

### Epic 1: Signed in and wallet-ready, inside Telegram

A person opens My Tab from a Telegram link and is already authenticated, holding a Solana wallet they were never asked about — no login screen, no connect-wallet step, no seed phrase. This epic also lays the greenfield scaffold and the pure integer-money module that every later epic computes against.

**FRs covered:** FR-A1, FR-A2, FR-A3, FR-A4, FR-A5, FR-A6, FR-W1, FR-W2, FR-W3, FR-W4, FR-M1, FR-M2, FR-M3

**Implementation notes:** Carries **Day 0 Gate items 1–4** and the project's single hardest risk (OQ-1 / research R-1: Convex `https://` issuer normalization versus Privy's bare `privy.io` issuer). The AD-5 fallback — a Vercel token bridge minting a five-minute My Tab JWT with a published JWKS — is pre-designed and must be implementable within this epic without redesign. No third-party starter template exists: Story 1 hand-builds the Structural Seed tree with React 19 pinned and all versions locked, because Astryx is Beta. `lib/domain/` money primitives ship here because Epic 3 needs atomic-unit arithmetic before any bill exists.

### Epic 2: The group chat starts the tab

Someone types `/tab` in a Telegram group and the group gets one card with an `[Open tab]` button. Everyone who taps it lands in the same scoped, authenticated session, and the group's card keeps itself current instead of flooding the chat.

**FRs covered:** FR-N1, FR-N2, FR-N3, FR-N4, FR-N5, FR-N6, FR-G1, FR-G2, FR-G3, FR-G4, FR-G5

**Implementation notes:** The authenticated Convex HTTP Action is the single Telegram ingress — verify the secret, normalize, deduplicate, invoke internal mutations, return fast. The bot's group messages are a designed product surface, not plumbing (UX-DR37, UX-DR38): one status message per tab, edited in place, five event types only, and never an individual bill amount or address. Update-ID idempotency and deleted-message recovery must be provable by fixtures.

### Epic 3: Send a tip

One person taps another person's name, picks an amount, and money lands. No address is typed, no network fee is paid, and the group sees the one warm message of the evening. This is the entire settlement spine proven on the simplest possible flow.

**FRs covered:** FR-T1, FR-T2, FR-T4, FR-T5, FR-T6, FR-T7, FR-S1, FR-S2, FR-S3, FR-S5, FR-S6, FR-S7, FR-S8, FR-S9, FR-S10

**Implementation notes:** Carries **Day 0 Gate item 5** and the second hardest risk — Privy sponsor co-sign over partially signed bytes. Establishes the machinery Epic 6 reuses without modification: the durable-intent sequence (AD-8), the AD-10 checklist run twice, sign-only through Privy, sponsor co-sign, Convex broadcast, parsed confirmation (AD-11), and the sponsorship caps, allowlists and kill switch (AD-17, NFR-4). Exact USDC only — no routing here. Also delivers `payment-sheet`, `settlement-stepper`, and the human-readable state mapping (UX-DR13, UX-DR16, UX-DR36).

### Epic 4: Author the tab

An organizer names a tab, enters what the table ordered, and applies the real-world adjustments a Bangkok restaurant bill actually carries — service charge, VAT, a discount, a group tip — and watches the total resolve.

**FRs covered:** FR-B1, FR-B2, FR-B3

**Implementation notes:** Manual entry only; receipt import is Epic 8 behind a flag, and the two capture paths must converge on the same item shape so Epic 8 adds a source rather than a branch. This epic and Epic 5 share `convex/tabs.ts` and the item list; they stay split because Epic 4 is independently demoable and is the natural parallel-work seam for a four-person team.

### Epic 5: Claim, compute, lock

Everyone claims their items on the same live board — additively, so two people reaching for the same dish get a split rather than a conflict — sees their exact share with every satang inspectable, and the organizer locks the bill into immutable per-person obligations.

**FRs covered:** FR-C1, FR-C2, FR-C3, FR-C4, FR-C5, FR-M4, FR-M5, FR-M6, FR-M7, FR-M8, FR-B4, FR-B5, FR-B6, FR-B7

**Implementation notes:** Claiming and computation are one epic because the sticky footer's running personal subtotal already requires the proportional-adjustment math of FR-M5 — splitting them would create a forward dependency. Allocation and remainder logic lives in `lib/domain/` as pure unit-tested functions (AD-6); the lock verifies the FR-M6 invariant and writes the snapshot plus obligations in one transaction (AD-7). The concurrency experience is product-specific and designed, not emergent (UX-DR31, UX-DR32, UX-DR33), and rounding asymmetry is disclosed as its own breakdown line (UX-DR28). Bill Review is read-only for every participant, not an organizer privilege (UX-DR23).

### Epic 6: Settle your share

A participant pays exactly what they owe, in the one token they happen to hold, and the person who fronted the bill receives USDC. The board settles in place, the group's ring advances, and nobody sees the word swap.

**FRs covered:** FR-S4 and FR-T3 — extending the Epic 3 settlement spine to bill obligations, DFlow-routed SOL input, and optional round-up tips

**Implementation notes:** Reuses Epic 3's canonical intent state machine, validation checklist, sponsor path, and confirmation parser. The delta is the DFlow Node action, the bounded target-output solver (NFR-9), and offsetting a bill obligation rather than a tip. My Tab owns a maximum 60-second quote TTL and idempotency; `otherAmountThreshold` is the minimum-output field. "At least" is the required honest phrasing (UX-DR29). OQ-2 is resolved by the readiness contract: exact USDC plus routed native SOL represented by the wrapped-SOL mint are the P0 inputs, with USDC output only.

### Epic 7: Balances, activity, and all square

A person opens My Tab and one sentence tells them where they stand. Every claim, lock, tip and payment is on the record. When the last obligation clears, the group gets its one moment — and then the product goes quiet again.

**FRs covered:** FR-L1, FR-L2, FR-L3, FR-L4, FR-L5, FR-L6, FR-M9

**Implementation notes:** Balances derive from immutable ledger events (AD-12), never from a mutable paid flag, and every ring and counter reflects confirmed money only (UX-DR30). Owns the accessibility and device floor for the whole product (NFR-10, UX-DR42 through UX-DR47), the `all-square-card` firing exactly once per bill, and the demo-readiness work: seeded dataset, the non-production badge, and the backup video.

### Epic 8: Scan the receipt

The organizer photographs the restaurant receipt instead of typing it, corrects the two rows the model got wrong, and confirms. The tab fills itself.

**FRs covered:** FR-R1, FR-R2, FR-R3, FR-R4, FR-R5, FR-R6, FR-R7

**Implementation notes:** Extraction is advisory input and never authority (AD-18): every amount is re-parsed to integer minor units and every line total recalculated deterministically before display, and organizer confirmation is required before any item is created. It follows the manual-entry domain path and may be feature-flagged during integration, but it remains part of the complete build. Manual entry from Epic 4 is always available and "Use sample receipt" is the seeded fallback. Presented as scanning, never as intelligence: no sparkle, no wand, no confidence percentage (UX-DR48).

---

## Epic 1: Signed in and wallet-ready, inside Telegram

A person opens My Tab from a Telegram link and is already authenticated, holding a Solana wallet they were never asked about — no login screen, no connect-wallet step, no seed phrase. This epic also lays the greenfield scaffold, the design foundation, and the pure integer-money module that every later epic computes against.

**Covers:** FR-A1…A6, FR-W1…W3, FR-M1…M3 · NFR-3 (partial), NFR-7, NFR-8 · UX-DR1…UX-DR5, UX-DR24 (Authenticating, Auth recovering)
**Carries Day 0 Gate items 1–4.** Story 1.5 is the project's highest-risk seam (OQ-1 / research R-1).

### Story 1.1: Project scaffold with coordinated Vercel and Convex deployment

As a developer on the My Tab team,
I want a single Next.js repository with a colocated Convex backend that ships both targets from one build command,
So that every later story has one place to add code, one command to deploy, and no ambiguity about which runtime owns what.

**Acceptance Criteria:**

**AC1 — The Structural Seed exists**

**Given** an empty repository
**When** the scaffold story is complete
**Then** the directory tree matches the Architecture Spine's Structural Seed: `app/(miniapp)/`, `app/api/`, `components/primitives/`, `features/`, `lib/domain/`, `lib/{telegram,privy,solana,dflow,formatting}/`, `convex/`, `convex/internal/`, and `tests/{domain,convex,e2e}/`
**And** `app/layout.tsx`, `app/providers.tsx`, `convex/schema.ts`, `convex.json`, `next.config.ts`, and `vercel.json` are present
**And** no directory exists for a second backend, a second component system, or a second state-management layer

**AC2 — Version floors are locked, not ranged**

**Given** the package manifest
**When** dependencies are installed
**Then** React and React DOM resolve to 19.x, TypeScript is 5.x with `strict: true`, and Next.js is the current stable App Router release
**And** every Astryx package (`@astryxdesign/core`, `@astryxdesign/theme-neutral`, `@stylexjs/stylex`) is pinned to an exact version because Astryx is Beta
**And** a lockfile is committed

**AC3 — Forbidden dependencies are absent and stay absent**

**Given** the installed dependency tree
**When** it is inspected
**Then** it contains no PostgreSQL client, Supabase, Prisma, Drizzle, Redis client, Express, Fastify, shadcn/ui, TanStack Query, or `@stylexjs/babel-plugin` (AD-2, AD-20, research R-5)
**And** a check exists that fails the build if any of them is introduced

**AC4 — One build command deploys both targets**

**Given** a push to the connected branch
**When** Vercel builds
**Then** the build command is `npx convex deploy --cmd 'npm run build'` with `CONVEX_DEPLOY_KEY` set in Vercel (AD-3)
**And** the deployed Next.js app is bound to the Convex deployment that same build provisioned
**And** `GET /api/health` returns the resolved Convex deployment identifier so a wrong-deployment binding is visible without guessing

**AC5 — Preview environments are inert and visibly non-production**

**Given** a preview deployment
**When** the app loads
**Then** a non-production badge is visible in the UI
**And** the environment cannot send a real Telegram message or spend real sponsor funds (AD-3)
**And** automated egress tests prove Telegram, Privy sponsor, DFlow, receipt provider, and production RPC endpoints are denied in preview rather than merely hidden by UI configuration

**AC6 — Secrets sit in the runtime that consumes them**

**Given** the environment configuration
**When** it is audited
**Then** no server secret carries a `NEXT_PUBLIC_` prefix (NFR-8, AD-19)
**And** Convex holds the DFlow API key, Telegram bot token, `OPENAI_API_KEY`, Privy app secret, Privy sponsor wallet ID, and server RPC key
**And** Convex also holds the Telegram webhook secret and provider-webhook secrets because it owns those HTTP Actions
**And** Vercel holds only `CONVEX_DEPLOY_KEY` plus, if the AD-5 fallback is activated, Privy verification credentials and the token-bridge signing key
**And** preview and production credentials are separate values, not shared
**And** an environment-contract test fails if `TELEGRAM_WEBHOOK_SECRET` is present in Vercel or absent from Convex

### Story 1.2: My Tab design foundation on Astryx

As a developer building any My Tab screen,
I want the complete token set, type scale, and layout frame available as one configured Astryx theme,
So that every surface is built from one system and no screen invents its own colors, spacing, or numerals.

**Acceptance Criteria:**

**AC1 — Tokens are defined once and consumed everywhere**

**Given** the theme configuration extending `@astryxdesign/theme-neutral`
**When** it is loaded
**Then** all 21 color tokens, 4 radius tokens, and the 8-step spacing scale from `DESIGN.md` are defined with their exact values (UX-DR1)
**And** `mode="light"` is forced with no dark variant and no `prefers-color-scheme` branch
**And** a hardcoded hex value outside the token set fails review

**AC2 — The type scale renders correctly in both scripts**

**Given** the nine type roles from `DESIGN.md`
**When** a screen uses them
**Then** Instrument Sans loads via `next/font` with the documented system fallback stack, base tracking `-0.006em`, and per-size negative tracking (`-0.032em` at 42px, `-0.028em` at 34px, `-0.02em` at 24px, `-0.018em` on titles) (UX-DR2)
**And** a string mixing Thai and Latin characters renders without clipping ascenders or descenders

**AC3 — Every numeral is tabular**

**Given** any surface that displays a figure
**When** it renders
**Then** the numerals are tabular, including inside skeleton placeholders (UX-DR3)
**And** a column of amounts of differing digit counts aligns on the decimal with no horizontal shift

**AC4 — Elevation is border-led**

**Given** a card, a button, and a sheet
**When** they render
**Then** the card is `surface` on `paper` with a 1px `border` and `0 1px 2px rgba(10,32,56,0.045)`, the primary button carries `inset 0 -1px 0 rgba(10,32,56,0.24)`, and only a floating sheet gets a real shadow with a dimmed scrim (UX-DR4)
**And** no hover lift, pressed elevation, or layered card stack exists anywhere

**AC5 — The layout frame holds at the device floor**

**Given** the app shell
**When** it renders at 320px, 390px, and Telegram Desktop width
**Then** it is a single column with 16px gutters, 20px card padding, and no horizontal scroll at any width (UX-DR5)
**And** on Desktop the same 390px column centers on `paper` with no wide layout
**And** a screen's primary action is pinned to a bottom `surface` bar with a top `border` above the safe area — never floating, never a circular FAB

### Story 1.3: Integer money module in lib/domain

As a developer implementing any amount in My Tab,
I want a pure, unit-tested module that represents fiat and crypto as integers and refuses to produce a float,
So that a locked bill total can never drift and every later epic computes against one audited implementation.

**Acceptance Criteria:**

**AC1 — Fiat is int64 minor units**

**Given** a THB amount of 291.74 baht
**When** it is represented in the domain module
**Then** it is stored as the integer `29174` satang in a signed 64-bit field (FR-M1)
**And** formatting to "฿291.74" happens only at the display boundary, never in storage or arithmetic

**AC2 — Crypto is atomic units with persisted decimals**

**Given** a USDC amount
**When** it is represented
**Then** it is an atomic-unit integer carried as `bigint` in memory and as a decimal string across a JSON boundary (FR-M2)
**And** the mint's decimal count is carried alongside the amount, never assumed from the token symbol

**AC3 — Floats cannot enter**

**Given** the domain module's public surface
**When** any function is called with a JavaScript number that is not an integer
**Then** it throws rather than silently truncating (FR-M3)
**And** no function in `lib/domain/` returns a non-integer numeric type for a money value

**AC6 — Bounds, overflow, and empty denominators fail closed**

**Given** every public money or quantity boundary
**When** it receives a float, negative value where not explicitly signed, value beyond the readiness-contract maximum, checked-int64 overflow, bigint overflow policy, zero split denominator, zero recipient set, or percentage outside 0–10000 basis points
**Then** it rejects with a stable domain failure before persistence
**And** property tests cover minimum, maximum, maximum+1, negative, zero-denominator, and chained-adjustment overflow cases

**AC4 — The module is pure and independently testable**

**Given** `lib/domain/`
**When** its imports are inspected
**Then** it imports nothing from `convex/`, performs no I/O, and reads no environment variable (AD-6)
**And** unit tests run without a Convex instance, a network connection, or a database

**AC5 — Naming makes money self-identifying**

**Given** any money-bearing field or parameter in the module
**When** it is named
**Then** it ends in `Minor` for fiat or `Atomic` for crypto
**And** a money value named without one of those suffixes fails review

### Story 1.4: Zero-click Privy Telegram login with an embedded Solana wallet

As someone who tapped a My Tab link in a Telegram group,
I want the app to already know who I am and to already hold a wallet for me,
So that I never see a login screen, a connect-wallet step, or a seed phrase.

**Acceptance Criteria:**

**AC1 — Authentication is invisible inside Telegram**

**Given** a person opening the Mini App from inside Telegram on iOS, Android, or Desktop
**When** the app loads
**Then** Privy's Telegram login completes with zero clicks and no login screen, no "connect wallet" affordance, and no wallet-selection step appears anywhere (FR-A1, UX-DR — *Authentication is invisible*)
**And** the provider order is exactly `TelegramRuntimeProvider` → `PrivyProvider` → `PrivyConvexProvider` → theme (AD-15)

**AC2 — A Solana wallet exists without being requested**

**Given** a first-time user completing login
**When** authentication resolves
**Then** exactly one Privy embedded Solana wallet is created for them (FR-W1)
**And** a returning user's existing wallet is restored rather than a second one created
**And** at no point is the user asked to create, fund, back up, or approve a wallet

**AC3 — The Launch state is designed, not a spinner**

**Given** authentication in progress
**When** the Launch surface renders
**Then** it shows the wordmark, an indeterminate indicator, and "Getting your tab ready…" with no buttons, no login affordance, and no elapsed timer (UX-DR24)

**AC4 — Session refresh is silent**

**Given** an authenticated session whose token needs refreshing
**When** the refresh occurs
**Then** nothing appears in the UI
**And** if the refresh genuinely fails, a single inline "Reconnecting…" bar appears with cached reads still visible — never a modal and never a logout (UX-DR24, NFR-6)

**AC5 — Live surfaces are Client Components**

**Given** any surface that subscribes to Convex
**When** it is implemented
**Then** it is a Client Component and there is no authenticated server-side rendering (AD-15)
**And** Server Components are used only for static shell and landing content

### Story 1.5: A Privy access token authenticates a Convex query

As a developer,
I want Convex to accept a Privy access token as a verified identity,
So that every private function can trust `ctx.auth` instead of taking a user ID as an argument.

**Acceptance Criteria:**

**AC1 — The custom-JWT path is configured as specified**

**Given** `convex/auth.config.ts`
**When** it is deployed
**Then** it declares `type: 'customJwt'`, `issuer: 'privy.io'`, `applicationID` set to the Privy app ID, `algorithm: 'ES256'`, and a **base64 `data:` URI JWKS** carrying the Privy app verification key (AD-5, research R-2, R-3)
**And** no hosted JWKS route is used on this path, because Privy publishes no JWKS endpoint

**AC2 — A real token authenticates a real query — the Day 0 Gate**

**Given** a live Privy access token obtained inside a deployed Telegram Mini App
**When** a Convex query calls `ctx.auth.getUserIdentity()`
**Then** it returns a non-null identity whose subject is the Privy DID (FR-A3, FR-A2)
**And** the token's real `kid`, `alg`, `aud`, and `iss` header values are inspected and recorded against OQ-1 / research R-1
**And** token refresh continues to authenticate without a page reload

**AC6 — The generated public API authorization matrix passes**

**Given** every generated public Convex query, mutation, and action
**When** the authorization suite invokes it unauthenticated, with valid identity but wrong group/role, outside Telegram for a mutation, and with correct scope
**Then** only the documented read/write cases succeed
**And** adding a public function without matrix entries fails CI

**AC3 — The identity helper exists and is the only entry point**

**Given** any Convex public function that exposes private data
**When** it executes
**Then** it begins with the shared `requireIdentity` helper rather than ad-hoc auth logic (NFR-3)
**And** `requireIdentity` throws on a null identity rather than returning a default or anonymous user

**AC4 — Client-supplied identity is never accepted**

**Given** any Convex public function
**When** its arguments are inspected
**Then** none of them accepts a Privy DID, Telegram ID, chat ID, wallet ID, or wallet address from the browser (FR-A5, AD-5)
**And** the Solana address is never used as a primary key or lookup key for identity (FR-A2)

**AC5 — The gate outcome is recorded, and it decides the next story**

**Given** the spike result
**When** it is written up
**Then** it states explicitly whether Convex's issuer normalization accepts the bare `privy.io` issuer (OQ-1)
**And** if it does not, Story 1.6 is activated immediately and no UI feature work proceeds until identity is non-null in Convex

### Story 1.6: Token-bridge fallback for Convex authentication *(contingency — build only if Story 1.5 fails)*

As a developer blocked by an issuer mismatch between Privy and Convex,
I want a bounded Vercel token bridge that mints a My Tab JWT Convex will accept,
So that the auth seam is unblocked in hours without falling back to client-supplied user IDs.

**Acceptance Criteria:**

**AC1 — The bridge verifies before it mints**

**Given** a request to `POST /api/auth/convex-token` carrying a Privy access token
**When** the Route Handler runs
**Then** it verifies the token with `@privy-io/node` and rejects an invalid, expired, or wrong-audience token (AD-5)
**And** it mints a My Tab JWT with a five-minute expiry whose subject is the verified Privy DID

**AC2 — The bridge stays an adapter**

**Given** the Route Handler's implementation
**When** it is reviewed
**Then** it contains no domain logic, no authorization decision beyond token validity, and no Convex write (AD-1)

**AC3 — Convex accepts the bridged token**

**Given** `convex/auth.config.ts` pointed at the bridge's issuer
**When** a bridged token is supplied through `ConvexProviderWithAuth`
**Then** `ctx.auth.getUserIdentity()` returns a non-null identity with the Privy DID as subject
**And** the public key is served at `GET /.well-known/jwks.json`

**AC4 — Expiry is handled without the user noticing**

**Given** a bridged token approaching its five-minute expiry
**When** the client refreshes
**Then** a new token is minted and the Convex connection continues uninterrupted (NFR-6)

**AC5 — The forbidden fallback stays forbidden**

**Given** either auth path
**When** it fails entirely
**Then** the application surfaces a recoverable error and **never** falls back to accepting a client-supplied user ID (AD-5)

### Story 1.7: Verified Telegram identity bound to the Privy DID

As a person using My Tab inside a Telegram group,
I want My Tab to know which Telegram account I am, proven rather than claimed,
So that my group context is real and nobody can act as me by editing a request.

**Acceptance Criteria:**

**AC1 — Only server-verified initData binds an identity**

**Given** the Mini App holding raw Telegram `initData`
**When** it posts the payload with a valid Privy bearer JWT to authenticated `POST /telegram/bootstrap` in `convex/http.ts`
**Then** the HTTP Action validates raw `initData` with the bot token before extracting any field, enforces a five-minute `auth_date`, matches the hashed session token, and atomically creates or refreshes a five-minute server-side context bound to the verified Privy subject, Telegram user, chat, group, and session (FR-A4, AD-14)
**And** it invokes internal Convex functions only; there is no public bootstrap mutation or Vercel write bridge
**And** `initDataUnsafe` is never read on the server or trusted on the client for any authorization purpose
**And** an invalid, replayed, or expired `initData` payload is rejected with no binding written
**And** reloading the same valid launch under the same Privy DID idempotently refreshes the context, while reuse of its `initData` hash by another DID is rejected, audited, and writes nothing

**AC2 — The users document links three distinct identifiers**

**Given** a successful Privy verification and a successful Telegram verification
**When** the `users` document is written
**Then** it stores `privyDid` as the external auth subject and `telegramUserId` as the linked Telegram identity, kept as separate fields that are never collapsed (AD-4, FR-A2)
**And** the Convex document `_id` is the internal foreign key used by every other table
**And** the link is written only after **both** verifications succeed

**AC3 — getCurrentUser is the single lookup**

**Given** an authenticated Convex function needing the acting user
**When** it resolves them
**Then** it uses the shared `getCurrentUser` helper reading from a `by_privy_did` index (NFR-3)
**And** no function looks a user up by Telegram ID or wallet address

**AC4 — Only required profile data is stored**

**Given** the verified Telegram profile
**When** it is persisted
**Then** only the fields the product actually renders are stored — display name, username, avatar reference — and nothing else (NFR-7)
**And** no raw Privy access token is stored at any point

**AC6 — Telegram context is required for writes**

**Given** a valid Privy identity outside Telegram or with stale/unverified group context
**When** it calls any product mutation
**Then** the server rejects it with `TELEGRAM_CONTEXT_REQUIRED` while authorized reads remain available
**And** every public mutation uses the shared helper that checks both Privy identity and the current Telegram binding

**AC5 — No second session system exists**

**Given** the running application
**When** its session handling is reviewed
**Then** there is exactly one application session, owned by Privy (AD-4)
**And** no Telegram-only session, cookie, or parallel token exists beside it

### Story 1.8: Wallet record synced with one default receiving wallet

As a person who will be paid by someone in my group,
I want My Tab to hold one address that is definitively mine,
So that money sent to me arrives without anyone typing an address.

**Acceptance Criteria:**

**AC1 — Only non-sensitive wallet data is stored**

**Given** a Privy embedded wallet
**When** the `wallets` record is written
**Then** it stores the Privy wallet ID and the Solana address and nothing else (FR-W2)
**And** no private key, seed phrase, mnemonic, or exported key material is written to the database or to any log (NFR-7)

**AC2 — Exactly one default receiving wallet exists per user**

**Given** a user with one or more wallets
**When** their receiving wallet is resolved
**Then** exactly one is marked default (FR-W3)
**And** an embedded wallet is distinguishable from an external wallet by a stored type field
**And** attempting to mark a second wallet default in the same transaction is rejected

**AC3 — The address is server-owned**

**Given** any later flow that needs this user's receiving address
**When** it resolves it
**Then** it reads the Convex `wallets` record and never a request body, a deep link, or a client field (AD-13, FR-A5)

**AC4 — The wallet record survives a restore**

**Given** a returning user whose embedded wallet already exists at Privy
**When** they authenticate
**Then** the existing `wallets` record is matched by Privy wallet ID and reused
**And** no duplicate wallet record is created

**AC5 — The "You" surface shows the wallet without becoming a wallet app**

**Given** the You surface
**When** it renders
**Then** it shows the receiving preference in plain language with no token list, no portfolio value, no price chart, and no network selector (UX-DR48)

### Story 1.9: Opaque session tokens that resolve, expire, and revoke

As a person tapping a shared link,
I want the link to carry nothing about me or the money involved,
So that a forwarded or guessed link cannot leak or redirect anything.

**Acceptance Criteria:**

**AC1 — The token carries no meaning**

**Given** a generated session token
**When** it is inspected
**Then** it is opaque and randomly generated, encoding no database ID, chat ID, Telegram ID, wallet address, amount, or recipient (FR-N3, AD-13)
**And** it is hashed at rest, so a database read does not yield a usable token

**AC2 — Resolution maps a token to exactly one session subject**

**Given** a valid unexpired token
**When** it is resolved server-side
**Then** it returns exactly one session subject and its scope (FR-A6)
**And** resolution happens only in Convex — never in a Route Handler and never on the client

**AC3 — Invalid tokens are rejected by category**

**Given** a token that is expired, revoked, already consumed where single-use, or scoped to a subject the caller may not access
**When** it is presented
**Then** it is rejected (FR-A6)
**And** the rejection reason is a stable failure code mapped to product copy, never a raw error

**AC6 — Reusable and single-use tokens cannot be confused**

**Given** token creation
**When** its type is chosen
**Then** `tab_session` is reusable by verified members for 24 hours and `action_token` is subject-bound, single-use, and valid for 10 minutes
**And** consumption logic rejects a token whose stored type does not match the requested operation

**AC4 — Revocation is immediate**

**Given** a revoked token
**When** it is presented after revocation
**Then** it is rejected on the first attempt with no grace window

**AC5 — Expiry is enforced by the scheduler, not by read-time luck**

**Given** tokens that pass their expiry
**When** the Convex cron runs
**Then** they are marked expired on a schedule (AD-16)
**And** a read of an expired-but-not-yet-swept token still rejects it

### Story 1.10: External Solana wallet connection

As a person who already owns a Solana wallet,
I want to connect it and receive into it instead of the embedded wallet,
So that my My Tab balance lands where I already keep funds.

**Acceptance Criteria:**

**AC1 — Sequenced after the embedded path is proven**

**Given** the external-wallet story begins
**When** its dependency gate is checked
**Then** the embedded wallet, receiving-wallet guard, and exact-USDC Day 0 transaction already pass
**And** the `wallets` schema distinguishes embedded from external so this feature changes no identity invariant

**AC2 — Connection is wallet-standard-first when built**

**Given** the feature is activated
**When** a user connects an external wallet
**Then** connection uses the wallet-standard flow, the address is verified by signature, and a `wallets` record of type external is written
**And** exactly one wallet remains marked default (FR-W3)

**AC3 — Sponsorship boundaries are re-checked**

**Given** an external wallet set as the receiving wallet
**When** it is used as a settlement recipient
**Then** it passes the same recipient allowlist and sponsorship checks as an embedded wallet (AD-17, NFR-4)

---

## Epic 2: The group chat starts the tab

Someone types `/tab` in a Telegram group and the group gets one card with an `[Open tab]` button. Everyone who taps it lands in the same scoped, authenticated session, and the group's card keeps itself current instead of flooding the chat.

**Covers:** FR-N1…N6, FR-G1…G5 · NFR-2, NFR-6, NFR-7 · UX-DR21, UX-DR22, UX-DR37, UX-DR38, UX-DR45

### Story 2.1: Telegram webhook ingress that verifies, normalizes, and returns fast

As a developer,
I want one verified webhook endpoint that hands Telegram updates to Convex and returns immediately,
So that the bot never double-processes an update and never blocks Telegram waiting on our own work.

**Acceptance Criteria:**

**AC1 — There is exactly one ingress and it verifies the secret**

**Given** a POST from Telegram to the configured Convex HTTP Action
**When** the HTTP Action runs
**Then** it compares `X-Telegram-Bot-Api-Secret-Token` in constant time before processing the update and rejects a missing or wrong secret with no mutation call (FR-N2)
**And** no Vercel Route Handler or public Convex mutation is registered as a second Telegram ingress

**AC2 — The handler stays an adapter**

**Given** the Convex HTTP Action's implementation
**When** it is reviewed
**Then** it verifies, validates only supported update shapes, normalizes them, invokes internal mutations with the verified `chat.id`, `from.id`, message ID, update ID, and command, and returns
**And** it contains no bill calculation, no authorization decision, no DFlow call, and no ledger write

**AC3 — It returns before slow work happens**

**Given** an update that triggers downstream work
**When** the handler responds
**Then** it returns without waiting for extraction, DFlow, confirmation polling, or reminders (FR-N2)
**And** the downstream work runs on the Convex scheduler (AD-16)

**AC4 — Updates are idempotent by update ID**

**Given** the same Telegram update delivered twice
**When** both are processed
**Then** exactly one effect occurs — one session, one message, one record (FR-N5, NFR-2)
**And** the idempotency key and its result are persisted in Convex, never held in function-instance memory
**And** a test replays an identical payload and asserts a single effect

**AC5 — An unsupported update is ignored cleanly**

**Given** an update that is not a supported command or callback
**When** it arrives
**Then** it is acknowledged with a 200 and produces no state change and no group message

### Story 2.2: A My Tab group resolved from the verified Telegram chat

As a member of a Telegram group,
I want My Tab to know my group as a real thing with real members,
So that everything I do is scoped to the people actually at the table.

**Acceptance Criteria:**

**AC1 — Groups come from the webhook, never from the client**

**Given** a verified update carrying a chat ID
**When** the group is resolved
**Then** it is created if absent and matched if present, keyed off the server-verified chat ID (FR-G1)
**And** no client-supplied chat ID, group ID, or membership claim is ever accepted (FR-G5, FR-A5)

**AC2 — The group carries what the UI needs**

**Given** a resolved group
**When** it is read
**Then** it exposes display name, avatar, and for each member their join state, role, and wallet readiness (FR-G2)
**And** wallet readiness reflects whether that member has a default receiving wallet on record

**AC3 — Membership authorization is a shared helper**

**Given** any Convex public function scoped to a group
**When** it executes
**Then** it begins with `requireGroupMember`, which resolves membership from `groupMembers` and throws otherwise (NFR-3)
**And** membership is never inferred from a client claim or from the presence of a link (FR-G5)

**AC4 — Only the profile data the product renders is stored**

**Given** Telegram profile fields available on an update
**When** members are persisted
**Then** only rendered fields are stored (NFR-7)
**And** no group message content is retained beyond what the status message needs

**AC5 — Silent members and lifecycle changes are verified**

**Given** a group member who never sent a bot-visible message
**When** they first open a valid tab session with verified `initData`
**Then** Convex calls `getChatMember`, requires the bot to be an administrator, and creates or refreshes `groupMembers` only for an allowed current status
**And** leave, kick, restriction, rejoin, role-change, and bot-admin-loss updates revoke or refresh write scope
**And** a privileged mutation refreshes membership proof when it is older than five minutes

### Story 2.3: `/tab` starts a tab and posts the deep-link card

As the person who just got handed the bill,
I want to type one command and have the group get a button,
So that everyone can join without me collecting names, numbers, or addresses.

**Acceptance Criteria:**

**AC1 — The command creates a tab and an opaque token**

**Given** an authorized group member types `/tab`
**When** the update is processed
**Then** Convex creates a tab scoped to that group with the sender as organizer and status `draft`, and mints an opaque session token using the Story 1.9 primitive (FR-N1, FR-A6)
**And** repeating `/tab` within the idempotency window does not create a second tab (NFR-2)

**AC2 — The deep link leaks nothing**

**Given** the posted card
**When** its button URL is inspected
**Then** it is exactly `https://t.me/<bot>/<miniapp>?startapp=<opaque-token>` (FR-N3)
**And** it contains no database ID, chat ID, Telegram ID, wallet address, amount, or recipient
**And** the button label is `[Open tab]` on every posting (UX-DR37)

**AC3 — The card is the tab-opened event**

**Given** a newly started tab
**When** the bot posts
**Then** it posts one message naming the tab and inviting the group to open it — one of the five sanctioned event types (FR-N4, UX-DR38)

**AC4 — Multiple open tabs are supported**

**Given** a group that already has an open tab
**When** `/tab` is used again
**Then** a second tab is created and both remain open (FR-G4)
**And** each has its own token and its own status message

**AC5 — Creation is bounded without removing multi-tab support**

**Given** a verified member who is below the AD-24 limits
**When** they create tabs up to the boundary
**Then** multiple open tabs continue to work, up to 10 simultaneously open tabs per group
**And** creation atomically enforces 10 tabs per user per UTC day, 30 per group per UTC day, and the reviewed global daily cap before writing a tab, token, or bot message
**And** a request above any limit returns a stable retry-after error and creates no durable object or Telegram message

**AC6 — A non-member cannot start a tab**

**Given** a sender who is not a verified member of the chat
**When** the command is processed
**Then** it is rejected with no tab created and no group message posted (FR-G5)

### Story 2.4: One status message per tab, edited in place

As a member of a busy group chat,
I want the bot to keep one card current rather than posting after every event,
So that My Tab never becomes the reason someone mutes the group.

**Acceptance Criteria:**

**AC1 — One message, edited, not replaced**

**Given** a tab with a posted status message
**When** its state changes
**Then** the bot edits that same message rather than posting a new one, and stores the message ID for that tab (FR-N4, UX-DR37)
**And** a second status message for the same tab is never created

**AC6 — Deletion recovery recreates one canonical message**

**Given** Telegram reports that the stored status message no longer exists or cannot be edited
**When** the scheduled publisher handles the permanent edit error
**Then** it posts one replacement, atomically stores the new message ID, and retries subsequent updates against that ID
**And** concurrent recovery attempts deduplicate against the tab plus event version

**AC2 — Only five events ever post**

**Given** any domain event
**When** the bot's publishing rules are applied
**Then** only these post or update: tab opened, bill ready to settle, payment confirmed, bill completed, tip confirmed (FR-N4, UX-DR38)
**And** claims, edits, joins, and reminders never produce a group message

**AC3 — Group messages carry group facts only**

**Given** a status message at any state
**When** its content is inspected
**Then** it contains only group-level facts — tab name, people count, total, claim or settlement progress (UX-DR38, NFR-7)
**And** it never contains who owes what, an individual amount, a wallet address, or a transaction link

**AC4 — Publishing is idempotent and retryable**

**Given** a publish that fails or is attempted twice
**When** it is retried
**Then** exactly one message exists and one edit is applied (NFR-2)
**And** a Telegram failure retries on the scheduler without rolling back confirmed money state (NFR-6, AD-16)

**AC5 — Preview environments do not post**

**Given** a preview deployment
**When** a publishable event occurs
**Then** no real Telegram message is sent (AD-3)

### Story 2.5: `/tip`, `/balance`, and the `/splitbill` alias

As someone in the group,
I want the other three commands to do the obvious thing,
So that the bot behaves like a tool and not like a demo with one path.

**Acceptance Criteria:**

**AC1 — All four commands are registered and routed**

**Given** the bot's command set
**When** it is inspected
**Then** `/tab`, `/splitbill`, `/tip`, and `/balance` are all registered (FR-N1)
**And** `/splitbill` routes to the identical handler as `/tab` with identical behavior

**AC2 — `/tip` opens a scoped tip session**

**Given** a verified group member types `/tip`
**When** it is processed
**Then** an opaque token is minted for a tip session scoped to that group and a card with `[Open tab]`-equivalent action is posted (FR-N1, FR-N3)

**AC3 — `/balance` answers without leaking**

**Given** a verified group member types `/balance`
**When** it is processed
**Then** the group receives no individual amounts (NFR-7, UX-DR38)
**And** the member's own position is reachable through a scoped session rather than stated in the chat

**AC4 — Commands from an unverified sender are rejected**

**Given** any of the four commands from a sender who fails verification
**When** processed
**Then** the command is rejected with no state change (FR-G5)

### Story 2.6: A deep link lands in a scoped session with the tab bar hidden

As someone who tapped `[Open tab]` from the group,
I want to arrive inside the tab itself,
So that I am not dropped into an app I then have to navigate.

**Acceptance Criteria:**

**AC1 — The token resolves to a scoped session on arrival**

**Given** the Mini App opened with a `startapp` token
**When** it loads
**Then** the token is resolved server-side to its tab and group, and the app opens directly on that tab's surface already authenticated and already scoped (FR-N3, FR-A6, UX-DR37)

**AC2 — The tab bar is hidden on a deep-linked arrival**

**Given** an arrival from a Telegram deep link
**When** the tab surface renders
**Then** the three-item bottom tab bar is hidden entirely (UX-DR22)
**And** the only exit is the header back control, which lands on Tabs

**AC3 — Global navigation exists on a cold open**

**Given** the app opened without a deep-link token
**When** it renders
**Then** the bottom tab bar shows **Tabs · Activity · You** with no drawer and no hamburger (UX-DR21)
**And** sheets stack one level deep, never two

**AC4 — A rejected token fails into somewhere useful**

**Given** an expired, revoked, or unauthorized token
**When** the app opens with it
**Then** the person lands on Tabs with a single plain-language line explaining the link is no longer valid (FR-A6)
**And** no modal, no error code, and no dead end

**AC5 — Arriving joins you to the tab**

**Given** a verified group member opening a valid tab token for the first time
**When** the token resolves
**Then** a `tabParticipants` record is created linking them to that tab, so later epics can authorize them with `requireParticipant` (FR-C3, NFR-3)
**And** re-opening the same link does not create a second participant record (NFR-2)
**And** a person who is not a verified member of the group is not joined (FR-G5)

**AC6 — First open bootstraps a silent verified member**

**Given** a Telegram user absent from `groupMembers` because they have never spoken to the bot
**When** valid `initData`, matching `chat_instance`, and `getChatMember` prove current membership
**Then** membership and `tabParticipants` are created atomically and the reusable session remains usable by the next verified member

### Story 2.7: The Group surface

As a member of a group,
I want one screen that shows where my group stands and what is open,
So that I can act without hunting.

**Acceptance Criteria:**

**AC1 — The group's defaults are visible, not buried**

**Given** the Group surface
**When** it renders
**Then** the group's default currency and its recipient asset are shown in plain language (FR-G3)
**And** no mint address, token logo, or network selector appears (UX-DR48)

**AC2 — Members render as people**

**Given** the member list
**When** it renders
**Then** each member shows name, avatar, and wallet readiness (FR-G2)
**And** a missing avatar renders an initial on a deterministic tint derived from the user id, never a generic silhouette (UX-DR46)

**AC3 — Open tabs are listed, one optimized for**

**Given** a group with one or more open tabs
**When** the surface renders
**Then** all open tabs are listed as `tab-card`s and the most recent active tab is visually primary (FR-G4, UX-DR7)
**And** the whole card is one tap target routing to that tab

**AC4 — Empty state is designed**

**Given** a group with no tabs
**When** the surface renders
**Then** it shows "No tabs yet. Start one from any Telegram group." with a "Start a tab" action beneath (UX-DR24)

### Story 2.8: Telegram-native runtime affordances

As someone using My Tab inside Telegram,
I want the app to respect the shell it is running in,
So that it feels native rather than like a website in a box.

**Acceptance Criteria:**

**AC1 — Safe areas and viewport are honored**

**Given** the app running in Telegram on iOS and Android
**When** any surface renders
**Then** safe-area insets are honored top and bottom, a sticky footer sits above the home indicator, and viewport-change events resize the layout without detaching the footer (FR-N6, UX-DR45)

**AC2 — Back is one control, never two**

**Given** a surface with a back affordance
**When** it renders inside Telegram
**Then** Telegram's native back control is used where exposed, and the in-app header chevron mirrors it — they never both appear (FR-N6, UX-DR45)
**And** the Android system back gesture maps to the same action

**AC3 — Haptics fire only at the three sanctioned moments**

**Given** the Telegram haptics API
**When** it is wired
**Then** it fires light on claim/unclaim, medium on lock, and success on confirmed payment, and at no other moment (UX-DR41)
**And** all haptics are suppressed under Reduce Motion

**AC4 — Expanded mode is requested where it helps**

**Given** the app launching in Telegram
**When** it initializes
**Then** it requests expanded mode so the single column has full height (FR-N6)

**AC5 — The standalone-browser fallback is read-only**

**Given** the app opened outside Telegram in a plain browser
**When** it loads
**Then** authenticated reads and cached presence function, unstyled by Telegram (UX-DR47)
**And** claiming, authoring, tipping, settlement, waiver, and manual-cash controls are disabled with "Open this in Telegram to make changes"
**And** direct mutation attempts fail server-side while Telegram-only affordances degrade silently rather than throwing

---

## Epic 3: Send a tip

One person taps another person's name, picks an amount, and money lands. No address is typed, no network fee is paid, and the group sees the one warm message of the evening. This is the entire settlement spine proven on the simplest possible flow.

**Covers:** FR-T1, T2, T4…T7, FR-S1, S2, S3, S5…S10 · NFR-1, NFR-2, NFR-4, NFR-5, NFR-6 · UX-DR9, UX-DR13, UX-DR14, UX-DR15, UX-DR16, UX-DR26, UX-DR27, UX-DR29, UX-DR36, UX-DR38, UX-DR41
**Carries Day 0 Gate item 5.** Establishes the machinery Epic 6 reuses unchanged.

> **Addition beyond the PRD and Architecture Spine — memo commitment.** Story 3.3 AC6, Story 6.1 AC6 and Story 6.2 AC6 add a memo instruction that commits each exact-USDC transfer on-chain to the record it settles. This is not derived from any FR or AD; it was added as a deliberate scope decision (2026-08-21) for verifiability. It requires the memo program in the AD-10 and AD-17 allowlists, and it does not apply to the DFlow path. If it is cut, cut all three ACs together.

### Story 3.1: Tip Composer — pick a person, pick an amount, add a note

As someone who wants to thank a person in my group,
I want to pick them, tap an amount, and say something,
So that tipping takes seconds and feels like a message rather than a transfer.

**Acceptance Criteria:**

**AC1 — Recipients are verified group participants, shown as people**

**Given** the Tip Composer
**When** the recipient selector renders
**Then** it lists only verified members of the group, each as a `participant-chip` with avatar and name (FR-T1, UX-DR9)
**And** selection is single-select, shown as a 2px `primary` ring and never a fill
**And** no wallet address appears anywhere on this surface (UX-DR48)

**AC2 — Presets and a custom amount both work**

**Given** a selected recipient
**When** the amount step renders
**Then** preset amount chips and a custom-amount entry are both available (FR-T1)
**And** the entered amount is converted to integer minor units on entry and never held as a float (FR-M1, FR-M3)

**AC3 — A note and a reaction are optional, never required**

**Given** the composer
**When** a person proceeds without a note or reaction
**Then** the tip is composable and payable (FR-T2)
**And** when supplied, the note and reaction are stored with the tip record

**AC4 — Opened with a recipient pre-selected where context supplies one**

**Given** the composer opened with a recipient supplied by the calling context rather than chosen from the list
**When** it renders
**Then** that person is already selected and the flow starts at the amount step (FR-T1)
**And** the entry point is a parameter of the surface, so later surfaces can supply a recipient without changing this story

**AC5 — Recipient asset is stated, not chosen**

**Given** a selected recipient
**When** the composer renders
**Then** it states that the recipient receives USDC (FR-T4)
**And** the recipient's asset is not a control the sender can change

### Story 3.2: A server-owned settlement intent, created before anything external happens

As a developer,
I want durable state written before any external API is called,
So that no money flow ever exists only inside an in-flight HTTP request.

**Acceptance Criteria:**

**AC1 — The mutation writes the intent, then schedules the action**

**Given** a person tapping to pay a composed tip
**When** the flow starts
**Then** a Convex **mutation** validates and inserts a `settlementIntents` document with status `created`, then calls `scheduler.runAfter(0, internalAction)` (AD-8, NFR-1, FR-S1)
**And** the browser never calls a public action as the first step of a money flow

**AC2 — The intent binds everything the transaction must match**

**Given** a created intent
**When** it is read
**Then** it carries user, wallet, the target (tip or obligation), recipient address, input mint, output mint, maximum input, minimum output, idempotency key, and expiry (FR-S2)
**And** money fields end in `Minor` or `Atomic` and mint decimals are stored with the intent (FR-M2, AD-6)

**AC3 — Recipient and amount come from the server**

**Given** the intent's recipient address
**When** it is resolved
**Then** it comes from the recipient's Convex `wallets` record and never from the request body (FR-T5, AD-13)
**And** the request carries only the recipient's internal user id and the amount the sender chose

**AC4 — After creation, the sender cannot change the terms**

**Given** an intent past `created`
**When** any request attempts to alter recipient, amount, output mint, or sponsor
**Then** it is rejected (FR-T6)

**AC5 — Ownership is a shared helper**

**Given** any function acting on an intent
**When** it executes
**Then** it begins with `requireIntentOwner`, which verifies the authenticated user owns that intent (NFR-3)

**AC6 — Creation is idempotent**

**Given** a double-tap or a retried creation with the same idempotency key
**When** both are processed
**Then** exactly one intent exists and the second returns the first's result from persisted Convex state (NFR-2, FR-T7)

### Story 3.3: An exact USDC transaction built with the sponsor as fee payer

As a person sending a tip,
I want the network fee paid for me,
So that I never need SOL and never see the word gas.

**Acceptance Criteria:**

**AC1 — The transaction is built server-side in a Node action**

**Given** a scheduled internal action for a `created` intent
**When** it runs
**Then** it builds the exact USDC transfer in a Convex Node action with `@solana/kit` (FR-S3, AD-9)
**And** the dedicated Privy-managed sponsor wallet address is set as fee payer

**AC2 — One sponsorship path exists in the codebase**

**Given** the whole repository
**When** it is searched
**Then** there is no client-side `signAndSendTransaction({ sponsor: true })` and no raw sponsor keypair (AD-9)
**And** exactly one sponsor wallet is configured per environment, with separate development and production wallets (AD-17)

**AC3 — Recipient token account handling is bounded**

**Given** a recipient with no existing USDC token account
**When** the transaction is built
**Then** account creation is included within the configured ATA-creation limit and is counted against sponsorship budget (AD-17, NFR-4)
**And** exceeding the limit fails the intent with a stable failure code rather than building the transaction

**AC4 — The result is written back through an internal mutation**

**Given** the built transaction
**When** the action completes
**Then** it writes the serialized transaction and its status through an internal mutation, never directly from the action's own return value to the client (AD-8)
**And** the subscribed client sees the transition without polling

**AC5 — Structured logs carry identifiers only**

**Given** any log line emitted during this flow
**When** it is inspected
**Then** it contains only `intentId`, `userId`, `statusTransition`, `durationMs`, and `failureCode` where applicable (NFR-5)
**And** it never contains a token, a secret, or transaction bytes

**AC6 — The transfer commits on-chain to what it is paying** *(addition beyond PRD/spine — see note below)*

**Given** an exact USDC transfer being built
**When** the instruction set is assembled
**Then** a memo instruction is appended carrying a hash that commits to the intent's target record — for a tip, the tip record and its terms
**And** the memo program is added to the AD-10 program allowlist and to the sponsorship instruction allowlist (AD-17, NFR-4), so the checklist accepts it deliberately rather than by omission
**And** the memo carries a hash only — never a name, an amount, a note, a Telegram ID, or an address (NFR-7)
**And** the memo is part of the message the AD-10 validator hashes, so altering it after quoting fails validation like any other change

### Story 3.4: The transaction validation checklist

As a developer,
I want one fixed checklist that every transaction must pass,
So that no client and no external router can substitute a different transaction between quote and sponsorship.

**Acceptance Criteria:**

**AC1 — The complete versioned AD-10 manifest is one reusable gate**

**Given** a serialized transaction and its intent
**When** the validator runs
**Then** it verifies the sole versioned FR-S6 / AD-10 manifest: authenticated payer and wallet own the intent · fresh Telegram membership/context · locked unsuperseded target · server-owned recipient and amount · input/output mints · maximum input and minimum output · routed-request sync/async/sponsor/ALT parameters, threshold, exact `sync` response, and `destinationWalletMustSign=false` · exact signer set `{payer,sponsor}` · sponsor fee payer · zero platform fee with no `feeAccount` · exact allowed programs, instruction discriminators, resolved ALT entries, writable roles, and no extra writable account · compute-unit, 250,000-lamport priority-fee, one-ATA/2,500,000-rent, and 3,000,000-total-sponsor limits · valid blockhash/`lastValidBlockHeight` · stored message hash · expected `ready_for_signature|user_signed` state · active `sponsor-v1` reservation and kill switch
**And** it is a single shared function, not duplicated logic at two call sites

**AC2 — The hash is stored before any byte reaches the client**

**Given** a validated transaction
**When** it is returned to the client
**Then** its serialized message hash has already been persisted on the intent and the status is `ready_for_signature` (FR-S5)

**AC3 — The checklist runs twice**

**Given** the settlement flow
**When** it is traced
**Then** the validator runs once before returning bytes and again before sponsor co-signing (AD-10)

**AC4 — A mutated transaction is rejected**

**Given** a test that alters the recipient, the amount, the fee payer, the mint, or an instruction after bytes are returned
**When** the altered bytes are submitted
**Then** validation fails and the intent moves to `failed` with a stable failure code (FR-S6)
**And** these mutation tests are required to fail the transaction, and a passing mutation is a build-breaking defect

**AC6 — Semantic predicates are tested independently of the stored hash**

**Given** each validator predicate in the executable manifest
**When** a table-driven negative fixture constructs a fresh internally consistent transaction before any hash is stored
**Then** that predicate alone causes rejection at both the pre-client and pre-sponsor gates
**And** fixtures include stale Telegram context, wrong signer/fee payer, destination signer, async DFlow response, missing or changed ALT, extra writable account, program/instruction discriminator, compute units, priority fee, ATA count/rent, sponsor debit, stale blockhash, self-payment, absent reservation, and paused sponsorship

**AC5 — Platform fee policy is zero and asserted**

**Given** the judged build
**When** the fee check runs
**Then** it asserts no platform fee account and a zero fee amount, matching `PLATFORM_FEE_BPS = 0` (PRD OQ-4, research R-7)

### Story 3.5: Sign-only through Privy, re-verify, sponsor co-sign, broadcast

As a person paying,
I want to approve once and have everything else handled,
So that one tap is the whole of my involvement.

**Acceptance Criteria:**

**AC1 — The user signs without broadcasting**

**Given** validated transaction bytes on the client
**When** the person approves in Privy's sheet
**Then** Privy signs the transaction **without** broadcasting it (FR-S7, AD-9)
**And** the partially signed bytes are returned to Convex through `settlements.submitUserSignedTransaction`

**AC2 — Convex re-parses and rejects any message change**

**Given** returned partially signed bytes
**When** Convex receives them
**Then** it re-parses them and re-runs the full checklist, rejecting any change to the serialized message (FR-S7, AD-10)
**And** the stored message hash must match exactly

**AC3 — The sponsor co-signs only on policy pass**

**Given** bytes that pass re-verification
**When** sponsorship is requested
**Then** the Privy fee-payer wallet adds its signature via the server SDK (FR-S8, AD-9)
**And** an intent failing any policy check is never presented to the sponsor wallet

**AC4 — Convex broadcasts, not the client**

**Given** a fully signed transaction
**When** it is sent
**Then** Convex broadcasts through the configured RPC and stores the returned signature with status `submitted` (FR-S8)
**And** the client never broadcasts

**AC6 — Ambiguous broadcast is preserved**

**Given** the RPC times out or disconnects after broadcast may have occurred
**When** no definitive send result is available
**Then** the intent becomes `unknown`, retains its budget reservation and signed bytes/signature evidence, and cannot be replaced
**And** confirmation reconciliation begins immediately rather than marking the payment failed

**AC5 — A cancelled approval is not a failure**

**Given** a person dismissing Privy's sheet without approving
**When** the client handles it
**Then** the Payment Sheet returns to its previous state with no error message and the intent remains payable (UX-DR26)

### Story 3.6: Parsed on-chain confirmation moves the ledger exactly once

As a person who was tipped,
I want My Tab to say I received money only when I actually did,
So that the record is trustworthy rather than optimistic.

**Acceptance Criteria:**

**AC1 — A signature alone changes nothing**

**Given** a submitted transaction with a returned signature
**When** the ledger is inspected before confirmation
**Then** no balance, obligation, or tip has been offset (FR-S9, AD-11, FR-L3)

**AC2 — Confirmation is parsed against the complete AD-11 contract**

**Given** a confirmed transaction result
**When** it is parsed
**Then** it verifies: finalized transaction success · exact stored message hash · correct recipient token account and mint · recipient increase at or above target · payer debit within maximum input · zero platform fee with no `feeAccount` · actual sponsor debit within the owned `sponsor-v1` reservation · signature and target not previously applied (FR-S9, AD-11)
**And** any failed semantic condition prevents settlement and enters a reviewable failure state; an RPC timeout or temporary absence never does

**AC3 — Settlement is atomic and happens once**

**Given** a fully verified confirmation
**When** it is applied
**Then** one Convex transaction marks the settlement confirmed, offsets the tip once, updates balances, emits an activity event, and queues the Telegram confirmation (AD-11, FR-M8)
**And** applying the same signature twice produces no second offset (FR-S10, NFR-2)

**AC4 — Terminal states are terminal**

**Given** an intent in `confirmed`, `failed`, `expired`, or `superseded`
**When** any transition is attempted
**Then** it is rejected — terminal states never transition back (AD conventions)

**AC5 — Duplicate payment of the same target is blocked**

**Given** a tip that already has a confirmed settlement
**When** a second intent for it is created or paid
**Then** it is blocked (FR-S10, FR-T7)
**And** a failed or expired quote can still be recreated without duplicating the tip record (FR-T7)

**AC7 — Negative and late-confirmation fixtures protect the ledger**

**Given** fixtures for wrong message hash, recipient token account, mint, insufficient recipient delta, excessive payer debit, unexpected fee, sponsor debit above reservation, transaction execution failure, reused signature/target, temporary RPC absence, late confirmation, and a reorg observation
**When** confirmation processing runs
**Then** no balance, activity, notification, tip, or obligation offset changes before all confirmation predicates pass
**And** a late valid confirmation applies exactly once even after the intent entered `unknown`

**AC6 — Every intent exposes a readable status**

**Given** any settlement intent
**When** it is queried
**Then** its current status and, on failure, its stable failure code are readable (NFR-5)

### Story 3.7: The Payment Sheet and Payment Progress surfaces

As a person paying,
I want to see what I am spending, who gets what, and where it is,
So that I never have to trust an amount I cannot inspect.

**Acceptance Criteria:**

**AC1 — The sheet's content order is fixed**

**Given** the Payment Sheet
**When** it renders
**Then** its order is: obligation in bill currency → recipient and destination asset → payment-token selector → maximum sender spend → minimum recipient receive → optional round-up tip → collapsed `disclosure-row` → one fixed 52px bottom action (UX-DR13)
**And** it never leads with an address, a mint, or transaction bytes

**AC2 — Disclosure is collapsed every time**

**Given** a repeat visit to the sheet
**When** it opens
**Then** the `disclosure-row` is collapsed, with no memory of a prior expanded state (UX-DR15)
**And** the network fee inside it reads "Network fee · Covered by My Tab", not a zero (UX-DR29)
**And** no platform-fee line appears anywhere, including as a placeholder (UX-DR29)

**AC3 — Every figure is labelled and exact**

**Given** any disclosed amount on the sheet
**When** it renders
**Then** it uses `amount-pair` with a label left and a tabular right-aligned amount (UX-DR19, UX-DR27)
**And** no figure is rounded in copy — if it is ฿291.74 every surface says ฿291.74 (UX-DR35)
**And** bill currency and token amounts never share a line (UX-DR27)

**AC4 — The quote countdown and its expiry are designed states**

**Given** a live quote
**When** the sheet renders
**Then** it shows "Quote refreshes in 0:42" in `ink-muted`, turning `warning` under ten seconds (UX-DR24)
**And** on expiry the amounts hold at 40% opacity and the action becomes "Refresh quote" — never blanked (UX-DR26)

**AC5 — The stepper is server-driven and never optimistic**

**Given** Payment Progress
**When** the `settlement-stepper` renders
**Then** its four steps advance only on server-confirmed transitions, never optimistically, and a step never moves backward (UX-DR16, AD-11)
**And** the step copy maps exactly: `ready_for_signature` plus wallet-open UI stage → "Approved in your wallet" · `user_signed` → "Verifying" · `submitted` → "Sending to Maya" with "Usually takes a few seconds" · `unknown` → "Still checking — don't pay again" · `confirmed` → "Confirmed" (UX-DR36)
**And** a failure replaces the active step in place with a plain cause and two actions, "Try again" and "Back to tab" — never a raw code, a signature, or a stack trace

**AC6 — The sheet commits forward only**

**Given** the Payment Sheet
**When** the person taps Pay
**Then** it transitions to Payment Progress and can no longer be dismissed by scrim tap or swipe-down (UX-DR13)
**And** before Pay is tapped, both dismissal gestures work

**AC7 — Banned vocabulary does not appear**

**Given** every string on both surfaces
**When** they are reviewed
**Then** none of execute, swap, route, approve, broadcast, transaction, signature, mint, ATA, gas, lamports, slippage, blockhash, RPC, or wallet address appears (UX-DR34)

### Story 3.8: Sponsorship caps, allowlists, and a kill switch

As the team running this on mainnet,
I want the sponsor wallet's exposure bounded and stoppable,
So that quote spam or an ATA cycle cannot drain it during a public demo.

**Acceptance Criteria:**

**AC1 — Six budget dimensions are enforced**

**Given** a sponsorship request
**When** policy runs
**Then** per-user, per-wallet, per-group, per-transaction, daily, and global budgets are all checked and any breach rejects the intent (NFR-4, AD-17)
**And** the rejection carries a stable failure code

**AC2 — Four allowlists are enforced**

**Given** a transaction awaiting sponsorship
**When** policy runs
**Then** programs, mints, recipients, and instructions are each checked against an allowlist (NFR-4, AD-17)
**And** a non-allowlisted writable account rejects the transaction

**AC3 — Environments are isolated with small balances**

**Given** the deployed environments
**When** sponsor wallets are inspected
**Then** development and production use separate wallets, each holding a small capped SOL balance (AD-17)

**AC4 — The kill switch stops payments without stopping reads**

**Given** the emergency pause is enabled
**When** the app is used
**Then** no new sponsored transaction can be created
**And** every read in the product remains fully available — nothing that only displays state is disabled (AD-17, NFR-4)
**And** the Payment Sheet shows "Payments are paused right now. Your tab is safe." (UX-DR24)

**AC5 — One idempotency key per intent**

**Given** the sponsorship path
**When** it is exercised
**Then** each settlement intent carries exactly one idempotency key and a retry reuses it rather than minting a new one (AD-17, NFR-2)

**AC6 — Policy values and atomic reservation are executable**

**Given** `sponsor-v1`
**When** a request is evaluated
**Then** all six lamport caps, UTC reset windows, ATA maximum, priority-fee maximum, and manifest version exactly match the Implementation Readiness Contract
**And** worst-case spend is atomically reserved across every dimension before co-sign, actual spend settles on confirmation, ambiguous submission retains its reservation, and only proven non-broadcast failure releases it

**AC7 — Boundary and concurrency tests close the race**

**Given** each cap and the kill switch
**When** tests submit limit−1, equal-limit, limit+1, concurrent requests, and a pause toggled between quote and co-sign
**Then** only allowed reservations succeed and no interleaving oversubscribes a budget or signs after pause

### Story 3.9: Quote expiry and retry on the Convex scheduler

As a person whose payment did not go through the first time,
I want the app to recover on its own or tell me exactly what to tap,
So that a failure is never a dead end.

**Acceptance Criteria:**

**AC1 — The scheduler is the only job runner**

**Given** quote expiration, confirmation polling, and failed-action retry
**When** they run
**Then** they run on the Convex scheduler and crons (AD-16)
**And** no Vercel Cron exists in P0

**AC2 — Quotes expire on a schedule and on read**

**Given** an intent in `created`, `quoting`, or `ready_for_signature` past its expiry
**When** the cron runs or the intent is read
**Then** it transitions to `expired` (PRD §11)
**And** an expired intent cannot be signed, co-signed, or broadcast (FR-S6)

**AC3 — Confirmation polling is bounded and terminal**

**Given** a `submitted` or `unknown` intent
**When** confirmation is polled
**Then** it retries until confirmed or until blockhash expiry plus signature absence conclusively proves failure (NFR-6)
**And** timeout never transitions a broadcast-capable intent to `expired`, and a late confirmation is reconciled exactly once

**AC4 — A failed quote is recreatable without duplication**

**Given** a failed or expired tip quote
**When** the person taps "Refresh quote" or "Try again"
**Then** a new intent is created against the same tip record with no duplicate tip (FR-T7)

**AC5 — Telegram retry never rolls back money state**

**Given** a confirmed payment whose group message failed to publish
**When** the publish is retried
**Then** the confirmed settlement is untouched and only the message is retried (NFR-6)

### Story 3.10: The tip confirmation message in the group

As the person who was tipped,
I want the group to see it,
So that the thanks happens in front of everyone, which is the whole reason the tip exists.

**Acceptance Criteria:**

**AC1 — It posts only on confirmation**

**Given** a tip settlement
**When** the group message is queued
**Then** it is queued only after parsed on-chain confirmation, never on submission (AD-11, FR-N4)

**AC2 — It names both people and the amount**

**Given** a confirmed tip
**When** the message posts
**Then** it names sender and recipient and states the amount — the one sanctioned warm message in the product (UX-DR38)

**AC3 — It still leaks nothing else**

**Given** the posted message
**When** it is inspected
**Then** it contains no wallet address, no transaction link, and no unrelated individual amount (NFR-7, UX-DR38)

**AC4 — It is one of the five, and idempotent**

**Given** the bot's publishing rules
**When** a tip confirms twice through a retry
**Then** exactly one message is posted (FR-N4, NFR-2)

---

## Epic 4: Author the tab

An organizer names a tab, enters what the table ordered, and applies the real-world adjustments a Bangkok restaurant bill actually carries — service charge, VAT, a discount, a group tip — and watches the total resolve.

**Covers:** FR-B1, B2, B3 · NFR-3 · UX-DR5, UX-DR19, UX-DR24, UX-DR25, UX-DR34, UX-DR35

### Story 4.1: New Tab — title, currency, payer, recipient, FX snapshot

As the organizer who just paid the restaurant,
I want to set up the tab in a few taps,
So that I can start entering items while everyone is still at the table.

**Acceptance Criteria:**

**AC1 — The draft carries the full set of bill facts**

**Given** the New Tab surface
**When** the organizer completes it
**Then** the tab record carries title, merchant, display currency, payer, recipient, and an FX snapshot taken at creation (FR-B1)
**And** the FX snapshot is stored as integers with its source and timestamp, never recomputed silently later

**AC6 — The THB→USDC policy is exact and freshness-gated**

**Given** a THB tab
**When** its FX snapshot is created or locked
**Then** it uses Frankfurter v2 `USD/THB` filtered to the Bank of Thailand provider and stores `direction:'USDC_ATOMIC_PER_THB_MINOR'`, integer `numeratorAtomic`/`denominatorMinor`, provider date, expiry, and policy version
**And** it computes required USDC as `ceil(thbMinor × numeratorAtomic / denominatorMinor)` without parsing the provider decimal through a JavaScript number
**And** freshness is 36 hours from provider date on weekdays and 96 hours across weekends/Thai bank holidays; production fails closed while a non-production manual rational is visibly badged

**AC2 — Defaults come from the group**

**Given** a tab started in a group with a default currency and recipient asset
**When** New Tab renders
**Then** currency and recipient asset are pre-filled from the group and confirmable in one tap (FR-G3, FR-B1)
**And** the payer defaults to the organizer

**AC3 — The recipient is a person, resolved server-side**

**Given** a chosen recipient
**When** the tab is written
**Then** the recipient's receiving address is resolved from their Convex `wallets` record at lock time, and the tab stores only the internal user id (AD-13)
**And** no address is shown or entered on this surface (UX-DR48)
**And** payer and recipient must differ and the recipient must have a verified current default USDC receiving wallet before lock

**AC4 — Only the organizer can author**

**Given** any authoring mutation on a tab
**When** it executes
**Then** it begins with the shared `requireBillOrganizer` helper and throws for anyone else (NFR-3)
**And** the UI never enforces this on its own

**AC5 — The surface follows the layout frame**

**Given** New Tab at 320px
**When** it renders
**Then** it is a single column with no horizontal scroll and one dominant action pinned to the bottom bar (UX-DR5)
**And** the primary action reads "Add items"

### Story 4.2: Add, edit, duplicate, and remove items

As the organizer,
I want to enter what the table ordered quickly and fix mistakes without starting over,
So that the tab matches the paper receipt in front of me.

**Acceptance Criteria:**

**AC1 — Items support the fields a real receipt has**

**Given** the item entry surface
**When** an item is added
**Then** it carries a 1–120 character name, quantity 1–999, and positive unit price in integer minor units within the readiness-contract bill cap (FR-B2, FR-M1)
**And** the line total is computed from quantity and unit price in the domain module, never entered independently

**AC2 — All four operations work while unlocked**

**Given** an unlocked tab
**When** the organizer acts
**Then** they can add, edit, duplicate, and remove any item (FR-B2)
**And** duplicate copies name, quantity, and price into a new item with no allocations carried over

**AC3 — Editing is blocked once locked**

**Given** a locked tab
**When** any item mutation is attempted
**Then** it is rejected server-side with a stable failure code (FR-B2, FR-B5)

**AC4 — Item entry supports Thai and Latin names**

**Given** an item named in Thai, in English, or in both
**When** it renders in a list
**Then** it displays without clipping ascenders or descenders and truncates at the name with ellipsis rather than at the amount (UX-DR2, UX-DR46)

**AC5 — The empty state is designed and organizer-only**

**Given** a tab with no items
**When** it is viewed
**Then** the organizer sees "Add what you ordered." with both capture actions and a participant sees "Maya is adding the bill. You can stay here — it will appear automatically." (UX-DR24)
**And** the posted tab link remains usable before items exist; realtime transition replaces the waiting state without refresh

**AC6 — Both capture paths converge on one item shape**

**Given** the item schema
**When** it is defined
**Then** it carries a `source` field from the outset, so an imported item and a typed item differ by that field alone
**And** no field on the item is specific to how it was captured

### Story 4.3: Tax, service charge, discount, and group tip

As the organizer,
I want to add the charges the restaurant actually applied,
So that the tab reconciles to the printed total instead of approximately matching it.

**Acceptance Criteria:**

**AC1 — Four adjustment types, each fixed or percentage**

**Given** the adjustments surface
**When** the organizer adds one
**Then** tax, service charge, discount, and group tip are each available as either a fixed minor-unit amount or a percentage (FR-B3)
**And** a percentage is stored as an integer basis-point-style value, never as a float

**AC2 — Adjustment order is explicit and stored**

**Given** a tab with a service charge and a tax
**When** they are applied
**Then** the order of application is stored as part of the adjustment policy, not implied by insertion order (FR-B3, FR-M7)
**And** the policy is what gets snapshotted at lock
**And** the canonical precedence is item subtotal → service charge → tax → discount → group tip → disclosed largest remainder, with each percentage's base stored explicitly

**AC3 — The running total reconciles visibly**

**Given** items and adjustments entered
**When** the surface renders
**Then** the total is shown with each adjustment as its own labelled `amount-pair` line (UX-DR19)
**And** every figure is exact, never rounded in copy (UX-DR35)

**AC4 — A discount cannot make a total negative**

**Given** a discount exceeding the item subtotal plus charges
**When** it is applied
**Then** it is rejected server-side with a plain-language reason (FR-B3)

**AC5 — Voice rules hold on this surface**

**Given** every string on the authoring surfaces
**When** reviewed
**Then** it uses the product's plain register and none of the banned vocabulary (UX-DR34)

### Story 4.4: Loading and empty states for an unfilled tab

As anyone opening a tab that is still being built,
I want the screen to tell me what is happening,
So that I never look at a blank rectangle and assume it is broken.

**Acceptance Criteria:**

**AC1 — First paint uses geometry-matched skeletons**

**Given** a tab loading for the first time
**When** it renders
**Then** skeleton rows match the final geometry and use tabular-width numeral placeholders so nothing shifts on arrival (UX-DR25)

**AC2 — Subsequent loading renders nothing**

**Given** already-correct data on screen
**When** an update arrives over Convex reactivity
**Then** content is replaced in place with no spinner (UX-DR25)
**And** a spinner over correct data is treated as a defect

**AC3 — A participant arriving early sees a real state**

**Given** a participant who opens a tab before items exist
**When** the surface renders
**Then** they see a designed waiting state rather than the organizer's "Add what you ordered." empty state (UX-DR24)

**AC4 — Offline is a bar, not a blocker**

**Given** the device goes offline while a tab is open
**When** the app detects it
**Then** a single inline "You're offline. We'll catch up." bar appears and cached tab state stays readable (UX-DR24, UX-DR26)

---

## Epic 5: Claim, compute, lock

Everyone claims their items on the same live board — additively, so two people reaching for the same dish get a split rather than a conflict — sees their exact share with every satang inspectable, and the organizer locks the bill into immutable per-person obligations.

**Covers:** FR-C1, C3, C4, C5, FR-M4…M8, FR-B4…B7 · NFR-3, NFR-9 · UX-DR8, UX-DR10, UX-DR11, UX-DR12, UX-DR19, UX-DR23, UX-DR24, UX-DR28, UX-DR31, UX-DR32, UX-DR33, UX-DR40, UX-DR41, UX-DR43

### Story 5.1: Revision as the concurrency and freshness key

As a person on a bill several people are editing,
I want my phone to be corrected rather than to act on stale information,
So that nobody's edit silently overwrites someone else's.

**Acceptance Criteria:**

**AC1 — Every draft edit increments the revision**

**Given** any edit to an unlocked tab — item, adjustment, participant, or policy
**When** the mutation commits
**Then** `tabs.revision` increments monotonically in the same transaction (FR-B4, AD-7)

**AC2 — Stale mutations are rejected server-side**

**Given** a client holding revision N submitting against a tab now at revision N+1
**When** the mutation runs
**Then** it is rejected (AD-7, FR-C3)
**And** the rejection is a stable failure code, not a raw error

**AC3 — A rejected stale action corrects the board quietly**

**Given** a rejected stale mutation
**When** the client handles it
**Then** the board updates to current state and shows one line, "That changed a moment ago." (UX-DR32)
**And** there is no modal, no forced reload, and no lost scroll position

**AC4 — All clients converge without a refresh gesture**

**Given** three devices subscribed to the same tab
**When** one of them edits
**Then** the other two reflect the change without any manual refresh (FR-C3, NFR-9)
**And** pull-to-refresh is not implemented anywhere (UX-DR39)

### Story 5.2: Equal split with largest-remainder allocation

As someone who shared a dish,
I want the split to add up to the exact price of that dish,
So that the bill reconciles instead of losing a satang.

**Acceptance Criteria:**

**AC1 — Integer division plus largest remainder**

**Given** an item of 100 satang shared by 3 people
**When** shares are computed
**Then** the result is 34, 33, 33 — integer division with the remainder distributed by largest fractional remainder (FR-M4)
**And** the shares sum to exactly the item total with no residue

**AC2 — Order is stable and reproducible**

**Given** the same item and the same claimants
**When** allocation is recomputed
**Then** the same person receives the extra minor unit every time, by a stable participant ordering (FR-M4)
**And** the ordering rule is documented in the domain module

**AC3 — The logic is pure and unit-tested**

**Given** the allocation function
**When** it is tested
**Then** it runs in `lib/domain/` with no Convex import and no I/O (AD-6)
**And** tests cover 1 claimant, 2 claimants, prime-remainder cases, and a zero-price item

**AC4 — Persisted shares, not a formula**

**Given** computed shares
**When** they are stored
**Then** the final allocated integer share per participant is persisted, not only the inputs (FR-M5)

### Story 5.3: Proportional adjustments with disclosed remainders

As someone reading my share,
I want to see exactly how tax, service, tip, and discount reached my number,
So that I can check it rather than trust it.

**Acceptance Criteria:**

**AC1 — Each adjustment is allocated proportionally, floored, then remainder-distributed**

**Given** a tab with tax, service charge, tip, and discount
**When** per-participant shares are computed
**Then** each adjustment is computed per participant proportionally to their item share, floored to integer minor units, with remainders distributed by largest fractional remainder (FR-M5)
**And** each adjustment's per-participant allocation is persisted separately

**AC2 — Discounts reduce, and cannot invert**

**Given** a discount allocation
**When** it is applied
**Then** it subtracts from the participant's total and no participant's obligation can become negative (FR-M5, FR-B3)

**AC3 — Rounding is disclosed as its own line**

**Given** a participant who received an extra minor unit from remainder distribution
**When** their breakdown is expanded
**Then** it shows a dedicated line, "Rounding +฿0.01" (UX-DR28)
**And** silent asymmetry between people who ordered identical items is treated as a defect

**AC4 — The math is pure and independently testable**

**Given** the adjustment allocation functions
**When** they are tested
**Then** they live in `lib/domain/`, import nothing from Convex, and are covered by unit tests including a case where every adjustment type is present at once (AD-6)

**AC5 — No float ever appears**

**Given** any intermediate value in the computation
**When** it is inspected
**Then** it is an integer, and a percentage is applied by integer arithmetic rather than by multiplying a float (FR-M3)

### Story 5.4: Claim and release your own items, live

As someone at the table,
I want to tap what I ordered,
So that my share is mine without anyone having to ask me.

**Acceptance Criteria:**

**AC1 — One tap claims, one tap releases**

**Given** a `claim-row` on an unlocked tab
**When** the viewer taps the row body
**Then** their own claim toggles on or off (FR-C1, FR-C4, UX-DR8)
**And** long-press is unbound and no context menu exists (UX-DR39)
**And** a light haptic fires on claim and on unclaim (UX-DR41)

**AC2 — Claiming is additive, never exclusive**

**Given** an item already claimed by one person
**When** a second person claims it
**Then** both claims stand, the second avatar joins the stack, and the row reads "Split 2 ways · ฿120.00 each" (FR-C1, UX-DR31)
**And** neither person is rejected and neither sees an error, a conflict dialog, or a loser

**AC3 — Releasing recalculates in place, silently**

**Given** a shared item
**When** one claimant releases it
**Then** the remaining claimants' per-head amount recalculates in place and the releaser's footer subtotal drops (UX-DR31)
**And** nobody receives a notification for this

**AC4 — Mutations are atomic, authorized, and revision-aware**

**Given** any claim mutation
**When** it runs
**Then** it is a single Convex transaction that begins with `requireParticipant`, checks the revision, and is visible through realtime subscriptions (FR-C3, NFR-3, AD-7)

**AC5 — A participant can only release their own claim**

**Given** a participant attempting to release someone else's allocation
**When** the mutation runs
**Then** it is rejected (FR-C4)

**AC6 — The row's visual states are exact**

**Given** the claim board
**When** rows render
**Then** an unclaimed row carries a 3px `warning` left edge, a row the viewer owns takes a `primary-soft` fill, and the avatar stack sits beneath the item name (UX-DR8)
**And** tapping the avatar stack opens the who-has-this sheet rather than toggling the claim

### Story 5.5: Live presence and arriving claims

As someone claiming items on my phone,
I want to see that other people are here doing the same thing,
So that the tab feels like a shared object rather than a form.

**Acceptance Criteria:**

**AC1 — Presence shows who is actually subscribed**

**Given** the Claim Board header
**When** other people are subscribed to the same tab
**Then** `presence-stack` shows up to three overlapping 24px avatars plus a `+n` counter, updating live (UX-DR10)
**And** it never shows the viewer themselves

**AC2 — Alone means absent, not "1 person here"**

**Given** a viewer alone on the tab
**When** the header renders
**Then** the presence stack is absent entirely (UX-DR10)

**AC3 — An arriving claim animates once, briefly**

**Given** another person's claim arriving over the subscription
**When** it renders
**Then** the avatar animates into the stack over approximately 200ms and the footer reconciliation line ticks (UX-DR32, UX-DR40)
**And** this is one of only three sanctioned animations in the product

**AC4 — Reduce Motion removes the animation, not the update**

**Given** Reduce Motion enabled
**When** a remote claim arrives
**Then** values update instantly with no animation and no haptic (UX-DR44, UX-DR41)

**AC5 — The stack is one touch target**

**Given** the presence stack
**When** it is measured
**Then** it is a single target of at least 44px and individual overlapping avatars are not separately tappable (UX-DR42)

### Story 5.6: The sticky claim footer with a running personal subtotal

As someone claiming items,
I want my own number in front of me the whole time,
So that I know where I stand without opening anything.

**Acceptance Criteria:**

**AC1 — Two lines, always visible**

**Given** the Claim Board
**When** it renders
**Then** the footer is pinned above the safe area on `surface` with a top `border`, showing a `meta` reconciliation line and an `amount-md` personal subtotal beside a full-height `primary` action (UX-DR11)

**AC2 — The subtotal reflects the full computation**

**Given** the viewer's current claims and the tab's adjustments
**When** the footer renders
**Then** the subtotal is their item shares plus their allocated adjustments, computed by the Story 5.3 functions (FR-M5)
**And** it updates live as claims change on any device

**AC3 — The action label is state-driven**

**Given** the footer action
**When** the viewer's state changes
**Then** it reads "Claim yours" while they hold nothing, "Finish claiming" once they hold something, and — for the organizer only — is disabled with "2 items need an owner" while unassigned items remain (UX-DR11)

**AC4 — Participants are never blocked by someone else's item**

**Given** unassigned items on the board
**When** a non-organizer participant views the footer
**Then** their action is enabled (UX-DR11)

**AC5 — The footer yields to the keyboard**

**Given** an input focused and the keyboard open
**When** the layout adjusts
**Then** the footer yields rather than overlapping the keyboard, and stays attached to the viewport (UX-DR46, UX-DR45)

### Story 5.7: Unassigned items and organizer override

As the organizer,
I want to see what nobody claimed and be able to assign it myself,
So that one forgotten dish does not hold up the whole table.

**Acceptance Criteria:**

**AC1 — Unassigned items are visible and counted**

**Given** a tab with unclaimed items
**When** the board renders
**Then** each unclaimed row carries a `warning` left edge and the footer states the count as words, "2 items need an owner" (FR-C5, UX-DR11, UX-DR42)
**And** the state is never carried by color alone

**AC2 — Lock is blocked with the reason named**

**Given** unassigned items remaining
**When** the organizer attempts to lock
**Then** the lock is blocked both in the UI and server-side, with the count as the stated reason (FR-C5)

**AC3 — The organizer can assign anyone**

**Given** the organizer using the row's overflow control
**When** they assign an item to a participant
**Then** the allocation is written on that participant's behalf (FR-C4, UX-DR8)
**And** the override is authorized by `requireBillOrganizer`, not by the UI (NFR-3)

**AC4 — An override that removes a claim is announced, not dialogued**

**Given** an organizer edit that removes an item someone had claimed
**When** the affected person's client updates
**Then** an inline footer note reads "Maya removed an item you claimed." without stealing focus (UX-DR32)
**And** no dialog appears

### Story 5.8: Bill Review, read-only for everyone

As anyone on this bill,
I want to inspect every person's share, not just my own,
So that a split nobody can audit never becomes a split we argue about.

**Acceptance Criteria:**

**AC1 — Same surface, same detail, for everyone**

**Given** Bill Review
**When** any participant opens it
**Then** they see the full per-person breakdown with identical layout, identical expandable rows, and the identical reconciliation line (UX-DR23)
**And** nothing is hidden from a non-organizer

**AC2 — Only the footer action differs**

**Given** Bill Review before lock
**When** it renders
**Then** the organizer's action is "Lock bill" and a participant's is "Settle up", disabled with the reason stated: "Waiting on Maya to lock" (UX-DR23, UX-DR24)
**And** after lock the participant's action is enabled
**And** the action is never blank or hidden

**AC3 — The breakdown expands in place**

**Given** a `breakdown-row`
**When** it is tapped
**Then** it expands in place revealing indented sub-lines with their own right-aligned amounts, and multiple rows may be open at once (UX-DR12)
**And** the breakdown is never behind a separate screen

**AC4 — Every figure is a labelled amount-pair**

**Given** any disclosed figure on this surface
**When** it renders
**Then** it uses `amount-pair` with a label, and no amount appears unlabelled (UX-DR19, UX-DR27)

**AC5 — Reconciliation is stated positively**

**Given** shares that reconcile
**When** the line renders
**Then** it reads "Everyone's shares add up to ฿1,840.00 ✓" in `settled` (UX-DR28)
**And** if it fails, lock is blocked and the shortfall is named exactly

**AC6 — Nothing is editable here**

**Given** any participant including the organizer
**When** they interact with an amount on Bill Review
**Then** no amount is editable — editing happens on the Claim Board, before lock (UX-DR23)

### Story 5.9: Lock — invariant, snapshot, and obligations in one transaction

As the organizer,
I want locking to create each person's final amount, permanently,
So that from that moment the bill is real and nobody's number can drift.

**Acceptance Criteria:**

**AC1 — The invariant is checked server-side or the lock is rejected**

**Given** a lock request
**When** the mutation runs
**Then** it verifies `sum(item shares) + sum(tax) + sum(service) + sum(tip) − sum(discount) = locked bill total` and rejects the lock if it does not hold (FR-M6)
**And** the rejection names the exact shortfall

**AC2 — Lock is one transaction**

**Given** a valid lock
**When** it commits
**Then** the same Convex transaction verifies all items are resolved, writes the immutable snapshot, and creates every obligation (AD-7, FR-B5)
**And** a partial lock is impossible

**AC3 — The snapshot is complete and immutable**

**Given** a locked tab
**When** the snapshot is read
**Then** it carries revision, items, allocations, adjustment policy, FX, per-participant obligation, target settlement asset, and recipient (FR-M7)
**And** no later edit mutates it
**And** the snapshot contains the fresh readiness-contract FX rational, its source date/policy, the canonical adjustment precedence, exact recipient wallet, USDC mint/decimals, and all persisted remainder assignments

**AC4 — Obligations are immutable ledger events**

**Given** created obligations
**When** they are later settled
**Then** the obligation is never overwritten with a paid flag — a settlement event offsets it (FR-M8, AD-12)

**AC5 — Only the organizer locks, and only with everything assigned**

**Given** a lock attempt
**When** it is authorized
**Then** `requireBillOrganizer` passes and no items are unassigned, or the attempt is rejected (FR-B5, FR-C5, NFR-3)
**And** payer and recipient differ, every participant has a valid denominator, every obligated recipient wallet is ready, and all checked arithmetic remains within bounds

**AC6 — Locking is a designed moment**

**Given** the organizer confirming a lock
**When** the confirmation renders
**Then** it reads "Locking creates each person's final amount. Editing after this needs a reopen." (UX-DR33)
**And** a medium haptic fires on lock (UX-DR41)
**And** every other client's board transitions to locked live, with rows becoming read-only rather than disabled-greyed, the header gaining "Locked", and the footer becoming "Settle up" beside a quiet "See the full bill" link (UX-DR24, UX-DR33)

### Story 5.10: Reopen after lock, and quote invalidation

As the organizer who spotted a mistake after locking,
I want a deliberate way to reopen,
So that a correction is possible without anyone silently paying a number that changed.

**Acceptance Criteria:**

**AC1 — Reopen is explicit and organizer-only**

**Given** a locked tab with no confirmed payment and no in-flight intent
**When** the organizer reopens it
**Then** one transaction appends obligation-supersession events for the old revision, expires only pre-broadcast intents, increments the revision, and returns the tab to `open` through an explicit action authorized by `requireBillOrganizer` (FR-B7, NFR-3)
**And** there is no implicit or automatic path back to `open`

**AC2 — A confirmed payment closes the door**

**Given** a tab with at least one confirmed settlement
**When** a reopen is attempted
**Then** it is rejected (FR-B7)

**AC6 — In-flight or ambiguous money closes the door**

**Given** any intent on the locked revision in `user_signed`, `submitted`, or `unknown`
**When** reopen is attempted
**Then** it is rejected until confirmation reconciliation proves the final state
**And** a late confirmation is applied before eligibility is re-evaluated

**AC3 — Any revision change supersedes every safe older quote**

**Given** live settlement intents created from revision N
**When** the tab moves to revision N+1
**Then** every safe pre-broadcast intent transitions to `superseded`, while `user_signed`, `submitted`, or `unknown` intents block the reopen (FR-B6, AD-7)

**AC4 — An open Payment Sheet switches to the stale state**

**Given** someone with the Payment Sheet open when the bill is reopened
**When** their client updates
**Then** the sheet shows "This bill changed. Refresh to see your new amount." with one action (UX-DR26)
**And** payment is blocked rather than silently repriced

**AC5 — Terminal payment states are unaffected**

**Given** a confirmed settlement on the tab
**When** a revision change occurs
**Then** the confirmed settlement is untouched (AD conventions)

### Story 5.11: Quantity, percentage, and fixed-amount allocation modes

As someone who ate two of something,
I want to claim the quantity I actually consumed,
So that an equal split does not misrepresent what I owe.

**Acceptance Criteria:**

**AC1 — Sequenced on the proven allocation kernel**

**Given** largest-remainder and revision-aware claiming already pass
**When** the additional modes are implemented
**Then** quantity, percentage, and fixed-amount controls use the same `allocations` schema and lock invariant
**And** invalid zero denominators, totals over 100%, negative fixed amounts, and mode changes against stale revisions reject server-side

**AC2 — Each mode preserves the exact item total when built**

**Given** any of the three additional modes
**When** shares are computed
**Then** the shares sum to exactly the item total with remainders distributed by the same largest-remainder rule (FR-C2, FR-M4)

**AC3 — Mixed modes on one bill reconcile**

**Given** a bill mixing equal split, quantity, and fixed-amount items
**When** the lock invariant runs
**Then** it holds exactly (FR-M6)

---

## Epic 6: Settle your share

A participant pays exactly what they owe, in the one token they happen to hold, and the person who fronted the bill receives USDC. The board settles in place, the group's ring advances, and nobody sees the word swap.

**Covers:** FR-S4 and FR-T3, extending the Epic 3 spine to bill obligations, DFlow-routed SOL input, and round-up · NFR-2, NFR-5, NFR-6, NFR-9 · UX-DR13, UX-DR14, UX-DR16, UX-DR26, UX-DR27, UX-DR29, UX-DR30, UX-DR36

### Story 6.1: Settle an obligation with exact USDC

As someone who owes ฿291.74,
I want to pay it,
So that my part of the evening is done.

**Acceptance Criteria:**

**AC1 — The obligation is the intent's target**

**Given** a participant with a locked obligation
**When** they tap "Settle up"
**Then** a settlement intent is created against that obligation using the Story 3.2 mutation unchanged, binding the obligation, the locked revision, and the server-resolved recipient (FR-S1, FR-S2, AD-13)

**AC2 — The Epic 3 spine is reused, not reimplemented**

**Given** the settlement flow for an obligation
**When** it is traced
**Then** it uses the same intent state machine, the same AD-10 validator, the same sign-only path, the same sponsor co-sign, and the same confirmation parser as a tip (FR-S3, S5…S9)
**And** no parallel implementation exists for bill settlement

**AC3 — Confirmation offsets the obligation exactly once**

**Given** a parsed confirmation
**When** it is applied
**Then** one Convex transaction marks the settlement confirmed, offsets the obligation once, updates balances, emits activity, and queues the Telegram post (AD-11, FR-M8)
**And** the obligation record itself is never overwritten with a paid flag (AD-12)

**AC4 — Duplicate settlement of the same obligation is blocked**

**Given** an obligation with a confirmed settlement
**When** a second intent is created or paid for it
**Then** it is blocked (FR-S10)
**And** a double-tap test asserts exactly one confirmed settlement

**AC5 — The amount is the obligation, exactly**

**Given** an obligation of ฿291.74
**When** the Payment Sheet renders
**Then** it shows ฿291.74 with no rounding anywhere in the copy (UX-DR35)

**AC6 — The on-chain payment commits to the exact bill revision** *(addition beyond PRD/spine)*

**Given** an exact-USDC settlement of a bill obligation
**When** the transfer is built
**Then** the Story 3.3 memo carries a hash of the locked bill snapshot, binding the payment to the exact revision it was priced from (FR-M7, AD-7)
**And** the same hash is stored on the settlement record, so the on-chain commitment is independently checkable against Convex
**And** nothing in the memo is user-facing — no surface displays it, and no copy mentions it (UX-DR34)

### Story 6.2: DFlow order with the sponsor as fee payer and a server-owned recipient

As someone who holds SOL but owes baht,
I want to pay with what I have,
So that the person I owe still receives what they wanted.

**Acceptance Criteria:**

**AC1 — The order is requested server-side with fixed parameters**

**Given** an intent whose input mint differs from USDC
**When** the DFlow order is requested in a Convex Node action
**Then** it sets the sponsor wallet address as `sponsor`, `sponsorExec=false`, `allowSyncExec=true`, `allowAsyncExec=false`, `includeAddressLookupTables=true`, and the server-owned recipient as `destinationWallet` (FR-S4, AD-9)
**And** `feeAccount` is unset because the platform fee is zero (research R-7, PRD OQ-4)

**AC2 — The response is validated at the boundary**

**Given** a DFlow response
**When** it is received
**Then** it is validated with Zod before any field is used (AD conventions)
**And** `otherAmountThreshold` is read as the minimum-output field (research R-4)
**And** `executionMode` must equal `sync`, `destinationWalletMustSign` must be false, and every returned address lookup table is fetched and resolved before use

**AC3 — The returned transaction passes the same checklist**

**Given** DFlow's serialized transaction
**When** it is processed
**Then** it passes the full AD-10 checklist and executable manifest — exact payer+sponsor signer set, resolved v0 accounts, programs/instructions/writable roles, compute/priority fee, ATA count, mints, blockhash and `lastValidBlockHeight` — before any byte reaches the client, and its message hash is stored (FR-S5, FR-S6)
**And** a DFlow-substituted recipient, mint, fee payer, or amount fails validation

**AC4 — Byte preservation survives partial signing**

**Given** DFlow bytes signed by the user's Privy wallet without broadcasting
**When** Convex re-parses them
**Then** the serialized message is byte-identical to the stored hash and the sponsor co-signs (FR-S7, FR-S8, AD-9)
**And** a test asserts that a single altered byte is rejected

**AC5 — The input token allowlist is enforced**

**Given** a requested input mint
**When** the intent is created
**Then** it must be mainnet USDC or native SOL represented at the router boundary by the canonical wrapped-SOL mint from the readiness contract, or the request is rejected (FR-T4, NFR-4)
**And** decimals and native/wrapped handling are manifest data, never inferred from a symbol

**AC6 — The DFlow path carries no memo, and that gap is explicit**

**Given** a DFlow-routed settlement
**When** its instruction set is inspected
**Then** it carries no memo, because My Tab does not construct that transaction and adding an instruction would break byte preservation (AD-9, AD-10)
**And** the settlement record stores the bill-snapshot hash regardless, so the Convex-side commitment exists on both paths
**And** the difference is documented rather than silently tolerated — a routed payment is not claimed to carry an on-chain commitment

### Story 6.3: A bounded target-output quote solver

As someone paying a swap-routed amount,
I want the app to find a quote that covers exactly what I owe,
So that the recipient is never short and I never overpay by guesswork.

**Acceptance Criteria:**

**AC1 — The solver targets the obligation, not the input**

**Given** an obligation requiring a specific USDC minimum output
**When** the solver runs
**Then** it searches for an input amount whose `otherAmountThreshold` meets or exceeds that minimum (FR-S4, FR-S6)

**AC2 — The search is hard-bounded**

**Given** the solver
**When** it runs
**Then** it is bounded by both a hard request count and a wall-clock deadline (NFR-9)
**And** the bounds are exactly four router requests and three seconds total
**And** exhausting either bound fails the intent with a stable failure code rather than looping

**AC3 — Failure has a path forward**

**Given** a solver that cannot find a covering quote
**When** the sheet updates
**Then** the person sees a plain-language reason and a retry action, never a dead end (NFR-6)

**AC4 — Retries are bounded and idempotent**

**Given** a transient DFlow failure
**When** it retries
**Then** the retry is bounded, reuses the intent's idempotency key, and expires with the quote (NFR-2, NFR-6)

**AC5 — Solver activity is observable**

**Given** a solver run
**When** logs are inspected
**Then** they carry `intentId`, request count, `durationMs`, and outcome — and no quote payloads or secrets (NFR-5)

**AC6 — Excess output is explicit, not a hidden credit**

**Given** a sync route whose confirmed recipient delta exceeds the locked minimum
**When** confirmation is recorded
**Then** the excess is persisted as `excessOutputAtomic`, belongs to the recipient, and creates no balance credit or changed fiat obligation

**AC7 — Provider budget is reserved before the first router request**

**Given** a DFlow solver run
**When** it is admitted
**Then** Convex atomically reserves four AD-24 hourly attempt tokens before the first request, settles the number actually used, and releases the unused remainder
**And** a quota or pause rejection makes zero DFlow requests and returns stable retry-after copy
**And** the concurrency lease releases on success, failure, three-second timeout, cancellation, or crash recovery; tests cover abandon/retry and prove a stale lease cannot exhaust future capacity

### Story 6.4: My Tab owns quote TTL and idempotency

As a developer,
I want expiry and deduplication to be ours,
So that a router response with no order ID and no expiry cannot leave us guessing.

**Acceptance Criteria:**

**AC1 — Expiry is ours, and stored**

**Given** a created quote
**When** it is persisted
**Then** the intent carries a My Tab-owned `expiresAt` in integer milliseconds capped at the earlier of 60 seconds or the blockhash safety window (FR-S2)
**And** no expiry is read from or inferred from the DFlow response

**AC2 — Idempotency is keyed on our key**

**Given** a quote request
**When** it is deduplicated
**Then** it is keyed on the intent's own idempotency key, never on a DFlow order ID (research R-4, NFR-2)

**AC3 — Expired quotes are unusable at every gate**

**Given** an expired intent
**When** signing, co-signing, or broadcasting is attempted
**Then** each is rejected by the AD-10 checklist (FR-S6)

**AC4 — Expiry is swept and enforced on read**

**Given** intents past expiry
**When** the Convex cron runs
**Then** they transition to `expired`, and a read of an unswept expired intent still treats it as expired (AD-16)

**AC5 — A quote-expiry test exists before the cut date**

**Given** the test suite
**When** it runs
**Then** it covers quote creation, expiry, refresh, and rejection of an expired quote at each gate

### Story 6.5: The payment-token selector

As someone choosing how to pay,
I want to see what I can pay with and why something is unavailable,
So that I am never left guessing at a greyed-out chip.

**Acceptance Criteria:**

**AC1 — Chips are names and balances, never logos**

**Given** the token selector
**When** it renders
**Then** each `token-chip` shows the token name in `label` and the balance in `meta`, with no token logo anywhere (UX-DR14, UX-DR48)
**And** selection is single-select, shown as a `primary-soft` fill with a 1px `primary` border

**AC2 — An unaffordable token is disabled, not hidden**

**Given** a token the person cannot afford
**When** the selector renders
**Then** the chip is shown disabled with its balance visible so the reason is legible (UX-DR14)

**AC3 — Bill currency and token amounts never share a line**

**Given** the sheet with a token selected
**When** it renders
**Then** the obligation appears in bill currency and the token figures appear only in the disclosed lines, labelled by token name (UX-DR27)

**AC4 — "At least" is the honest word**

**Given** a routed payment
**When** the minimum receive line renders
**Then** it reads "Maya receives at least 8.25 USDC" (UX-DR29, FR-S6)
**And** no projected exact output is presented as a guarantee

**AC5 — Chips meet the touch floor**

**Given** any token chip
**When** measured
**Then** it is at least 44px in its tappable dimension (UX-DR42)

### Story 6.6: Stale revision blocks payment

As someone about to pay,
I want to be stopped rather than silently repriced,
So that I never pay an amount that stopped being true.

**Acceptance Criteria:**

**AC1 — The intent is bound to a revision**

**Given** a settlement intent
**When** it is created
**Then** it stores the locked revision it was priced against (FR-S2, AD-7)

**AC2 — A stale intent fails the checklist**

**Given** an intent whose tab has since changed revision
**When** signing or co-signing is attempted
**Then** the AD-10 check "intent belongs to the locked revision" fails and the payment is blocked (FR-S6, FR-S10)

**AC3 — The sheet says so plainly**

**Given** a stale-revision intent with the sheet open
**When** the client updates
**Then** it shows "This bill changed. Refresh to see your new amount." with one action (UX-DR26)
**And** the amounts are not silently replaced with new ones

**AC4 — Refreshing produces a correctly priced intent**

**Given** the person taps the single action
**When** a new intent is created
**Then** it is bound to the current locked revision and priced against the current obligation

### Story 6.7: A confirmed payment settles in place and advances group progress

As everyone watching the tab,
I want a payment to land visibly and calmly,
So that the group can see progress without a takeover.

**Acceptance Criteria:**

**AC1 — The row settles in place, with no takeover**

**Given** a confirmed payment
**When** the Claim Board updates
**Then** the payer's row swaps to `settled` in place and a check draws in over approximately 400ms (UX-DR24, UX-DR40)
**And** the Claim Board's own settlement ring — introduced by this story — advances to reflect the newly confirmed obligation
**And** no full-screen takeover occurs for an individual payment

**AC2 — A success haptic fires once**

**Given** the person's own payment confirming
**When** it lands
**Then** a success haptic fires, and no other moment in this flow vibrates (UX-DR41)

**AC3 — Progress counts confirmed money only**

**Given** a submitted-but-unconfirmed payment
**When** the group's progress renders
**Then** the Claim Board's ring and its "n of 5 settled" caption are unchanged (FR-L3, UX-DR30, AD-11)
**And** the stepper moves while group progress does not
**And** the same confirmed-only rule is applied to every counter added in later epics

**AC4 — Reduce Motion swaps instantly**

**Given** Reduce Motion enabled
**When** a payment confirms
**Then** the row changes state instantly with no draw animation and no haptic (UX-DR44)

**AC5 — The stepper announces to screen readers**

**Given** a screen reader active
**When** the stepper transitions
**Then** each transition is announced once as a live region, with the confirmation being the most important announcement in the product (UX-DR43)

### Story 6.8: The payment-confirmed group message

As the group,
I want to see that a payment landed,
So that nobody has to ask who has paid.

**Acceptance Criteria:**

**AC1 — It edits the existing status message**

**Given** a confirmed payment on a tab with a posted status message
**When** the bot publishes
**Then** it edits that same message rather than posting a new one (FR-N4, UX-DR37)

**AC2 — It posts only on confirmation**

**Given** a submitted payment
**When** it has not yet confirmed
**Then** nothing is published (AD-11)

**AC3 — It states group facts only**

**Given** the updated message
**When** inspected
**Then** it shows settlement progress as a group fact and never who paid what, an individual amount, an address, or a transaction link (UX-DR38, NFR-7)

**AC4 — Bill completed is its own sanctioned event**

**Given** the final obligation confirming
**When** the tab completes
**Then** the bill-completed event updates the same message (FR-N4)
**And** completion is server-derived, never client-asserted (PRD §11)

### Story 6.9: Round-up tip attached to a bill payment

As someone settling a share,
I want to round my payment up and let the extra go to the organizer,
So that thanking them costs me one tap instead of a second flow.

**Acceptance Criteria:**

**AC1 — Sequenced after exact obligation settlement**

**Given** exact obligation settlement and its confirmation parser pass
**When** the Payment Sheet renders
**Then** the optional round-up control appears in the canonical content order and defaults off (FR-T3, UX-DR13)

**AC2 — When built, it rides the same intent**

**Given** a round-up selected
**When** the intent is created
**Then** the tip is carried within the same settlement intent rather than as a second payment (FR-T3, AD-8)
**And** the disclosed lines show the obligation and the round-up as separate labelled `amount-pair`s (UX-DR19)

**AC3 — The recipient is still server-owned**

**Given** a round-up tip
**When** its recipient is resolved
**Then** it comes from the Convex wallet record of the bill's recipient, never from the request (FR-T5, AD-13)

---

## Epic 7: Balances, activity, and all square

A person opens My Tab and one sentence tells them where they stand. Every claim, lock, tip and payment is on the record. When the last obligation clears, the group gets its one moment — and then the product goes quiet again.

**Covers:** FR-L1…L6 and FR-M9 · NFR-10 · UX-DR6, UX-DR7, UX-DR17, UX-DR18, UX-DR21, UX-DR24, UX-DR25, UX-DR30, UX-DR39, UX-DR40, UX-DR42…UX-DR48

### Story 7.1: The balance hero — one sentence for where you stand

As someone opening My Tab,
I want one line that tells me my position,
So that I understand my situation before I understand the app.

**Acceptance Criteria:**

**AC1 — Three states, in plain language**

**Given** the Tabs or Group surface
**When** `balance-hero` renders
**Then** it reads "You owe ฿291.74" in `owed`, "You are owed 42.10 USDC" in `settled`, or "All square" in `ink` (FR-L1, UX-DR6)
**And** it sits directly on `paper` with no container and no card

**AC2 — It is not interactive and not a token balance**

**Given** the hero
**When** a person taps it
**Then** nothing happens — it is state-driven display only (UX-DR6)
**And** it never shows a token amount, a portfolio value, or a chart (UX-DR48)

**AC3 — The amount is exact**

**Given** any hero amount
**When** it renders
**Then** it is stated to full precision in `amount-hero` with tabular numerals and never rounded in copy (UX-DR3, UX-DR35)

**AC4 — Semantic color carries a word**

**Given** the owed or settled state
**When** it renders
**Then** the meaning is carried by the words "You owe" or "You are owed" as well as by the color (UX-DR42)

**AC5 — It compresses rather than truncates**

**Given** the largest supported dynamic type at 320px
**When** the hero renders
**Then** the amount may compress but never truncates and never wraps mid-figure (UX-DR44)

### Story 7.2: Tabs home — position, actions, open tabs, groups

As someone who opened the app cold,
I want the home screen to show me where I stand and what I can do,
So that I never have to navigate to find the point.

**Acceptance Criteria:**

**AC1 — The hierarchy is fixed**

**Given** the Tabs surface
**When** it renders
**Then** the order is balance hero → two primary actions → open tabs → groups → recent activity (PRD §9, UX-DR21)
**And** a chart is never the first screen

**AC2 — Two primary actions, no more**

**Given** the actions row
**When** it renders
**Then** it offers "Start a tab" and "Send a tip" (PRD §9)

**AC3 — Open tabs render as tab-cards**

**Given** open tabs across the person's groups
**When** they render
**Then** each is a `tab-card` whose whole surface is one tap target routing to that Claim Board (UX-DR7)
**And** its progress bar reflects settled obligations only, never submitted ones (FR-L3, UX-DR30)

**AC4 — Every balance links back to its bill**

**Given** any balance or obligation shown
**When** it is opened
**Then** it routes to its source bill (FR-L4)

**AC5 — The empty state is designed**

**Given** a person with no groups
**When** Tabs renders
**Then** it shows "No tabs yet. Start one from any Telegram group." with a "Start a tab" action beneath (UX-DR24)

**AC6 — Start a tab never dead-ends outside a group context**

**Given** the person taps "Start a tab" without an active Telegram group session
**When** Telegram context is available
**Then** the app opens a group picker containing only server-verified eligible groups
**And** outside Telegram it explains "Open My Tab from a Telegram group to start a tab" with one action that opens the bot, never an unusable form

### Story 7.3: The activity feed of immutable events

As anyone in a group,
I want a record of everything that happened,
So that a disagreement can be settled by looking rather than by arguing.

**Acceptance Criteria:**

**AC1 — Events are emitted for every domain action**

**Given** a claim, an edit, a lock, a tip, a payment, a waiver, or a manual cash settlement
**When** it commits
**Then** an immutable activity event is appended in the same transaction (FR-L5, AD-12)

**AC2 — Events are append-only**

**Given** any activity event
**When** an edit or delete is attempted
**Then** it is rejected — rows are immutable after the fact (AD-12, UX-DR18)

**AC3 — Rows expand in place**

**Given** an `activity-row`
**When** it is tapped
**Then** it expands in place to reveal detail plus the explorer link, without navigating away (UX-DR18)
**And** the explorer link is the only place a transaction reference is exposed to a person

**AC4 — Rows are readable at a glance**

**Given** the feed
**When** it renders
**Then** each row is a 32px round icon tinted by event type, a `body` sentence, a right-aligned `amount-row` where applicable, and a `meta` relative timestamp (UX-DR18)
**And** the feed is reverse chronological

**AC5 — The empty state is designed**

**Given** no activity yet
**When** the feed renders
**Then** it reads "Nothing yet. Claims, tips and payments show up here." (UX-DR24)

**AC6 — Waivers are recipient-authorized immutable offsets**

**Given** an outstanding obligation with no nonterminal on-chain intent
**When** its recipient chooses to waive all or part of it
**Then** an idempotent immutable waiver event offsets no more than the outstanding amount and records actor, target, amount, reason, and timestamp
**And** an organizer who is not the recipient cannot waive someone else's receivable

**AC7 — Manual cash requires dual acknowledgement**

**Given** an outstanding obligation with no nonterminal on-chain intent
**When** payer or recipient records a cash settlement
**Then** a proposal event is appended but no balance moves until the counterparty acknowledges the exact amount
**And** acknowledgement appends an immutable offset event, rejects overpayment or replay, and remains linked to the source obligation

### Story 7.4: Payment states, visually distinct and confirmed-only

As someone tracking a payment,
I want each state to look different from the others,
So that I always know whether money has actually moved.

**Acceptance Criteria:**

**AC1 — Six states are visually distinct**

**Given** quoted, awaiting signature, submitted, confirmed, failed, and expired
**When** any of them renders
**Then** each is visually distinguishable from the others (FR-L2)
**And** each carries a word or glyph as well as a color (UX-DR42)

**AC2 — Submitted never reduces debt**

**Given** a submitted but unconfirmed payment
**When** balances render
**Then** the debt is unchanged (FR-L3, AD-11)

**AC3 — Progress counters are confirmed-only, everywhere**

**Given** any ring, bar, or "n of 5 settled" counter in the product
**When** it renders
**Then** it reflects confirmed obligations only (UX-DR30)

**AC4 — Failure copy names a cause and a next action**

**Given** a failed payment
**When** it renders in any list
**Then** it states a plain cause mapped from the stable failure code, never a raw provider error (AD conventions, UX-DR34)

### Story 7.5: Within-group balance derivation

As someone in a group with several bills,
I want one net position for that group,
So that I do not have to add up my own obligations.

**Acceptance Criteria:**

**AC1 — Balances derive from ledger events**

**Given** obligations and settlements in a group
**When** the net position is computed
**Then** it derives from immutable ledger events rather than from a mutable paid flag (FR-L6, AD-12)

**AC2 — Derivation spans bills within one group only**

**Given** a person in two groups
**When** their position is shown for one group
**Then** it includes every bill in that group and nothing from the other (FR-L6)
**And** no cross-group netting occurs

**AC3 — Every component links back**

**Given** a derived net position
**When** it is inspected
**Then** each contributing obligation links to its source bill (FR-L4)

**AC4 — All square is a real derived state**

**Given** a group whose cross-bill immutable offsets net to zero
**When** the group position is computed
**Then** it is exactly zero and renders as "All square" (FR-L1, UX-DR24)
**And** this group-level condition is independent of whether any individual bill has completed

**AC5 — Bill completion is derived independently**

**Given** one bill
**When** every active obligation for its current locked revision is fully offset by confirmed chain settlement, recipient-authorized waiver, or dual-acknowledged cash
**Then** that bill becomes complete even if the group has a nonzero position from other bills
**And** superseded obligations never count toward completion

### Story 7.6: The all-square card, once per bill

As the group that just finished settling,
I want one moment that says we are done,
So that completion feels like something rather than a counter reaching zero.

**Acceptance Criteria:**

**AC1 — It fires on the transition, once**

**Given** the final active obligation on a bill receiving its final authorized offset
**When** that bill transitions to complete
**Then** the `all-square-card` appears exactly once for that bill (UX-DR17)
**And** it is never replayed on revisit

**AC2 — Only people present see it**

**Given** the transition
**When** it occurs
**Then** only people with the app open at that moment see the card (UX-DR17)
**And** people opening later see "All square" as a calm state on the Group screen, with no badge and no trophy (UX-DR24)

**AC3 — It is the only gradient in the system**

**Given** the card
**When** it renders
**Then** it uses the `tip` wash fading into `paper` across the top 40%, a centered check in a ring, an `amount-hero` headline, a `presence-stack`, and a `primary` action (UX-DR17)
**And** this is the only gradient anywhere in the product (UX-DR40)

**AC4 — Reduce Motion keeps the card, drops the wash**

**Given** Reduce Motion enabled
**When** the transition occurs
**Then** the card still appears but does not wash in (UX-DR44)

**AC5 — No per-payment celebration exists**

**Given** any individual payment confirming
**When** it lands
**Then** no confetti, no takeover, and no celebration fires (UX-DR40, UX-DR48)

### Story 7.7: The accessibility floor

As someone using a screen reader, a larger type size, or reduced motion,
I want to be able to settle a bill,
So that the product works for me and not only for a demo.

**Acceptance Criteria:**

**AC1 — Semantic color never travels alone**

**Given** every state carried by `owed`, `settled`, or `warning`
**When** it renders
**Then** it also carries a word or glyph (UX-DR42)
**And** a person who cannot distinguish the hues can still complete a settlement

**AC2 — Touch targets meet the floor**

**Given** every interactive element including claim rows, token chips, and avatar chips
**When** measured
**Then** each is at least 44px (NFR-10, UX-DR42)

**AC3 — Screen readers get role, state, and meaning**

**Given** a screen reader active
**When** elements are traversed
**Then** every interactive element announces role and state, and `claim-row` announces item, price, and current claimants — "Green Curry, 180 baht, claimed by you" (UX-DR43)
**And** the `settlement-stepper` announces each transition once as a live region

**AC4 — Amounts read as money**

**Given** any amount read aloud
**When** it is announced
**Then** it reads "291 baht 73" and never "two nine one point seven three" (UX-DR43)

**AC5 — Focus order follows reading order**

**Given** any surface
**When** it is traversed by keyboard
**Then** focus order matches reading order and the sticky footer action is last, never first (UX-DR43)

**AC6 — Reduce Motion and dynamic type both hold**

**Given** Reduce Motion enabled and the largest supported type size at 320px
**When** every surface renders
**Then** the three animations and all haptics are absent, states change instantly, layout holds, and no amount truncates (UX-DR44)

### Story 7.8: The device and platform floor

As someone on a small phone, a Thai keyboard, or Telegram Desktop,
I want the app to hold together,
So that my device is not the reason a payment fails.

**Acceptance Criteria:**

**AC1 —320px is a hard floor**

**Given** any surface at 320px
**When** it renders
**Then** there is no horizontal scroll and amount columns compress before item names truncate (UX-DR46)

**AC2 — Amounts are never truncated**

**Given** a long Telegram display name beside an amount
**When** the row renders
**Then** the name truncates with an ellipsis and the amount renders in full (UX-DR46)

**AC3 — Missing avatars are people, not silhouettes**

**Given** a member with no avatar
**When** they render
**Then** an initial appears on a deterministic tint derived from their user id (UX-DR46)
**And** white initials clear AA contrast on all five avatar tints

**AC4 — The keyboard does not break the footer**

**Given** an open keyboard on Android or iOS
**When** the layout adjusts
**Then** the focused field scrolls into view and the sticky footer stays attached to the viewport rather than overlapping the keyboard (UX-DR46, UX-DR45)

**AC5 — Desktop and standalone both work**

**Given** Telegram Desktop and a plain browser
**When** the app runs
**Then** Desktop centers the same 390px column with no wide layout, and the standalone browser supports presence, claiming, and all reads (UX-DR45, UX-DR47)

### Story 7.9: Product-wide empty, loading, and offline states

As anyone using the app on a bad connection,
I want every screen to have something honest to say,
So that I never face a blank rectangle or a spinner over data I can already see.

**Acceptance Criteria:**

**AC1 — Every surface resolves to a designed state**

**Given** each of the 13 surfaces
**When** it is in any of its possible states
**Then** designed copy exists for it — no state in the product ships without copy (UX-DR24)

**AC2 — First paint is a geometry-matched skeleton**

**Given** first paint on Tabs, Claim Board, or Activity
**When** it renders
**Then** skeleton rows match final geometry with tabular-width numeral placeholders (UX-DR25)

**AC3 — Subsequent updates show no spinner**

**Given** correct data already on screen
**When** an update arrives
**Then** it replaces content in place with no spinner (UX-DR25)

**AC4 — Offline degrades to readable, not broken**

**Given** the device offline
**When** any surface renders
**Then** a single inline "You're offline. We'll catch up." bar appears, cached state stays readable, claims queue and reconcile on reconnect, and money actions are disabled (UX-DR24, UX-DR26)
**And** only claim/release operations enter an IndexedDB outbox with `operationId`, requested effect, target, base revision, and created time; authoring, lock/reopen, payment, waiver, and manual cash never queue
**And** replay is serial and server-deduplicated, stale operations refresh current state and require a new tap when their intended effect is no longer applicable, and no stale mutation is retried blindly

**AC5 — Banned interaction patterns are absent**

**Given** the whole product
**When** it is reviewed
**Then** there is no pull-to-refresh, no carousel, no parallax, no skeleton shimmer, no toast stack, no badge count, no confetti, and no sound (UX-DR39, UX-DR40)

### Story 7.10: Demo readiness

As the team presenting this to judges,
I want a seeded dataset, a visible environment badge, and a recorded fallback,
So that a network failure on stage is an inconvenience rather than the end of the demo.

**Acceptance Criteria:**

**AC1 — A seeded dataset exists and resets**

**Given** demo mode
**When** it is invoked
**Then** the seeded group, members, tab, and items from the UX protagonists (Maya, Andre, Noi, Ploy, Tim) are created
**And** a Convex scheduled task can reset demo data to a known state (AD-16)

**AC2 — Environment is unmistakable**

**Given** a non-production deployment
**When** the app loads
**Then** a visible non-production badge appears (AD-3)

**AC3 — Demo affordances are hidden from judges**

**Given** any demo-mode affordance in the product
**When** the app renders normally
**Then** it is deliberately hidden and is not discoverable by a judge (UX-DR39)
**And** a hidden long-press is the single sanctioned exception to long-press being unbound, reserved for demo mode only

**AC4 — A backup video exists**

**Given** the demo checklist
**When** it is completed
**Then** a recorded backup video of the full flow exists and is accessible offline (PRD §12)

**AC5 — Production smoke test after every config change**

**Given** any change to a Vercel or Convex environment variable
**When** it is deployed
**Then** a production smoke test confirms the app is bound to the intended Convex deployment via `GET /api/health` (AD-3)

### Story 7.11: Debt compression

As a group with several bills going in both directions,
I want the app to suggest the fewest payments that settle everything,
So that we do not each make three transfers that cancel out.

**Acceptance Criteria:**

**AC1 — Sequenced as a pure domain addition**

**Given** within-group balance derivation and confirmed-only ledger offsets pass
**When** compression is implemented
**Then** it consumes that same derived input without a second balance model (FR-M9)
**And** compression requires no mutation of obligations or settlements

**AC2 — Greedy matching over confirmed net positions**

**Given** confirmed net positions in a group
**When** compression runs
**Then** it greedily matches debtors to creditors and produces at most `n − 1` transfers (FR-M9)
**And** it operates on confirmed positions only, never submitted ones (AD-11)

**AC3 — The claim is honest**

**Given** any copy describing compression
**When** it renders
**Then** it does not claim the result is the mathematical minimum (FR-M9)

---

## Epic 8: Scan the receipt

The organizer photographs the restaurant receipt instead of typing it, corrects the two rows the model got wrong, and confirms. The tab fills itself.

**Covers:** FR-R1…R7 · NFR-6, NFR-7 · UX-DR20, UX-DR24, UX-DR34, UX-DR48
**Sequenced after manual entry and deterministic parsing.** It may use a rollout flag while integration is validated, but it remains in the complete build and the receipt must never block manual entry.

### Story 8.1: Upload a receipt image to Convex file storage

As the organizer holding a paper receipt,
I want to photograph it,
So that I do not have to type nineteen dishes with the table waiting.

**Acceptance Criteria:**

**AC1 — Upload goes through Convex file storage**

**Given** an organizer capturing or selecting a receipt image
**When** it uploads
**Then** it is stored through Convex file storage and a `receiptImports` record is created linked to the tab (FR-R1)
**And** the upload never routes through a Route Handler or a third-party bucket
**And** Convex atomically creates a `ticketed` import plus a one-use organizer-bound upload ticket only after authorization and AD-24 quota reservation; the ticket expires after 10 minutes and never renews

**AC2 — The record is durable before extraction runs**

**Given** an uploaded image
**When** extraction is triggered
**Then** the `receiptImports` record already exists with status `uploaded`, and extraction runs via `scheduler.runAfter` (AD-8, NFR-1)
**And** finalization binds exactly one storage ID to the pending import; `ticketed|uploaded|extracting|needs_review` count as active, while `confirmed|failed|rejected|deleted` do not

**AC3 — Access is authenticated on every request and deletion is timed**

**Given** a stored receipt image
**When** it is read
**Then** an authenticated Convex HTTP Action verifies identity plus organizer/group scope and streams the object; a permanent `storage.getUrl()` bearer URL is never returned (NFR-7)
**And** originals/provider payload delete at the earlier of 30 days after upload or 7 days after bill completion, failed/abandoned uploads delete after 24 hours, and normalized confirmed items delete after 365 days leaving only non-sensitive tombstone/audit IDs (AD-23)
**And** authorized deletion may shorten but never extend those periods

**AC4 — Only the organizer can upload**

**Given** an upload request
**When** it is authorized
**Then** `requireBillOrganizer` passes or the request is rejected (NFR-3)

**AC5 — Receipt bytes are validated before extraction**

**Given** bytes uploaded through an authorized ticket
**When** Convex validates the stored object
**Then** it accepts only JPEG, PNG, or WebP by magic type, at most 10 MB, at most 10,000 pixels on either edge, and at most 25 megapixels decoded
**And** a client-selected HEIC image is converted to an accepted format before upload rather than being trusted by extension
**And** any rejected or ticket-mismatched blob is deleted immediately and never scheduled for extraction

**AC6 — Abandoned tickets and orphan blobs cannot hold capacity**

**Given** a ticket that expires before valid finalization, an upload whose client disappears, or a storage ID not bound to its pending import
**When** the cleanup cron runs
**Then** it deletes any orphan blob, marks the import `deleted`, and releases only the active-capacity reservation owned by that import
**And** the consumed upload attempt remains charged for its daily/hourly window so abandonment cannot bypass quotas
**And** crash, retry, double-finalize, expiry-boundary, and orphan-cleanup tests prove the ticket is single-use and capacity recovers

**AC7 — The capture affordance is not framed as intelligence**

**Given** the capture control
**When** it renders
**Then** it reads "Scan receipt" with no sparkle, wand, or robot icon and no mention of AI (UX-DR48, UX-DR34)

### Story 8.2: Extraction against a strict schema in a Convex action

As the organizer,
I want the photo turned into structured rows,
So that I am correcting a draft rather than starting from nothing.

**Acceptance Criteria:**

**AC1 — Extraction runs at the effect edge against a fixed schema**

**Given** an uploaded receipt
**When** extraction runs
**Then** it executes in a Convex action against a strict schema, validated with Zod at the boundary (FR-R1, AD-18, AD conventions)
**And** free-form model output that does not match the schema is rejected rather than coerced

**AC2 — Provenance is stored alongside the result**

**Given** a completed extraction
**When** the record is written
**Then** it stores the raw extraction, per-field confidence, reconciliation status, and model metadata (FR-R2)

**AC3 — The model's authority is bounded**

**Given** the extraction action
**When** its scope is reviewed
**Then** it does not assign participants, resolve disputes, produce a final total, or sign or submit anything (AD-18)

**AC4 — The selected provider and key live at the Convex effect edge**

**Given** the receipt-extraction provider configuration
**When** it is configured
**Then** the `receiptExtraction` adapter calls the OpenAI Responses API with image input and a strict schema from a Convex Node action
**And** `OPENAI_API_KEY` is held only in Convex env with no `NEXT_PUBLIC_` prefix (AD-18, AD-19, NFR-8)
**And** the vision-capable model ID is pinned in deployment configuration only after the Thai/English receipt fixture evaluation; changing provider/model reruns the fixture suite and requires an architecture decision

**AC5 — Failure writes a state, not an exception**

**Given** extraction that fails or times out
**When** the action completes
**Then** the record moves to a failed status with a stable failure code and the organizer is routed to manual entry (NFR-6, FR-R6)

**AC6 — Extraction consumes an atomically reserved budget**

**Given** an authorized validated upload
**When** extraction is requested
**Then** Convex atomically reserves the AD-24 provider-call budget before scheduling the action
**And** at most 3 imports per user and 10 per group are active, at most 2 extractions run concurrently per group, and daily extraction caps are 10 per user, 30 per group, and the reviewed global cap
**And** a rejected, paused, or over-limit request calls no provider, exposes a stable retry-after/manual-entry path, and releases no reservation it did not own
**And** extraction has a 90-second deadline and a two-minute concurrency lease refreshed every 30 seconds; success, schema rejection, provider failure, timeout, cancellation, and crash recovery all release that lease
**And** consumed time-window attempts stay charged, unused reserved attempts release, and table-driven tests cover crash, retry, stale heartbeat, and every terminal state

### Story 8.3: Deterministic re-parse and line-total recalculation

As anyone on this bill,
I want every number recomputed by our own code before I see it,
So that a model's arithmetic never becomes what I owe.

**Acceptance Criteria:**

**AC1 — Every amount is re-parsed to integer minor units**

**Given** extracted amounts in any format the receipt used
**When** they are processed
**Then** each is parsed into integer minor units by the `lib/domain/` parser before display (FR-R3, FR-M1)
**And** no extracted numeric value is displayed as-is

**AC2 — Line totals are recomputed, never trusted**

**Given** an extracted line with quantity, unit price, and a printed line total
**When** it is processed
**Then** the line total is recomputed from quantity and unit price, and the printed value is used only for comparison (FR-R3, FR-R5)

**AC3 — Reconciliation is computed against the printed total**

**Given** recomputed line totals and the extracted receipt total
**When** they are compared
**Then** the difference is computed in integer minor units and stored as reconciliation status (FR-R2, FR-R3)

**AC4 — Model output can never become an obligation directly**

**Given** any extracted value
**When** it flows toward an obligation
**Then** it passes through deterministic recalculation and organizer confirmation first (FR-R5, AD-18)

**AC5 — Parsing is pure and unit-tested**

**Given** the parsing and reconciliation functions
**When** they are tested
**Then** they live in `lib/domain/` with no I/O and are covered by unit tests over the target receipt formats (AD-6)

### Story 8.4: Receipt Review with the discrepancy card and confidence flags

As the organizer,
I want to see exactly what needs my attention,
So that I fix two rows instead of re-reading nineteen.

**Acceptance Criteria:**

**AC1 — Low-confidence and mismatched fields are flagged**

**Given** extracted fields with low confidence or a reconciliation mismatch
**When** Receipt Review renders
**Then** those rows are visibly flagged with an amber treatment and a word, never color alone (FR-R4, UX-DR42)

**AC2 — The discrepancy card states the exact gap**

**Given** a total that does not reconcile
**When** the card renders
**Then** it is sticky at the top of Receipt Review, in `warning` text with a 1px border on a 6%-opacity amber fill, stating the exact figures: "Items add up to ฿1,812 but the total says ฿1,840." (UX-DR20, UX-DR35)

**AC3 — The card dismisses itself, and only itself**

**Given** the organizer correcting values until the numbers reconcile
**When** reconciliation succeeds
**Then** the discrepancy card disappears on its own (UX-DR20)
**And** it is never manually dismissible

**AC4 — Every field is editable**

**Given** any extracted merchant, item, quantity, price, or total
**When** the organizer edits it
**Then** the edit is accepted and reconciliation recomputes live (FR-R4)

**AC5 — No confidence percentages are shown**

**Given** stored per-field confidence
**When** the surface renders
**Then** confidence drives which rows are flagged but is never displayed as a percentage or a score (UX-DR48)

### Story 8.5: Confirm receipt creates the bill items

As the organizer,
I want one action that turns the corrected receipt into the tab,
So that the claim board opens ready for everyone.

**Acceptance Criteria:**

**AC1 — Confirmation is required and explicit**

**Given** a reviewed extraction
**When** items are created
**Then** they are created only after the organizer taps "Confirm receipt" (FR-R4, AD-18)
**And** no item is created automatically on extraction completion

**AC2 — Created items are indistinguishable in shape**

**Given** items created from a receipt
**When** their schema is inspected
**Then** they match the Story 4.2 item shape exactly, differing only by a source field (FR-R1)
**And** every downstream epic treats them identically

**AC3 — Confirmation is blocked while the bill does not reconcile**

**Given** an unresolved discrepancy
**When** confirmation is attempted
**Then** it is blocked with the shortfall named exactly (FR-R4, UX-DR28)

**AC4 — Confirmation increments the revision**

**Given** items created on an unlocked tab
**When** the mutation commits
**Then** `tabs.revision` increments and all subscribed clients update (FR-B4, AD-7)

**AC5 — The Claim Board opens next**

**Given** a confirmed receipt
**When** the flow proceeds
**Then** the organizer lands on the Claim Board with items listed and any present participants already in the presence stack (UX-DR10)

### Story 8.6: The sample receipt and the manual fallback

As the person demoing this,
I want a receipt path that cannot fail,
So that a bad photo or a slow provider never ends the demo.

**Acceptance Criteria:**

**AC1 — A sample receipt path exists under demo mode**

**Given** demo mode active
**When** the hidden affordance is used
**Then** a seeded sample receipt produces a known-good extraction with no external call (FR-R6)
**And** the affordance is deliberately hidden from judges (UX-DR39)

**AC2 — Failure routes to manual entry, always**

**Given** an unusable photo or a failed extraction
**When** the flow recovers
**Then** Receipt Review opens empty with "Add what you ordered." and both capture actions (FR-R6, UX-DR24)
**And** the receipt never blocks the tab

**AC3 — Manual entry is never removed**

**Given** the receipt feature enabled
**When** New Tab renders
**Then** manual item entry from Epic 4 remains available as a first-class path (FR-R6)

**AC4 — Rollout flag does not remove the complete feature**

**Given** a non-production integration rollout with the flag off
**When** the app renders
**Then** no scan affordance appears and manual entry functions unchanged (FR-R6)
**And** production readiness requires the flag-on image fixtures and provider egress tests to pass; the story is not considered done while permanently disabled

### Story 8.7: The targeted Thai and English receipt subset

As the team,
I want a defined and tested set of receipt formats,
So that we can say what works instead of promising universal OCR.

**Acceptance Criteria:**

**AC1 — The target subset is written down**

**Given** the receipt feature
**When** its scope is documented
**Then** it names the tested subset: Thai and English restaurant receipts with baht symbols, VAT rows, service-charge rows, and both whole-baht and two-decimal formats (FR-R7)

**AC2 — Each format has a fixture and a test**

**Given** the target subset
**When** the test suite runs
**Then** each named format has a representative image fixture that passes through the actual configured provider adapter and deterministic parser with an expected result (FR-R7)
**And** extraction JSON fixtures may supplement but never replace end-to-end image fixtures

**AC3 — Out-of-subset receipts fail into manual entry**

**Given** a receipt outside the target subset
**When** extraction runs
**Then** it either extracts correctly or fails cleanly into manual entry, and never produces silently wrong items (FR-R5, FR-R6)

**AC4 — No universal-OCR claim appears**

**Given** any user-facing or judge-facing copy
**When** it is reviewed
**Then** it does not promise universal receipt scanning (FR-R7)
