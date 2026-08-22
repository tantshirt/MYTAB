---
title: My Tab — Product Requirements Document
status: final
version: '1.1'
created: '2026-08-21'
updated: '2026-08-21'
sources:
  - ../../briefs/brief-MYTAB-2026-08-21/brief.md
  - ../../architecture/architecture-MYTAB-2026-08-21/ARCHITECTURE-SPINE.md
  - ../../research/2026-08-21-stack-verification.md
note: >-
  Distilled from Brief v1.3 sections 3, 4, 6, 7, 8, 10, 11, 12, 17, 19, 24, 26.
  The brief remains the narrative and judge-facing source; this PRD is the
  numbered requirement contract that UX, epics, and stories cite. Edit via
  `bmad-prd` Update intent.
---

> ## ⚠ Amendment notice — read `docs/DECISIONS.md` first
>
> **This document remains the numbered requirement contract** that UX, epics and stories cite.
> FR/NFR ids are stable and still binding except where listed below.
>
> Superseded, with reasoning in **`docs/DECISIONS.md`** (binding):
>
> - **OQ-2** — *"Resolved 2026-08-21: native SOL"* is itself superseded. Any token the payer
>   holds, subject to verification (**D-05**).
> - **FR-S4** — *"P0 DFlow orders support one non-USDC input: native SOL"* → any verified
>   token (**D-05**). The output mint, wrapped-SOL normalization and the sync-only rule are
>   unchanged; `allowAsyncExec=false` must be asserted **present in the serialised query**
>   because the API default is `true` (**D-04**).
> - **FR-S6** — *"platform fee amount is exactly zero and no fee account exists"* → the fee
>   fields are **omitted from the request entirely**; a declared fee, including a declared
>   zero, is charged against the slippage budget (**D-04**). The checklist item *"resolved
>   address-lookup-table entries match the versioned manifest"* is now the routed path's
>   normal operation, not an edge case (**D-02**).
> - **OQ-4** — resolved zero, and implemented as *omitted* rather than *zero* (**D-04**).
> - **OQ-1** — resolved; the custom-JWT path works.
> - Mainnet is the target cluster and the cluster is configuration (**D-01**); no fixture or
>   demo data ships in source (**D-11**); `tabParticipants` is the authoritative roster
>   (**D-06**).


# My Tab — Product Requirements Document

## 1. Product Summary

**My Tab is the group tab that lives in Telegram. Start it, split it, tip the crew, and settle without leaving the chat.**

A Telegram group starts a bill. Participants open the same Mini App session and claim their items. My Tab computes each obligation with transparent tax, service-charge, discount, and tip rules. A participant chooses an allowed payment token, the recipient receives USDC, and a dedicated Privy-managed fee-payer wallet sponsors the Solana network fee. The bill updates live and the bot posts a confirmation into the group.

The product must read as a social coordination app with invisible crypto infrastructure — never a wallet interface with expense features attached.

## 2. Users

| Segment | Who | Core need |
| --- | --- | --- |
| **Primary — Organizer** | Dinner host, trip organizer, roommate, team lead, community admin | Start a bill fast, invite without a registration flow, see who claimed and who paid, stop chasing people |
| **Secondary — Participant / payer** | Anyone in the group chat | Join in one tap, see only their items and a clear total, understand every adjustment, pay without learning Solana |
| **Tertiary — Tip sender / recipient** | Anyone thanking anyone | Send a fast social payment with a message, pay in an allowed token, receive a preferred stable asset, get immediate social confirmation |

### Jobs to be done

- JTBD-1 — When a group finishes a meal, help us agree on each share and settle before anyone leaves.
- JTBD-2 — When one person covers a group expense, show everyone what they owe and who has paid.
- JTBD-3 — When someone helps the group, let me tip them in seconds without asking for a wallet address.
- JTBD-4 — When several bills accumulate, show my current position without making me inspect every transaction.

## 3. Product Principles

1. **Amount first.** Show the obligation before token details.
2. **One clear action.** Every screen gets one dominant next step.
3. **Explain the math.** Tax, service charge, discounts, tip, and rounding stay inspectable.
4. **Social context over wallet context.** Names, avatars, and group language before addresses and mints.
5. **Deterministic money.** All arithmetic uses integer units and audited rules.
6. **Progressive disclosure.** Hide routing, price protection, and network data until requested. The engineering term "slippage" never appears in user-facing copy.
7. **Live confidence.** Participants see who joined, claimed, locked, and paid.
8. **No dead ends.** Every AI, quote, wallet, or network failure has a manual or retry path.

## 4. Success Criteria

