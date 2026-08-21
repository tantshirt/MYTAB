# Google Stitch Handoff — My Tab

**Producer:** Google Stitch — https://stitch.withgoogle.com
**Emits:** DESIGN.md + per-screen HTML
**Save outputs to:** this folder (`_bmad-output/planning-artifacts/ux-designs/ux-MYTAB-2026-08-21/`). Stitch's `DESIGN.md` replaces the frontmatter-only stub already here. Per-screen HTML goes in `.working/`, then gets promoted to `mockups/` on the Update pass.

## How to run this

Run **Wave 1 first** and check the output before continuing. Waves 2 and 3 each begin by restating the design system in one line so Stitch re-anchors — that is deliberate, do not delete it. If Stitch drifts on a screen, re-run that screen alone with the Section A block pasted above it.

- **Wave 1** — the visual language: Tabs, Claim Board, Payment Sheet. Lock these before anything else.
- **Wave 2** — the rest of the demo path: Bill Review, Payment Progress, All Square, Tip Composer, Group.
- **Wave 3** — the supporting screens: Launch/Auth, New Tab, Receipt Review, Activity, You.

---

## SECTION A — Paste at the top of every wave

> I'm designing a mobile app called **My Tab**. It's a Telegram Mini App where a group of friends splits a restaurant bill, each person claims the items they actually ate, and everyone settles up — money moves in the background, invisibly. It must feel like a **social coordination app**, not a wallet, not a crypto app, not a finance dashboard.
>
> **Tagline:** *The group tab that lives in Telegram.* **Launch line:** *Start it. Split it. Settle it.*
>
> **Form factor:** mobile only, single column, 390px design width, safe for 320px. Designed for a phone held one-handed inside the Telegram app.
>
> **Light mode only.** No dark mode variants.
>
> ### Colors — use these exact values, do not substitute
>
> | Role | Hex |
> |---|---|
> | Primary action / selection / links / focus | `#1E51D2` |
> | Selected row, active chip (soft primary) | `#E9EFFF` |
> | App canvas background (cool paper) | `#F4F7FA` |
> | Card, sheet, input surface | `#FFFFFF` |
> | Primary text | `#0A2038` |
> | Metadata and helper text | `#55677D` |
> | Dividers and borders | `#DFE7EF` |
> | Tip icon and celebration accent | `#FF8A5B` |
> | Paid, received, all square | `#0B7561` |
> | Owed, failed, disputed, destructive | `#B32B44` |
> | Unassigned items, quote expiring | `#9A6209` |
>
> ### Typography
>
> **Instrument Sans** with system fallbacks. Body 15px. Balance and obligation amounts 34–42px. **All numbers use tabular figures** so columns align. Labels 13px, metadata 13px in the muted color.
>
> ### Layout and depth
>
> - 4px spacing scale. 16px screen gutters. 20px card padding.
> - **Border-led depth, not shadow-led.** Cards are white on the paper canvas with a 1px `#DFE7EF` border. Shadows are extremely restrained — used only for sheets that float above content, never on ordinary cards.
> - Minimum touch target 44px.
> - Corner radius: 12px cards, 10px inputs and buttons, full-round for chips and avatars.
>
> ### Hard visual rules — reject anything that violates these
>
> - **No dark backgrounds.** The canvas is warm paper, always.
> - **No purple-to-blue gradients**, no "AI" gradients, no glassmorphism, no frosted blur, no neon.
> - **No crypto aesthetics:** no token logos in navigation, no wallet-address-first layouts, no candlestick or price charts, no "connect wallet" framing.
> - **No sparkle or magic-wand icons.** The receipt feature is called "Scan receipt" — never "AI".
> - **No chart walls.** Analytics are never the first thing on a screen.
> - **Do not wrap every section in its own rounded card.** Use dividers and whitespace; reserve cards for things that are genuinely one object.
> - Show **names and avatars before addresses or token symbols**, always.
>
> ### Voice — use this copy style verbatim where it appears
>
> Say: "Start a tab" · "Claim yours" · "2 items need an owner" · "You owe ฿291.74" · "Ready to settle" · "Tip sent" · "All square" · "Quote expired. Refresh it."
>
> Never say: "Execute swap" · "Approve route" · "Destination ATA" · "Broadcast transaction" · "AI-powered split" · "Insufficient lamports" · "Connect wallet".
>
> ### Consistent demo data across every screen
>
> Group **Sukhumvit Dinner**, 5 people, **฿1,840.00** total. **Maya** is the organizer who paid the restaurant. **Andre is the viewer** — the person whose phone this is — and he owes **฿291.74**. The others are **Noi**, **Ploy**, and **Tim**. Currency displays as Thai baht with the ฿ symbol and two decimals. This is the canonical fixture for every mock and test.

