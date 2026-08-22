---
name: My Tab
status: final
created: '2026-08-21'
updated: '2026-08-21'
sources:
  - ../../prds/prd-MYTAB-2026-08-21/prd.md
  - ../../briefs/brief-MYTAB-2026-08-21/brief.md
  - ../../architecture/architecture-MYTAB-2026-08-21/ARCHITECTURE-SPINE.md
  - ../../research/2026-08-21-stack-verification.md
companion: ./DESIGN.md
---

> ## ⚠ Amendment notice — read `docs/DECISIONS.md` first
>
> **This document remains the behavioral authority** for everything from the Claim Board
> onward — states, journeys, component behavior, voice, the accessibility floor. Nothing
> below is retired, and where a mock or artboard disagrees with it, this spine still wins.
>
> Superseded sections, with the reasoning in **`docs/DECISIONS.md`** (binding):
>
> - **D-06** — §Foundation, *"Membership is live trust… The bot must be a group
>   administrator."* `tabParticipants` is the authoritative roster; the token admits, the
>   roster authorizes; bot-admin is a group-door requirement, not a product prerequisite.
> - **D-06** — §Information Architecture and §State Patterns: *"Open My Tab from a Telegram
>   group to start a tab"* and *"Start one from any Telegram group"* are dead ends and are
>   replaced by the First Screen. **`INVITE-FLOW.md` is the authority on ingress** — everything
>   before the Claim Board. This document wins everywhere else.
> - **D-07** — after lock, loss of group membership or bot-admin never blocks a person from
>   paying what they already owe.
> - **D-10** — §The Telegram Surface: the five-event rule is intact and is scoped to *group
>   chats*. "Share to group" is Telegram's native share sheet sent **by the person**, not a
>   sixth bot event.
> - **D-11** — §Interaction Primitives: the demo-mode "Use sample receipt" affordance is
>   **deleted**. No fixture or demo data ships in application source.
> - **D-20** — §Foundation: *"five components are custom"* is a stale count. Astryx supplies
>   the theme; the primitives are ours. The AD-20 prohibition on a second component system
>   still binds.
> - **D-17** — the five-minute Telegram context must be **renewed**; it expired mid-meal and
>   every write failed silently.


# My Tab — Experience Spine

Behavior, information architecture, states, and journeys. Visual identity lives in `DESIGN.md`; tokens are referenced here as `{colors.owed}`, `{typography.amount-hero}`, `{spacing.4}`. Where this spine and any mock, wireframe, or generated artboard disagree, **this spine wins**.

Requirements are cited as `FR-S6` (PRD §6) and architecture decisions as `AD-9` (spine). Nothing here restates them — it specifies how they surface to a person.

## Foundation

**Single-surface mobile.** A Telegram Mini App running inside Telegram's in-app browser on iOS, Android, and Desktop. Design width 390px, functional floor 320px. On Telegram Desktop the same single column centers on `{colors.paper}` — Desktop is a test target, not a design target.

**UI system: Astryx** (`@astryxdesign/core` extending `@astryxdesign/theme-neutral`), forced `mode="light"`. Astryx supplies controls, cards, forms, sheets, avatars, progress, badges, skeletons, and empty states; this spine specifies only the behavioral delta. Five components are custom because no system ships them: `claim-row`, `sticky-claim-footer`, `payment-sheet`, `settlement-stepper`, `all-square-card` (AD-20).

**Light mode only, unconditionally.** Telegram's own theme is frequently dark. My Tab does not follow it and does not offer a dark variant.

**Authentication is invisible.** There is no login screen, no "connect wallet", and no wallet-selection step inside Telegram (FR-A1, FR-W1). The user arrives already authenticated with a wallet that already exists. Outside Telegram, authenticated reads remain available but all mutations are disabled with "Open this in Telegram to make changes." Any surface that silently allows a browser-only write is a defect.

**The group chat is a surface of this product**, not an external channel. Bot messages are designed here (see *The Telegram Surface*).

**Membership is live trust, not a link possession check.** The bot must be a group administrator. A silent member is admitted on first open only after verified `initData`, matching chat scope, and a current server-side membership check. Leaving, being removed, or bot-admin loss removes write access while authorized reads remain available.

## Information Architecture