| Goal | Acceptance target |
| --- | --- |
| Product comprehension | A judge understands the product within 15 seconds |
| Group onboarding | A participant joins a bill from Telegram in one tap |
| Split accuracy | Participant totals reconcile exactly to the locked bill total |
| Settlement | At least one live sponsored Solana payment confirms during the demo |
| DFlow proof | At least one payment converts an allowlisted input token into recipient USDC |
| Tipping | A tip can be composed, paid, and acknowledged independently of a bill |
| Live coordination | Item claims and payment status update without a page refresh |
| Polish | Consistent branding, motion, haptics, loading, empty, error, and success states |
| Reliability | Deterministic fallback for receipt import, FX, and network failure |

**North star:** time from Telegram bill link to confirmed payment, under 90 seconds for a returning wallet user.

**Supporting metrics:** bill completion rate · median time to claim all items · quote-to-sign conversion · confirmed settlement rate · average outstanding balance age · tips sent/received · requote and expiration rate.

## 5. Scope

P0 and P1 are **risk-based implementation sequences, not scope cuts**. All capabilities represented by the approved 70-story backlog remain committed. P0 proves the highest-risk production seams first; P1 follows on the same architecture after those gates pass. A schedule change may move a capability later, but it does not remove it without an explicit product decision and documentation update.

### 5.1 P0 — required for the judged MVP

Telegram commands and deep links · bill creation and manual item entry · join, claim, unclaim, equal split · exact integer calculation with proportional adjustments · organizer lock · balances and payment progress · Privy embedded Solana wallet · exact USDC settlement via user sign + sponsor co-sign · SOL-to-USDC through DFlow with a bounded target-output solver · direct tipping · settlement state tracking · history · complete branded light theme with all interaction states.

### 5.2 P1 — judge-wow after the payment path works

Receipt scan · Thai and English receipt handling · live claim presence · personal round-up tip · payment celebration card · lightweight debt compression · read-only web summary · quantity, percentage, and fixed allocation modes · external-wallet support.

### 5.3 Explicit non-goals

Arbitrary memecoin support · multiple recipient wallets per bill · prediction-market tips · merchant dashboard · group treasury and voting · recurring charges · cross-group debt netting · installments · refund automation · accounting exports · AI-inferred participant assignment from chat history · universal receipt OCR · custody, cards, bank transfers, fiat on-ramp · reputation, badges, leaderboards.

## 6. Functional Requirements

Requirement IDs are stable. UX flows, epics, and stories cite them by ID.

### FR-A — Authentication and identity

- **FR-A1** Privy is the canonical authentication provider; Telegram seamless login is enabled so the Mini App authenticates with zero clicks inside Telegram.
- **FR-A2** The Privy DID from the verified JWT is the external authentication subject. The Convex document `_id` is the internal foreign key. The Solana address is never a primary key.
- **FR-A3** Privy access tokens flow into `ConvexProviderWithAuth`; every public Convex function that exposes private data checks `ctx.auth.getUserIdentity()`.
- **FR-A4** Telegram identity is bound only by authenticated `POST /telegram/bootstrap` in `convex/http.ts`. The HTTP Action requires a valid Privy bearer JWT plus raw Telegram Mini App `initData`, validates the Telegram HMAC with the bot token, enforces `auth_date` freshness and replay protection, matches `start_param` to the hashed session token, and atomically creates or refreshes a five-minute server-side Telegram context bound to the verified Privy subject, Telegram user, chat, group, and session. It invokes internal Convex functions only; `initDataUnsafe` is never trusted.
- **FR-A5** No browser-supplied Privy DID, Telegram ID, chat ID, wallet ID, or wallet address is ever trusted.
- **FR-A6** Opaque tokens have explicit classes. A `tab_session` token is reusable by different verified members and across revisits until its TTL, revocation, bill closure, or group-membership failure; resolving it grants scope, never identity. A `tip_session` token is reusable only within its bound group and context. A `single_use_action` token is subject-bound, purpose-bound, consumed atomically once, and rejected on replay. All raw tokens are high-entropy, stored only as hashes, and rejected when expired, revoked, wrong-class, wrong-scope, or unauthorized.
- **FR-A7** Authenticated mutations are Telegram-only: they require both a valid Privy identity and a fresh server-side Telegram context for the relevant group/session created by FR-A4. The browser may reference the opaque session token but cannot select the bound Privy subject, Telegram user, chat, or group. Outside Telegram, an opaque token may expose the explicitly sanitized read-only summary, but cannot claim, edit, lock, waive, record cash, create an intent, sign, or pay.

### FR-W — Users and wallets

- **FR-W1** One Privy embedded Solana wallet is created or restored on first successful login.
- **FR-W2** Convex stores the Privy wallet ID and Solana address only. No private keys, seed phrases, or exported material.
- **FR-W3** Exactly one default receiving wallet per user; embedded and external wallets are marked distinctly.
- **FR-W4** External Solana wallets are P1 only.

### FR-G — Groups

