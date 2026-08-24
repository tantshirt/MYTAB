---
title: 'End-to-end My Tab product journey'
type: 'feature'
created: '2026-08-23'
status: 'done'
baseline_commit: '748ef52ae22b5f66fef33eee1239b722528ad9f2'
review_loop_iteration: 5
context:
  - '{project-root}/docs/DECISIONS.md'
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/dflow-api-reference.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** My Tab's restaurant-repayment journey is fragmented: group Mini App creation is not persisted, scan can disappear, money is THB/USDC-specific, routed DFlow confirmation cannot accept real DFlow lookup tables, and QR scanning, organizer resolution, delayed-payment controls, and receive-side views are missing. Standalone tipping distracts from repayment.

**Approach:** Make either Telegram door create the same real tab; support scan-first or invite-first, exact supported fiat currencies, a verified organizer receive token frozen at lock, any verified payer holding through visibly attributed DFlow, fair claims, private status, delayed/outside payment, and premium accessible UI.

## Boundaries & Constraints

**Always:** Amend `docs/DECISIONS.md` before superseding USDC/THB/tip rules. Preserve integer money, server-owned parties/assets, roster authorization, durable intent, confirmation-moves-ledger, DFlow minimum-output guarantees, two-pass validation, resolved ALTs, fail-closed configuration, legacy/in-flight compatibility, Telegram privacy, accessibility floors, and five gates.

**Ask First:** Live-cluster operations, dependencies/services, destructive migration, weaker sponsor/confirmation policy, or an unproven native-SOL receipt model.

**Never:** Reinterpret legacy rows, persist floats, trust client mints/addresses/amounts, add a backend/admission path, hide required deployed capability, expose individual debts in Telegram, ship sample receipts, or retain standalone/round-up tipping.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior | Refusal |
|---|---|---|---|
| Create | Either door; scan/invite first | Persisted authorized tab; both actions remain | Named error; no synthetic id |
| Receipt | Multi-page, ISO currency, adjustments | Strict review then atomic exact confirmation | Unknown/mismatch blocks; manual remains |
| Claim/lock | Quantity/shared/unassigned | Integer shares, disclosed remainder, frozen fiat/receive asset | Stale/overflow/unresolved/unverified blocks |
| Pay | Verified token, possibly days late | Fresh FX/quote; guaranteed DFlow receive; actuals recorded | Expiry refreshes; mismatch becomes held incident |
| Outside/QR | Proposed cash, waiver, QR, reminder | Dual confirmation; same seat admission; private rate-limit | Self/outsider/malformed/in-flight refuses |

</frozen-after-approval>

## Code Map

- `lib/domain/{money,parse,format,a11yAmount,fx,receiptParse,allocation,quantityClaim}.ts` -- generic exact currency, extraction, allocation.
- `convex/schema.ts`, `convex/lib/{lockSync,fxSnapshotSync,settlementObligationSync,claimSync}.ts` -- versioned rows, lock, fresh pricing, resolution.
- `convex/{tabs,receipts,settlements,activity,balances,tokens}.ts` -- creation, atomic import, payment/offset APIs and projections.
- `convex/internal/{receiptExtraction,dflow,confirmations,settlementPipeline,solana}.ts` -- providers and ALT/native-aware settlement proof.
- `lib/solana/{sponsorPolicyManifest,validateTransactionMessage}.ts`, `lib/tokens/{policy,display}.ts` -- intent-specific verified-token policy.
- `features/{bills,receipts,claims,invite,settlement,balances,telegram,you}/**`, `components/{claim-row,settlement-sheet}/**` -- complete journeys and polish.
- `lib/telegram/messages.ts`, `convex/lib/{tabCommandSync,telegramStatusManager}.ts`, `app/(miniapp)/**`, `features/tips/**`, `scripts/**` -- private status, routing, tip removal, verification.

## Tasks & Acceptance