| Surface | Reached from | Purpose | Primary action |
|---|---|---|---|
| Launch | Cold open | Authenticate and restore silently | none — resolves itself |
| Tabs | Tab bar (home) | Net position, groups, open tabs, quick actions | Start a tab |
| Group | Tabs → group row | Group balance, members, open tabs, activity | Start a tab |
| New Tab | Tabs → Start a tab | Title, currency, payer, capture method | Add items |
| Receipt Review | New Tab → Scan receipt | Correct extracted merchant, items, totals | Confirm receipt |
| Claim Board | Deep link, or New Tab → Add items | Assign items, live, together | Finish claiming |
| Bill Review | Claim Board → Finish claiming · locked board → See the full bill | Inspect the exact per-person math — **everyone** | Lock bill *(organizer)* / Settle up *(participant)* |
| Payment Sheet | Claim Board or Group → Settle up | Choose token, inspect the quote | Pay |
| Payment Progress | Payment Sheet → Pay | Wallet, submission, confirmation state | Back to tab |
| All Square | Final obligation confirms | The group's completion moment | Share to group |
| Tip Composer | Tabs → Send a tip, or a tip affordance anywhere | Recipient, amount, note, token | Send tip |
| Activity | Tab bar | Every event, reverse chronological | Open event |
| You | Tab bar | Wallet, receiving preference, export | Manage wallet |

Bottom tab bar with three items — **Tabs · Activity · You**. No drawer, no hamburger.

"Start a tab" uses the current verified Telegram group or opens a picker of verified eligible groups. Without Telegram group context it explains "Open My Tab from a Telegram group to start a tab" and opens the bot; it never opens a form that cannot be submitted.

**A deep-linked Claim Board hides the tab bar entirely.** Arriving from a Telegram link puts the person into the bill room, not into an app they have to navigate. The only exit is the header back control, which lands on Tabs. Sheets stack one level deep, never two.

Nine of the thirteen surfaces are reachable in one tap from Tabs or from a Telegram link. Receipt Review, Bill Review, Payment Progress, and All Square are consequences of an action, never destinations a person navigates to.

## Voice and Tone

Microcopy rules. Brand voice lives in `DESIGN.md.Brand & Style`.

The register is **a friend who is good with numbers** — plain, specific, never apologetic, never celebratory about ordinary events. Amounts are stated, not softened. Failures name the next action in the same breath.

| Do | Don't |
|---|---|
| "You owe ฿291.74" | "Your outstanding balance is ฿291.74" |
| "2 items need an owner" | "⚠️ 2 unassigned items detected" |
| "Claim yours" | "Select your items to continue" |
| "Quote expired. Refresh it." | "Error: quote validity window exceeded" |
| "Maya receives at least 8.25 USDC" | "Min. output: 8.25 USDC (slippage 0.5%)" |
| "Ready to settle" | "Payment pending user action" |
| "All square" | "Congratulations! 🎉 All debts settled!" |
| "You can close this — we'll update the tab either way." | "Please do not close this window." |
| "Scan receipt" | "AI Receipt Magic ✨" |

**Never appears in user-facing copy:** execute, swap, route, approve, broadcast, transaction, signature, mint, ATA, gas, lamports, slippage, blockhash, RPC, wallet address, AI, powered by, seamless.

**Numbers are never rounded in copy.** If the obligation is ฿291.74, every surface says ฿291.74. "About ฿292" is a defect — the entire trust argument is that the math is exact.