- **FR-G1** A My Tab group is created or resolved from the Telegram chat recorded by the bot webhook.
- **FR-G2** The group carries display name, avatar, member join state, role, and wallet readiness.
- **FR-G3** Group default currency and recipient asset are visible.
- **FR-G4** Multiple open tabs are supported; the UI optimizes for one active tab.
- **FR-G5** Telegram group membership is never inferred from client claims.
- **FR-G6** The bot must be an administrator in each supported group. Convex consumes Telegram membership updates and refreshes `getChatMember` before join and whenever the cached result is older than five minutes at a privileged action. Only `creator`, `administrator`, `member`, or `restricted` with `is_member=true` qualify; `left` and `kicked` revoke mutation access immediately. Bot-admin or Telegram-API failure produces a read-only state with a clear organizer repair action.

### FR-B — Bills

- **FR-B1** Create a draft bill with title, merchant, display currency, payer, recipient, and FX snapshot.
- **FR-B2** Add, edit, duplicate, and remove items while unlocked.
- **FR-B3** Add tax, service charge, discount, and group-tip adjustments (fixed or percentage).
- **FR-B4** The bill carries a monotonically increasing revision; every draft edit increments it.
- **FR-B5** The organizer must lock a revision before any settlement intent can exist.
- **FR-B6** Any revision change expires every quote created from an older revision.
- **FR-B7** Post-lock edits require an explicit reopen-and-recalculate action; a bill with a confirmed payment cannot silently return to open.

### FR-C — Item allocation (claim board)

- **FR-C1** P0 allocation modes: one participant, or equal split across selected participants.
- **FR-C2** P1 allocation modes: quantity consumed, custom percentage, custom fixed amount.
- **FR-C3** Every claim mutation is atomic, authorized, revision-aware, and visible through Convex realtime subscriptions.
- **FR-C4** A participant can release their own allocation; the organizer can override any allocation.
- **FR-C5** Unassigned items surface a warning state and block lock until resolved.

### FR-M — Calculation and ledger

- **FR-M1** Fiat amounts are signed 64-bit integers in minor units. THB stores satang even when the UI shows whole baht.
- **FR-M2** Crypto amounts are atomic-unit integers carried as `bigint` or decimal string across JSON boundaries. Mint decimals are stored with every quote and settlement record.
- **FR-M3** JavaScript floating point is never used for persisted money.
- **FR-M4** Equal item split uses integer division plus largest-remainder allocation in stable participant order, preserving the exact item total.
- **FR-M5** Proportional tax, service charge, tip, and discount are computed per participant, floored, then remainders distributed by largest fractional remainder. Final allocated shares are persisted, not only the formula.
- **FR-M6** The lock invariant must hold or the server rejects the lock: `sum(item shares) + sum(tax) + sum(service) + sum(tip) − sum(discount) = locked bill total`.
- **FR-M7** Locking persists an immutable snapshot: revision, items, allocations, adjustment policy, FX, per-participant obligation, target settlement asset, recipient.
- **FR-M8** Obligations and settlements are immutable ledger events. An obligation is never overwritten to mark it paid; a settlement event offsets it.
- **FR-M9** Debt compression (P1) computes net positions and greedily matches debtors to creditors, guaranteeing at most `n − 1` transfers. It is not claimed to be the mathematical minimum.
- **FR-M10** Every obligation stores both `displayAmountMinor` in the locked bill currency and `settlementAmountAtomic` in USDC. USDC atomic units are the canonical ledger and group-net unit; display-currency values are never summed across unlike currencies. A group may render a current informational fiat equivalent, but it is not ledger truth and must show its rate timestamp.
- **FR-M11** A THB bill uses an immutable FX snapshot with `direction="USDC_ATOMIC_PER_THB_MINOR"`, positive integers `numeratorAtomic` and `denominatorMinor`, `provider:'frankfurter:BOT'`, `providerAsOf`, `fetchedAt`, `expiresAt`, and policy version. Frankfurter v2 `USD/THB` filtered to the Bank of Thailand provider is normalized without parsing through a JavaScript number; conversion is `ceil(displayAmountMinor × numeratorAtomic ÷ denominatorMinor)` so the recipient target is never underfunded. A snapshot is fresh for 36 hours from provider date on weekdays and 96 hours across weekends/Thai bank holidays. Production fails closed if unavailable or stale; only non-production may use a visibly labeled manual rational. Once locked, the snapshot never refreshes silently.
- **FR-M12** A waiver is an immutable offset authorized only by the obligation recipient, for no more than the remaining obligation, with a required reason and actor timestamp; an organizer has no unilateral waiver authority unless they are that recipient. A manual-cash settlement is a separate immutable proposal that becomes an offset only after the payer and recipient acknowledge the same amount/currency/method; either party may propose, neither may finalize alone, and the organizer has no extra authority. It never claims on-chain confirmation. Completion counts confirmed on-chain settlements, dual-acknowledged cash offsets, and recipient-authorized waivers exactly once.