**Execution:**
- [x] Decisions/schema/domain -- version generic fiat, receive asset, FX, receipt pages, reminders and actual settlement fields; reject unassigned ISO codes; persist receive-token program evidence; preserve legacy reads.
- [x] Creation/setup -- persist both doors through fresh Telegram membership/admin proof; enforce personal/group creation limits; make replay dedupe draft-only and exact-configuration-only; authorize stored payer/recipient parties; use a verified receive-asset picker and server-resolved labels.
- [x] Receipt -- support both orderings and same-tab manual fallback; adopt a detected supported currency on an untouched personal draft; implement bounded multi-page image validation, strict final-page total/adjustment rules, currency-safe editable review, explicit errors, bigint reconciliation, and idempotent atomic confirmation from `needs_review` only.
- [x] Claim/lock -- implement multi-person/remainder resolution, quantity-proportional claimant disclosure, proportional adjustments, and fresh verified receive metadata/program revalidation at lock.
- [x] DFlow/security -- route from persisted intent policy (including USDC input to non-USDC output); derive caps from proven payer balance; settle provider leases on every exit; implement independently proven native-SOL input or refuse it before quote; support or pre-intent-refuse Token-2022; preserve ALT, signer, sponsor, output-floor, and actual-delta proof without weakening sponsorship.
- [x] QR/debt UX -- test native scanner lifecycle/navigation; make outside cash/waiver settle obligations and refresh tab completion; make reminders private, delivery-state-safe, and retryable after failure; prevent reciprocal debt-loading false empties; keep visible DFlow progress and currency-safe formatting.
- [x] Tip/Telegram/polish -- remove tip/round-up routes, APIs, commands, events and fixtures; retain receipt gratuity; update private cards and responsive accessible states.
- [x] Tests/docs -- cover every matrix row plus group-creation wrapper, receipt confirmation/replay, DFlow receive-asset orchestration, reminder destination/status, native/token-program refusal or proof, and QR hook-to-navigation behavior without live funds.

**Acceptance Criteria:**
- Given either entry door, when scan or invite is chosen first, then the same persisted live Claim Board retains both actions.
- Given supported 0/2/3-decimal currency, when a reconciled receipt is confirmed, then exact fiat obligations and adjustments persist without floats or unlike-currency sums.
- Given verified receive and payer tokens, when payment confirms, then destination, threshold, cap, signer/program/ALT set, sponsor exposure, actual deltas and ledger transition are independently proven.
- Given delayed, outside, malformed-QR, missing-capability, concurrent, legacy or unknown states, when acted on, then private fail-closed idempotent behavior provides a usable next action.
- Given shipped bot/app, when routes, APIs, commands and copy are inspected, then standalone tipping is absent, receipt gratuity remains, Telegram exposes no individual debt, and supported viewports pass.

## Spec Change Log