**Currency.** Bill amounts display in the bill's currency with its symbol and full precision (฿291.74). Token amounts appear only inside the payment sheet's disclosed lines and are labelled with the token name, never a symbol or logo. The two never share a line.

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Where | Behavioral rules |
|---|---|---|
| `balance-hero` | Tabs, Group | Not interactive. State-driven only: owed → `{colors.owed}`, owed-to-you → `{colors.settled}`, zero → "All square" in `{colors.ink}`. Never shows a token amount. |
| `tab-card` | Tabs, Group | Whole card is the tap target → Claim Board. Progress bar reflects *settled obligations*, never submitted ones (FR-L3). |
| `claim-row` | Claim Board | Tap the row body toggles the viewer's own claim. Tap the avatar stack opens the who-has-this sheet. Long-press is unbound — no hidden actions. Organizer sees an extra overflow control for override (FR-C4). |
| `participant-chip` | Tip Composer, New Tab, Bill Review | Single-select in Tip Composer and New Tab. Selection is a ring, never a fill, so the avatar stays readable. |
| `presence-stack` | Claim Board header | Shows people *currently subscribed* to this tab, max 3 plus `+n`. Updates live. Never shows the viewer themselves. Absent when the viewer is alone — no "1 person here". |
| `sticky-claim-footer` | Claim Board | Always visible above the safe area. The action label is state-driven: "Claim yours" while the viewer has nothing → "Finish claiming" once they do → disabled with "2 items need an owner" when unassigned items remain *and* the viewer is the organizer. Participants are never blocked by someone else's unclaimed item. |
| `breakdown-row` | Bill Review, Payment Sheet | Tap expands in place; multiple rows may be open. Expansion is the "explain the math" affordance and must never be behind a separate screen. |
| Bill Review (surface) | Everyone | **Read-only for every participant; the organizer is the only one who can act on it.** Same layout, same expandable rows, same reconciliation line for all. The organizer's footer is "Lock bill"; a participant's is "Settle up" before lock (disabled, with "Waiting on Maya to lock") and enabled after. Nobody can edit an amount here — editing happens on the Claim Board, before lock. |
| `payment-sheet` | Claim Board, Group, Activity | Dismissible by scrim tap or swipe-down **only before Pay is tapped**. Once tapped, it transitions to Payment Progress and can no longer be dismissed backward. |
| `token-chip` | Payment Sheet, Tip Composer | Single-select. A token the user cannot afford is shown disabled with its balance visible — never hidden, so the reason is legible. |
| `disclosure-row` | Payment Sheet | Collapsed on every open, including repeat visits. Never remembers its expanded state — the default must always be the simple view. |
| `settlement-stepper` | Payment Progress | Steps advance only on server-confirmed transitions (AD-11). Never optimistic. A step never moves backward; a failure replaces the active step in place. |
| `all-square-card` | On final confirmation | Fires **once per bill**, only on the transition to all-square, and only for people present in the app at that moment. Never replayed on revisit. |
| `activity-row` | Activity, Group | Tap expands in place to reveal detail plus the explorer link. Rows are immutable — an event is never edited or removed after the fact (AD-12). |
| `amount-pair` | Everywhere money is disclosed | Label left, amount right, decimal-aligned. Every disclosed figure uses this so no amount ever appears without a label. |
| `discrepancy-card` | Receipt Review | Sticky at top while a mismatch exists. Dismisses itself when the numbers reconcile — never manually dismissible. |

## State Patterns

Every surface resolves to one of these. There is no state in this product without designed copy.