### FR-L — Balances and activity

- **FR-L1** Show bill-level obligation and group net position in plain language: "You owe ฿291.74" / "You are owed 42.10 USDC" / "All square". A group net is calculated only from canonical USDC atomic ledger events; any THB rendering is a clearly timestamped informational conversion.
- **FR-L2** Quoting, ready to pay, awaiting wallet approval, verifying, submitted, confirmation unknown, confirmed, failed, and quote-expired payment states are visually distinct.
- **FR-L3** Confirmed debt is never reduced by a merely submitted transaction.
- **FR-L4** Every balance preserves a link back to its source bill.
- **FR-L5** Immutable activity events are emitted for claims, edits, locks, tips, payments, waivers, and manual cash settlement.
- **FR-L6** P0 derives balances across bills within one group. No cross-group netting.

### FR-T — Tipping

- **FR-T1** Direct tip to a verified group participant, with presets and a custom amount.
- **FR-T2** Optional message and reaction.
- **FR-T3** Round-up tip attachable to a bill payment.
- **FR-T4** Recipient receives USDC in P0; sender pays USDC or one allowlisted DFlow input token.
- **FR-T5** The recipient address comes from the Convex wallet record, never the request body.
- **FR-T6** After quote creation, the sender cannot alter recipient, amount, output mint, or sponsor.
- **FR-T7** The same intent cannot be paid twice; a failed or expired quote can be recreated without duplicating the tip record.

### FR-S — Settlement

- **FR-S1** A server-owned settlement intent is created before any transaction is requested.
- **FR-S2** The intent binds user, wallet, bill revision, obligation or tip, recipient, input mint, output mint, maximum input, minimum output, idempotency key, and expiry.
- **FR-S3** Exact USDC transfers are built in a Convex Node action with the Privy sponsor wallet as fee payer.
- **FR-S4** P0 DFlow orders support one non-USDC input: native SOL, normalized server-side to the wrapped-SOL mint `So11111111111111111111111111111111111111112`; the UI always labels it "Solana" and does not require a persistent wrapped-SOL balance. The recipient output is mainnet USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. Orders are requested in a Convex Node action with the sponsor address as `sponsor`, `sponsorExec=false`, `allowSyncExec=true`, `allowAsyncExec=false`, and the server-owned recipient as `destinationWallet`. My Tab rejects any response whose execution mode is not synchronous. Any wrap, temporary token-account, and close instructions must match the transaction allowlist.
- **FR-S5** The serialized transaction is validated against the full checklist (see FR-S6) and its message hash stored before any bytes reach the client.
- **FR-S6** Validation checklist, enforced before returning bytes and again before sponsor co-signing: authenticated payer owns the intent · payer wallet matches the Privy record · fresh Telegram group membership and launch scope remain valid · intent belongs to the locked revision · recipient matches the server-side record · mints match intent and allowlist · maximum input has not increased · minimum output meets the obligation · fee payer is the expected sponsor wallet · platform fee amount is exactly zero and no fee account exists for the judged build · signer set is exactly the expected payer and sponsor set · programs, instructions, writable accounts, and resolved address-lookup-table entries match the versioned manifest · compute/priority fee and ATA creation stay within policy · blockhash and `lastValidBlockHeight` are valid · message hash matches stored hash · intent is in the expected `ready_for_signature` or `user_signed` state and is not submitted, unknown, confirmed, failed, expired, or superseded.
- **FR-S7** The user signs through Privy without broadcasting; the partially signed bytes return to Convex for re-verification. Successful re-verification persists `user_signed`.
- **FR-S8** The Privy fee-payer wallet co-signs only `user_signed` intents that pass server policy; Convex broadcasts through the configured RPC. RPC acceptance persists `submitted`; ambiguous acceptance persists `unknown`.
- **FR-S9** The ledger changes only after parsed finalized on-chain confirmation: transaction success, exact stored message hash, correct recipient token account and mint, recipient increase at or above target, payer debit within maximum input, zero platform fee with no fee account, actual sponsor debit within the owned reservation, and signature plus target not previously applied.
- **FR-S10** Duplicate payment and stale-revision payment are blocked.
- **FR-S11** Broadcast ambiguity never becomes an immediate retry. The persisted intent moves `user_signed → submitted` when broadcast is accepted; an unavailable or inconclusive RPC observation moves it to `unknown`. While `submitted` or `unknown`, a replacement intent for the same obligation or tip is blocked. "Confirming" is a UI label derived from `submitted`, never a stored state. An intent becomes `failed` only after an on-chain error, a definitive pre-broadcast rejection, or after `lastValidBlockHeight` has passed and signature-history checks prove absence according to the confirmation policy. Scheduled reconciliation continues to accept and idempotently apply a late confirmation; signature uniqueness prevents double application.
- **FR-S12** At most one nonterminal settlement intent may exist per obligation or tip. Reopen first freezes new settlement creation and rejects while any `user_signed`, `submitted`, or `unknown` intent exists. Only `created`, `quoting`, or `ready_for_signature` old-revision intents may become `superseded`; `user_signed` must resolve to `submitted` or proven pre-broadcast `failed`. Reopen writes explicit supersession/reversal ledger events before a new revision creates obligations. Confirmed, cash-settled, or waived offsets are never silently discarded.