---

## WAVE 1 — The visual language

Lock these three before running anything else. Every later screen inherits from them.

### 1. Tabs (home)

The home screen. Vertical order, top to bottom:

1. **Balance hero.** The single most important thing on screen. Large 40px tabular amount: **"You owe ฿291.74"** in the owed color `#B32B44`. Below it in muted 13px: "across 1 group". If the user owed nothing this would read "All square" in `#0B7561` — show the owed state.
2. **Two primary actions, side by side, equal width.** "Start a tab" (filled, primary blue) and "Send a tip" (outlined, with a small apricot tip icon). 44px tall minimum.
3. **Open tabs.** A section label "Open tabs", then one card: "Sukhumvit Dinner", "5 people · ฿1,840.00", a thin horizontal progress bar showing 3 of 5 settled, and on the right the viewer's remaining amount "฿291.74" in the owed color.
4. **Groups.** Section label, then one row: group avatar, "Sukhumvit Dinner", an overlapping avatar stack of 5 faces, and the viewer's position "You owe ฿291.74" in muted 13px.
5. **Recent activity.** A compact social feed, 3 rows, each with a small avatar, a plain sentence, and a relative timestamp: "Noi paid ฿412.00 · 2m", "Maya locked the bill · 8m", "Ploy claimed Pad Thai · 12m".

Bottom tab bar with three items: **Tabs** (active), **Activity**, **You**.

Do not put a chart anywhere on this screen.

### 2. Claim Board — the heart of the product

This is the most important screen in the app. A live, collaborative list where each person taps the items they ate. Several people are on it at the same time on different phones, so arrival of other people's claims must be visible.

**Header:** back chevron, "Sukhumvit Dinner", and on the right a live presence indicator — a small overlapping stack of 3 avatars with a subtle pulsing dot, meaning "3 people are here right now".

**Item rows.** Each row contains, left to right: the item name with quantity ("2× Pad Thai"), the price right-aligned in tabular figures ("฿240.00"), and below the name a row of small assigned-participant avatars. On the right edge, an action: a **"Claim"** button when unclaimed, or a filled state when claimed.

Show all four of these states in the list so the visual language is clear:

- **Unclaimed and needing attention** — "1× Som Tam · ฿120.00" with a left edge accent in the warning amber `#9A6209`, no avatars, and a "Claim" button.
- **Claimed by the viewer** — "1× Green Curry · ฿180.00" with Andre's avatar and a soft blue `#E9EFFF` row background, the "Claim" action replaced by a subtle "Yours" label.
- **Shared between two people** — "2× Pad Thai · ฿240.00" with two overlapping avatars (Maya, Noi) and a small "Split 2 ways · ฿120.00 each" caption in muted 13px.
- **Claimed by someone else** — "1× Mango Sticky Rice · ฿160.00" with Tim's avatar only, no background tint, and a quiet "Tim" label.

**Sticky footer**, pinned to the bottom above the safe area, on a white surface with a top border. Two lines:

- Line 1, small and muted: "฿1,720.00 of ฿1,840.00 assigned · **2 items need an owner**" — with the "2 items need an owner" portion in the warning amber.
- Line 2: on the left "Your share" with a 24px tabular amount "฿291.74"; on the right a full-height primary button "Finish claiming".

### 3. Payment Sheet

A bottom sheet sliding up over a dimmed Claim Board. Rounded top corners, a small grab handle. This is where money gets explained clearly. Strict vertical order:

1. **The obligation, large.** 40px tabular "฿291.74", and beneath it in muted 13px "your share of Sukhumvit Dinner".
2. **Recipient row.** Maya's avatar, "To Maya", and on the right "receives USDC" in muted 13px. Names before anything technical.
3. **Payment token selector.** A horizontal row of two selectable chips: "USDC" (selected, soft blue `#E9EFFF` background with a blue border) and "SOL". Each chip shows the token name and the user's balance beneath in 13px muted. No token logos.
4. **You spend** — a row, label left, tabular amount right: "≈ 8.31 USDC".
5. **Maya receives at least** — a row, "8.25 USDC", with the amount in the settled green `#0B7561`.
6. **Add a tip** — an optional inline control: "Round up to ฿300" as a small outlined toggle chip with an apricot accent, plus "+฿8.27" in muted text.
7. **A single collapsed disclosure row**, closed by default: "Route, fees and network" with a chevron. Everything technical hides in here.
8. **A quote timer** in small muted text: "Quote refreshes in 0:42".
9. **One fixed bottom action**, full width, primary blue, 52px tall: **"Pay ฿291.74"**.