| State | Surface | Treatment |
|---|---|---|
| Authenticating | Launch | Wordmark, indeterminate indicator, "Getting your tab ready…". No buttons, no login affordance, no elapsed timer. |
| Auth recovering | Any | Session refresh is silent. If it genuinely fails: a single inline bar, "Reconnecting…", with reads still visible from cache. Never a modal, never a logout. |
| Empty — no groups | Tabs | "No tabs yet. Start one from any Telegram group." with "Start a tab" beneath. |
| Empty — no activity | Activity | "Nothing yet. Claims, tips and payments show up here." |
| Empty — no items | Claim Board | Organizer: "Add what you ordered." with both capture actions. Participant: "Maya is adding the bill. You can stay here — it will appear automatically." The shared link may be opened before items exist. |
| Loading — first paint | Tabs, Claim Board, Activity | Skeleton rows matching final geometry, **with tabular-width numeral placeholders** so nothing shifts on arrival. |
| Loading — subsequent | Any | Nothing. Convex reactivity replaces content in place; a spinner over already-correct data is a defect. |
| Unassigned items | Claim Board | Row carries a `{colors.warning}` left edge. Footer counts them. Lock is blocked for the organizer with the count as the reason. |
| Claim conflict | Claim Board | See *Concurrency and Revision*. |
| Locked | Claim Board | Rows become read-only with claim affordances removed, not disabled-greyed. Header gains "Locked" in `{colors.ink-muted}`. Footer action becomes "Settle up", with a quiet "See the full bill" text link beside it routing to read-only Bill Review. |
| Pre-lock, participant | Bill Review | Full read-only breakdown for everyone. Footer action "Settle up" is disabled with the reason stated: "Waiting on Maya to lock". Never a blank or hidden action. |
| Quote live | Payment Sheet | Countdown in `{colors.ink-muted}`: "Quote refreshes in 0:42". Under 10 seconds it turns `{colors.warning}`. |
| Quote expired | Payment Sheet | Action becomes "Refresh quote" in place. Amounts hold their last values at 40% opacity — never blanked, so the person keeps their bearings. |
| Awaiting wallet | Payment Progress | Step 1 active: "Approved in your wallet". If Privy's sheet is dismissed, return to the Payment Sheet unchanged with no error — a cancelled signature is a normal act, not a failure. |
| Submitting | Payment Progress | Steps 2–3 active. "You can close this — we'll update the tab either way." Persisted `unknown` adds "Still checking — don't pay again." and never offers retry. |
| Confirmed | Payment Progress → Claim Board | The row swaps to `{colors.settled}` in place, a check draws in, the ring advances. **No takeover.** |
| Failed | Payment Progress | Active step turns `{colors.owed}` with a plain cause and two actions: "Try again" and "Back to tab". Never a raw code, never a signature, never a stack trace. |
| Stale revision | Payment Sheet | "This bill changed. Refresh to see your new amount." with one action. Payment is blocked, not silently repriced (FR-B6, AD-7). |
| Sponsorship paused | Payment Sheet | "Payments are paused right now. Your tab is safe." Reads stay fully available (AD-17, NFR-4). |
| Offline | Any | A single inline bar, "You're offline. We'll catch up." Cached state stays readable. Only claim/release enters the durable outbox; money, authoring, lock/reopen, waiver, and cash actions are disabled. |
| All square | Group, Tabs | `balance-hero` reads "All square" in `{colors.ink}`. No badge, no trophy, no persistent celebration. |

## Concurrency and Revision

*Product-specific. This is the behavior no component library ships and the reason the claim board exists as a designed surface.*

Several people are on the same bill on different phones. The experience must make simultaneity feel collaborative rather than contested.

**Two people claim the same item.** The item is not exclusive — claiming is additive. The second person's avatar joins the first person's in the stack and the row becomes a shared item: "Split 2 ways · ฿120.00 each". Neither person is rejected, neither sees an error. This is the correct outcome for a real dinner and it removes the entire conflict-resolution problem from the interface.

**Someone releases a shared item.** The remaining claimants' per-head amount recalculates in place. The person releasing sees their own subtotal in the footer drop. Nobody gets a notification for this.

**Someone else's claim arrives.** The avatar animates into the stack over ~200ms and the row's per-head caption updates. The sticky footer's reconciliation line ticks. This motion is load-bearing for the demo (multiple phones, side by side) and must not be removed as decoration — but it is suppressed under Reduce Motion, where values simply update.

**The organizer edits while others are claiming.** Every draft edit increments the revision (AD-7). Other clients update in place. An edit that removes a claimed item shows the affected people an inline note on the footer: "Maya removed an item you claimed." — informational, not a dialog, and it does not steal focus.

**A stale client acts.** The mutation is rejected server-side. The person sees the board correct itself to current state and a single line: "That changed a moment ago." No modal, no forced reload.

**Locking.** Only the organizer can lock, only when no items are unassigned. Lock is irreversible-feeling by design: the confirmation copy reads "Locking creates each person's final amount. Editing after this needs a reopen." Everyone else's board transitions to locked live, and their footer action becomes "Settle up" — that transition is the moment the bill becomes real.

**Reopening after lock.** Available only when no payment confirmed and no intent is `user_signed`, `submitted`, or `unknown`. It marks safe pre-broadcast intents `superseded` and appends obligation-supersession events for the old revision; it never mutates obligations. Late confirmation is reconciled before reopen can proceed.

## Money Legibility

*Product-specific. The trust argument is that the math is exact and inspectable — that is a UX obligation, not just a backend one.*