### FR-R — Receipt scan (P1)

- **FR-R1** Receipt images upload through a one-use organizer-authorized Convex storage ticket; byte count, magic type, decoded dimensions, pixel count, active-import limit, and abuse-budget reservation are validated before extraction runs in a Convex action against a strict schema.
- **FR-R2** Raw extraction, per-field confidence, reconciliation status, and model metadata are stored.
- **FR-R3** Every extracted amount is parsed to integer minor units and line totals recalculated deterministically before display.
- **FR-R4** Mismatches and low-confidence fields are flagged; organizer confirmation is required before bill items are created.
- **FR-R5** Model output never becomes a final obligation without deterministic recalculation.
- **FR-R6** A "Use sample receipt" path is available under demo mode; receipt failure never blocks the demo.
- **FR-R7** Target a tested Thai/English restaurant receipt subset (baht symbols, VAT and service-charge rows, whole-baht and two-decimal formats). Universal OCR is not promised.

### FR-N — Telegram integration

- **FR-N1** Commands: `/tab` (primary), `/splitbill` (alias), `/tip`, `/balance`.
- **FR-N2** Telegram webhooks terminate directly at a Convex HTTP Action. The action verifies `X-Telegram-Bot-Api-Secret-Token`, deduplicates the update ID, normalizes the update, invokes internal Convex functions, and returns fast. Vercel does not forward Telegram domain writes into a public Convex mutation.
- **FR-N3** Deep links carry only an opaque token: `https://t.me/<bot>/<miniapp>?startapp=<opaque-token>`. No database IDs, chat IDs, Telegram IDs, addresses, amounts, or recipients.
- **FR-N4** Bot posts only high-value events: tab opened, bill ready to settle, payment confirmed, bill completed, tip confirmed. Prefer editing one status message over flooding the group.
- **FR-N5** Telegram updates are idempotent by update ID.
- **FR-N6** Telegram-native affordances (safe areas, viewport events, back button, haptics, expanded mode) are used where they beat an in-app sheet.

## 7. Non-Functional Requirements

- **NFR-1 Determinism.** Every money transition is recorded as durable Convex state before any external API call runs.
- **NFR-2 Idempotency.** Required for Telegram update handling, bill creation from a command, tip creation, settlement-intent creation, quote creation, submitted-transaction recording, confirmation application, and bot status publishing. Keys and results persist in Convex, never in function-instance memory.
- **NFR-3 Authorization.** Convex public functions enforce authorization; the UI never does. Shared helpers: `requireIdentity`, `getCurrentUser`, `requireGroupMember`, `requireBillOrganizer`, `requireParticipant`, `requireIntentOwner`.
- **NFR-4 Sponsorship safety.** Per-user, per-wallet, per-group, per-transaction, daily, and global caps · program/mint/recipient/instruction allowlists · ATA-creation limits · separate dev and prod sponsor wallets · mainnet emergency pause that does not disable read access.
- **NFR-5 Observability.** Every settlement intent exposes a readable status. Structured logs carry `tabId`, `intentId`, `userId`, `transactionSignature`, `statusTransition`, `durationMs`, `failureCode` — never secrets, tokens, signed transactions, or bot tokens.
- **NFR-6 Retry.** DFlow quote: bounded retry with expiry. Telegram notification: retry without rolling back confirmed money state. RPC confirmation: scheduled retry while persisted state is `submitted` or `unknown` until confirmed or definitively failed under FR-S11; quote expiry never expires a possibly broadcast transaction. Receipt extraction: manual-entry fallback. FX: fail closed in production, visibly labeled manual rational in non-production only. Privy auth: reload and token-refresh recovery.
- **NFR-7 Privacy.** Store only required Telegram profile data. Never store raw Privy access tokens or wallet private material. Receipt bytes are served only by an authenticated Convex HTTP Action with authorization on every request and never by `storage.getUrl()`. Originals/provider payload delete at the earlier of 30 days after upload or 7 days after bill completion; failed/abandoned uploads after 24 hours; normalized confirmed items after 365 days, retaining only non-sensitive tombstone/audit IDs. Authorized deletion may shorten, never extend, retention. No personal bill detail in public group confirmations.
- **NFR-8 Secrets.** No server secret carries a `NEXT_PUBLIC_` prefix. Preview and production credentials stay separate.
- **NFR-9 Performance.** Claim mutations reflect across devices without manual refresh. Bounded DFlow quote solver with a hard request count and deadline.
- **NFR-10 Accessibility and device floor.** 44px minimum touch targets, 320px width, keyboard-open layout, long Telegram names, missing avatars, reduced motion, light-theme contrast.
- **NFR-11 Abuse and resource bounds.** AD-24 atomically enforces per-user, per-group, concurrency, time-window, and global quotas before tab creation, receipt upload/extraction, and provider calls. Rejected uploads are deleted immediately; quota or pause failures create no side effect and preserve reads plus manual bill entry.