- 2026-08-24 — Implemented the approved end-to-end journey. Verified all five repository gates, the frozen edge-case matrix, generic/legacy money compatibility, and absence of standalone tipping surfaces.
- 2026-08-24 — Review loop 1: parallel review found that the original execution checklist was too coarse to prevent direct acceptance-contract deviations in group creation freshness/dedupe, receipt strictness, DFlow routing/native/token-program proof, outside settlement completion, and integration verification. Expanded the non-frozen execution and verification requirements so re-derivation cannot preserve the known-bad state where controls render but the corresponding transaction or lifecycle cannot complete. KEEP: exact integer/legacy money compatibility; immutable lock snapshots; resolved-ALT and message-hash validation; sponsor-first/no-platform-fee policy; durable/idempotent intent and confirmation ledger; roster privacy; receipt gratuity with standalone tips removed; both persisted entry doors; fair organizer claim operations; QR/debt/reminder surfaces; deterministic fonts; all previously green repository gates and accessibility floors.
- 2026-08-24 — Review loop 2: parallel review found direct deviations that survived loop 1: receipt upload/extraction jobs could replay across state boundaries and the production multi-page path bypassed final-page enforcement; low-confidence fields could confirm; pre-signature intents blocked token switching and quote refresh; reminder and personal-tab delivery boundaries were not fully idempotent/private; partial quantity disclosure and several shipped UI-to-backend seams lacked executable proof. Expanded the non-frozen derivation rules to fence every lifecycle transition, bind reviewed data to extracted facts, make pre-sign intent replacement explicit, and require tests at the actual shipping seams. Known-bad state avoided: a green helper suite while the UI cannot switch/refresh, a delayed job reopens a confirmed import, or a hidden/dead control defeats scan/QR/create flows. KEEP: every loop-1 preservation instruction; all green integer money, lock, ALT/message-hash, sponsor, DFlow balance/lease, receive-program, cash/waiver ledger, Telegram privacy, accessible responsive polish, deterministic font, and legacy/in-flight compatibility work; 48-measurement visual cleanliness and the 2,228-test baseline.
- 2026-08-24 — Review loop 3: final clean-room review reproduced remaining cross-boundary failures: recipient shares became unpayable self-obligations; idempotency lookup preceded debtor authorization; stale/terminal intents and missing token metadata could expose Pay; confirmation accepted less than the displayed guarantee and did not bind finalized ALT identities; invitees disappeared from viewer scope; personal tabs still queued card delivery; retries could duplicate creation/reminders/provider work. Expanded derivation rules around server-owned obligation parties, scoped idempotency, terminal-state UI refusal, confirmation evidence persistence, roster/viewer scope, and concurrency. Known-bad state avoided: a fully green suite with a tab that cannot settle, a cross-user intent leak, an enabled Pay button for the wrong or terminal intent, or an invite-only participant who vanishes after navigation. KEEP: all loop-1 and loop-2 instructions and implementation that remains valid, especially exact currency/receipt state fencing, DFlow receive pricing and balance caps, token-program/native fail-closed policy, outside-payment completion, responsive polish, 48-measurement cleanliness, and the 2,243-test baseline.
- 2026-08-24 — Review loop 4: post-fix review reproduced payment-time FX staleness, DFlow lease leakage during replacement, failed-intent dead ends, receipt ownership/resource gaps, already-paid zero-obligation tabs, stale setup readiness, roster visibility after chat departure, and literal UI retry/stale-closure bugs. Expanded requirements to make current pricing, blob ownership/budgets, crash recovery, and shipping-host interactions executable invariants. Known-bad state avoided: one Retry tap submitting twice, a locked tab consuming OCR, a lost response defeating durable replay, or a payer seeing a terminal/wrong-token Pay state. KEEP: every earlier change-log instruction and all verified self-debt/idempotency/ALT/floor/personal-scope work; all 2,249 passing tests, build/smoke evidence, and 48-measurement responsive cleanliness.
- 2026-08-24 — Review loop 5: final clean-room review reproduced direct deviations that loop 4 left at shipping seams: the sheet displayed lock-time FX and could retain an old obligation during overlapping polls; failed asynchronous quotes had no recovery; settlement replay ignored exact request configuration; receipt sources were deleted before durable recording; zero-obligation projections contradicted settled tabs; ambiguous Telegram delivery could duplicate reminders; setup/invite failures could hang silently; receive-token discovery depended on accidental cache warming; fixed/percentage claim overrides lost allocations; irreversible waiver lacked confirmation; and several mandatory interaction/orchestration tests still exercised only helpers. Expanded the non-frozen requirements to make those cross-boundary states explicit and executable. Known-bad state avoided: signing an old obligation, retrying without source images, returning an incompatible intent for the same idempotency key, showing stale economics, duplicating a private reminder, or reporting an already-paid tab incomplete. KEEP: every earlier preservation instruction; the 2,253-test green baseline; current payment-time FX derivation, DFlow/ALT/floor security, receipt ownership/budgets, roster scope, zero-obligation lock transition, and all green build/smoke/sweep/accessibility evidence.
- 2026-08-24 — Review loop 5 implementation: fenced settlement sheet polling and payment-time economics, added exact durable replay conflicts and failed-quote recovery, refreshed/filter wallet metadata with bounded receive-asset import, made receipt terminal persistence precede source cleanup with safe numeric bounds, surfaced setup/invite failures, preserved fixed/percentage claim weights, aligned zero-obligation completion, waiver confirmation, reminder ambiguity/cooldown, and withdrawn-currency admission. Verified `npx tsc --noEmit`, 2,269 tests, production build, 11-route smoke, and 48 responsive sweep measurements.
- 2026-08-24 — Final consolidated patch: obligation-scoped settlement continuations, quote timeout and distinct-output floor gating; durable receipt cleanup/finalize replay; expiry/provider and Telegram accepted-send recovery; exact group-create idempotency; exact raw item money; invite/QR generation fencing; strict group-title refusal; retired route documentation cleanup. Verified `npx tsc --noEmit`, 2,279 tests across 125 files, production build, 11-route smoke, 48 responsive sweep measurements, and `git diff --check`.

## Design Notes