- **Every amount is attributable.** No figure appears without a label, via `amount-pair`. A number the user cannot explain is a number they will not trust.
- **The breakdown is always one tap away**, never one screen away. `breakdown-row` expands in place on Bill Review and inside the Payment Sheet.
- **Rounding is disclosed, not hidden.** Where largest-remainder allocation gives one person an extra satang (FR-M4, FR-M5), their expanded breakdown shows it as its own line: "Rounding +฿0.01". Silent asymmetry between people who ordered identical items is the fastest way to lose a group's trust.
- **Reconciliation is stated positively.** Bill Review shows "Everyone's shares add up to ฿1,840.00 ✓" in `{colors.settled}`. If it fails, lock is blocked and the shortfall is named exactly (FR-M6).
- **Bill currency and token amounts never share a line.** The obligation is ฿291.74. The token figures live in the payment sheet's disclosed lines, labelled by token name.
- **"At least" is the honest word for a swap.** The sheet says "Maya receives at least 8.25 USDC" — never a projected exact output presented as a guarantee (FR-S6).
- **There is no platform fee in the judged build.** `PLATFORM_FEE_BPS` is zero, so no fee line appears anywhere — not on the primary surface and not inside the disclosure row. Do not design a placeholder for it. If it ever becomes non-zero, it enters as an `amount-pair` inside the collapsed `disclosure-row`, never above it.
- **The sponsored network fee is stated, once, as free.** Inside the disclosure row: "Network fee · Covered by My Tab". The person is told they are not paying it rather than being shown a zero (AD-9).
- **Everyone can inspect everyone's share.** Bill Review is read-only for all participants, not a privilege of the organizer. A split people cannot audit is a split people argue about.
- **Progress counts confirmed money only.** Every ring, bar, and "n of 5 settled" reflects confirmed obligations. A submitted transaction moves the stepper, never the group's progress (AD-11, FR-L3).
- **Bill complete and group net zero are different.** A bill completes when every active obligation for that bill is offset by confirmed chain payment, recipient-authorized waiver, or dual-acknowledged cash. Group "All square" on Tabs is a cross-bill net position. The once-per-bill completion card listens to bill completion, never group net zero.
- **Waiver and cash are explicit social acts.** Only the recipient can waive their receivable. Cash is pending until payer and recipient acknowledge the same amount. Both appear as immutable activity rows and are unavailable while an on-chain payment is in flight.

## Settlement Status, in Human Terms

*Product-specific. The intent state machine (PRD §11) is internal; this is its only sanctioned surfacing.*

| Internal state | What the person sees | Where |
|---|---|---|
| `created`, `quoting` | Sheet contents resolving; action disabled | Payment Sheet |
| `ready_for_signature` | The full quote, "Pay ฿291.74" enabled, countdown running | Payment Sheet |
| `ready_for_signature` + wallet-open UI stage | Step 1 — "Approved in your wallet" | Payment Progress |
| `user_signed` | Step 2 — "Verifying" | Payment Progress |
| `submitted` | Step 3 — "Sending to Maya", with "Usually takes a few seconds" | Payment Progress |
| `unknown` | Step 3 — "Still checking — don't pay again"; no retry action | Payment Progress |
| `confirmed` | Step 4 — "Confirmed", then the row settles in place | Payment Progress → Claim Board |
| `failed` | Named cause + "Try again" / "Back to tab" | Payment Progress |
| `expired` | "Quote expired. Refresh it." | Payment Sheet |
| `superseded` | "This bill changed. Refresh to see your new amount." | Payment Sheet |

The words *intent*, *signature*, *broadcast*, *submitted*, and *confirmed-on-chain* never appear. Step 2 says "Verifying" because that is true and legible; it is not a euphemism for something the person would object to.

**A cancelled wallet prompt is not a failure.** It returns to the Payment Sheet in its previous state with no message.

**A submission timeout is not a failure.** It maps to persisted `unknown`; the progress screen remains forward-only, the same payment cannot be recreated, and a late confirmation completes normally.

## The Telegram Surface

*Product-specific. The bot's messages are part of this product's experience and are designed here.*

The group chat is where the product is discovered, invited into, and celebrated. It is also the surface most easily ruined by noise.

**One status message per tab, edited in place** rather than a new message per event (FR-N4). The group sees one card that evolves.

```
🍜 Sukhumvit Dinner is ready
5 people · ฿1,840 total
4 of 5 items claimed

[Open tab]
```

**Only five events ever post:** tab opened · bill ready to settle · payment confirmed · bill completed · tip confirmed. Nothing else — not claims, not edits, not joins, not reminders during the demo window.