## 8. Key Flows

### 8.1 Direct tip — built first

Open from `/tip`, a group action, or Tabs → Privy seamless login restores or creates the wallet → authenticated Convex bootstrap verifies raw Telegram launch data, binds a fresh server-side Telegram context, and verifies group membership → select group member → preset or custom amount → optional note/reaction → recipient asset defaults to USDC → sender picks USDC or Solana → sheet discloses sender maximum, recipient minimum, sponsored network fee, price protection, and quote expiry; the judged build has no platform-fee line → one Privy signature without broadcast → Convex verifies, sponsor co-signs, broadcasts, tracks confirmation → bot posts the tip card.

Cites FR-T1…T7, FR-S1…S10, FR-A1…A3.

### 8.2 Bill split

`/tab` in the group → bot creates a session storing the Telegram chat ID → bot posts a deep-link button with an opaque token → organizer enters items or imports a receipt → participants join from the same link → participants claim items, shared items split equally → organizer reviews unassigned items and sets the group-tip policy → organizer locks the revision → Convex creates immutable obligations → participants pay independently → UI and bot update per confirmed transaction → bill completes when every obligation is settled or waived.

Cites FR-N1…N4, FR-B1…B7, FR-C1…C5, FR-M4…M8, FR-S1…S10.

### 8.3 Group balance

Open a group → header shows one plain-language state → active bills, recent payments, unresolved obligations → settle a current obligation or inspect the source bill → confirmed settlements offset the ledger automatically.

Cites FR-L1…L6.

### 8.4 Organizer adjustment

Open an unlocked bill → change an item, participant, adjustment, or policy → server increments the revision → all clients update → post-lock edits require explicit reopen → existing quotes expire on revision change.

Cites FR-B4, FR-B6, FR-B7, FR-C3.

## 9. Information Architecture

Global navigation stays shallow: **Tabs** · **Activity** · **You**. A deep-linked bill opens directly into the active tab and temporarily hides global navigation.

| Screen | Purpose | Primary action |
| --- | --- | --- |
| Launch / Auth | Validate the Telegram session and restore state | Continue automatically |
| Tabs | Net position, groups, open tabs, quick actions | Start a tab / Send a tip |
| Group | Group balance, participants, open tabs, activity | Start a tab |
| New Tab | Title, payer, currency, capture method | Add items |
| Receipt Review | Correct extracted merchant, items, totals | Confirm receipt |
| Claim Board | Assign items with participant chips and live totals | Finish claiming |
| Bill Review | Exact per-person breakdown and policies | Lock bill |
| Payment Sheet | Select token, inspect the settlement quote | Pay now |
| Payment Progress | Wallet, submission, confirmation state | Return to bill |
| Tip Composer | Recipient, amount, note, token | Send tip |
| Activity | Bills, tips, adjustments, settlements | Open event |
| You | Privy wallet, receiving preference, export controls | Manage wallet |

**Tabs hierarchy:** balance hero → two primary actions → open tabs → groups → recent activity. Charts are never the first screen.

**Claim-board row:** item name and quantity · price · assigned participant avatars · Claim/Shared action · warning state when unassigned. Sticky footer: assigned vs receipt total · unassigned count · current participant subtotal · main action.

**Payment-sheet order:** obligation in bill currency → recipient and destination asset → payment-token selector → maximum sender spend → minimum recipient receive → optional round-up tip → collapsed detail row (route, price protection, sponsored network fee) → one fixed bottom action. Never lead with addresses, mints, or transaction bytes. The term "slippage" and a zero platform-fee row never appear in user-facing copy.

## 10. Brand and Voice Contract

Design decisions belong in `DESIGN.md` / `EXPERIENCE.md` (produced by `bmad-ux`). This section is the requirement-level constraint those spines must satisfy.