Fiat debt is canonical after lock. Payment-time FX derives a stable reference; DFlow solves payer input against the frozen receive asset. UI leads with `You owe`, `You send`, and `<name> receives at least`; legacy USDC intents finish under their original policy.

### Review-loop 1 derivation requirements

- Currency admission must cover genuinely assigned ISO currencies and their 0/2/3-digit scales while rejecting merely structural codes such as `ZZZ`.
- Personal creation enforces the same per-user daily ceiling as chat creation. Group Mini App creation refreshes stale Telegram member and bot-admin evidence in an action before the transactional write.
- A recent group-create replay reuses only a still-draft tab with the exact same title, merchant, fiat currency, payer, and verified receive asset. It never patches a locked or differently configured tab.
- Setup persists server-resolved asset identity and proves payer/recipient belong to the stored roster. The normal organizer UI selects named verified assets; it does not ask for a raw mint address.
- A scan-first personal tab may adopt a supported detected currency only while the draft is otherwise untouched and a lockable FX snapshot exists. Manual fallback remains on that persisted tab.
- Receipt review formats the detected currency everywhere and exposes editable line items plus service, tax, discount, and receipt gratuity. Adjustment magnitudes are positive; discount sign comes from its kind. Low-confidence adjustments count as unresolved review fields.
- Upload refuses more than eight pages visibly, duplicate storage ids, unsupported image MIME, and over-limit per-file/aggregate bytes. Blob reads are bounded. Non-final pages containing totals or adjustments refuse combination.
- First receipt confirmation requires `needs_review`, reconciles with bigint before safe narrowing, atomically writes exact items/adjustments/import state, and replays idempotently by confirmation key. Mutation failure is visible and retryable.
- Build-action dispatch uses the persisted `routingKind`; USDC input with a non-USDC organizer receive asset is DFlow-routed. The stable-reference receive quote becomes the solver target and its request/evidence/minimum output are persisted.
- DFlow caps come from proven payer balance and policy, not an arbitrary token-unit constant. Every post-reservation exit settles actual provider usage and releases the concurrency lease.
- Native SOL is shown only if confirmation can prove the intentional payer lamport input independently from sponsor-paid gas and cap it; otherwise it is refused before quote. Token-2022 is likewise supported end to end with program-aware metadata/ATA/confirmation or refused before intent. Neither may reach broadcast and fail only at confirmation.
- Receive metadata, decimals, token program, and freshness are re-proven at lock. Existing resolved-ALT loaded-address checks, exact rational FX, the bounded 60-mint anti-spam policy, sponsor constraints, and zero platform fee remain intact.
- Token selection and persisted intent cannot diverge: initial selection resolves an intent, switches commit only after successful intent creation, and expired/incompatible intent state is not displayed for a newly highlighted token.
- A full acknowledged cash offset or creditor waiver settles the obligation idempotently and drives the same all-obligations-settled tab/status transition as confirmed crypto.
- Reminder delivery always targets the stored debtor private Telegram id, records `sent` or `failed` even on thrown configuration/transport errors, and a failed delivery does not consume the 24-hour recipient cooldown.
- Reciprocal debt UI remains loading until both reads resolve. Quantity-mode claimant disclosure uses each claimant's stored quantity, so a 2:1 claim displays a 2:1 amount.
- Verification executes the group-create wrapper, receipt atomic replay, non-USDC DFlow action orchestration, reminder private delivery success/failure, and QR capability/popup/error/close/token-forward/navigation seams—not only their lower-level helpers.

### Review-loop 2 derivation requirements