**Never in a group message:** who owes what, individual amounts, wallet addresses, transaction links, or anything a person would not say out loud at the table (NFR-7). Totals and counts are group facts; individual debts are not.

**The button is always the same promise** — `[Open tab]` — and it always lands on the Claim Board for that specific tab, already authenticated and scoped (FR-N3). If the organizer has not added items yet, participants see the waiting state and transition live when items arrive.

**Deleted status messages recover quietly.** If editing reports the canonical message missing, the bot posts one replacement, atomically records its ID, and resumes edits. Concurrent retries never create multiple replacements.

**Tip confirmations are the one warm message.** They name both people and the amount, because that is the social act the tip was for.

## Interaction Primitives

- **Tap to act.** One tap claims, one tap pays, one tap tips.
- **Long-press is unbound throughout.** No hidden actions, no context menus. The single exception is the demo-mode "Use sample receipt" affordance, which is deliberately hidden from judges.
- **Swipe-down dismisses a sheet**, but only before it commits (see `payment-sheet`).
- **Pull-to-refresh is banned.** Convex is reactive; a refresh gesture would imply the data might be stale, which is the opposite of the product's claim.
- **Haptics, three moments only:** light on claim/unclaim · medium on lock · success on confirmed payment. Nothing else vibrates. Suppressed with Reduce Motion.
- **Telegram's native back control** is the back affordance wherever Telegram exposes it; the in-app header chevron mirrors it. They never both appear.
- **Motion is functional, not decorative.** Three sanctioned animations: an avatar arriving in a stack (~200ms), a check drawing on confirmation (~400ms), and the all-square wash (~600ms, once per bill). Everything else is an instant state swap.
- **Banned:** carousels, parallax, hero animations on open, skeleton shimmer, toast stacks, badge counts, confetti, sound.

## Accessibility Floor

Behavioral. Visual contrast is `DESIGN.md`'s responsibility.

- **Semantic color never travels alone.** Every state carried by `{colors.owed}`, `{colors.settled}`, or `{colors.warning}` also carries a word or a glyph: "Paid" with a check, "2 items need an owner" as text, "You owe" as a label. A person who cannot separate the coral from the mint must still be able to settle a bill.
- **Touch targets ≥ 44px**, including claim rows, token chips, and avatar chips in a stack. Overlapping avatars in `presence-stack` are decorative and not individually tappable — the stack is one target.
- **Screen readers.** Every interactive element announces role and state. `claim-row` announces item, price, and current claimants: "Green Curry, 180 baht, claimed by you." The `settlement-stepper` announces each transition once as a live region — the confirmation is the single most important announcement in the product.
- **Amounts read as money, not digits.** "291 baht 73" — never "two nine one point seven three".
- **Reduce Motion** removes the three sanctioned animations and all haptics. States change instantly. The all-square card still appears; it simply does not wash in.
- **Dynamic type.** Body scales with the platform setting. `amount-hero` may compress but never truncates and never wraps mid-figure. Layout holds at 320px with the largest supported size.
- **Focus order follows reading order** on every surface. The sticky footer action is last in traversal, never first.
- **No time limit is ever punitive.** The quote countdown expires into a recoverable state, never into a lost bill or a lost claim.

## Responsive & Platform

| Context | Behavior |
|---|---|
| iOS Telegram | Safe-area insets honored top and bottom. Sticky footer sits above the home indicator. Telegram back control used. |
| Android Telegram | System back gesture maps to the header back. Keyboard resize must not detach the sticky footer from the viewport. |
| Telegram Desktop | Same 390px column, centered on `{colors.paper}`. No wide layout, no two-column claim board. |
| Standalone browser | Authenticated reads and cached presence work without Telegram styling. All writes are disabled with "Open this in Telegram to make changes" and rejected server-side. |
| 320px width | Hard floor. No horizontal scroll anywhere. Amount columns compress before item names truncate. |
| Keyboard open | Composer and input surfaces scroll their field into view. The claim footer yields to the keyboard rather than overlapping it. |
| Long Telegram names | Truncate with ellipsis at the name, never at the amount. Amounts are never truncated anywhere in this product. |
| Missing avatar | Initial on a deterministic tint derived from the user id — never a generic silhouette. |

