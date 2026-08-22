---
name: My Tab — Polish Spec
status: final
created: '2026-08-22'
authority: implementation
binding_sources:
  - PRODUCT.md
  - DESIGN.md (visual authority)
  - EXPERIENCE.md (behavioural authority)
  - canvas/*.dc.html (approved artboards)
---

# My Tab — Polish Spec

> **What this is.** An executable specification for closing the gap between the approved design
> and the shipped build. `DESIGN.md` remains the visual authority and `EXPERIENCE.md` the
> behavioural authority; where this document and either of those disagree, they win and this
> document is a defect. Where this document and an *artboard* disagree, this document wins —
> the four places that happens are listed in §8.
>
> **How to use it.** Every value here is final. An engineer should never have to choose a
> number. Where a token exists, the token name is given; where a token does not exist, the
> exact value is given and §8 records that DESIGN.md needs the token added.

## 0. The diagnosis, in one paragraph

The build is not unfinished in the way a half-drawn screen is unfinished. It is unfinished in
three specific ways that compound. **First, four CSS classes that every button and every input
in the only reachable feature tree depends on — `mytab-button-primary`, `mytab-button-secondary`,
`mytab-link-button`, `mytab-input` — are referenced in nine files and defined nowhere**, so those
controls render as raw browser defaults on the one route a demo actually visits. **Second, the
app never tells Telegram what colour it is**, so Telegram's navy header sits on top of cool paper
and the whole thing reads as a page rather than an app. **Third, nine of thirteen surfaces have
finished components and no route**, and the one deep-link route that exists renders the wrong
surface — `/tabs/[publicToken]` mounts the bill *authoring* screen, when EXPERIENCE requires
`[Open tab]` to land on the Claim Board. Everything else in this document is craft. Those three
are the difference between a demo and a defect.

## 1. Surface-by-surface delta

### 1.0 The routing map, first

Nine surfaces have no route. Two more have a route that renders the wrong thing. This is the
target map; every path below is final and every surface in §1.1–§1.13 assumes it.

| # | Surface | Route / presentation | Component today | Status |
|---|---|---|---|---|
| 1 | Launch | inside `AuthGate`, no route | `features/auth/LaunchSurface.tsx` | present, needs polish |
| 2 | Tabs | `/` | `features/balances/TabsHomeSurface.tsx` | present, needs polish |
| 3 | Group | **`/groups/[groupId]` — new** | `features/groups/GroupSurface.tsx` | unreachable |
| 4 | New Tab | **`/tabs/new?group=<id>` — new** | `features/bills/NewTabForm.tsx` (inside `BillAuthoringSurface`) | reachable only by accident |
| 5 | Receipt Review | **`/tabs/[publicToken]/receipt` — new** | `features/receipts/ReceiptReview.tsx` | unreachable |
| 6 | Claim Board | **`/tabs/[publicToken]` — reassign** | `features/claims/ClaimBoard.tsx` | unreachable; route renders authoring instead |
| 7 | Bill Review | **`/tabs/[publicToken]/bill` — new** | `features/claims/BillReview.tsx` | unreachable |
| 8 | Payment Sheet | **sheet over 6/3/12, keyed `?settle=<obligationId>`** | `features/settlement/ObligationPaymentSheet.tsx` | unreachable |
| 9 | Payment Progress | **`/pay/[intentId]` — new, full-bleed** | `components/settlement-sheet/PaymentProgress.tsx` | unreachable |
| 10 | All Square | **overlay on 6 and 2, transition-driven** | `features/balances/AllSquareCard.tsx` | unreachable (props never passed) |
| 11 | Tip Composer | **`/tips/new?to=<userId>` — new** | `features/tips/TipComposer.tsx` | unreachable; `/tips/new` is a 404 today |
| 12 | Activity | `/activity` | `features/balances/ActivityFeed.tsx` | present, needs polish |
| 13 | You | `/you` | — | **stub** |

Two routes that exist in `href`s and must **not** be built: `/groups/picker` (`TabsHomeSurface.tsx:80,179`)
becomes a bottom sheet, not a page — see §1.2. And `pathname.startsWith("/groups")` in the tab-bar
active logic (`AppShell.tsx:92`) starts working once §1.3 lands; keep it.

Payment Progress is a **route, not a sheet**, because a payment in flight must survive a reload.
Payment Sheet is a **sheet, not a route**, because it is dismissible until Pay is tapped.
All Square is **neither** — it is a transition, and giving it a URL would let it be replayed,
which EXPERIENCE forbids.

---

### 1.1 Launch

**Artboard intent.** 390×844 centred stack on `paper`: 30px tab glyph + "My Tab" at 27px/600/`-0.035em`, 30px gap, a 108×3 `border` track with a 34px `primary` sweep, 30px gap, "Getting your tab ready…" at 15px `ink-muted`. No buttons, no timer.

**Code today.** `features/auth/LaunchSurface.tsx` — a 48px indeterminate bar with the keyframes inline at `:70`, `animation: mytab-launch-indeterminate 1.2s ease-in-out infinite` at `:54`.

**Delta.**
- Track is 108×3px, `rounded/full`, `colors/border`; the sweep is 34px wide, `rounded/full`, `colors/primary`. Currently 48px wide — replace.
- Add the wordmark lockup above the track: 30×30 tab glyph stroked `colors/primary` at 1.8, `gap: 11px`, "My Tab" at 27px/600, tracking `-0.035em`, `colors/ink`. It is absent from the code.
- Vertical rhythm: `gap: 30px` between all three blocks, container `padding: 0 40px`, centred both axes on `var(--app-height)`.
- Copy is exactly "Getting your tab ready…" (U+2026, not three periods) at `meta` 15px `colors/ink-muted`.
- **Add the reduce-motion branch.** `LaunchSurface.tsx:54` has no `prefers-reduced-motion` guard. Under reduce-motion the sweep is a static 34px `colors/primary` segment at `left: 0`.
- Animation timing: `1.25s`, `ease-in-out`, `infinite`, `translateX(-100%) → translateX(320%)`. Code says `1.2s` — align to the artboard.
- **No elapsed timer, no "still working", no retry button, ever.** If auth genuinely fails, §4 covers it.

---

### 1.2 Tabs (home)

**Artboard intent.** `balance-hero` (42px, state-coloured) + `meta` sub-line → 28px → two 48px quick actions side by side → 32px → "OPEN TABS" micro-label + one `tab-card` → 32px → "GROUPS" + a group row with a 40px monogram and a 4-avatar presence cluster → 32px → "RECENT" + a 3-row activity card → tab bar.

**Code today.** `features/balances/TabsHomeSurface.tsx` (282 lines), mounted at `app/(miniapp)/page.tsx:29` on all-fixture props.

**Delta — correctness first.**
- **`BalanceHero.tsx:36-39` clips the hero amount.** `whiteSpace:"nowrap"` + `overflow:"hidden"` + `textOverflow:"clip"` truncates mid-glyph with no signal. This is the reported "฿291.7". Fix: split the label from the figure. `formatBalanceHeroText` (`lib/domain/balance.ts:132-145`) must stop returning one string. Render two elements: the label ("You owe" / "You are owed" / nothing) as `meta` 13px `colors/ink-muted` **above**, and the figure alone as `amount-hero`. Then the figure is 8 glyphs, not 26, and fits at 42px in a 358px column with room to spare. Drop `textOverflow` entirely; keep `white-space: nowrap`; allow `font-size: clamp(32px, 10.8vw, 42px)` so 320px still holds.
- **`lib/domain/format.ts:15` emits no thousands separators.** The canonical fixture in DESIGN.md is `฿1,840.00`. `฿1840.00` is a defect against the visual authority *and* makes every clipping case worse. Change to `Intl`-free grouping: insert `,` every three digits left of the decimal. Keep the integer assertion at `:6` and the `฿` glyph.
- **`/groups/picker` and `/tips/new` are 404s** (`:80`, `:97`, `:179`). "Send a tip" → `/tips/new` (built in §1.11). "Start a tab" → **opens a bottom sheet**, not a route:
  - 0 verified groups → the sheet does not open; the button is replaced in place by the empty state below.
  - exactly 1 → skip the sheet, `router.push('/tabs/new?group=<id>')`.
  - 2+ → sheet, `rounded/lg` top, micro-label "START A TAB IN", one 56px row per group (32px monogram, name, member count), tap → `/tabs/new?group=<id>`.
- **`/groups/${group.id}` (`:252`)** starts working once §1.3 lands.
- **The `emptyGroups` guard at `:150` has a hole**: with `groups.length > 0` and `openTabs.length === 0`, the "Open tabs" heading renders above an empty `<ul>`. Add a per-section empty: "No open tabs in your groups." in `meta`, `colors/ink-muted`, 16px below the micro-label.
- **`loading` and `offline` are never passed** by `app/(miniapp)/page.tsx:29-49`, so `TabsHomeSkeleton` and `OfflineBar` are dead code. Wire both.
- **`showAllSquare` / `allSquareBill` are never passed**, so `AllSquareCard` is unreachable. See §1.10.

**Delta — craft.**
- Quick actions: 48px min-height (code has 52px — the artboard pairs a 48px *pair* with a 52px *single*; use 48 here), `gap: 10px`, `rounded/sm`. Primary is `colors/primary` fill, white label, `MYTAB_ELEVATION.buttonInset`. Secondary is `colors/surface` + 1px `colors/border`, `colors/ink` label. Both carry an 18px icon at `gap: 8px` — plus glyph for "Start a tab", the terracotta up-arrow-with-dot for "Send a tip", stroked `colors/tip`. Icons are absent from the code.
- Section micro-labels are `11px / 600 / 0.07em / uppercase / colors/ink-subtle`, `margin-bottom: 10px`, `margin-top: 32px`. The code uses ordinary headings.
- `tab-card`: `spacing/5` (20px) padding, title 16px/600 `-0.01em`, `meta` sub-line "5 people · ฿1,840.00" at 13px, right-aligned `amount-row` in the state colour, then `margin-top: 16px` for the 4px `rounded/full` `colors/border` track with a `colors/settled` fill, then `margin-top: 8px` for "3 of 5 settled" at 13px `colors/ink-muted`. `TabCard.tsx:44` renders `status` as a raw lowercase string — fixtures pass `"open"` / `"locked"`; map to "Open" / "Locked · ฿1,840.00".
- Group row: 40px `rounded/full` monogram, `colors/primary-soft` fill, `colors/primary` initials at 15px/600; name at 15px/600; position line at 13px `colors/ink-muted`; right cluster of 26px avatars at `margin-left: -9px` with a 2px `colors/surface` ring, max 3 + a `+n` chip in `colors/paper` / `colors/ink-muted`. The code renders a bare name + "N members".
- **Row layout rule from §2.3 applies to `:254-266`** — the group name span has no `min-width: 0`, so a long group name pushes "N members" off the edge inside `AppShell`'s `overflow-x: hidden`.
- "Suggested transfers" (`:221-239`) is not in the artboard. Keep it — it is real product value — but move it **below** "Groups" and above "Recent", give it the micro-label "SUGGESTED TRANSFERS", and render each row as an `amount-pair` (`from → to` left, amount right) rather than an interpolated sentence, so the amount lands in the reserved column.

---

### 1.3 Group

**Artboard intent.** Header: chevron + 32px monogram + 20px title. Then a `colors/surface` card containing `amount-lg` (34px) in the state colour, a `meta` sub-line "You owe Maya", and a 48px `Settle up` primary — all in one row. Then "MEMBERS" (5 × 48px avatars with a 13px status dot, name beneath at 12px), "OPEN TABS" (`tab-card`), "ACTIVITY" (4 rows), and a full-width `Start a tab` secondary at the end.

**Code today.** `features/groups/GroupSurface.tsx` (204 lines). **Zero importers.** No route.

**Delta.**
- **Create `app/(miniapp)/groups/[groupId]/page.tsx`.** Server component, `await params`, render `<GroupSurface groupId={groupId} />` inside `AuthGate > AppShell`. Data: `convex/groups.ts:getGroup`, `convex/tabs.ts:listOpenTabsForGroup`, `convex/activity.ts:listForGroup`.
- **The balance card is missing entirely.** Add it as the first element: `colors/surface`, `rounded/md`, 1px `colors/border`, `MYTAB_ELEVATION.cardShadow`, `spacing/5` padding, flex row `gap: 14px`. Left: `amount-lg` 34px/600/`-0.028em` in `colors/owed` | `colors/settled` | `colors/ink`, `line-height: 1.05`, then `margin-top: 5px` for the `meta` sub-line "You owe Maya" / "Maya owes you" / "All square". Right: 48px `Settle up`, `padding: 0 20px`, `colors/primary`, `buttonInset`. Hidden when the position is zero.
- **Members are a list, not a row of avatars.** Replace `:90-118` with a horizontal flex at `gap: 14px`: per member a 60px-wide column — 48px `rounded/full` avatar on `avatarTintForUserId`, 17px/600 white initial, a 13px status dot at `bottom-right` with a 2.5px `colors/paper` ring (`colors/settled` = settled, `colors/owed` = owes), and the name beneath at 12px `colors/ink-muted`, centred, ellipsed. The current "Wallet ready" / "Wallet not set up" text (`:112`) is mechanism on a social surface — **delete it**; a member without a wallet simply cannot be selected as a recipient, which is already handled in `NewTabForm.tsx:30`.
- Section micro-labels at `margin: 28px 0 12px`.
- Trailing action: full-width 48px `Start a tab`, `colors/surface` + 1px `colors/border`, 18px plus glyph at `gap: 8px`, `margin-top: 24px`.
- **`:156` calls `new Date(...).toLocaleDateString()` with no locale** — a hydration mismatch. Use the same relative formatter as `ActivityFeed.tsx:19-33`.
- **`:165-169` shows "Most recent tab highlighted." whenever there is ≥1 tab.** Delete the sentence; the highlight is self-evident.
- `:107` member `<div style={{flex:1}}>` has no `min-width: 0` — apply §2.3.
- Empty members: "No one else has opened this tab yet." in `meta` — the heading currently sits above an empty list.

---

### 1.4 New Tab

**Artboard intent.** Header chevron + "Start a tab". Then, each preceded by a micro-label at 9–12px below it: a focused text field with a `colors/primary` border; a pair of `rounded/full` currency chips at 44px min-height; a row of five 48px payer avatars with a 2px `colors/primary` ring on the selected one and the name beneath; and two side-by-side 12px-radius capture cards ("Scan receipt" / "Add manually") with a 28px icon and a two-line description. Sticky footer: a single 52px `Add items` primary.

**Code today.** `features/bills/NewTabForm.tsx` (119 lines) inside `BillAuthoringSurface.tsx:246`. Reachable only through `/tabs/[publicToken]` in `phase: "setup"`.

**Delta — this surface is the furthest from its artboard of any in the product.**
- **Create `app/(miniapp)/tabs/new/page.tsx`** taking `?group=<id>`, mounting the setup phase directly. Data: `convex/tabs.ts:getGroupDefaults`, `listTabMemberOptions`, `saveTabSetup`, `beginItemEntry`.
- **`mytab-input` is undefined** (`NewTabForm.tsx:41,52,88,105`). Every field on this screen is an unstyled browser input. Define it (§6.3): `colors/surface`, 1px `colors/border`, `rounded/sm`, `padding: 15px 16px`, 16px/500 (16px, not 15px — anything smaller triggers iOS focus-zoom), `colors/ink`; `:focus-visible` → 1px `colors/primary` border and no default outline ring.
- **Currency is a read-only `<p>` (`:56-69`); it must be a chip pair.** Two `rounded/full` chips, `min-height: 44px`, `padding: 0 22px`, 15px/600. Unselected: `colors/surface` / `colors/ink` / 1px `colors/border`. Selected: `colors/primary-soft` / `colors/primary` / 1px `colors/primary`. `gap: 10px`.
- **Payer is a `<select>` (`:81-96`); it must be avatars.** Row of 52px-wide columns at `gap: 16px`: 48px `rounded/full` avatar, 17px/600 white initial; selected carries `box-shadow: 0 0 0 2px colors/primary` — a **ring, never a fill**, so the face stays readable (DESIGN.md `participant-chip`). Name beneath at 12px, weight 600 + `colors/ink` when selected, 400 + `colors/ink-muted` otherwise. Reuse `components/primitives/participant-chip.tsx` at the 48px size.
- **"Recipient asset" and the recipient `<select>` (`:64`, `:98-113`) do not belong on this surface.** The recipient is the payer; the receiving asset is always USDC and is stated on the You surface. Delete both, along with `:115` "Receiving wallet is resolved when the tab is locked — not shown here." — which is mechanism copy on a social screen.
- **Add the two capture cards.** Side-by-side, `flex-grow: 1`, `gap: 12px`, `colors/surface`, `rounded/md`, 1px `colors/border`, `cardShadow`, `padding: 24px 18px`, centred column at `gap: 12px`. Card A: 28px camera outline stroked `colors/primary` at 1.7 — **never a sparkle, wand, or robot** — title "Scan receipt" 15px/600, `meta` 12px "Photograph it, then fix anything wrong", `line-height: 1.4`. Card B: 28px list glyph stroked `colors/ink`, "Add manually", "Type each dish and price". Card A is hidden entirely when `isReceiptScanEnabled()` is false; it is never shown disabled.
- Sticky footer: one 52px `Add items` primary. `BillAuthoringSurface.tsx:212` already labels it "Add items" — keep.
- The merchant field stays; move it under the tab name with the micro-label "WHERE".
- **`ItemEditor` has no validation** (`ItemEditor.tsx`, no `<form>`, no submit, no error slot) and `BillAuthoringSurface.tsx:147-181` will persist `name: ""` at `฿0.00`. Add: Save disabled until name is non-empty after trim and unit price > 0; the reason under the field in `colors/owed` `meta` — "Give it a name." / "Add a price."
- **`AdjustmentsPanel`'s four buttons are visible no-ops** (`AdjustmentsPanel.tsx:59` — `onEdit` is optional and never passed by `BillAuthoringSurface.tsx:299`). Either wire them to `convex/adjustments.ts:upsertAdjustment` through an inline editor, or render the panel read-only. **A visible button that does nothing is worse than an absent one.**
- **`BillEmptyState.tsx:57` "Scan a receipt" is wired to `() => undefined`** (`BillAuthoringSurface.tsx:277`) and does not consult `isReceiptScanEnabled()`. Wire it to §1.5 or remove it.

---

### 1.5 Receipt Review

**Artboard intent.** Header chevron + "Check the receipt" / "Fix anything we got wrong." Sticky `discrepancy-card`. One card holding a `colors/paper` header strip (merchant micro-label left, date right), then per-item rows — 26px qty column, editable name, editable price, with flagged rows outlined 1px `colors/warning` on `colors/warning-soft` — then a totals block. A helper line beneath. Sticky footer: 52px `Confirm receipt`, disabled until it reconciles.

**Code today.** `features/receipts/ReceiptReview.tsx` (243 lines). No route, no importer outside tests.

**Delta.**
- **Create `app/(miniapp)/tabs/[publicToken]/receipt/page.tsx`.** Data: `convex/receipts.ts:getImport`, `confirmReceipt`, `useSampleReceipt`.
- **Copy leaks the data model.** `:171` "Unit price (minor)" and `:205` "Receipt total (minor)" are shown to a person standing in a restaurant. Replace with "Unit price" and "Receipt total", both in baht, and move the minor-unit conversion behind `bahtToMinor` (`ItemEditor.tsx:91`).
- **`:29-38` hardcodes `rgba(154, 98, 9, 0.06)`** in violation of `lib/theme/tokens.ts:1-3`. Use `colors/warning-soft` (`#FBF1E0`) with a 1px `colors/warning` border, `rounded/md`, `spacing/5` padding.
- `discrepancy-card` layout: 20px warning triangle, `flex-shrink: 0`, `margin-top: 1px`, `gap: 12px`, text at 14px/500 `colors/warning` `line-height: 1.45`. Copy from `lib/domain/receiptParse.ts:122` is correct — keep it, and append "Check the highlighted rows." so the sentence names its next action.
- **It must dismiss itself and never be dismissible.** `:19-21` already returns `null` on reconcile — correct. Do not add a close control.
- Add the merchant/date header strip: `colors/paper` fill, `padding: 13px 16px`, bottom hairline; merchant as micro-label left, date at 13px `colors/ink-muted` right.
- Flagged rows: the *fields* carry the outline, not the row — 1px `colors/warning` + `colors/warning-soft` on the name and price inputs, `rounded: 7px`, `padding: 5px 8px`, `margin: -5px -8px` so the text does not shift when the flag clears. `:122` currently tints the whole `<li>`.
- Add the totals block inside the same card: Subtotal / Service charge 10% / VAT 7% at 14px `colors/ink-muted` label + 14px/500 amount, then a `colors/border` rule at `padding-top: 11px` and Total at 15px/600.
- Add the helper line, `margin-top: 14px`, 13px `colors/ink-muted`, state-driven: mismatched → "Two rows were hard to read. Tap either one to correct it."; reconciled → "Everything reconciles. Confirm to turn these into claimable items."
- **"Use sample receipt" must be gated behind `isDemoModeEnabled()`.** The artboard shows it as a visible link; EXPERIENCE calls it "deliberately hidden from judges". §8 records the disagreement. Render it only when the flag is on, as a centred 13px `colors/primary` text link 12px below the footer action.
- Confirm button disabled state: `colors/paper` fill, `colors/ink-muted` label, 1px `colors/border`, `cursor: not-allowed`. Never a greyed-out blue.

---

### 1.6 Claim Board — the surface the demo is judged on

**Artboard intent.** Header row: chevron + a two-line title block (20px name, 13px status line) + a right-hand `presence-stack` of 24px avatars at `-8px` with a 2px `colors/paper` ring and a 6px `colors/settled` dot. One card of full-bleed rows: qty at 13px/500 `colors/ink-muted` and name at 15px/500 on the baseline, an avatar row 7px beneath at 22px / `-6px` with a 2px ring in the row's own background colour, and the per-head caption 12px to its right. Right column: price `amount-row` and, 7px beneath, a `rounded/full` state tag ("Claim" / "Yours" / "Taken"). Unclaimed rows carry a 3px `colors/warning` left edge and drop `padding-left` to 11px. Viewer-owned rows take a `colors/primary-soft` fill. A helper line below the card. Sticky footer: a 13px reconciliation line, then "Your share" 13px over `amount-md` 24px beside a 48px state-driven action.

**Code today.** `features/claims/ClaimBoard.tsx` (318 lines) — a good component. **Zero importers.** `/tabs/[publicToken]` renders `BillAuthoringSurface` instead.

**Delta.**
- **Repoint `app/(miniapp)/tabs/[publicToken]/page.tsx` at the Claim Board.** This is the highest-value single change in the document: EXPERIENCE says `[Open tab]` "always lands on the Claim Board for that specific tab", and Flows 2, 3 and 4 all begin there. Authoring moves to `/tabs/new` (§1.4) and to an organizer-only "Edit items" entry from the Claim Board header.
- **Hide the tab bar.** `AppShell hideTabBar` — a deep-linked Claim Board hides it entirely (EXPERIENCE, IA). Already correct in `TabDeepLinkSurface.tsx:69`; carry it over.
- **Rename one of the two `ClaimBoard`s.** `features/claims/ClaimBoard.tsx` and `features/settlement/ClaimBoard.tsx` export the same name with unrelated props. The settlement one is the per-person settlement ring — rename it `SettlementProgress` and move it to `components/settlement-progress/`.
- **Grammar bug, `:79-84`:** `` `${count} ${count===1?"item":"items"} need an owner` `` renders "1 item need an owner". Pluralise the verb too: 1 → "1 item needs an owner", n → "n items need an owner".
- **`:224-236` is the second-worst amount clip in the build.** The footer amount span carries `flex: 1` while the action button is unconstrained, so a long label like "3 items need an owner" squeezes the 24px figure. Invert it: the amount block is `flex: none` with `white-space: nowrap`; the action is `flex: 1` with `min-width: 0` and its label ellipsed. Apply §2.3.
- `:178-186` item rows and `:102-103` the header both need `min-width: 0` on the text side and `flex: none` on the amount.
- **Add the state tag column.** Absent from the code. 12px/600, `letter-spacing: 0.01em`, `padding: 4px 10px`, `rounded/full`. "Claim" → `colors/primary` on `colors/surface` with 1px `colors/border`. "Yours" → `colors/primary` on `colors/primary-soft`, borderless. "Taken" → `colors/ink-muted` on `colors/surface` with 1px `colors/border`. When locked, only "Yours" survives; the others render as empty space, not as greyed chips.
- **Add the helper line** beneath the card, `margin-top: 12px`, `padding: 0 4px`, 13px `colors/ink-muted`, `line-height: 1.5`: unlocked → "Tap a dish to claim it. Two people on the same dish split it — nobody gets bumped."; locked → "Maya locked this bill. Amounts are final." This sentence is doing the single most important teaching job in the product and it is currently absent.
- Presence stack: **never shows the viewer**, max 3 + `+n`, absent entirely when the viewer is alone — no "1 person here". `:112-134` is close; add the 6px `colors/settled` dot at `gap: 6px` to the right of the stack.
- **Delete `:108-110` "Revision {n}".** It is a debugging affordance on a consumer surface.
- The stale notice at `:136-140` takes its copy from the caller and has no default. Set it: "That changed a moment ago." — `meta`, `colors/ink-muted`, one line, no dismiss, no modal.
- Row padding: `13px 14px`, `13px 11px` when the 3px warning edge is present, so the text baseline does not move. `border-bottom: 1px solid colors/border`, last row none.
- Scroll padding: the list needs `padding-bottom: 200px` (artboard) so the footer never covers the last row; `:143` uses 120px, which is short of the two-line footer.
- **Empty items:** `:144` maps with no guard. Organizer → "Add what you ordered." with both capture actions. Participant → "Maya is adding the bill. You can stay here — it will appear automatically." Both already exist in `BillEmptyState.tsx:27,40` — reuse them here.
- **Haptics:** `impactOccurred('light')` on every claim/unclaim toggle. Nothing fires today (§2.8).
- **Motion:** avatar arrival, §5.1. Nothing animates today.

---

### 1.7 Bill Review

**Artboard intent.** Header chevron + "Review bill" / "Sukhumvit Dinner · 5 people". "WHO OWES WHAT" micro-label over a card of five expandable person rows — 32px avatar, name 15px/500, total 15px/600, a chevron that rotates 90° — expanding in place to an indented block at `padding: 4px 16px 16px 60px` of 13px `amount-pair` lines: Items / Service charge 10% / VAT 7% / Group tip / Rounding (in `colors/warning`) / Their share (in `colors/ink`). Then "APPLIED TO EVERYONE" over a totals card with a `proportional` annotation at 12px `colors/ink-muted` beside each shared charge. Then the reconciliation line: an 18px `colors/settled` check + "Everyone's shares add up to ฿1,840.00" at 14px/500 `colors/settled`. Sticky footer: role-driven action plus a 13px note beneath it.

**Code today.** `features/claims/BillReview.tsx` (222 lines). No route.

**Delta.**
- **Create `app/(miniapp)/tabs/[publicToken]/bill/page.tsx`.** Data: `convex/allocations.ts:getBillReview`, `lockBill`.
- **`:64` says "Bill review — read only".** That is a mechanism label. Replace with "{tabName} · {n} people" at 13px `colors/ink-muted` under a 20px "Review bill" title. Read-only-ness is expressed by the absence of edit affordances, not by a caption.
- **`:139` hides negative rounding** (`roundingMinor > 0`), and `:132` hides negative discounts. A −฿0.01 adjustment then makes the expanded lines fail to sum to the shown total, which is precisely the trust failure the Money Legibility section exists to prevent. Show any non-zero value, signed, `colors/warning` for rounding.
- Rounding label is "Rounding" with the value signed: "+฿0.01" / "−฿0.01". The line only appears when non-zero.
- Add the `proportional` annotation to Service charge, VAT and Group tip in the "Applied to everyone" card — 12px `colors/ink-muted`, `margin-left: 6px`, inline with the label. It is the one word that explains the whole allocation model.
- **The viewer's own row takes a `colors/primary-soft` fill**, header and expanded panel both, so a person finds themselves without reading. Absent from the code.
- Chevron rotates `0deg → 90deg` over 140ms `ease` (§5.5), instant under reduce-motion.
- Reconciliation line: `margin-top: 18px`, `gap: 9px`, 18px check stroked `colors/settled` at 2.4. Failure copy: "Shares are ฿{shortfall} short of ฿{total}. Lock is blocked." — name the exact shortfall (FR-M6); `:162` currently says only "Shares do not reconcile — lock is blocked".
- **Add a stale-revision line.** `ClaimBoard.tsx:109` shows a revision; this surface shows none, so a participant reading a superseded breakdown has no signal. Use the §4 copy, not a revision number.
- **Add the "Locking creates each person's final amount. Editing after this needs a reopen." note** beneath the organizer's action, 13px `colors/ink-muted`, centred, `line-height: 1.45`, `margin-top: 10px`. It exists in the artboard and not in the code; it is the sentence that makes lock feel deliberate.
- Participant-before-lock note: "Waiting on Maya to lock." Participant-after-lock: "Maya locked this bill. Your amount is final."
- `AmountPair` needs the §2.3 treatment — `amount-pair.tsx:25` has no `min-width: 0` and `:26` no `flex: none`, and `:78` wraps it in `overflow: hidden`, so a long display name silently clips an amount.
- **Haptics:** `impactOccurred('medium')` when the organizer confirms the lock.

---

### 1.8 Payment Sheet

**Artboard intent.** The surface behind holds at 55% opacity under a `rgba(10,32,56,0.38)` scrim. The sheet: `rounded/lg` top corners, `0 -8px 32px rgba(10,32,56,0.12)`, `padding: 10px 20px 22px`, a 36×4 `colors/border` grab handle. Then `amount-lg` 34px + "your share of Sukhumvit Dinner" at 13px; a recipient row bounded top and bottom by hairlines with a 34px avatar, "To Maya" 15px/500, "receives USDC" 13px right; "PAY WITH" over two `rounded/full` token chips (name 15px/600, balance 12px `colors/ink-muted`); two disclosed lines — "You spend" and "Maya receives at least" (the latter 15px/600 `colors/settled`); a `rounded/sm` round-up row with a terracotta glyph; a `disclosure-row` bounded by hairlines; the countdown, centred; and a 52px action.

**Code today.** `components/settlement-sheet/PaymentSheet.tsx` (180 lines) + `features/settlement/ObligationPaymentSheet.tsx`. No route, no sheet presentation, no scrim, no handle.

**Delta.**
- **Present it as a sheet.** Today it is a bare `<section>`. Build `components/settlement-sheet/SheetContainer.tsx`: fixed overlay, scrim `rgba(10,32,56,0.38)`, sheet pinned to the bottom, `colors/surface`, `border-radius: 20px 20px 0 0`, `MYTAB_ELEVATION.sheetShadow`, 36×4 `colors/border` handle at `margin: 0 auto 20px`, `max-height: calc(var(--app-height) - 64px)`, inner scroll with `overscroll-behavior: contain`, bottom padding `calc(22px + var(--app-pad-bottom))`. Present/dismiss per §5.4. Focus trap; `Escape` and scrim tap dismiss **only before Pay**.
- **Key it to a search param — `?settle=<obligationId>`** — so Telegram's BackButton dismisses it and a reload restores it.
- **The countdown is not live.** `PaymentSheet.tsx:77` takes `quoteRemainingMs` as a static prop; there is no timer anywhere in the repo except `AuthGate.tsx:65`. Wire `lib/settlement/quoteCountdown.ts` — which already exports `formatQuoteCountdown`, `isQuoteCountdownWarning` and `isQuoteExpired` and **has zero importers** — to a 1000ms interval that clears on unmount and on expiry. Delete the duplicate `formatCountdown` at `:61-66` and the inlined `10_000` threshold at `:136`.
- **Primary lines are labelled wrong.** `:123` "Maximum you spend" belongs in the disclosure, not on the face. The face reads "You spend" with the approximate figure ("≈ 0.0412 SOL"); "Most you can spend" moves inside the `disclosure-row`. `:124` "Minimum they receive" becomes "**Maya** receives at least" — naming the person is the entire point (EXPERIENCE, Voice and Tone).
- `:43` "Fees and details" → "**Fees and network**". Note the artboard says "Route, fees and network" — **`route` is a banned word**; §8 records the correction.
- Disclosure contents, in order, as `amount-pair`s on a `colors/paper` inset at `rounded/sm`, `padding: 14px`, `gap: 9px`: "Network fee" → "Covered by My Tab" in `colors/settled` (never a zero); "Rate" → "฿35.36 per USDC"; "Most you can spend" → the max. **No fee line of any kind** — `PLATFORM_FEE_BPS` is zero and a placeholder must not be designed.
- **Collapsed on every open, including repeat visits.** `:14` already defaults to `false` — never persist it.
- Token chips: `rounded/full`, `flex-grow: 1`, `padding: 12px 14px`. Selected → `colors/primary-soft` + 1px `colors/primary`, name in `colors/primary`. Unselected → `colors/surface` + 1px `colors/border`. Unaffordable → **disabled with the balance still visible**, `opacity: 0.55`, never hidden. `PaymentTokenSelector.tsx:32-57` is correct; it needs `min-height: 44px` (it has `min-width: 44px`) and roving `tabIndex` + arrow keys for its `radiogroup`.
- **No token logos, ever.**
- Round-up row: `rounded/sm`, `padding: 12px 14px`, 18px terracotta glyph, label "Round up to ฿300" 14px/500, amount "+฿8.27" right. Off → 1px `colors/border` on `colors/surface` with the amount in `colors/ink-muted`. On → 1px `colors/tip` on `colors/tip-soft` with the amount in `colors/tip`. **`RoundUpControl.tsx:37` hides the amount when off** — the person cannot see what they are being offered. Always show it.
- Quote states: live → "Quote refreshes in 0:42" `colors/ink-muted`; ≤10s → same string, `colors/warning`, weight 600; expired → "Quote expired. Refresh it." and the action becomes "Refresh quote", with **the amounts held at 40% opacity, never blanked**. `:102-103` already does the 0.4 dim — add `transition: opacity 160ms ease` so it does not snap, and exempt it under reduce-motion.
- Action label is "**Pay ฿291.74**", not "Pay" (`:175`). The amount on the button is the last thing a person reads before approving.
- Stale revision replaces the whole sheet body (`ObligationPaymentSheet.tsx:63`) — correct. Its copy is right at `RoundUpControl.tsx:87`. Give the button the label "Refresh bill", not "Refresh".
- `ObligationPaymentSheet.tsx:47-52` hardcodes `#5A6672`; use `colors/ink-muted`. `:39-41` contains a `.replace()` for a prefix nothing produces — delete it.
- **No haptic on Pay.** Correct — the haptic fires on *confirmation*, not on submission.

---

### 1.9 Payment Progress

**Artboard intent.** Full-bleed `colors/paper`, no header, no tab bar. Vertically centred: `amount-lg` 34px + "to Maya" at 15px, 44px gap, then a 4-step vertical stepper — 26px dots with a 2px border and a 2px × 18px connector, label 15px with weight and colour by state, note 13px `colors/ink-muted` beneath, `padding-bottom: 22px` per step. A centred foot-note above the actions.

**Code today.** `components/settlement-sheet/PaymentProgress.tsx` (99 lines) + `SettlementStepper.tsx` (83 lines). No route. Dots are 20px and flat.

**Delta.**
- **Create `app/(miniapp)/pay/[intentId]/page.tsx`**, full-bleed, `hideTabBar`, `BackButton.hide()` — the surface is forward-only.
- **`lib/settlement/stepperCopy.ts:51-52` is a correctness bug.** `SETTLEMENT_STATUS` has ten values; `STEPPER_STAGES` maps four. `created`, `quoting`, `expired` and `superseded` fall through `stageIndex === -1` to `resolvedIndex = 0`, so **an expired or superseded payment renders as "Approved in your wallet — active"**. Add explicit branches: `created`/`quoting` → the sheet, not this surface (route back); `expired` → "Quote expired. Refresh it." with a single "Back to the sheet" action; `superseded` → "This bill changed. Refresh to see your new amount." with "Back to tab".
- **`PaymentProgress.tsx:44` shows "Sending payment" above the `unknown` copy**, which reads as a contradiction next to "Still checking — don't pay again". Make the heading state-driven: `unknown` → "Still checking"; `failed` → "Payment did not go through"; otherwise → "Sending payment". Better still, replace the heading with the artboard's centred `amount-lg` + "to Maya" — the amount is the heading.
- **Add the amount block.** Absent entirely. `amount-lg` 34px/600/`-0.028em`, centred, then `margin-top: 8px` for "to Maya" at 15px `colors/ink-muted`, then `margin-bottom: 44px`.
- Stepper geometry: dots 26px (not 20px), `border: 2px solid`, connector `width: 2px; min-height: 18px`. Complete → `colors/settled` fill, `colors/settled` border, 13px white check at stroke 3.2. Active → `colors/surface` fill, `colors/primary` border, gently pulsing (§5.6). Pending → `colors/paper` fill, `colors/border` border. Failed → `colors/owed` fill and border with a white cross.
- Connector colour: `colors/settled` above the active step, `colors/border` below.
- Step notes, from `stepperCopy.ts`, are right — add the active-state notes the artboard carries: step 1 "Waiting for you to approve", step 2 "Checking the amount and who it goes to", step 3 "Usually takes a few seconds", step 4 complete "Maya received 8.25 USDC".
- Foot-note, centred, 13px `colors/ink-muted`, `line-height: 1.5`: in flight → "You can close this — we'll update the tab either way."; `unknown` → "Still checking — don't pay again."; failed → "Nothing left your wallet. Your share is unchanged."; confirmed → "Your share of Sukhumvit Dinner is settled."
- Actions: failed → a 52px `Try again` primary above a 44px `Back to tab` text action. Confirmed → one 52px `Back to tab` in `colors/surface` + 1px `colors/border`. In flight → **no action at all**, and no cancel.
- **`unknown` must never offer retry.** `PaymentProgress.tsx:53` gates the button pair on `failed` only — correct; keep it that way.
- **The docblock at `:15` claims non-dismissibility and nothing enforces it.** Enforce it: `BackButton.hide()`, no in-app chevron, and `router.replace` on entry so the browser back stack cannot return to the sheet.
- **Haptics:** `notificationOccurred('success')` exactly once on the transition into `confirmed`, latched by intent id.
- **Motion:** the check draw, §5.2.

---

### 1.10 All Square

**Artboard intent.** Full screen. An apricot wash over the top 46% fading into `paper`. Centred: an 84px white ring with a 2px `colors/tip` border and a 40px terracotta check that draws itself; "All square" at `amount-hero` 42px; "Sukhumvit Dinner · ฿1,840.00" at 15px `colors/ink-muted`; an 18px ring glyph + "5 of 5 settled" at 15px/600 `colors/settled`; five 40px avatars at `-10px` with 3px `colors/paper` rings; "Your group tab. Settled." at 16px/500. Bottom: a 52px `Share to group` primary and a 44px `Done` text action.

**Code today.** `features/balances/AllSquareCard.tsx` (160 lines). Unreachable — `showAllSquare` / `allSquareBill` are never passed.

**Delta.**
- **Wire the trigger.** It fires on a **bill-completion transition**, subscribed live — never on mount with an already-complete bill, never from the group net-zero calculation. Guard with a `localStorage` key `mytab.allsquare.<billId>` so a reload cannot replay it, in addition to the existing `sessionStorage` guard at `:18-30`.
- Present it as a full-bleed overlay above the Claim Board and above Tabs, not as an in-flow card.
- **`:110` sets `gap: "-8px"`, which is invalid CSS and silently dropped.** The overlap actually comes from `marginLeft` at `:130`. Remove the invalid property.
- **`:101` renders an amount without tabular numerals** — no `mytab-tabular`, no `data-mytab-amount`. Add both. §2.3 makes this moot once tabular figures are global, but fix the attribute anyway.
- Add the missing pieces: the "5 of 5 settled" row with its 18px ring glyph, the "Your group tab. Settled." line, and the `Share to group` primary with its 18px up-arrow glyph. Only "All square", the meta line, the avatars and `Done` exist today.
- `Share to group` posts the completion card via the bot. `Done` dismisses. `Done` is a text action in `colors/ink-muted`, not a second button.
- **The wash needs two tokens DESIGN.md does not have**: `tip-wash-top: #F6E9DC` and `tip-wash-mid: #F7EFE7`, used only here. `linear-gradient(180deg, tip-wash-top 0%, tip-wash-mid 45%, paper 100%)` over `height: 46%`. §8 records this.
- Empty members renders 24px of dead space (`:104-137`) — guard it.
- **Motion:** §5.3. The existing `:61` reduce-motion guard drops the gradient entirely; it should keep the wash and drop only the animation.

---

### 1.11 Tip Composer

**Artboard intent.** Header chevron + "Send a tip". "TO" over a horizontally scrolling row of 52px participant chips. A centred `amount-hero` 42px with "to Maya" at 13px beneath. A row of five 44px `rounded/full` preset chips. A note field, then six 44px reaction chips. A "Paying with USDC / Maya receives USDC" card with a chevron. Sticky footer: 52px `Send tip` with a terracotta arrow glyph.

**Code today.** `features/tips/TipComposer.tsx` (377 lines). No route. `/tips/new` is a 404 linked from the home screen.

**Delta.**
- **Create `app/(miniapp)/tips/new/page.tsx`** taking `?to=<userId>` and `?group=<id>`. Data: `convex/settlements.ts:createTipIntent`, `refreshTipIntent`.
- **`:100-114` allows double submission.** The button stays enabled and `createIdempotencyKey()` mints a *new* key per press, so idempotency does not protect it. Disable on submit, show "Sending…" in place of the label, and hoist the idempotency key to a `useRef` created once per composed tip.
- **`:89-98` swallows an invalid custom amount silently.** Add a field error in `colors/owed` `meta` under the input: "Enter an amount above ฿0."
- **Empty eligible members** (`:56-65`): the screen renders "To" over nothing, a hero of `฿100.00`, and the word "to" with no name. Add the empty state from §4.
- `:355` hardcodes `#F1CBB2` for the arrow glyph. This is the artboard's value; add it to DESIGN.md as `tip-on-primary` or restroke the glyph in `colors/tip-soft`. §8 records this.
- Preset chips: `min-height: 44px`, `rounded/full`, 14px/600, `flex-grow: 1`, `gap: 8px`. Selected → `colors/primary-soft` / `colors/primary` / 1px `colors/primary`. The fifth chip is "Custom" and is never pre-selected.
- Reaction chips: `min-height: 44px`, `rounded/full`, 20px glyph. Selected → `colors/tip-soft` + 1px `colors/tip`. Tapping the selected one clears it.
- The "Paying with USDC" card carries a chevron in the artboard but has nowhere to go — there is one payment asset for tips. **Remove the chevron**, keep the card as a statement.
- `participant-chip.tsx:58-66` has no truncation on the name inside a 56px column — names over ~7 characters overflow. Add `min-width: 0`, ellipsis, and `text-align: center`.
- `participant-chip.tsx:53` writes `box-shadow: 0 0 0 0 transparent` specifically so a transition *could* run, and declares none. Leave it un-animated — chip selection is an instant state swap (§5.7).
- **Members without a wallet are filtered out silently** (`:56-65`), so a person wonders why a friend is missing. Show them, disabled, with "Hasn't opened My Tab yet" at 12px `colors/ink-muted` beneath the name.
- **No haptic on "Send tip".** Correct — the haptic fires on confirmation.

---

### 1.12 Activity

**Artboard intent.** 20px "Activity" title at `padding: 24px 16px 12px`. Then, per day, a micro-label ("TODAY", "YESTERDAY") over one card of rows: a 32px `rounded/full` icon tinted by event kind, the sentence at 14px `line-height: 1.35`, and a right column holding a 14px/600 amount over a 12px `colors/ink-muted` timestamp. A row expands in place to an indented panel at `padding: 2px 16px 16px 60px` with From / Received / Network fee `amount-pair`s and an explorer link.

**Code today.** `features/balances/ActivityFeed.tsx` (169 lines), mounted at `/activity`.

**Delta.**
- **Add day grouping.** The code renders one flat list. Group by local day, `margin-bottom: 22px` per group, micro-label above each: "TODAY", "YESTERDAY", then a formatted date.
- **The amount and the timestamp are alternatives, not a stack** (`:87-93` renders amount *or* time). The artboard stacks them: amount at 14px/600 in the kind colour, `margin-top: 2px`, timestamp at 12px `colors/ink-muted`. Quiet events (a lock, a claim) render no amount and the timestamp sits alone in the same column.
- **`:56` grid `32px 1fr auto` has no `min-width: 0` on the `1fr` track**, so a long summary squeezes the amount — this is the reported "42.10 USDC" truncation. Apply §2.3.
- Icon tints, by kind: settle → `colors/settled-soft` bg, `colors/settled` fg; tip → `colors/tip-soft` / `colors/tip`; quiet → `colors/sunk` / `colors/ink-muted`. The amount colour follows: settle → `colors/settled`, tip → `colors/ink`, quiet → `colors/ink-muted`.
- **Replace the emoji glyphs.** `lib/domain/activityTypes.ts:48-66` returns `"↗"`, `"♥"`, `"—"`, `"🔒"`, `"📄"`, `"฿"`, `"•"`. A padlock emoji and a heart are not this product's register. Use 14px stroked glyphs in the tint's foreground colour: arrow-up-right (settled), arrow-up-with-dot (tip), lock outline (locked), receipt outline (bill ready), plus (claim), dot (other).
- Expanded panel: From / Received / Network fee ("Covered by My Tab" in `colors/settled`) as `amount-pair`s at 13px, then "View on explorer" at 13px `colors/primary`. `:118` has the link; the three lines above it are missing.
- **`/activity` never passes `loading`** (`activity/page.tsx:16`), so the skeleton at `:134-150` is dead. Wire it.
- **No error state anywhere in the file.** Add per §4.
- **No offline state.** Add the inline bar.
- The `/activity` page renders `<ActivityFeed>` raw with no title and no vertical rhythm (`activity/page.tsx:16`). Add the 20px title at `padding: 24px 16px 12px`.

---

### 1.13 You

**Code today.** `app/(miniapp)/you/page.tsx` renders `<h1>You</h1>` and "Your receiving preference and profile." That is the entire surface.

**Delta.** Designed in full in §3.
## 2. The "native, not webview" system

The single largest defect in the build is not any one screen. It is that the app announces itself as a web page inside Telegram. Nine changes remove that, and they are cheap relative to what they buy.

### 2.1 Chrome colour matching — the seam

Telegram paints three surfaces the app does not own: the header above it, the background behind it, and the bottom bar below it. Right now all three are Telegram's dark navy and the app is `paper`. That contrast line across the top of the screen is what makes it read as a pasted-in webview.

Call these on bootstrap, before first paint, and again on every `themeChanged` event (Telegram re-asserts its own colours when the user switches theme):

| Call | Value | Why |
|---|---|---|
| `WebApp.setHeaderColor('#F4F7FA')` | `colors/paper` | The header becomes a continuation of the canvas. Telegram derives its own icon contrast from this value; at L=96 it picks dark glyphs, which is what we want. |
| `WebApp.setBackgroundColor('#F4F7FA')` | `colors/paper` | The overscroll gutter and the pre-mount frame. |
| `WebApp.setBottomBarColor(...)` | Two values only — see below | The strip between the app and the home indicator. |

`setBottomBarColor` is per-surface and takes exactly two values, never more:

- `#FFFFFF` (`colors/surface`) on every surface whose bottom-most element is a tab bar or a sticky footer: Tabs, Activity, You, Claim Board, Bill Review, New Tab, Receipt Review, Tip Composer, Payment Sheet.
- `#F4F7FA` (`colors/paper`) on the three surfaces that end in canvas: Launch, Payment Progress, All Square.

Set it in a single `useBottomBarColor(color)` hook called once per surface. A surface that forgets to call it inherits the previous value, which is the failure mode to test for.

Guard every call: these are Bot API 6.9 / 7.10 features. Feature-detect on `WebApp.isVersionAtLeast()`, and no-op silently outside Telegram. A thrown `WebAppMethodUnsupported` on an old client must not break the render.

### 2.2 First paint — no white flash, no shift

Three separate causes, three separate fixes.

**Flash.** The paper background must exist in the server-rendered document, before any CSS bundle or SDK call lands. Put it on the elements themselves in `app/layout.tsx`:

```
<html lang="en" style={{ background: "#F4F7FA" }}>
  <head><meta name="theme-color" content="#F4F7FA" /></head>
  <body style={{ background: "#F4F7FA", margin: 0 }}>
```

Do not rely on a StyleX rule, an Astryx theme token, or `setBackgroundColor` for this. All three arrive after the first paint.

**Viewport.** `app/layout.tsx` exports no `viewport` object, so Next emits only its default `width=device-width, initial-scale=1`. Add `export const viewport` with exactly:

```
width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no
```

`viewport-fit=cover` is what makes `env(safe-area-inset-*)` non-zero. Without it the entire `env()` fallback path in `useSafeAreaInsets.ts:31` resolves to `0px` — which is why that hook's careful DOM probe currently returns nothing useful outside Telegram, and why the sticky footer sits under the home indicator. `user-scalable=no` stops the double-tap zoom that makes a Mini App feel like a page.

**Font shift.** `lib/theme/fonts.ts:2` already loads Instrument Sans 400/500/600 through `next/font/google` with `display: 'swap'`, self-hosted, with Next's `adjustFontFallback` metric override on by default. Two things are missing:

- **Thai glyphs.** Instrument Sans has none, and receipt item names are Thai — `ผัดไทยกุ้งสด` is in the canonical fixture (`ReceiptReview.dc.html`). Add `Noto Sans Thai` (400/500/600) as a second `next/font/google` family, expose it as `--font-noto-thai`, and put it **second** in `MYTAB_TYPOGRAPHY.family` (`lib/theme/tokens.ts:58`), before the generic fallbacks. Without it the Thai rows fall through to a system face with different metrics and different vertical proportions, in the middle of a card whose whole job is looking exact.
- **Line height for Thai.** Set `line-height: 1.4` minimum on any element that can hold an item name — Claim Board rows, Receipt Review name fields, Item rows. Thai ascenders and tone marks clip at the 1.2 that a 15px Latin line gets away with. `ItemRow.tsx:38` already uses 1.45; make it the rule.

**Layout shift on data arrival.** This is the same bug as the horizontal clipping (§2.3) and is fixed by the same rule: the amount column is a reserved column, not content-sized. Skeletons paint inside that reserved column, so the real figure lands exactly where the placeholder was.

Skeleton rules:
- Fill is `colors/sunk` (`#EDF2F7`), `rounded/sm`, **static**. No shimmer, no pulse — EXPERIENCE bans skeleton shimmer and a pulsing rectangle is the most common webview tell in this category.
- A skeleton amount is `height: 1em`, right-aligned inside the reserved amount column, `width: 5.5ch` for `amount-row` and `7ch` for `amount-md`/`amount-lg`, with `font-variant-numeric: tabular-nums` inherited so `ch` resolves to the tabular figure advance.
- Skeleton row geometry must match the real row to the pixel: same padding, same hairline, same avatar diameter, same number of rows as the last known count (or 3 when unknown).
- Skeletons appear **only on first paint of a surface with no cached data**. Convex reactivity replaces content in place afterwards; a skeleton over already-correct data is a defect (EXPERIENCE, *State Patterns*).

### 2.3 Horizontal clipping — the amount column

Amounts truncate today ("฿291.7", "42.10 USDC") because rows are flex containers where the amount is allowed to shrink. Amounts are the one thing in this product that may never truncate.

**The rule, applied to every row in the product:**

```
.row            { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 12px; align-items: baseline; }
.row__label     { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row__amount    { flex: none; white-space: nowrap; font-variant-numeric: tabular-nums;
                  font-feature-settings: "tnum" 1; text-align: right; }
```

Three invariants:
1. **`min-width: 0` on every flex/grid child that holds a name.** Without it a grid/flex child's automatic minimum size is its content, so the name pushes the amount off the edge instead of ellipsing. This is the actual cause of the observed truncation.
2. **`flex: none` + `white-space: nowrap` on every amount.** The amount column sizes to its content and never compresses. Names truncate; amounts do not. This is EXPERIENCE, *Responsive & Platform*, stated as a hard rule.
3. **`font-variant-numeric: tabular-nums` set once on `:root`** and never unset, so the whole product inherits it — including skeletons, inputs, and the Telegram-supplied fallback font.

Then add a 320px guard: `html, body { overflow-x: hidden; }` is a symptom mask, not a fix — instead add a dev-only assertion in the app shell that logs when `document.documentElement.scrollWidth > clientWidth`, and test every surface at 320px.

Screen gutters stay at `spacing/4` (16px) at every width. Do not reduce them at 320px; reduce the label column instead.

### 2.4 Back: Telegram's BackButton, never both

**Recommendation: Telegram's `BackButton` is the back affordance whenever it is available. The in-app chevron renders only when it is not.**

Implement one hook and use it on every non-root surface:

```
useBackAffordance({ onBack })  →  { showInAppChevron: boolean }
```

- Inside Telegram (`WebApp.isVersionAtLeast('6.1')`): `BackButton.show()` on mount, `BackButton.onClick(onBack)`, `BackButton.hide()` + `offClick` on unmount. Returns `showInAppChevron: false`.
- Outside Telegram, or on a client that does not support it: returns `showInAppChevron: true` and the surface renders the 24px chevron at the 16px gutter.
- On the three tab roots (Tabs, Activity, You) the hook is not called at all and `BackButton.hide()` is asserted by the shell, so a stale button from a previous surface never survives.

Why Telegram's, not ours: after §2.1 the Telegram header is our header. Using the control that already lives there removes a 36px-wide chevron and its 12px gap from the header row of nine surfaces — which is also 48px of horizontal space returned to the title, at 320px the difference between "Sukhumvit Din…" and "Sukhumvit Dinner". A back control in a colour-matched native header is the strongest single "this is an app" signal available.

Consequence for the header row: on Telegram, the header becomes title-only, left-aligned at the 16px gutter, no chevron, no back-arrow gap. Titles shift left by 36px. Every artboard that draws a chevron (Group, New Tab, Receipt Review, Bill Review, Claim Board, Tip Composer) is showing the standalone-browser fallback, not the Telegram case.

Android's system back gesture already maps to `BackButton`, so no extra handling.

### 2.5 MainButton vs the sticky footer

**Recommendation: keep the in-app sticky footer. Never show Telegram's `MainButton`.** Assert `MainButton.hide()` and `SecondaryButton.hide()` once at bootstrap so a stale button from a previous session can never appear.

The reasoning, in order of weight:

1. **The footer is not a button.** `sticky-claim-footer` carries three things: a `meta` reconciliation line, an `amount-md` running subtotal, and the action. `MainButton` renders one label. Moving the running subtotal off the footer to accommodate it would invert the product's first principle — amount, then person, then mechanism — on the surface where it matters most.
2. **Disabled states need a stated reason.** "Finish claiming" disabled with "2 items need an owner" beneath it is the designed behaviour. `MainButton` can be disabled but cannot carry the reason, and EXPERIENCE forbids a blank or hidden action.
3. **It would be the one control that is not ours.** `MainButton` uses Telegram's radius, height, weight and font. Every other control in the product is Instrument Sans 600 at `rounded/sm` with `inset 0 -1px 0 rgba(10,32,56,0.24)`. One foreign-looking button on the most-used surface reads as a webview tell, not as native integration.
4. **Consistency beats platform mimicry.** Eight surfaces carry a primary action. A mix — MainButton where it fits, in-app footer where it does not — is worse than either choice applied uniformly.

What the footer must then do to earn the comparison:

- `position: sticky; bottom: 0` inside the surface's flex column. **Never `position: fixed`.** On Android, Telegram resizes the viewport when the keyboard opens; a fixed footer detaches and floats over the keyboard, a sticky one rides the resize. This is an explicit EXPERIENCE requirement.
- Bottom padding: `calc(12px + max(var(--tg-safe-area-inset-bottom, 0px), env(safe-area-inset-bottom, 0px)))`.
- Background `colors/surface`, top hairline `colors/border`, and the matching `setBottomBarColor('#FFFFFF')` from §2.1 so the strip below it is the same white.
- The action is `min-height: 52px` on task surfaces, `48px` where it sits beside the subtotal on the Claim Board. Never below 44px.
- Focus order: the footer action is **last** in traversal on every surface.

### 2.6 Swipe-to-close, expand, fullscreen, closing confirmation

| Call | Decision | Reason |
|---|---|---|
| `WebApp.expand()` | **Always, at bootstrap.** | The app opens at full height instead of the half-sheet, so the first thing a person sees is a full screen rather than a peek. |
| `WebApp.disableVerticalSwipes()` | **Always, at bootstrap.** | Every primary surface scrolls. Telegram's vertical swipe-to-close fires on a downward drag at `scrollTop: 0`, which is exactly the gesture someone makes scrolling back up a claim board. Losing swipe-to-close is acceptable: Telegram's header Close remains, and this is a task surface, not a browsing one. Without this the app will close mid-claim during the demo. |
| `WebApp.requestFullscreen()` | **Never.** | Fullscreen removes Telegram's header — and with it the `BackButton` we just adopted in §2.4 — replacing it with a floating close control we would have to design around. That is more webview, not less. Stay expanded. |
| `WebApp.enableClosingConfirmation()` | **Never. Call `disableClosingConfirmation()` at bootstrap.** | Payment Progress says, verbatim, "You can close this — we'll update the tab either way." A confirmation dialog would call that copy a lie. The forward-only intent state machine is what makes closing safe; the dialog would be protecting nothing. |
| `WebApp.ready()` | Once, after the first surface has painted its shell. | Calling it before the shell exists shows Telegram's loader over an empty frame. |

Pull-to-refresh stays banned. `overscroll-behavior-y: contain` on the scroll container, so no browser-native refresh gesture can appear on Android.

### 2.7 Safe area and content-safe area

Telegram exposes two different insets and the app currently conflates them.

- `safeAreaInset` — the device inset (notch, home indicator).
- `contentSafeAreaInset` — the inset below Telegram's own header, which changes with expanded/collapsed state.

Rules:

```
--app-pad-top:    var(--tg-content-safe-area-inset-top, env(safe-area-inset-top, 0px));
--app-pad-bottom: max(var(--tg-safe-area-inset-bottom, 0px), env(safe-area-inset-bottom, 0px));
--app-height:     var(--tg-viewport-stable-height, 100dvh);
```

- Every surface's top padding is `calc(var(--app-pad-top) + 16px)` for tab roots that start with a title, `calc(var(--app-pad-top) + 12px)` for surfaces with a header row.
- The sticky footer and the tab bar add `var(--app-pad-bottom)` to their bottom padding.
- The app shell height is `var(--app-height)`, **not** `100vh` and not `100svh`. Telegram's stable height excludes the keyboard and the collapsed-state delta; `100vh` on Android Telegram overshoots by the address-bar equivalent and produces a shell that scrolls one dead pixel.
- Re-read all three on `viewportChanged` and `safeAreaChanged`, writing them to `document.documentElement.style` — do not hold them in React state and re-render the tree on every viewport tick.
- Fall back to `env()` everywhere so the standalone-browser and old-client cases still land correctly.

### 2.8 Haptics — exactly three moments, and nowhere else

| Moment | Call | Fired when | Guard |
|---|---|---|---|
| Claim / unclaim | `HapticFeedback.impactOccurred('light')` | On the tap, optimistically — **not** on server acknowledgement. A buzz 200ms after the finger lifts reads as a bug. | none |
| Lock bill | `HapticFeedback.impactOccurred('medium')` | On accepting the lock confirmation, once. | Not on the confirm sheet opening. |
| Payment confirmed | `HapticFeedback.notificationOccurred('success')` | On the stepper's transition into `confirmed`. | A `useRef` latch keyed by intent id, so a re-render or a reconnect cannot repeat it. |

Nothing else vibrates. Explicitly not: tab switch, sheet open, sheet dismiss, token selection, preset chip, chevron expand, copy-to-clipboard, errors, or arrival of someone else's claim. An error that buzzes turns a recoverable state into an alarm.

All three are suppressed when `window.matchMedia('(prefers-reduced-motion: reduce)').matches` — the same switch that suppresses motion, per the Accessibility Floor. Wrap them in one `useHaptics()` module so there is exactly one place the suppression can be got wrong.

### 2.9 Transitions between the three tab-bar surfaces

**Recommendation: no transition. Instant swap.**

Tabs, Activity and You are peers. A horizontal slide would assert a hierarchy that does not exist; a cross-fade adds 150ms of blur to a surface people open to check one number. Native tab bars on both platforms swap instantly, and adding motion here would also breach the three-sanctioned-animations constraint for no gain.

What has to be true instead — this is where the "native" feeling actually comes from:

1. **The tab bar lives in the layout, not in the page.** It must not unmount, re-mount, or shift by a pixel across a switch. Today each page renders its own; that is why switching feels like a page load.
2. **Scroll position is preserved per tab.** Returning to Tabs from Activity lands where you left it. Keep all three mounted and toggle visibility, or persist `scrollTop` per route key.
3. **No skeleton on return.** A tab whose Convex query is already subscribed renders its cached rows immediately. Skeletons are first-paint-only (§2.2). A skeleton flash on every tab switch is the single loudest webview signal in the current build.
4. **The active item is a colour change only** — `colors/ink-muted` → `colors/primary` on icon and label, label weight 500 → 600. No indicator bar, no scale, no bounce.
5. **Tab bar geometry:** `colors/surface`, top 1px `colors/border`, `padding: 10px 0 calc(10px + var(--app-pad-bottom))`, three equal flex items, 22px icon, 11px label at `spacing/1` gap. Each item is a full-height 44px+ target across a third of the width.

The one place a transition is warranted is the payment sheet — specified in §5.4 as a gesture-continuous transform rather than a fourth animation.

### 2.10 What the code does today — the exact call sites

The whole Telegram integration is one effect. `features/telegram/TelegramRuntimeProvider.tsx:104-121`:

```
useEffect(() => {
  const webApp = window.Telegram?.WebApp;
  if (!webApp) { return; }
  webApp.ready();
  webApp.expand();
  setRuntime({ ... });
}, []);
```

`ready()` and `expand()` are the only two Mini App methods called anywhere in the repo. `setHeaderColor`, `setBackgroundColor`, `setBottomBarColor`, `disableVerticalSwipes`, `enableClosingConfirmation`, `requestFullscreen`, `MainButton` and `SecondaryButton` have **zero call sites**.

Six further facts an implementer needs:

1. **The bootstrap effect gives up permanently.** It runs once with `[]` deps and returns silently if `window.Telegram.WebApp` has not appeared yet. When that happens `isTelegramWebApp` stays `false` forever, which also forces `useSafeAreaInsets.ts:23-26` to `ZERO_INSETS`. The SDK is loaded `strategy="beforeInteractive"` (`app/layout.tsx:19-22`), so this is usually fine — but "usually" is not a property you want in the first two seconds of a demo. Poll for `window.Telegram?.WebApp` on `requestAnimationFrame` for up to 3000ms before concluding we are outside Telegram.
2. **The SDK script is unpinned.** `https://telegram.org/js/telegram-web-app.js` with no version query. Pin it — `?58` — so a Telegram-side release cannot change behaviour mid-demo.
3. **`useSafeAreaInsets.ts:40-45` reads `safeAreaInset` and never `contentSafeAreaInset`**, and subscribes to `window.resize` rather than to Telegram's `safeAreaChanged` / `contentSafeAreaChanged`. It also computes `left` and `right` and applies neither.
4. **`AppShell.tsx:58` hardcodes `56` as the tab-bar height** when offsetting the sticky footer. The nav actually measures ≈41px (`12 + 12 + ~16 + 1`). The footer therefore floats ~15px above the tab bar with a paper gap between them — visible on every surface that has both. Measure it, or set an explicit `--tab-bar-height: 56px` and make the nav that tall (which it should be anyway once the 22px icons from §1.2 land).
5. **`AppShell.tsx:44` caps the column at `MYTAB_LAYOUT.maxColumnWidth = "390px"` on every device.** On a 430px phone that leaves 40px of dead paper on both sides and shrinks the amount budget for no reason, while `BalanceHero`'s `8vw` keeps growing the glyphs against a column that does not grow. Change the cap to apply only above 480px: `width: 100%; max-width: min(100%, 480px)`. The 390px figure is a *design* width, not a layout cap — DESIGN.md asks for a centred single column on Desktop, not a 390px letterbox on a large phone.
6. **`triggerTelegramHaptic` already exists and is never called.** `useTelegramBackButton.ts:50-79` implements all three haptic styles and already early-returns under `prefers-reduced-motion` at `:55-58`. It has zero importers. Move it to `features/telegram/useHaptics.ts` and wire the three moments in §2.8.

### 2.11 Astryx and StyleX — resolve the contradiction

EXPERIENCE names Astryx as the UI system. In the build, **no Astryx component is rendered anywhere**, and `@astryxdesign/core/dist/astryx.css` is never imported — so the `<Theme>` wrapper at `components/theme/MyTabThemeProvider.tsx:18` renders a plain block `<div>` around the entire app instead of the `display: contents` it intends, breaking any `height: 100%` chain through it. `@stylexjs/stylex` is a dependency with zero source imports and no compiler plugin in `next.config.ts`.

Resolution, in this order:

1. **Import `@astryxdesign/core/dist/astryx.css` in `app/layout.tsx`.** It is StyleX atomic CSS scoped to generated class names, so it cannot collide with the hand-written globals, and it makes the `<Theme>` wrapper transparent as designed. This is a one-line fix for a real layout bug.
2. Add `transpilePackages: ["@astryxdesign/core", "@astryxdesign/theme-neutral"]` to `next.config.ts`.
3. **Leave StyleX alone.** Adding the compiler for zero call sites is churn. If it is not adopted by the end of this polish pass, remove the dependency.
4. Where Astryx has a component that does the job — `BottomSheet`, `Skeleton`, `Switch`, `SegmentedControl`, `AvatarGroup`, `ProgressBar`, `StatusDot` — prefer it over a hand-rolled one, but do not refactor working surfaces to adopt it during this pass.
## 3. The "You" surface, designed in full

Today `app/(miniapp)/you/page.tsx` renders an `<h1>You</h1>` and the sentence "Your receiving preference and profile." That is the whole surface. It is one third of the tab bar and it currently tells a person that the app is unfinished.

**Purpose** (EXPERIENCE, IA table): wallet, receiving preference, export. **Primary action:** Manage wallet.

**The one idea this surface has to land:** *My Tab holds nothing of yours.* Andre has never owned a wallet and does not intend to start. This is the only screen where he might wonder what he has been given. It should answer that in four rows and then get out of the way.

### 3.1 Layout

Single column, `spacing/4` (16px) gutters, `colors/paper`. Tab bar at the bottom (this is a tab root — no back control, `BackButton.hide()` asserted).

```
┌────────────────────────────────────────┐
│  [top: --app-pad-top + 24px]           │
│  You                        (title 20) │
│  [24px]                                │
│  ⬤60  Andre                (title 20)  │  identity block
│        @andre                (meta 13) │
│  [30px]                                │
│  WALLET                  (micro-label) │
│  ┌──────────────────────────────────┐  │
│  │ Solana wallet                    │  │  card, surface, rounded/md
│  │ 7xKX…9mPq              [copy] ⧉  │  │  1px border, card shadow
│  ├──────────────────────────────────┤  │
│  │ Receiving                        │  │
│  │ You always receive USDC       ⌄  │  │  disclosure-row
│  ├──────────────────────────────────┤  │
│  │ Export wallet                 ›  │  │
│  └──────────────────────────────────┘  │
│  [12px]                                │
│  [ Manage wallet ]        (full-width) │  primary action
│  [28px]                                │
│  ABOUT                   (micro-label) │
│  ┌──────────────────────────────────┐  │
│  │ How My Tab splits             ⌄  │  │  disclosure-row
│  ├──────────────────────────────────┤  │
│  │ Help                          ›  │  │
│  └──────────────────────────────────┘  │
│  [20px]                                │
│  My Tab holds no keys. Your wallet is  │  meta, ink-muted
│  yours — export it any time.           │
│  [16px]                                │
│  My Tab · build 2026.08.22   (11px,    │  ink-subtle
│                          ink-subtle)   │
│  [32px]                                │
│  ────────────────────────────────────  │
│  Tabs      Activity      You           │
└────────────────────────────────────────┘
```

Every row in both cards is `min-height: 56px`, `padding: 16px`, separated by a 1px `colors/border` hairline **inside** one card — not one card per row.

### 3.2 Row-by-row specification

**Identity block** (not a card — it sits directly on `colors/paper`, like `balance-hero`)

| Element | Spec |
|---|---|
| Avatar | 60px `rounded/full`. Telegram `photo_url` when present, `object-fit: cover`. Otherwise the initial of `first_name`, white, 22px/600, on `avatarTintForUserId(userId)` from `lib/theme/tokens.ts:87`. Never a silhouette. |
| Name | `title` (20px/600, `-0.018em`). `first_name` + `last_name`. `min-width: 0`, one line, ellipsis. |
| Username | `meta` (13px, `colors/ink-muted`), `@` + `username`. **If there is no username, this line is omitted entirely** — never "@—", never a blank line. |
| Gap | 14px between avatar and text block; 30px below the block. |

**Card 1 — micro-label "WALLET"**

*Row 1 — Solana wallet (copy)*

| | |
|---|---|
| Label | "Solana wallet" — `body` 15px/500, `colors/ink` |
| Value | The public key, elided as first 4 + `…` + last 4 (`7xKX…9mPq`), `meta` 13px, `colors/ink-muted`, `ui-monospace, SFMono-Regular, Menlo, monospace`, `font-variant-numeric: tabular-nums` |
| Trailing | 20px copy glyph (two offset rounded rects), `colors/ink-muted`, inside a 44×44 target |
| Tap | Whole row copies the **full** key to the clipboard |
| Confirmation | The value line is replaced in place by "Copied" in `colors/settled` for 1600ms, then reverts. Announced once via `aria-live="polite"`. **No toast** — toast stacks are banned. |
| Failure | If the clipboard write rejects (Telegram Desktop, permissions): value line becomes "Couldn't copy. Long-press to select." in `colors/ink-muted` for 2400ms. This is the one place selection is permitted; the row's `user-select` becomes `text` for that window only, so the long-press-unbound rule still holds everywhere else. |
| a11y | `role="button"`, `aria-label="Copy your Solana wallet key"` |

The word "address" never appears. `wallet address` is on the banned list; "Solana wallet" is the label and the key is its value.

*Row 2 — Receiving (disclosure-row)*

| | |
|---|---|
| Label | "Receiving" — `body` 15px/500 |
| Value | "You always receive USDC" — `meta` 13px, `colors/ink-muted` |
| Trailing | Chevron, rotates 0° → 90° on expand |
| Expanded | `colors/paper` inset panel, `rounded/sm`, `spacing/4` padding, `meta`: "Whoever pays you can be holding any token. It arrives as USDC either way, and the network fee is covered by My Tab." |
| Collapsed by default, every open. It never remembers. |

This is deliberately **not** a chevron-into-a-screen. There is one receiving asset and no choice to make; a row that navigates to a screen with a single un-choosable option is a dead end. Stating the fact and explaining it in place is the honest design. If a second receiving asset ever ships, this becomes a `SegmentedControl` in place — still no new screen.

*Row 3 — Export wallet*

| | |
|---|---|
| Label | "Export wallet" — `body` 15px/500 |
| Sub | "Take your keys to any Solana app." — `meta`, `colors/ink-muted` |
| Trailing | Chevron `›` |
| Tap | Privy `exportWallet()`. Privy renders its own modal; we render nothing over it. |
| Disabled when | Wallet not yet provisioned, or outside Telegram. Disabled = `colors/ink-muted` label with the reason on the sub-line, not a greyed-out ghost. |

**Primary action — "Manage wallet"**

Full-width, `min-height: 52px`, `rounded/sm`, `colors/surface`, 1px `colors/border`, `body` 15px/600 in `colors/ink`. A *secondary* button, not the blue primary — the blue is reserved for actions that move money, and this one opens a drawer.

It is **not pinned to the bottom.** Justification: the three tab roots carry a tab bar on the bottom edge; stacking a sticky footer above it would put 100px of chrome under a screen with six rows of content. Tabs sets the precedent — its "Start a tab" / "Send a tip" pair is inline, not pinned. The pinned-footer rule in DESIGN.md applies to task surfaces (Claim Board, Bill Review, New Tab, Receipt Review, Tip Composer, Payment Sheet), not to tab roots.

Tapping it presents a bottom sheet (`payment-sheet` geometry: `colors/surface`, `rounded/lg` top corners, 36×4 grab handle, `sheetShadow`, scrim `rgba(10,32,56,0.38)`):

| Element | Copy / spec |
|---|---|
| micro-label | "SOLANA WALLET" |
| Key | The **full** public key, monospace `meta`, `word-break: break-all`, wrapping across two lines. Never elided inside the sheet — this is the surface where the whole thing is meant to be readable. |
| Row | "Copy key" — same copy behaviour as Card 1 Row 1 |
| Row | "Export wallet" · sub "My Tab never holds your keys. Exporting takes nothing away from your tabs." → Privy `exportWallet()` |
| Row | "Connect a different wallet" — **rendered only when `isExternalWalletEnabled()`** (`lib/features/flags.ts:3`). When the flag is off the row is absent, not disabled. |
| Dismiss | Scrim tap or swipe-down. No commit step, so it is dismissible throughout. |

There is no "Disconnect", no "Sign out", no "Delete account". Authentication is invisible; there is nothing to log out of, and offering it would raise the question the product spent five screens avoiding.

**Card 2 — micro-label "ABOUT"**

*Row 1 — How My Tab splits (disclosure-row)*

Expanded copy, `meta` on `colors/paper` inset:
> "Items go to whoever claimed them. Service charge, VAT and the group tip are shared in proportion to what each person ordered. If a satang is left over, it shows up as its own line so nobody is quietly rounded."

This row is doing trust work, not help work. It is the answer to "how do I know this is fair", one tap from the tab bar, and it costs nothing.

*Row 2 — Help*

Label "Help", chevron. Opens the support chat via `WebApp.openTelegramLink('https://t.me/<support>')`. Outside Telegram it is an ordinary `target="_blank"` link.

**Footer note** — `meta` 13px, `colors/ink-muted`, `line-height: 1.5`, 20px above:
> "My Tab holds no keys. Your wallet is yours — export it any time."

**Build line** — 11px, `colors/ink-subtle`, 16px above the tab bar:
> "My Tab · build 2026.08.22"

Financial software shows its version. It reads as care, and it makes a demo bug reportable.

### 3.3 What is removed from the artboard, and why

`You.dc.html` includes a **Notifications toggle**. Delete it.

Two reasons. First, EXPERIENCE explicitly rejects notification pressure — "reminder pings, nudges, badge counts" — and the only messages the product sends go to the *group*, edited in place, five event types, never to an individual. There is no per-person notification to switch off. Second, a toggle that controls nothing is worse than no toggle. This is a genuine artboard/spine disagreement, and the spine wins by its own rule.

Also corrected from the artboard: the wallet value uses a copy affordance rather than a bare icon with no stated behaviour, and the "Receiving" row loses its chevron (see 3.2).

### 3.4 States

| State | Trigger | Treatment and exact copy |
|---|---|---|
| Loading — first paint | No cached viewer | Identity: 60px `colors/sunk` circle, a 140×20 bar, a 90×13 bar. Cards: 3 and 2 static `colors/sunk` rows at the real 56px height. No spinner, no shimmer. |
| Loading — subsequent | Any refetch | Nothing. Content replaces in place. |
| Wallet provisioning | Privy embedded wallet not yet created | Row 1 label stays "Solana wallet"; value becomes "Setting up your wallet…" in `colors/ink-muted`, with the 108×3 `colors/border` track and 34px `colors/primary` sweep used on Launch. Row 3 and "Manage wallet" disabled. **This is not an error and carries no warning colour.** |
| Wallet provisioning failed | Privy returns an error | Value: "We couldn't finish setting up your wallet. Close My Tab and open it again." in `colors/owed`. No retry button — reopening *is* the retry, and a button that re-runs a failing call twice is worse than a sentence. |
| Viewer load failed | Convex query error | Replace the identity block with: "Couldn't load your details." (`body`) and "Try again" (`colors/primary`, `label`, 44px target). Cards still render with cached values if any exist. |
| Offline | `navigator.onLine === false` or Convex disconnected | Inline bar above the title: "You're offline. We'll catch up." (`colors/warning` text on `colors/warning-soft`, 1px `colors/warning`, `rounded/md`). Copy still works — the key is cached. Export and Manage wallet disabled with sub-line "Needs a connection." |
| Outside Telegram | `isTelegramWebApp === false` | Inline bar: "Open this in Telegram to make changes." Identity, key and copy all still work — reads stay available. Export and Manage wallet disabled with sub-line "Open this in Telegram to make changes." |
| Reduce Motion | media query | Chevron rotation is instant; the "Copied" swap is instant; the provisioning sweep becomes a static 34px `colors/primary` segment at the left of the track. |
| Empty | — | **This surface has no empty state.** A viewer always has a name and a wallet, or is in one of the two states above. Do not design one. |

### 3.5 Accessibility

- Every row is a `<button>` or `<a>` with `min-height: 56px`, comfortably over the 44px floor.
- The copy row announces "Copy your Solana wallet key"; the confirmation announces "Copied" once through a polite live region.
- Disclosure rows carry `aria-expanded` and `aria-controls`; the panel is not removed from the DOM, it is `hidden`.
- Focus order: title → identity → wallet rows → Manage wallet → about rows → tab bar.
- The key is read character-by-character by screen readers only on demand; the row's accessible name is the label, not the key, so a swipe-through does not spell out 44 characters.
## 4. Empty, loading, error and offline states

Not one of the twenty-three components surveyed implements an **error state** or a **retry**. Offline exists in two places and is mounted in one. Skeletons exist in three places and are reachable in one. This section closes all of it.

### 4.0 The four rules that generate every string below

1. **A failure names its next action in the same breath.** "Couldn't load your tabs. Try again." — never a sentence that ends in the problem.
2. **Never apologise, never explain the mechanism.** No "Oops", no "Sorry", no "Something went wrong" where a specific cause is known, no error codes, no signatures, no stack traces.
3. **Numbers are never rounded and never blanked.** A stale or expired figure holds its last value at 40% opacity. It never becomes a dash.
4. **No state ships as a spinner over correct data.** Convex is reactive; a spinner implies staleness, which is the opposite of this product's claim.

### 4.1 Loading

| Surface | First paint (no cache) | Subsequent |
|---|---|---|
| Launch | The launch surface *is* the loading state. Copy: "Getting your tab ready…" | n/a |
| Tabs | `TabsHomeSkeleton` — a 46px hero bar, a 2-up 48px action pair, then a 20px micro-label bar + two 96px `tab-card` blocks + a 72px group block + three 56px activity rows. Static `colors/sunk`, no shimmer. | Nothing. |
| Group | Same shape: 96px balance card, five 48px circles, one 96px `tab-card`, four 56px rows. | Nothing. |
| New Tab | Nothing — the form is local until submitted. | Nothing. |
| Receipt Review | While extraction runs: the card renders with 8 skeleton rows and the header strip in place; the sticky footer action reads "Reading the receipt…" and is disabled. **No sparkle, no percentage, no "AI".** | Nothing. |
| Claim Board | 8 skeleton rows at the real 68px row height, each with a 100px name bar, a 22px avatar circle and a `5.5ch` right-aligned amount bar. Header title and status line as bars. Footer renders live with `฿0.00`. | Nothing. |
| Bill Review | Five 56px person rows with a 32px circle, a 90px name bar and a `6ch` amount bar. | Nothing. |
| Payment Sheet | The sheet opens immediately with the obligation amount (known) and the token chips and disclosed lines as bars. Action disabled, label "Getting a price…". | Nothing. |
| Payment Progress | Never loads — it is entered with an intent id. | n/a |
| All Square | Never loads. | n/a |
| Tip Composer | Chips as five 52px circles; hero renders the default `฿100.00` immediately. | Nothing. |
| Activity | Three 56px rows per day group, two groups. | Nothing. |
| You | Per §3.4. | Nothing. |

Skeleton fill is `colors/sunk` `#EDF2F7`, `rounded/sm`, **static**. Amount placeholders sit inside the reserved amount column at `width: 5.5ch` (`amount-row`) or `7ch` (`amount-md` / `amount-lg`) with `font-variant-numeric: tabular-nums` inherited. Every skeleton container carries `aria-busy="true"` and an `aria-label`; every skeleton child is `aria-hidden`.

### 4.2 Empty

| Surface | Condition | Copy | Action |
|---|---|---|---|
| Tabs | No groups and no tabs | "No tabs yet. Start one from any Telegram group." | "Start a tab" (48px primary) |
| Tabs | Groups exist, no open tabs | "No open tabs in your groups." | — (the section renders the line, not a button) |
| Tabs | No recent activity | Section is omitted entirely | — |
| Group | No open tabs | "No tabs yet. Start one from any Telegram group." | "Start a tab" |
| Group | No other members | "No one else has opened this tab yet." | — |
| New Tab | No selectable payer | "Nobody in this group has opened My Tab yet. Ask someone to tap the link." | — |
| Receipt Review | Extraction returned nothing | "Add what you ordered." | "Add items manually" (primary) · "Scan receipt" (secondary, only when `isReceiptScanEnabled()`) |
| Claim Board | No items, viewer is organizer | "Add what you ordered." | "Type an item" · "Scan a receipt" |
| Claim Board | No items, viewer is a participant | "{Organizer} is adding the bill. You can stay here — it will appear automatically." | — |
| Bill Review | No participants with a share | "Nobody has claimed anything yet." | "Back to the tab" |
| Payment Sheet | No affordable token | "You don't have enough in any token yet." with every chip shown disabled and its balance visible | — |
| Tip Composer | No eligible recipients | "Nobody here has opened My Tab yet. Once they do, you can tip them." | — |
| Activity | No events | "Nothing yet. Claims, tips and payments show up here." | — |
| You | — | No empty state exists for this surface. | — |

Empty states are `colors/surface` cards at `padding: 24px 20px`, centred, `rounded/md`, 1px `colors/border`. The headline is `body` 15px/500 `colors/ink`; any second line is `meta` `colors/ink-muted`. No illustration, no icon, no emoji.

### 4.3 Error

Errors are an **inline block in the flow**, never a modal and never a toast. Layout: `colors/surface` card, 1px `colors/border`, `rounded/md`, `spacing/5` padding; headline `body` `colors/ink`; the retry as a 44px `colors/primary` text action beneath. Semantic colour is used at *text* weight only — never a filled red panel.

| Surface | Failure | Copy | Action |
|---|---|---|---|
| Launch | Auth genuinely fails after retry | "We can't reach My Tab right now. Close this and open it again from your group." | none — reopening is the retry |
| Any | Session refresh fails | Inline bar, `colors/warning` on `colors/warning-soft`: "Reconnecting…" — cached reads stay visible. **Never a modal, never a logout.** | none |
| Tabs | Query error | "Couldn't load your tabs." | "Try again" |
| Group | Group not found / no longer a member | "You're not in this group any more." | "Back to your tabs" |
| Group | Query error | "Couldn't load this group." | "Try again" |
| New Tab | Save fails | "Couldn't start the tab. Try again." (inline, under the footer action) | the footer action re-submits |
| Receipt Review | Photo unusable | "We couldn't read that photo. Add the items yourself, or take another." | "Add items manually" · "Scan receipt" |
| Receipt Review | Confirm fails | "Couldn't save the receipt. Try again." | footer action re-submits |
| Claim Board | Tab link invalid | "This link is no longer valid." | "Back to your tabs" |
| Claim Board | Query error | "Couldn't load this tab." | "Try again" |
| Claim Board | Claim rejected as stale | "That changed a moment ago." — `meta` on the footer, the board corrects itself. **No modal, no forced reload.** | none |
| Claim Board | Organizer removed a claimed item | "{Organizer} removed an item you claimed." — `meta` on the footer, informational, does not steal focus | none |
| Bill Review | Lock fails on reconciliation | "Shares are ฿{shortfall} short of ฿{total}. Lock is blocked." | none — the organizer fixes it on the board |
| Bill Review | Lock fails otherwise | "Couldn't lock the bill. Try again." | footer action re-submits |
| Payment Sheet | Quote fails | "Couldn't get a price right now." | "Try again" |
| Payment Sheet | Quote expired | "Quote expired. Refresh it." | action becomes "Refresh quote"; amounts hold at 40% opacity |
| Payment Sheet | Bill changed under it | "This bill changed. Refresh to see your new amount." | "Refresh bill" — payment is blocked, never silently repriced |
| Payment Sheet | Sponsorship paused | "Payments are paused right now. Your tab is safe." | action disabled; reads stay fully available |
| Payment Progress | Wallet prompt dismissed | **Nothing.** Return to the Payment Sheet unchanged. A cancelled approval is a normal act. | — |
| Payment Progress | Failed — expired | "Quote expired. Refresh it." above "Nothing left your wallet. Your share is unchanged." | "Try again" · "Back to tab" |
| Payment Progress | Failed — not confirmed | "The network didn't confirm this payment." | "Try again" · "Back to tab" |
| Payment Progress | Failed — already settled | "This one was already settled." | "Back to tab" only |
| Payment Progress | Failed — unknown cause | "This payment didn't go through." | "Try again" · "Back to tab" |
| Payment Progress | `unknown` | "Still checking — don't pay again." | **no action at all** |
| Payment Progress | `superseded` | "This bill changed. Refresh to see your new amount." | "Back to tab" |
| Tip Composer | Custom amount invalid | "Enter an amount above ฿0." under the field, `colors/owed` `meta` | — |
| Tip Composer | Send fails | "Couldn't send the tip. Try again." | footer action re-submits |
| Activity | Query error | "Couldn't load your activity." | "Try again" |
| You | Viewer load fails | "Couldn't load your details." | "Try again" |
| You | Wallet setup fails | "We couldn't finish setting up your wallet. Close My Tab and open it again." | none |

**Banned in every one of these strings:** the word list in PRODUCT.md, plus "Oops", "Sorry", "Unexpected", "Failed to", "Please", "Error:", and any numeric code.

### 4.4 Offline

One treatment, everywhere: a full-bleed inline bar at the very top of the surface, above the header. `colors/warning-soft` fill, `colors/warning` text, bottom 1px `colors/border`, `padding: 10px 16px`, 14px, centred, `role="status" aria-live="polite"`.

> **"You're offline. We'll catch up."**

`features/bills/OfflineBar.tsx` already renders exactly this. `features/balances/LoadingStates.tsx:10` is a second implementation of the same component with the same string — **delete one and export the survivor from a shared location.**

What offline does per surface:

| Surface | Behaviour |
|---|---|
| Tabs, Group, Activity, You | Cached state stays readable. "Start a tab" and "Send a tip" disabled with "Needs a connection." beneath. |
| Claim Board | **Claim and release still work.** They enter the IndexedDB outbox with an operation id and base revision; replay is serial and deduplicated. The row updates optimistically. Nothing else on the surface is enabled. |
| New Tab, Receipt Review | All authoring disabled. The form retains its values. |
| Bill Review | Read-only anyway. Lock and Settle up disabled with "Needs a connection." |
| Payment Sheet, Payment Progress, Tip Composer | Disabled entirely. Money never moves optimistically. |

A stale outbox effect asks for a new tap rather than retrying blindly: "That was a while ago — tap it again to be sure."

### 4.5 Outside Telegram

`isTelegramWebApp === false` and the viewer is authenticated: reads work, every mutation is disabled, both client-side and server-side.

Same bar geometry as offline, in `colors/ink-muted` on `colors/sunk`:

> **"Open this in Telegram to make changes."**

Every disabled control repeats the same sentence on its own sub-line rather than going silent. `TabsHomeSurface.tsx:46` already carries the related string "Open My Tab from a Telegram group to start a tab." — keep that one for the *no group context* case, which is different and must not be conflated.

### 4.6 Locked, and the states that are not failures

| State | Surface | Treatment |
|---|---|---|
| Locked | Claim Board | Rows become read-only with the claim affordances **removed, not disabled-greyed**. Header status line gains "Locked · 5 people" in `colors/ink-muted`. Footer action becomes "Settle up" with a quiet "See the full bill" text link beside it. |
| Pre-lock, participant | Bill Review | Full read-only breakdown for everyone. Footer "Settle up" disabled with the reason stated: "Waiting on Maya to lock." **Never a blank or hidden action.** |
| Unassigned items | Claim Board | 3px `colors/warning` left edge on the row, "Needs an owner" caption in `colors/warning`, and the footer count. Lock is blocked for the organizer with the count as the reason. **Participants are never blocked by someone else's unclaimed item.** |
| All square | Tabs, Group | `balance-hero` reads "All square" in `colors/ink`. No badge, no trophy, no persistent celebration. |
| Two people on one item | Claim Board | "Split 2 ways · ฿120.00 each". No warning, no dialog, no loser. |
## 5. Motion spec

Nothing in the product animates today except a launch bar with no reduce-motion guard and a 400ms background fade on an unmounted component. All three sanctioned animations are unbuilt.

Global preamble, in the injected stylesheet:

```
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

This is the floor, not the design. Each animation below states its own reduce-motion form, because "instantly at the end state" is not always correct — the all-square wash must still be *painted*, it just must not move.

Read the preference once in a `useReducedMotion()` hook backed by `matchMedia('(prefers-reduced-motion: reduce)')` **with a `change` listener** — a person can flip it mid-session — and thread it through. It is the same switch that suppresses haptics (§2.8).

**Never used anywhere:** `transition: all`, skeleton shimmer, hover lift, pressed elevation, parallax, carousels, hero animations on open, sound, confetti.

---

### 5.1 Avatar arrival in a stack — 200ms

*Sanctioned animation #1. Load-bearing for the demo: multiple phones, side by side.*

| | |
|---|---|
| Where | `presence-stack` in the Claim Board header; the claimant avatar row inside `claim-row` |
| Trigger | A claimant id appears in a row's list that was not there on the previous render. **Arrival only.** |
| Properties | `transform: scale(0.6) translateX(-6px) → scale(1) translateX(0)` and `opacity: 0 → 1` |
| Duration | 200ms for the transform; 120ms for the opacity, both starting at 0ms |
| Easing | `cubic-bezier(0.22, 1, 0.36, 1)` for the transform; `linear` for the opacity |
| Fill | `both` |
| Departure | **Instant.** A released claim vanishes; it does not fade. Lingering would imply the release is provisional. |
| Accompaniment | The row's per-head caption ("Split 2 ways · ฿120.00 each") and the footer reconciliation line update on the same frame the animation starts — **the numbers never wait for the motion.** |
| Reduce motion | No transform, no opacity. The avatar appears in place. The caption and footer update identically. |

Implementation note: apply via a `data-enter` attribute set on mount and removed by a 200ms timeout, keyed by claimant id, so a parent re-render cannot retrigger it. Never key on array index.

---

### 5.2 The check draws — 400ms

*Sanctioned animation #2. This is the moment the product is selling.*

| | |
|---|---|
| Where | `settlement-stepper` step 4; the row settling in place on the Claim Board; the centre check on `all-square-card` |
| Trigger | The transition into `confirmed` — server-confirmed only, never optimistic |
| Ring | `transform: scale(0.9) → scale(1)`, 260ms, `cubic-bezier(0.34, 1.4, 0.64, 1)`, starting at 0ms. The slight overshoot is the only bounce in the product and it is spent here. |
| Stroke | SVG `stroke-dasharray: 34; stroke-dashoffset: 34 → 0`, 400ms, `cubic-bezier(0.65, 0, 0.35, 1)`, starting at 140ms |
| Colour swap | The row's fill and text move to `colors/settled` **instantly at 0ms** — the colour is information, the drawing is the flourish |
| Progress advance | The `tab-card` bar and the settlement ring animate on the same event: `transform: scaleX(a) → scaleX(b)` with `transform-origin: left`, 400ms, `cubic-bezier(0.65, 0, 0.35, 1)`, starting at 140ms. This is part of animation #2, not a fourth animation — it is the same fact rendered twice. |
| Haptic | `notificationOccurred('success')` at 0ms, latched once per intent id |
| Announcement | The stepper announces the transition once through a live region — the single most important announcement in the product |
| Reduce motion | Check rendered fully drawn (`stroke-dashoffset: 0`), no ring scale, progress bar jumps to its new width, colour swap identical, haptic suppressed, announcement identical |

---

### 5.3 The all-square wash — 600ms, once per bill

*Sanctioned animation #3. Fires exactly once, on the transition to bill completion, for people present at that moment. Never replayed on revisit.*

| | |
|---|---|
| Wash layer | `linear-gradient(180deg, #F6E9DC 0%, #F7EFE7 45%, #F4F7FA 100%)` over `height: 46%`, `position: absolute; inset-inline: 0; top: 0` |
| Wash animation | `opacity: 0 → 1` and `transform: translateY(-12px) → translateY(0)`, 600ms, `cubic-bezier(0.16, 1, 0.3, 1)`, no delay |
| Content stagger | Each element `opacity: 0 → 1` + `translateY(10px) → 0`, 420ms, `cubic-bezier(0.16, 1, 0.3, 1)`, `fill: both`, at delays **0 / 80 / 140 / 200 / 260 / 320ms** for: check ring · "All square" · the bill line · "5 of 5 settled" · the avatar row · "Your group tab. Settled." |
| Check inside it | Per §5.2, starting at 220ms — `stroke-dasharray: 34`, 480ms |
| Guard | Fires on the *live* completion transition only, gated by `localStorage['mytab.allsquare.<billId>']` **and** the existing `sessionStorage` guard, so a reload cannot replay it |
| Reduce motion | **The wash is painted at full opacity immediately.** No translate, no stagger, no check draw. The card still appears — EXPERIENCE is explicit that it "simply does not wash in". The current code at `AllSquareCard.tsx:61` drops the gradient entirely under reduce-motion; that is wrong and must be changed. |

The gradient stops are the **only** gradient in the product. Two new tokens are required (§8).

---

### 5.4 Sheet present and dismiss — warranted, and why it is not a fourth animation

The payment sheet is dismissible by drag. A draggable object must be positionable mid-gesture, which means it must have a transform, which means present and dismiss have to resolve that transform somehow. **This is gesture continuation, not decoration** — the same category as scrolling, which nobody counts as an animation. Ship it.

| | |
|---|---|
| Present | Sheet `transform: translateY(100%) → translateY(0)`, 280ms, `cubic-bezier(0.32, 0.72, 0, 1)`. Scrim `opacity: 0 → 1`, 200ms, `linear`. |
| Dismiss (scrim tap / back) | Reverse, 220ms, same curve. Scrim 160ms. |
| Drag | The sheet follows the finger 1:1 downward. Upward drag is resisted at 0.55×. |
| Release | Past 96px of travel **or** velocity > 0.5 px/ms → dismiss over 200ms. Otherwise spring back over 280ms, same curve. |
| After "Pay" | The drag handler and the scrim tap are unbound. The sheet transitions to Payment Progress and cannot be dismissed backward. |
| Reduce motion | Sheet and scrim appear and disappear instantly. Drag-to-dismiss still works; release snaps rather than eases. |

The same treatment covers the "Start a tab" group picker (§1.2) and the "Manage wallet" sheet (§3.2). **Sheets stack one level deep, never two.**

---

### 5.5 Disclosure chevron — 140ms, and it is sanctioned

The Bill Review and Payment Sheet artboards both specify `transition: transform 140ms ease` on the disclosure chevron. A strict reading of "three sanctioned animations" would delete it. It should not be deleted: it is a 140ms response to a control the finger is still touching, and removing it makes the chevron read as a static decoration rather than as a state.

Sanctioned narrowly: `transform: rotate(0deg) → rotate(90deg)`, 140ms, `ease`, **on a disclosure chevron and on nothing else**. Instant under reduce-motion. §8 records the clarification.

---

### 5.6 Two further transitions, both permitted, both narrow

| | Spec | Why |
|---|---|---|
| Active stepper dot | `box-shadow: 0 0 0 0 rgba(30,81,210,0.35) → 0 0 0 6px rgba(30,81,210,0)`, 1400ms, `ease-in-out`, `infinite` | Payment Progress currently has **no motion of any kind** on a screen whose entire job is saying "this is happening". A flat dot next to "Sending to Maya" reads as frozen. This is the only looping animation in the product. Suppressed entirely under reduce-motion — the dot is a solid `colors/primary` circle. |
| Quote-expiry dim | `transition: opacity 160ms ease` on the sheet's amount block, `1 → 0.4` | Without it the sheet snaps and looks like a bug. Instant under reduce-motion. |

### 5.7 Tab switch — no transition

Stated and justified in §2.9. Tabs, Activity and You swap instantly. The felt quality comes from a tab bar that does not remount, per-tab scroll restoration, and no skeleton on return — not from motion.

### 5.8 Everything else is an instant state swap

Explicitly un-animated: token chip selection, participant chip selection, preset chip selection, reaction toggle, claim row tint on tap (the tint is instant; only the *avatar* animates), offline bar appearance, empty-to-populated list transitions, item add and remove, `PaymentStateBadge` changes, tab-card progress except on confirmation (§5.2), and every number in the product — **no counting-up, no odometer, no number roll.** An amount that animates to its value is an amount you cannot read while it moves, on a screen whose entire argument is that the math is exact.
## 6. Component inventory gap

DESIGN.md lists fifteen components. **Eleven exist in some form, four do not exist at all, and eight of the eleven diverge from their spec.** Six of the eleven cannot be reached from any route.

### 6.1 The table

| # | Component | File | Exists | Reachable | Verdict |
|---|---|---|---|---|---|
| 1 | `balance-hero` | `features/balances/BalanceHero.tsx` | yes | yes | **diverges** — clips the amount (`:36-39`); label and figure are one inseparable string |
| 2 | `tab-card` | `features/balances/TabCard.tsx` | yes | yes | **diverges** — no amount column, raw lowercase `status`, no `spacing/5` padding |
| 3 | `claim-row` | inline in `features/claims/ClaimBoard.tsx:143-210`; `components/claim-row/` is an empty `.gitkeep` | inline only | **no** | **diverges + not extracted** — no state tag, no helper caption styling, no `min-width: 0` |
| 4 | `participant-chip` | `components/primitives/participant-chip.tsx` | yes | **no** | **diverges** — one size only (52px), no truncation, `aria-pressed` where a radio is meant |
| 5 | `presence-stack` | inline in `features/claims/ClaimBoard.tsx:112-134` | inline only | **no** | **diverges + not extracted** — no `colors/settled` dot, no arrival animation |
| 6 | `sticky-claim-footer` | inline in `features/claims/ClaimBoard.tsx:212-272` | inline only | **no** | **diverges + not extracted** — amount is the flexible child, so it is the thing that squeezes |
| 7 | `breakdown-row` | inline in `features/claims/BillReview.tsx:71-148` | inline only | **no** | **diverges + not extracted** — hides negative rounding and discount (`:132`, `:139`) |
| 8 | `payment-sheet` | `components/settlement-sheet/PaymentSheet.tsx` | yes | **no** | **diverges** — it is a bare `<section>`: no sheet, no scrim, no handle, no shadow, no radius, countdown not live |
| 9 | `token-chip` | `components/settlement-sheet/PaymentTokenSelector.tsx` | yes | **no** | **close** — affordability and disabled-with-balance are correct; needs `min-height: 44px` and roving `tabIndex` |
| 10 | `disclosure-row` | `DisclosureRow` in `components/settlement-sheet/PaymentSheet.tsx:12-59` | yes | **no** | **diverges** — uses `+` / `−` glyphs, not a chevron; no `colors/paper` inset for its contents; no top/bottom hairlines |
| 11 | `settlement-stepper` | `components/settlement-sheet/SettlementStepper.tsx` | yes | **no** | **diverges** — 20px dots not 26px, no 2px connector, no active-state motion, four of ten statuses unmapped (`stepperCopy.ts:51`) |
| 12 | `all-square-card` | `features/balances/AllSquareCard.tsx` | yes | **no** | **diverges** — no wash animation, no settled-count row, no closing line, no share action, invalid `gap: -8px` (`:110`) |
| 13 | `activity-row` | `ActivityRow` in `features/balances/ActivityFeed.tsx:40-125` | yes | yes | **diverges** — amount and timestamp are alternatives not a stack; emoji glyphs; no day grouping; no expanded detail lines |
| 14 | `amount-pair` | `components/primitives/amount-pair.tsx` | yes | yes | **diverges** — no `min-width: 0` on the label, no `flex: none` on the amount, no a11y amount label |
| 15 | `discrepancy-card` | `DiscrepancyCard` in `features/receipts/ReceiptReview.tsx:18-43` | yes | **no** | **diverges** — hardcoded `rgba(154,98,9,0.06)` instead of `colors/warning-soft`, no `rounded/md`, no `spacing/5` |

**Missing outright as named, reusable components: `claim-row`, `presence-stack`, `sticky-claim-footer`, `breakdown-row`.** All four exist as inline JSX inside one 318-line and one 222-line file. Three of them have empty `.gitkeep` placeholder directories waiting for them (`components/claim-row/`, `components/balance-banner/`, `components/tab-card/`, `components/settlement-receipt/`).

### 6.2 Extraction plan

Extract the four inline components into `components/`, because each is used by more than one surface once the routes in §1.0 exist:

| New file | Used by |
|---|---|
| `components/claim-row/ClaimRow.tsx` | Claim Board; the who-has-this sheet |
| `components/presence-stack/PresenceStack.tsx` | Claim Board header; Group members strip |
| `components/sticky-claim-footer/StickyFooter.tsx` | Claim Board, Bill Review, New Tab, Receipt Review, Tip Composer — every surface with a pinned action |
| `components/breakdown-row/BreakdownRow.tsx` | Bill Review; Payment Sheet disclosure |

Also rename to remove two collisions: `features/settlement/ClaimBoard.tsx` → `components/settlement-progress/SettlementProgress.tsx` (it is the settlement ring, not a claim board), and delete one of the two `OfflineBar` implementations (`features/bills/OfflineBar.tsx` and `features/balances/LoadingStates.tsx:10` render the same string).

### 6.3 The four undefined CSS classes — this is the top defect in the build

`lib/theme/globalStyles.ts` defines `.mytab-card`, `.mytab-tabular` and the nine `.mytab-type-*` roles. It does **not** define:

| Class | Referenced at |
|---|---|
| `mytab-button-primary` | `BillAuthoringSurface.tsx:207,216` · `BillEmptyState.tsx:45` · `ItemEditor.tsx:80` |
| `mytab-button-secondary` | `BillEmptyState.tsx:52` · `ItemEditor.tsx:83` · `AdjustmentsPanel.tsx:58` |
| `mytab-link-button` | `ItemRow.tsx:57,62,69` |
| `mytab-input` | `NewTabForm.tsx:41,52,88,105` · `ItemEditor.tsx:37,54,69` |

There is no `.css` file anywhere in the repo, so these resolve to nothing. **Every button and every input in the only feature tree a route actually mounts renders as an unstyled browser default.** That single fact explains most of "it does not feel like a premium native app". Define them:

```
.mytab-button-primary {
  display: flex; align-items: center; justify-content: center;
  min-height: 52px; width: 100%; padding: 0 20px;
  border: 1px solid #1E51D2; border-radius: 10px;
  background: #1E51D2; color: #FFFFFF;
  font: 600 16px/1 var(--mytab-font-family);
  letter-spacing: var(--mytab-tracking-base);
  box-shadow: inset 0 -1px 0 rgba(10, 32, 56, 0.24);
  cursor: pointer;
}
.mytab-button-primary:active   { background: #17409F; border-color: #17409F; }
.mytab-button-primary:disabled { background: #F4F7FA; border-color: #DFE7EF; color: #55677D;
                                 box-shadow: none; cursor: not-allowed; }

.mytab-button-secondary {
  /* identical box, different skin */
  background: #FFFFFF; border-color: #DFE7EF; color: #0A2038; box-shadow: none;
}
.mytab-button-secondary:active { background: #EDF2F7; }

.mytab-link-button {
  min-height: 44px; padding: 0 4px; border: 0; background: none;
  color: #1E51D2; font: 500 13px/1 var(--mytab-font-family); cursor: pointer;
}
.mytab-link-button:active { color: #17409F; }

.mytab-input {
  width: 100%; min-height: 52px; padding: 15px 16px;
  border: 1px solid #DFE7EF; border-radius: 10px;
  background: #FFFFFF; color: #0A2038;
  font: 500 16px/1.2 var(--mytab-font-family);
  letter-spacing: var(--mytab-tracking-base);
}
.mytab-input:focus-visible { outline: none; border-color: #1E51D2; }
.mytab-input::placeholder  { color: #55677D; }
```

`16px` on `.mytab-input` is not negotiable — anything smaller triggers iOS focus-zoom, which is the loudest possible "this is a web page" signal.

Add, in the same file:

```
:root { font-variant-numeric: tabular-nums lining-nums;
        font-feature-settings: "tnum" 1, "lnum" 1; }
.mytab-row        { display: grid; grid-template-columns: minmax(0,1fr) auto;
                    column-gap: 12px; align-items: baseline; }
.mytab-row__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mytab-row__amount{ white-space: nowrap; text-align: right; }
.mytab-focus:focus-visible { outline: 2px solid #1E51D2; outline-offset: 2px; border-radius: 10px; }
```

Also missing and worth adding while the file is open: `--mytab-elevation-card` and `--radius-md`, both referenced by `.mytab-card` (`globalStyles.ts:82-87`) and both undefined, silently falling back.

### 6.4 Three finished modules with zero importers

| Module | State |
|---|---|
| `lib/domain/a11yAmount.ts` | **Zero importers, no test.** `formatThbMinorForA11y` returns "291 baht 73" — exactly what EXPERIENCE's Accessibility Floor requires — and nothing uses it. Every amount in the product is currently read to a screen reader as raw glyphs. Wire it into `amount-pair`, `claim-row`, `balance-hero`, `breakdown-row` and the Payment Sheet lines as an `aria-label`. |
| `lib/settlement/quoteCountdown.ts` | **Zero importers.** `PaymentSheet.tsx:61-66` reimplements `formatCountdown` inline and hardcodes the 10s warning threshold at `:136`. Delete the duplicates, import the module, and drive it from a real interval (§1.8). |
| `features/telegram/useTelegramViewport.ts` | **Zero importers.** Needed for `--app-height` in §2.7. |

Plus `triggerTelegramHaptic` (`useTelegramBackButton.ts:50-79`) — implemented, reduce-motion-aware, never called.
## 7. Build order

Estimates are for a competent AI coding agent working in this repo with the tests present, and include running `npm test` and fixing what breaks. There are eleven feature test files under `tests/features/` and `tests/components/` that assert on copy strings; **every copy change in §4 will break at least one of them**, and the estimates below include updating them.

Three bands: **P0** the app is broken without it · **P1** the app feels cheap without it · **P2** the app feels ordinary without it.

### P0 — the app is broken without it · ~13h

| # | Item | Where | Est. |
|---|---|---|---|
| 1 | **Define the four missing CSS classes** plus the row-layout utilities, global tabular numerals, `--radius-md` and `--mytab-elevation-card` | `lib/theme/globalStyles.ts` (§6.3) | 45m |
| 2 | **Fix the amount clip.** Split label from figure in `balance-hero`; drop `textOverflow: clip`; apply the `min-width: 0` / `flex: none` rule to the eleven listed sites | `BalanceHero.tsx`, `balance.ts`, `ActivityFeed.tsx:56`, `ClaimBoard.tsx:178,224`, `amount-pair.tsx`, `TabsHomeSurface.tsx:254`, `GroupSurface.tsx:107` (§2.3) | 1h 30m |
| 3 | **Thousands separators** in `formatFiatMinorThb` — `฿1,840.00`, matching the canonical fixture | `lib/domain/format.ts:15` | 20m |
| 4 | **Telegram chrome:** `setHeaderColor` / `setBackgroundColor` / `setBottomBarColor`, `disableVerticalSwipes`, `disableClosingConfirmation`, `MainButton.hide()`, re-apply on `themeChanged`, retry the bootstrap poll | `TelegramRuntimeProvider.tsx`, new `useBottomBarColor` (§2.1, §2.6, §2.10) | 1h 30m |
| 5 | **Viewport + first paint:** `export const viewport` with `viewport-fit=cover`; paper background inline on `<html>`/`<body>`; `theme-color` meta; pin the SDK script | `app/layout.tsx` (§2.2) | 30m |
| 6 | **Safe area:** read `contentSafeAreaInset`, subscribe to `safeAreaChanged` / `contentSafeAreaChanged` / `viewportChanged`, publish `--app-pad-top` / `--app-pad-bottom` / `--app-height` as CSS vars | `useSafeAreaInsets.ts`, `useTelegramViewport.ts`, `AppShell.tsx` (§2.7) | 1h |
| 7 | **Repoint `/tabs/[publicToken]` at the Claim Board** and move authoring to `/tabs/new` | `app/(miniapp)/tabs/[publicToken]/page.tsx`, new `app/(miniapp)/tabs/new/page.tsx` (§1.0, §1.6) | 1h 30m |
| 8 | **Build the seven missing routes** — `/groups/[groupId]`, `/tabs/new`, `/tabs/[t]/receipt`, `/tabs/[t]/bill`, `/pay/[intentId]`, `/tips/new`, plus the `?settle=` sheet key | `app/(miniapp)/**` (§1.0) | 2h 30m |
| 9 | **Kill the dead links.** "Start a tab" becomes a sheet; "Send a tip" points at `/tips/new`; group rows point at `/groups/[id]` | `TabsHomeSurface.tsx:80,97,179,252` (§1.2) | 1h |
| 10 | **Fix the stepper status map.** `created` / `quoting` / `expired` / `superseded` currently render as "Approved in your wallet — active" | `lib/settlement/stepperCopy.ts:51-52` (§1.9) | 40m |
| 11 | **Make the quote countdown live** and wire `lib/settlement/quoteCountdown.ts` | `PaymentSheet.tsx:61-66,77,136` (§1.8) | 40m |
| 12 | **Show negative rounding and discount** on Bill Review — today the expanded lines can fail to sum to the shown total | `features/claims/BillReview.tsx:132,139` (§1.7) | 20m |
| 13 | **Build the You surface** | `app/(miniapp)/you/page.tsx` + new components (§3) | 2h |

### P1 — the app feels cheap without it · ~12h

| # | Item | Where | Est. |
|---|---|---|---|
| 14 | **BackButton adoption.** One `useBackAffordance` hook; drop the in-app chevron inside Telegram; assert `BackButton.hide()` on the three tab roots | `useTelegramBackButton.ts` + every non-root surface (§2.4) | 1h |
| 15 | **Tab bar rebuild.** Move it into a `(miniapp)/layout.tsx` so it never remounts; 22px icons + 11px labels; per-tab scroll restoration; fix the hardcoded `56` footer offset | `AppShell.tsx:58,71-114` (§2.9, §2.10) | 1h 30m |
| 16 | **Sheet container** — scrim, radius, handle, shadow, drag-to-dismiss, focus trap; used by the payment sheet, the group picker and Manage wallet | new `components/settlement-sheet/SheetContainer.tsx` (§1.8, §5.4) | 1h 30m |
| 17 | **Payment Sheet content pass** — line labels, "Maya receives at least", "Fees and network", disclosure inset, "Pay ฿291.74", round-up amount always visible, 40% expiry dim | `PaymentSheet.tsx`, `ObligationPaymentSheet.tsx`, `RoundUpControl.tsx` (§1.8) | 1h 30m |
| 18 | **The three sanctioned animations** plus the reduce-motion hook and the stepper pulse | new `useReducedMotion.ts`, `ClaimRow`, `SettlementStepper`, `AllSquareCard` (§5) | 2h |
| 19 | **Haptics at the three moments**, wired from the existing `triggerTelegramHaptic` | `useHaptics.ts` + three call sites (§2.8) | 30m |
| 20 | **Claim Board craft pass** — state tags, helper line, presence dot, 200px scroll padding, footer flex inversion, plural fix, delete "Revision {n}" | `features/claims/ClaimBoard.tsx` (§1.6) | 1h 30m |
| 21 | **New Tab rebuild** — currency chips, payer avatars, capture cards, delete the recipient controls, item validation | `NewTabForm.tsx`, `ItemEditor.tsx`, `BillAuthoringSurface.tsx` (§1.4) | 2h |
| 22 | **All the empty, error and offline states** with the §4 copy | every surface (§4) | 2h 30m |
| 23 | **Skeletons that match final geometry**, with reserved amount columns | `LoadingStates.tsx`, `BillSkeleton.tsx`, new per-surface skeletons (§2.2, §4.1) | 1h 30m |
| 24 | **Wire `a11yAmount`** into every amount as an `aria-label` | `amount-pair.tsx` and six call sites (§6.4) | 40m |

### P2 — the app feels ordinary without it · ~9h

| # | Item | Where | Est. |
|---|---|---|---|
| 25 | **Extract the four missing components** and resolve the two name collisions | `components/claim-row`, `presence-stack`, `sticky-claim-footer`, `breakdown-row` (§6.2) | 2h |
| 26 | **Group surface craft pass** — balance card, member strip with status dots, trailing action, delete the wallet-readiness text | `GroupSurface.tsx` (§1.3) | 1h 30m |
| 27 | **Activity craft pass** — day grouping, amount-over-timestamp column, stroked glyphs, expanded detail lines | `ActivityFeed.tsx`, `activityTypes.ts` (§1.12) | 1h 30m |
| 28 | **Bill Review craft pass** — viewer row tint, `proportional` annotations, exact shortfall copy, the lock note | `features/claims/BillReview.tsx` (§1.7) | 1h |
| 29 | **All Square** — wash animation, settled-count row, closing line, share action, completion trigger and its guard | `AllSquareCard.tsx` + trigger wiring (§1.10, §5.3) | 1h 30m |
| 30 | **Tip Composer polish** — double-submit guard, custom-amount error, ineligible members shown disabled, chip truncation | `TipComposer.tsx`, `participant-chip.tsx` (§1.11) | 1h |
| 31 | **Receipt Review craft pass** — header strip, field-level flag outlines, totals block, helper line, demo-gate the sample link, drop "(minor)" from the copy | `ReceiptReview.tsx` (§1.5) | 1h 30m |
| 32 | **Launch lockup**, reduce-motion branch, exact track geometry | `LaunchSurface.tsx` (§1.1) | 30m |
| 33 | **Thai font + line heights**; Astryx CSS import + `transpilePackages` | `fonts.ts`, `tokens.ts`, `layout.tsx`, `next.config.ts` (§2.2, §2.11) | 40m |
| 34 | **320px sweep.** Every surface at 320px with the largest supported type size, asserting no horizontal scroll | all (§2.3) | 1h |

### The order inside P0 matters

Items 1–3 first and together: they are the difference between "amounts truncate" and "amounts do not", and every screenshot taken after them looks like a different product. Items 4–6 next, as one commit: chrome, viewport and safe area are one idea and half of it is worse than none. Then 7–9, which turn nine dead components into nine reachable surfaces. Then 10–12, which are correctness bugs in the money path. Then 13.

**Total: ~34 hours.** P0 alone is ~13 hours and takes the build from broken to demonstrable.
## 8. Contradictions found in the binding documents

Eight places where the authorities disagree with each other, with the artboards, or with what is buildable. Each is resolved here; DESIGN.md and EXPERIENCE.md should be amended to match.

**1. `PaymentSheet.dc.html` uses a banned word.** The disclosure row is labelled "**Route**, fees and network". `route` is on PRODUCT.md's banned list and on EXPERIENCE's. **Resolved:** the label is "Fees and network". The code's current "Fees and details" (`PaymentSheet.tsx:43`) is also acceptable but loses the one word that tells the person what is inside.

**2. `You.dc.html` carries a Notifications toggle** that EXPERIENCE's anti-notification-pressure principle forbids, and that no data model supports — the bot posts to the *group*, five event types, one message edited in place, never to an individual. **Resolved:** deleted (§3.3).

**3. `ReceiptReview.dc.html` shows "Use sample receipt" as a visible link.** EXPERIENCE calls the sample-receipt affordance "deliberately hidden from judges". **Resolved:** rendered only when `isDemoModeEnabled()` is true (§1.5).

**4. "Three sanctioned animations" versus the artboards' chevron transition.** Both `BillReview.dc.html` and `PaymentSheet.dc.html` specify `transition: transform 140ms ease` on a disclosure chevron. **Resolved:** sanctioned narrowly as a control-affordance transition, on disclosure chevrons and nothing else (§5.5). Two further narrow transitions are added with justification: the active stepper dot pulse and the quote-expiry dim (§5.6).

**5. The all-square wash needs tokens DESIGN.md does not define.** The artboard gradient runs `#F6E9DC → #F7EFE7 → #F4F7FA`; the first two values appear in no palette. **Resolved:** add `tip-wash-top: '#F6E9DC'` and `tip-wash-mid: '#F7EFE7'` to DESIGN.md, used only by `all-square-card`. Similarly `TipComposer.tsx:355` hardcodes `#F1CBB2` for the terracotta arrow on the primary button — add it as `tip-on-primary` or restroke the glyph in `tip-soft`.

**6. EXPERIENCE names Astryx as the UI system; the build uses none of it** and never loads its stylesheet, leaving the `<Theme>` wrapper as an inert block `<div>` around the whole app. **Resolved:** import the stylesheet so the wrapper behaves as designed, prefer Astryx primitives for new work, and do not refactor working surfaces during this pass (§2.11). Either adopt StyleX or drop the dependency; today it is installed with no compiler and no call sites.

**7. EXPERIENCE bans the word `approve` and then uses it.** The banned list in both PRODUCT.md and EXPERIENCE.md includes `approve`; the *Settlement Status, in Human Terms* table then specifies step 1 as "Approved in your wallet", and Flow 4 says "he approves once". **Resolved:** the ban targets the DeFi token-approval sense (`approve` a spender for a mint). The wallet-prompt sense is the plainest English available for what actually happens and is explicitly sanctioned by the spine's own status table, so it stays — in exactly two strings, "Approved in your wallet" and "Waiting for you to approve", and nowhere else. Amend the banned list to read `approve (a token allowance)`. Note also that a dismissed wallet prompt is **not** a failure state at all (EXPERIENCE is explicit), so there is no "you didn't approve" error copy anywhere.

**8. `MYTAB_LAYOUT.maxColumnWidth = "390px"` is applied on every device.** DESIGN.md asks for "the same 390px column centred on the paper canvas" **on Telegram Desktop**; it does not ask for a 390px letterbox on a 430px phone, which shrinks the amount budget while `BalanceHero`'s `8vw` grows the glyphs against it. **Resolved:** the cap applies above 480px only (§2.10, item 5).

One more worth recording, though it is not a contradiction: **`app/(miniapp)/` has no `layout.tsx`**, so `AppShell` — and therefore the tab bar — is mounted per page and remounts on every tab switch. That single fact is responsible for more of the "webview" feeling than any colour value in this document.