- Receipt selection visibly refuses more than eight pages; partial upload failure has an authorized cleanup path. `finalizeUpload`, extraction success/failure, and confirmation are state-fenced and replay-safe so delayed/repeated work cannot move `confirmed` back to review or schedule duplicate extraction.
- The production multi-page provider path returns page-addressable extraction and runs the same non-final summary/currency combination rules as the tested domain function. Confirmation binds the submitted currency to the stored extraction, refuses zero items, and cannot adopt a client-relabeled currency.
- Receipt confirmation remains disabled until every low-confidence line and adjustment is explicitly resolved. Backend failure codes map to visible corrective actions for type, size, page, schema/provider, and reconciliation failures.
- Manual item entry validates currency precision before enabling Save and shows the precision error. Assigned ISO admission uses a shipped registry fallback rather than shrinking to seven currencies on older Telegram engines.
- Quantity disclosure allocates against the receipt item's full quantity, preserving the unresolved remainder; a 1-of-3 claim shows one third, while 2:1 fully claimed quantities show 2:1 amounts.
- Pre-signature settlement intents are replaceable in a controlled idempotent transition for token switches and quote refresh. The selected token changes only after replacement creation succeeds; rejected automatic creation stops retrying until an explicit retry. Refresh-quote invokes the refresh mutation, and stale-bill recovery resolves the current obligation rather than only bumping a read nonce.
- A token with unknown affordability remains selectable so the act of selection can create its quote; only proven unaffordable tokens are disabled. The receive-side display never formats stable-reference atomic units as the selected non-USDC output before pricing exists.
- A group create action refreshes and transactionally requires fresh evidence for every configured payer/recipient, not only the actor. Exact duplicate reuse returns an active usable invite, renewing it when necessary. Personal/invite-origin tabs structurally never queue Telegram chat-card delivery.
- Reminder delivery rechecks that the obligation is open, treats already-sent/replayed work as a no-op, and never changes `sent` to `failed`. Failed work remains retryable without exposing group chat details.
- Standalone tip creation/refresh cores and their creation tests are deleted; only strictly necessary legacy/in-flight finalization compatibility remains.
- Reciprocal debt rendering never says the viewer is entirely square when money is owed to them, and fixture/resolution coordination preserves whichever side has resolved rather than returning a false empty state.
- Verification executes: USDC input to a distinct non-USDC receive mint through the DFlow handler seam; cash and waiver tab-completion/status scheduling; both authoring origins through the submission/navigation seam; receipt-page confirmation payload/error state; settlement token switch/refresh failure and success; reciprocal query resolution in both orders; and the shipped QR control-to-popup-to-router path.

### Review-loop 3 derivation requirements

- Lock never creates an obligation whose debtor is the recipient; the recipient's own claimed share is already paid and does not block completion. Snapshot totals and tests distinguish total bill allocation from payable reimbursement.
- Settlement idempotency is checked only after authenticating/authorizing the debtor and is bound to user, obligation, input mint, and exact request configuration. A conflicting reuse refuses without exposing another intent.
- Personal creation has server idempotency/exact-draft dedupe so a client timeout cannot create two tabs; late promises cannot race navigation. Group manual creation routes to a real organizer item-authoring surface, not read-only review.
- Receipt finalize retry returns the already-advanced import result for the exact registered page set. Ticket/page registration is rate- and count-bounded; ninth-page and partial-registration failures delete the just-uploaded blob. Confirmation replay binds the same confirmation key to a payload hash.
- Stale-bill recovery resolves the viewer's current open replacement obligation. Quote retry retains the chosen/first affordable token. Failed, signed, submitted, confirmed, expired, and otherwise terminal/in-flight intents never render an active Pay button or borrow another token's metadata; missing active-mint metadata fails closed.
- Confirmation enforces at least the exact receive floor displayed to the payer (`quotedOtherAmountThreshold` when stronger) and persists the pre-sign resolved ALT writable/readonly identities so finalized RPC loaded addresses are compared by value, not count only.
- Reopen releases sponsor/provider reservations for superseded pre-sign intents and uses a tab-scoped index rather than an unbounded user/global scan.
- Personal/invite tabs are centrally blocked from every Telegram card publisher, including lock, crypto completion, cash, and waiver paths. Invite admission records participant origin and viewer-wide scope includes personal-tab participants without pretending they are Telegram group members.
- Cash proposals are actionable by the required counterparty in both proposer directions. QR popup open/close exceptions enter the visible error lifecycle.
- Reminder delivery atomically claims queued work, rechecks the obligation, marks missing dependencies failed, and makes concurrent/replayed workers no-op. Provider-budget reservation similarly refuses a second active lease for the same intent and has durable retry/reconciliation if final settlement accounting fails.
- Generic fiat refresh is independent of BOT/THB availability. Claim disclosure uses bigint intermediate arithmetic for safe proportional display.
- Verification executes the production multi-page extraction action, the client upload/register/finalize/cleanup workflow, actual settlement host switch/refresh behavior, page-to-hook QR wiring, manual JPY/KWD precision UI, reciprocal owed rendering, dead-invite renewal, self-obligation exclusion, scoped idempotency, terminal Pay refusal, ALT identity/floor confirmation, invitee scope/origin, personal no-card, bidirectional cash acknowledgement, reminder/provider concurrency, and FX-provider isolation.