Never lead this sheet with a wallet address, a token mint, or transaction data.

---

## WAVE 2 — The rest of the demo path

> Same app, same design system as before: cool paper `#F4F7FA` canvas, white cards with 1px `#DFE7EF` borders, Tab Blue `#1E51D2` primary, Instrument Sans, tabular numerals, light mode only, no gradients, no crypto aesthetics, names before addresses. Same demo data: Sukhumvit Dinner, ฿1,840.00, Maya organizer, Andre viewer owing ฿291.74, plus Noi, Ploy, Tim.

### 4. Bill Review

Shown to the organizer just before locking. The full arithmetic, made inspectable.

Header "Review bill", subtitle "Sukhumvit Dinner · 5 people".

**Per-person breakdown.** Five rows, each: avatar, name, and a right-aligned tabular amount. Each row is expandable — show one row (Andre's) already expanded to reveal: "Items ฿240.00", "Service charge 10% ฿24.00", "VAT 7% ฿18.48", "Group tip ฿9.25", "Rounding +฿0.01", and subtotal "฿291.74". The lines reconcile exactly.

**Adjustments summary**, a bordered white card: "Service charge 10% · ฿167.27", "VAT 7% · ฿128.80", "Group tip ฿92.00", each with a small "proportional" tag in muted 13px.

**Reconciliation line**, prominent: "Everyone's shares add up to ฿1,840.00 ✓" with the checkmark and text in the settled green `#0B7561`.

**Fixed bottom action:** primary button "Lock bill". Beneath it, muted 13px: "Locking creates each person's final amount. Editing after this needs a reopen."

### 5. Payment Progress

Shown after the user taps Pay. A calm, centered, vertical status screen — not a spinner on a blank page.

A vertical stepper with four steps, each with an icon, a label, and a state:

1. "Approved in your wallet" — **complete**, green check.
2. "Verifying" — **complete**, green check.
3. "Sending to Maya" — **in progress**, an animated blue indicator, with muted sub-text "Usually takes a few seconds".
4. "Confirmed" — **pending**, a hollow grey circle.

Above the stepper, the amount in 34px tabular: "฿291.74 to Maya". Below the stepper, one quiet muted line: "You can close this — we'll update the tab either way." No cancel button. Include an ambiguous-submission variant: "Still checking — don't pay again" with no retry action.

Also produce a **failed variant** of this same screen: step 3 shows an owed `#B32B44` state, the message reads "Quote expired. Refresh it." and two buttons appear — "Try again" (primary) and "Back to tab" (text button). Never show a raw error code.

### 6. All Square — the celebration card

Fires **once**, only when the final person settles and the whole group reaches zero. A full-screen moment.

A soft apricot `#FF8A5B` wash across the upper portion of the screen, fading into the paper canvas. Centered, in order:

1. A single large check mark, drawn in a circle.
2. **"All square"** in 42px.
3. "Sukhumvit Dinner · ฿1,840.00" in muted 15px.
4. "5 of 5 settled" with a completed progress ring.
5. The success line in 15px: *"Your group tab. Settled."*
6. Overlapping avatar stack of all five people.
7. One primary button "Share to group", and a quiet text button "Done".

Confident and warm, not a party. No confetti, no balloons, no emoji rain.

### 7. Tip Composer

Header "Send a tip".

1. **Recipient selector.** A horizontal scrolling row of group members as avatar chips with names beneath. Maya is selected — her chip has a `#1E51D2` ring around the avatar.
2. **Amount.** A large centered tabular amount "฿100.00" at 40px, editable-looking. Beneath it, a row of four preset chips: "฿20", "฿50", "฿100" (selected, soft blue), "฿200", plus a "Custom" chip.
3. **Note.** A single-line input, placeholder "Say something nice…", and beneath it a row of six emoji reaction chips.
4. **Token row.** "Paying with USDC" with a small chevron to change it, and "Maya receives USDC" beneath in muted 13px.
5. **Fixed bottom action:** primary button "Send tip" with a small apricot tip icon.

The whole screen should feel light and social — closer to sending a message than making a payment.

### 8. Group

Header with the group avatar and "Sukhumvit Dinner".

1. **Balance strip** — a full-width white card: "You owe ฿291.74" in 34px tabular, owed color, with a right-aligned "Settle up" primary button.
2. **Members** — a horizontal row of 5 avatars with names beneath; each shows a tiny status dot, green for settled, coral for still owing.
3. **Open tabs** — one card, same shape as on the Tabs screen.
4. **Activity** — a compact feed of 4 rows scoped to this group.

Bottom action, outlined full width: "Start a tab".

---

## WAVE 3 — Supporting screens

> Same app, same design system as before: cool paper `#F4F7FA` canvas, white cards with 1px `#DFE7EF` borders, Tab Blue `#1E51D2` primary, Instrument Sans, tabular numerals, light mode only, no gradients, no crypto aesthetics, names before addresses.

### 9. Launch / Auth

A near-empty screen — the app authenticates automatically, so this exists to reassure, not to ask. Centered: the My Tab wordmark, a quiet indeterminate progress indicator, and one line of muted 15px text: "Getting your tab ready…". Absolutely no "Connect wallet", no "Sign in", no login form, no buttons at all.

### 10. New Tab

Header "Start a tab".

1. Text input, label "What's this tab for?", placeholder "Sukhumvit Dinner".
2. Currency selector: two chips, "THB" (selected) and "USDC".
3. "Who paid?" — a horizontal avatar row, Maya selected with a blue ring.
4. **Two large capture choices**, side by side as equal tappable cards with generous padding: "Scan receipt" (with a plain camera or document icon — **not** a sparkle, wand, or magic icon) and "Add items manually" (with a list icon).
5. Fixed bottom action: "Add items".

### 11. Receipt Review

The screen after a receipt photo is scanned. It must look like a corrected document, not an AI output.

Header "Check the receipt" with muted sub-text "Fix anything we got wrong."

A **discrepancy card** pinned at the top, in warning amber `#9A6209` with a 1px amber border on a very pale amber background: "Items add up to ฿1,812 but the total says ฿1,840. Check the highlighted rows."

Then an editable line-item list. Each row: item name, quantity, price — all inline-editable, each row with a subtle edit affordance. Two rows carry an **amber outline** marking low confidence, one of them with Thai text in the item name. Totals section beneath: Subtotal, Service charge 10%, VAT 7%, Total — the Total row emphasized.

Fixed bottom action: "Confirm receipt". A quiet text link beneath: "Use sample receipt".

No sparkles, no "AI extracted", no confidence percentages shown as numbers, no robot iconography.

### 12. Activity

A single reverse-chronological feed, grouped under sticky date headers ("Today", "Yesterday").

Each row: a small circular icon whose color carries the meaning — settled green `#0B7561` for payments, terracotta `#A85F2E` for tips, muted grey for claims and edits — then a plain-language sentence, then a right-aligned amount where one applies, then a relative timestamp in muted 13px.

Sample rows: "Noi paid you ฿412.00" · "You tipped Maya ฿100.00" · "Maya locked Sukhumvit Dinner" · "Ploy claimed Pad Thai" · "Tim joined the tab".

One row should be expanded to reveal a detail line with a quiet text link "View on explorer" — the only place in the entire app where blockchain is acknowledged, and it is deliberately understated.

### 13. You

Header "You". A profile row at the top: large avatar, "Andre", "@andre" in muted 13px.

Then grouped settings rows with dividers, not individual cards:

- **Wallet** — "Solana wallet", with a truncated address "7xKX…9mPq" in muted 13px monospace and a copy icon. This is the **only** place an address appears in the app.
- **Receiving** — "You receive USDC" with a chevron.
- **Notifications** — a toggle.
- **Export wallet** — a chevron.
- **Help** — a chevron.

Calm and boring on purpose. This screen must not become a crypto dashboard: no balances in tokens, no portfolio value, no charts, no network selector.

---

## After Stitch runs

1. Treat the existing final `DESIGN.md` as authoritative; do not overwrite it with generated output.
2. Drop the per-screen HTML into `.working/`.
3. Come back and run `bmad-ux` in **Update** mode — it reads the memlog plus whatever Stitch emitted, reconciles the two, lifts behavioral decisions into `EXPERIENCE.md`, and promotes the keepers into `mockups/`.

`EXPERIENCE.md` is final and authoritative for behavior. Generated artboards are references only and must be reconciled back to it before implementation.