- **Name:** My Tab · **Descriptor:** *The group tab that lives in Telegram.* · **Launch line:** *Start it. Split it. Settle it.* · **Success line:** *Your group tab. Settled.* · **Slug:** `mytab`
- **UI system:** Astryx (`@astryxdesign/core` extending `@astryxdesign/theme-neutral`), forced `mode="light"` for the judged build. No shadcn/ui or second component system alongside it.
- **Palette:** The final `DESIGN.md` token map is authoritative: Paper `#F4F7FA` · Surface `#FFFFFF` · Sunk `#EDF2F7` · Ink `#0A2038` · Muted Ink `#55677D` · Subtle Ink `#61748B` · Border `#DFE7EF` · Border Strong `#C6D2DE` · Tab Blue `#1E51D2` · Tab Blue Soft `#E7EDFC` · Tab Blue Deep `#17409F` · Tip `#A85F2E` · Settled `#0B7561` · Owed `#B32B44` · Warning `#9A6209`, with the documented soft semantic companions.
- **Type and layout:** Instrument Sans with system fallbacks · 15px base body · 34–42px balance amounts · tabular numerals · 44px minimum touch targets · 4px spacing scale · 16px narrow-screen gutters · 20px cards · one-pixel borders.
- **Voice — use:** "Start a tab" · "Claim yours" · "2 items need an owner" · "You owe ฿291.74" · "Ready to settle" · "Tip sent" · "All square" · "Quote expired. Refresh it."
- **Voice — avoid:** "Execute swap" · "Approve route" · "Destination ATA" · "Broadcast transaction" · "AI-powered split" · "Insufficient lamports" · "slippage".
- **Anti-patterns:** dark-first presentation · purple-blue AI gradients · glassmorphism · neon crypto colors · token logos as navigation · sparkle icons for receipt scanning · chart walls · a rounded card around every section.

## 11. State Machines

**Bill:** `draft → open → locked → settling → completed`, with `locked → open` only by explicit reopen before any confirmation and when no `user_signed|submitted|unknown` intent exists, and `draft|open → cancelled|archived` for inactive authoring sessions. A locked or settling bill with unresolved obligations never expires or archives; completion is server-derived.

**Settlement intent (AD-21 binding persisted enum):** `created | quoting | ready_for_signature | user_signed | submitted | unknown | confirmed | failed | expired | superseded`. Normal progress is `created → quoting → ready_for_signature → user_signed → submitted → confirmed|failed`, with `submitted → unknown → confirmed|failed` when observation is ambiguous. Only `created|quoting|ready_for_signature` may become `expired` or `superseded`. `user_signed` blocks reopen and may transition only to `submitted` or to `failed` after a proven pre-broadcast rejection with no sponsor signature/broadcast possibility. `awaiting_wallet`, `presigned`, and `confirming` are derived UI labels only and must never be stored. `expired` never applies to bytes that may have been broadcast; `failed` requires the proof in FR-S11.

**Tip:** `draft → created`, then uses the same settlement-intent machine. The tip record itself becomes `confirmed`, `failed`, or `cancelled` only from the authoritative intent result.

## 12. Acceptance — Definition of Done

**Product.** Judge understands in 15 seconds · group starts a tab from Telegram · participants claim live · organizer locks a revision · participant pays a share · group reaches all square.

**Identity and wallet.** Seamless Telegram login works on target clients · Convex receives authenticated identity · Telegram identity synchronized server-side · embedded Solana wallet provisioned or restored · no private key in database or logs.

**Accounting.** Integer math only · every locked total reconciles exactly · deterministic rounding · revision changes invalidate quotes · confirmed chain movement settles the ledger once.

**Payments.** Exact USDC transfer works through user sign-only + Convex verification + sponsor co-sign + broadcast + parsed confirmation · DFlow swap-to-USDC works through the same path with exact USDC as fallback · client cannot change recipient or amount · duplicate settlement blocked · on-chain confirmation parsed.

**Backend.** Every private function checks auth · realtime updates across three devices · Telegram updates and settlement writes idempotent · AD-24 resource limits pass boundary and concurrency tests · crons expire stale quotes · preview and production isolated.

**Design.** Light Astryx theme consistent across P0 · no dark-first, glass, AI-gradient, or crypto-terminal pattern · loading, empty, error, expired, submitted, and confirmed states exist · small screens, keyboards, safe areas, and long names usable.

**Deployment.** Vercel deploys Next.js · Convex deploys via the Vercel build command · production secrets only in required runtimes · Telegram and Privy production domains configured · backup demo video exists.

**Canonical demo fixture.** `demo-sukhumvit-v1` is the single seeded fixture used by prose, mocks, seed data, and tests: locked bill total `฿1,840.00`; the example participant breakdown is `฿240.00 + ฿24.00 + ฿18.48 + ฿9.25 + ฿0.01 = ฿291.74`. Any generated canvas showing `฿1,871.92` or a `฿291.73` total is stale and must not seed implementation.

## 13. Epic Map