### Review-loop 4 derivation requirements

- Payment intent creation derives a fresh stable reference from the canonical fiat debt and a fresh payment-time FX snapshot; durable exact replay returns before mutable FX/token/obligation freshness checks after current-user authorization.
- Replacing/superseding any pre-sign routed intent releases sponsor and DFlow/provider leases. Failed/expired terminal setup exposes one explicit recovery action; one Retry click submits exactly one replacement using the chosen or first affordable token.
- DFlow RPC account evidence carries each response's actual context slot or uses `minContextSlot`; ALT rows are never stamped with an unrelated earlier slot. RPC construction failure transitions the intent to a named terminal failure.
- Receipt upload validates magic bytes and bounded image dimensions/pixels in addition to declared MIME/bytes. Every blob is uniquely owned by one import before finalize; finalize accepts only the exact registered ordered set, deletes registered pages on expiry/rejection, and can delete the just-uploaded unregistered candidate when registration fails.
- Receipt scan is hidden/refused once a tab locks. AD-24 budgets cover active imports, per-user/group/global windows, extraction attempts, concurrency leases, crash recovery, terminal release, and operational pause while preserving reads/manual entry.
- Receipt Review invalid/empty names or draft amounts disable Confirm with a corrective message rather than submitting hidden prior values. Confirmation replay remains payload-hash bound.
- A recipient-only already-paid bill becomes settled immediately with correct completion behavior. Viewer scope includes roster-authorized participant tab IDs for chat and personal origins without granting group-wide access after chat departure.
- Personal and settlement creation exact replay is checked after current-user authorization but before mutable dependency resolution; a lost committed response can still return the durable tab/intent and renew a dead invite.
- Group setup remains loading/blocked until organizer, payer, roster, verified receive options, and defaults resolve; changed payer is included in the submission callback dependencies. Group title validation is server-side and trims/refuses blank or overlong input.
- Currency admission excludes reserved/testing/non-circulating units such as `XXX`, `XTS`, metals and accounting units while retaining actual fiat codes. Jupiter-derived receive metadata carries required attribution at its display surface.
- Reminder claims schedule recovery after worker death and mark missing dependencies failed. Provider leases reconcile expired reservations and durably retry final accounting failures; a second active lease for an intent remains refused.
- Token inventory always prioritizes USDC and the active mint before the bounded cap and never surfaces wrapped/native SOL while native confirmation is refused.
- Generic FX providers remain independent; receipt/provider budgets and pauses do not silently fall back to fixtures.
- Verification executes the shipping settlement host (including single-call Retry), changed-payer authoring interaction, production upload and extraction actions, self-obligation lock path, authorization-scoped intent conflicts, ALT array persistence/substitution, stronger displayed confirmation floor, personal status suppression, both cash directions, dead-invite renewal, receipt ownership/expiry/invalid-draft cases, payment-time FX, failed-intent recovery, participant scope after chat departure, zero-obligation completion, resource/crash recovery, and title/currency/attribution guards.

### Review-loop 5 derivation requirements