## Inspiration & Anti-patterns

- **Lifted from a paper restaurant tab:** several hands marking one shared document. The claim board is that object, which is why claiming is additive rather than exclusive.
- **Lifted from Splitwise:** the plain-language balance sentence ("You owe…"). Rejected from Splitwise: making the ledger the product. My Tab's ledger is a consequence of settling, not the destination.
- **Rejected — the wallet-app pattern** (balance-first home, token list, connect-wallet gate): it puts the mechanism where the social context belongs and would make My Tab legible as a crypto app in under a second.
- **Rejected — swap-UI conventions** (route diagrams, slippage sliders, price impact warnings on the primary surface): the payer chose a token, not a trade. All of it lives behind one collapsed `disclosure-row`.
- **Rejected — celebration on every payment:** confetti per transaction spends the emotional peak on a routine act. The celebration fires once, when the *group* completes.
- **Rejected — AI framing** (sparkles, "magic", confidence percentages, a chat affordance): the model reads a receipt. Presenting it as intelligence invites the question of whether it can be trusted with money, which is exactly the wrong question to raise (AD-18).
- **Rejected — notification pressure** (reminder pings, nudges, badge counts): the group chat already applies social pressure far more effectively, and a payment app that nags is a payment app people mute.

## Key Flows

Protagonists are consistent across every flow and mirror the demo dataset: **Maya**, 31, organizes the Thursday dinner for a twelve-person Bangkok group chat and always ends up fronting the bill. **Andre**, 28, is in the group, has never owned a crypto wallet, and does not intend to start now. **Noi**, **Ploy**, and **Tim** round out the table.

### Flow 1 — Maya starts the tab (restaurant, bill just landed, everyone reaching for phones)

1. Maya types `/tab` in the group chat.
2. The bot posts a card: "Sukhumvit Dinner is ready" with `[Open tab]`.
3. She taps it. My Tab opens already signed in — no login, no wallet prompt.
4. She names the tab, confirms THB, confirms she paid.
5. She photographs the receipt.
6. Receipt Review opens with items extracted, two rows amber-outlined, and a discrepancy card: "Items add up to ฿1,812 but the total says ฿1,840."
7. She fixes one price and one quantity; the discrepancy card disappears on its own.
8. She taps "Confirm receipt".
9. **Climax:** the Claim Board opens with every dish listed and a live presence stack already showing two avatars — Noi and Ploy tapped the same link while she was fixing the receipt. The paper tab became a shared object without her inviting anyone.

*Failure:* extraction fails or the photo is unusable → Receipt Review opens empty with "Add what you ordered" and both capture actions. The receipt never blocks the tab (FR-R6).

### Flow 2 — Andre joins and claims (same table, 8% battery, no idea what Solana is)

1. Andre taps `[Open tab]` in the group chat.
2. My Tab opens on the Claim Board. He is authenticated and holds a wallet he was never asked about.
3. He sees the dishes and taps "Green Curry".
4. The row tints `{colors.primary-soft}`, his avatar appears, the footer subtotal moves to ฿180.00.
5. He taps "Pad Thai" — Noi's avatar is already there. The row becomes "Split 2 ways · ฿120.00 each". Nobody is rejected.
6. Ploy's avatar animates into a row across the screen; the footer reconciliation line ticks.
7. **Climax:** the footer reads "Your share ฿291.74" and Andre has never once been asked to install, connect, fund, or understand anything.

*Failure:* Andre goes offline mid-claim → the inline bar appears; his claim/release operation enters the IndexedDB outbox with an operation id and base revision. Replay is serial and deduplicated. A stale effect asks for a new tap instead of retrying blindly.

### Flow 3 — Noi and Ploy collide (twelve seconds apart, both certain the Som Tam was theirs)

1. Noi taps "Som Tam". Her avatar lands, the row leaves its amber unassigned state.
2. Ploy, on her own phone, taps the same row.
3. Ploy's avatar joins Noi's. The row becomes "Split 2 ways · ฿60.00 each".
4. Both footers update. Neither sees a warning, a conflict dialog, or a loser.
5. **Climax:** the disagreement resolves itself into the answer a real table would have reached anyway — they shared it — and the software never had to arbitrate.