Feeds `bmad-create-epics-and-stories`. Order matters: A → B → C precede the bill domain because they retire the highest-risk seam.

| Epic | Title | Covers |
| --- | --- | --- |
| **A** | Stack and identity | FR-A1…A6, FR-W1…W4 — scaffold Next.js + Convex, coordinated Vercel deploy, Privy seamless Telegram login, embedded Solana wallet, Privy→Convex auth adapter, verified user/wallet sync |
| **B** | Telegram session | FR-N1…N6, FR-G1…G5 — webhook route, secret verification, `/tab` `/splitbill` `/tip` `/balance`, opaque tokens, Convex session resolution, controlled status messages |
| **C** | Direct tip | FR-T1…T7, FR-S1…S10 — recipient selector, presets, exact USDC intent, transaction build, sign + sponsor co-sign, confirm and publish |
| **D** | Bill authoring | FR-B1…B3, FR-R1…R7 — draft, manual items, participants, adjustments, discrepancy display, receipt scan behind a flag |
| **E** | Claim board | FR-C1…C5 — live subscription, claim, split equally, release, unassigned state, organizer override |
| **F** | Calculation and lock | FR-M1…M8, FR-B4…B7 — integer money, remainder allocation, proportional adjustments, locked snapshot, obligations, quote invalidation |
| **G** | Settlement (DFlow) | FR-S4…S10 — DFlow action, target-output solver, transaction validation, sign-only, sponsor co-sign, confirmation, single ledger offset |
| **H** | Balances, history, polish | FR-L1…L6, NFR-10 — net position, open tabs, activity feed, explorer link, skeletons, errors, empty states, haptics, motion, seeded demo, backup video |

## 14. Risks

| Risk | Impact | Mitigation | Gate |
| --- | --- | --- | --- |
| Privy JWT does not authenticate Convex directly (issuer-normalization mismatch — see research note R-1) | Critical | Day 0 custom-JWT spike; data-URI JWKS; Vercel token-exchange fallback | No UI feature work until identity is non-null in Convex |
| Privy sponsor co-sign fails on partially signed DFlow bytes | Critical | Day 1 and Day 2 byte-preservation spike; exact USDC fallback | No bill UI work until the two-signature path succeeds |
| Telegram seamless login fails in a target client | High | Test iOS, Android, Desktop; standalone remains sanitized read-only | Lock the supported authenticated demo clients |
| Vercel points at the wrong Convex deployment | High | Coordinated build command, env audit, visible non-production badge | Production smoke test after every config change |
| Duplicate Telegram webhook | High | Update-ID idempotency in Convex | Replay the same payload in tests |
| Duplicate payment | Critical | Intent state machine, idempotency key, signature uniqueness, confirm-once | Double-tap and retry tests |
| Client mutates the DFlow transaction | Critical | Validate and hash before signing; parse confirmation after | Mutation tests must fail |
| Sponsor budget abuse | Critical | Privy policies, app limits, kill switch, allowlists | Mainnet budget stays tiny |
| DFlow response carries no order ID or expiry (research note R-4) | Medium | My Tab owns quote TTL and idempotency; do not key off a DFlow order ID | Quote-expiry test before Day 6 |
| Astryx is Beta | Medium | Lock React 19 and package versions on Day 0; no `@stylexjs/babel-plugin` in App Router | Component smoke test on Day 0 |
| Receipt extraction fails | Low | Manual entry and seeded receipt | Receipt never blocks the demo |
| Resource/provider abuse by a valid member | High | Atomic AD-24 quotas, upload validation, concurrency caps, and operational pauses | Boundary/race tests pass before public rollout |

## 15. Open Questions

- **OQ-1** Does Convex accept the bare `privy.io` issuer, or does its `https://` normalization break the exact-match check? Resolve on Day 0 (research note R-1).
- **OQ-2** ~~Which single non-USDC token is the DFlow demo input?~~ **Resolved 2026-08-21: native SOL, normalized to the wrapped-SOL mint only inside validated DFlow transactions; recipient USDC is fixed to the mainnet USDC mint.**
- **OQ-3** ~~Which vision provider backs receipt extraction, and does its key live in Convex env?~~ **Resolved 2026-08-21:** the `receiptExtraction` adapter uses the OpenAI Responses API with image input and strict schema from a Convex Node action; `OPENAI_API_KEY` is Convex-only. The exact vision-capable model is pinned after the Thai/English fixture evaluation, and any provider/model change reruns fixtures and requires an architecture decision.
- **OQ-4** ~~Is `PLATFORM_FEE_BPS` non-zero for the judged build?~~ **Resolved 2026-08-21: zero.** No platform fee is charged or displayed in the judged build. `feeAccount` is therefore unset on DFlow orders (research R-7).
- **OQ-5** Does the hackathon accept indirect DFlow routing via Privy's Swap API as a schedule fallback?