- The settlement sheet displays the active intent's payment-time FX snapshot, never the tab's lock-time rate when they differ. Changing `obligationId` clears all prior payable state immediately; polling is single-flight or sequence-fenced so an older response cannot overwrite a newer obligation, intent, or token choice.
- Failed/expired asynchronous quote creation remains visibly recoverable with one explicit replacement action. Idempotency replay compares the persisted exact request hash/configuration after owner authorization, including replacement semantics and frozen output/revision facts, and refuses any conflicting reuse without leaking the stored intent.
- Wallet inventory refreshes missing/stale held-token metadata before admission, excludes non-initialized/frozen token accounts, proves zero-balance USDC unaffordable when its requirement is known, and provides a bounded verified discovery/import path so non-USDC receive assets do not depend on unrelated cache warming. Required Jupiter attribution remains attached wherever that data is shown.
- Receipt extraction retains every source blob until a terminal success or failure record is durably committed. If record persistence fails, the worker leaves the images recoverable for lease retry. Multi-page orchestration uses a whole-job deadline compatible with the allowed page count while keeping bounded per-page timeouts, attempts, heartbeats, and storage cleanup.
- Receipt parsing and editing reject overflow before number precision can be lost; quantity input is visibly bounded to the backend limit and never crashes or submits an always-refused value.
- Group creation trims and rejects blank or over-120-character titles server-side instead of substituting a default. Setup query failure exits the loading skeleton into a named retryable error. Invite prepare/load/copy/QR/share/revoke failures are caught and shown with a corrective action.
- Fixed/percentage claim override operations either preserve and merge their exact monetary weights or refuse the unsupported operation before mutation; assign-remaining uses the server-projected monetary shortfall so the UI never hides an unresolved lock blocker.
- Completion projections treat a settled zero-obligation tab as complete. Waiver requires explicit user confirmation before the irreversible mutation.
- Reminder transport distinguishes a definite rejection from an ambiguous timeout. Ambiguous delivery consumes cooldown and surfaces an `unknown`/non-immediate-retry state so a Telegram-accepted message cannot be duplicated; durable recovery never regresses `sent`.
- Currency admission excludes withdrawn/non-current national units in addition to reserved, testing, metal, fund, and accounting codes while retaining genuinely circulating ISO fiat.
- Verification executes the real shipping seams, not only extracted helpers: distinct-output DFlow transaction validation; settlement host selection/retry/refresh/stale navigation and obligation-switch race fencing; personal and group authoring submit/navigation; receipt route confirmation/error and low-confidence edits; client partial-upload cleanup; production multi-page extraction persistence-before-delete; QR home-page wiring; reciprocal live-query ordering; 0/2/3-decimal item editing; exact settlement replay conflicts; failed asynchronous quote recovery; payment-time FX display; held-token metadata refresh/frozen-account filtering; title/setup/invite errors; claim override preservation/refusal; receipt overflow/quantity bounds; zero-obligation projection; reminder ambiguity; and waiver confirmation.

## Verification

**Commands:**
- `npx tsc --noEmit`
- `npm test`
- `npx next build`
- `npm run smoke`
- `npm run sweep`

**Manual checks (if no CLI):**
- Physical Telegram devices prove QR scanning and wallet return; mainnet remains gated by `docs/MAINNET-CUTOVER.md`.

## Suggested Review Order

**Settlement lifecycle**

- Start with the host fence that scopes every asynchronous continuation to one obligation.
  [`SettleSheetHost.tsx:39`](../../features/settlement/SettleSheetHost.tsx#L39)

- Bounded quote reads become retryable unavailable states and ignore late provider results.
  [`useSettleSheetData.ts:14`](../../features/settlement/useSettleSheetData.ts#L14)

- Distinct receive assets render only after a real output floor exists.
  [`mapSettleSheet.ts:79`](../../features/settlement/mapSettleSheet.ts#L79)

**Durable external work**

- Terminal receipt truth commits before deletion; cleanup remains a durable sweep queue.
  [`receiptExtraction.ts:352`](../../convex/internal/receiptExtraction.ts#L352)

- Lost finalize responses replay exactly without discarding possibly advanced imports.
  [`useReceiptUpload.ts:14`](../../features/receipts/useReceiptUpload.ts#L14)

- Expiry releases both sponsor and DFlow leases at the same transition boundary.
  [`intentExpiry.ts:26`](../../convex/lib/intentExpiry.ts#L26)

- Provider accounting retries indefinitely instead of abandoning the sixth failure.
  [`dflow.ts:681`](../../convex/internal/dflow.ts#L681)

- Telegram-accepted reminders recover as unknown and never regress to failed.
  [`telegramCommands.ts:512`](../../convex/internal/telegramCommands.ts#L512)

**Creation and authoring integrity**

- Group creation replays an owner/config-bound durable key before mutable dependencies.
  [`tabs.ts:424`](../../convex/tabs.ts#L424)

- Raw currency strings retain exact precision and overflow is refused before mutation.
  [`ItemEditor.tsx:31`](../../features/bills/ItemEditor.tsx#L31)

**Interaction fencing and proof**

- Invite tab changes invalidate pending load/share/copy/QR/revoke continuations.
  [`InviteSheet.tsx:31`](../../features/invite/InviteSheet.tsx#L31)

- Consolidated regression seams exercise late responses, exact replay, and overflow refusal.
  [`review4-regressions.test.ts:18`](../../tests/features/review4-regressions.test.ts#L18)