*Variant:* if it genuinely was Noi's alone, Ploy taps the row again to release. Noi's per-head amount returns to ฿120.00 in place, silently.

### Flow 4 — Maya locks, Andre settles (plates cleared, someone is asking about the taxi)

1. Maya's footer reads "1 item needs an owner" and her lock is blocked.
2. She taps the amber row and assigns it to Tim herself (organizer override).
3. She taps "Finish claiming" → Bill Review.
4. She expands Andre's row: items ฿240.00, service 10% ฿24.00, VAT 7% ฿18.48, group tip ฿9.25, rounding +฿0.01, total ฿291.74.
5. The reconciliation line reads "Everyone's shares add up to ฿1,840.00 ✓".
6. She taps "Lock bill".
7. Andre, meanwhile, had opened the same Bill Review from his own phone — read-only, footer disabled, "Waiting on Maya to lock". He expanded Tim's row out of curiosity and found the same arithmetic applied to someone else. Nothing was hidden from him.
8. The moment Maya locks, his board goes read-only and his footer becomes "Settle up". He taps it.
9. The Payment Sheet: **฿291.74**, "To Maya · receives USDC", token chips USDC and SOL. He picks SOL because that is what he has.
10. "You spend ≈ 0.0412 SOL". "Maya receives at least 8.25 USDC". Countdown running. He never sees the word swap.
11. He taps "Pay ฿291.74". Privy's sheet appears; he approves once.
12. The stepper walks: Approved in your wallet → Verifying → Sending to Maya → Confirmed.
13. **Climax:** his row on the Claim Board turns `{colors.settled}`, a check draws in, the group ring advances to 4 of 5 — and in the group chat the bot's one status card edits itself to say a payment landed. Andre paid a Thai baht restaurant bill with a token he happened to hold, to a person who wanted a different one, and the only decision he made was which chip to tap.

*Failure — quote expires before he approves:* the sheet holds his amounts at 40% opacity and the action becomes "Refresh quote". One tap re-prices; nothing is lost.
*Failure — Maya reopens the bill mid-sheet:* the sheet switches to "This bill changed. Refresh to see your new amount." Payment is blocked rather than silently repriced.

### Flow 5 — Andre tips Maya (walking out, thirty seconds later)

1. The settled Claim Board offers "Tip the organizer".
2. Tip Composer opens with Maya already selected.
3. He taps the ฿100 preset, types "legend 🙏", taps a reaction.
4. "Paying with USDC · Maya receives USDC."
5. He taps "Send tip". One approval.
6. **Climax:** the bot posts the one warm message of the evening into the group chat, naming both of them — the tip becomes a social act in front of everyone, which is the entire reason it exists.

### Flow 6 — The group reaches all square (Tim, in the taxi, last to pay)

1. Tim settles his ฿412.00 from the Group screen.
2. His stepper confirms.
3. The final obligation on Sukhumvit Dinner clears, so that bill becomes complete; in this demo fixture only, the separate cross-bill group net also happens to reach zero.
4. **Climax:** for everyone with the bill open, the completion card washes in once — apricot, one check, "All square", "Sukhumvit Dinner · ฿1,840", "5 of 5 settled", five avatars, and *Your group tab. Settled.* It fires exactly once from this bill's completion, never from the group-net calculation or an individual transaction, and then the product goes quiet again.

*Note:* people who open the app later see "All square" on the Group screen as a calm state. The card is a moment, not a badge — it is never replayed.

## Open Items

- **[RESOLVED 2026-08-21]** Bill Review is **read-only for everyone**, not organizer-only. Same layout and same expandable breakdown for every participant; only the footer action differs. Any split people cannot audit is a split people argue about.
- **[RESOLVED 2026-08-21]** The platform fee is **zero** for the judged build (PRD OQ-4). No fee line appears anywhere — not on the primary surface, not inside the disclosure row, and not as a placeholder. The only fee mentioned is the network fee, disclosed as "Covered by My Tab".
- **[ASSUMPTION]** SOL is the single allowlisted non-USDC input token shown in the payment sheet (PRD OQ-2). If it changes, only the token chip label changes.
- **[NOTE FOR UX]** Live presence was promoted out of P1 because the demo is multiple phones side by side. If that changes to a single mirrored screen, `presence-stack` and the avatar arrival animation can be cut without touching any other pattern.
