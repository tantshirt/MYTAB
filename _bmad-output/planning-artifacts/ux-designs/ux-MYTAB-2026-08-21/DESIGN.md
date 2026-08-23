---
name: My Tab
description: The group tab that lives in Telegram. Cool paper, navy ink, one confident blue. Premium financial craft applied to a social act — never a wallet, never a DeFi terminal.
status: final
created: '2026-08-21'
updated: '2026-08-21'
sources:
  - ../../prds/prd-MYTAB-2026-08-21/prd.md
  - ../../briefs/brief-MYTAB-2026-08-21/brief.md
  - ../../architecture/architecture-MYTAB-2026-08-21/ARCHITECTURE-SPINE.md
colors:
  paper: '#F4F7FA'
  surface: '#FFFFFF'
  sunk: '#EDF2F7'
  ink: '#0A2038'
  ink-muted: '#55677D'
  ink-subtle: '#61748B'
  border: '#DFE7EF'
  border-strong: '#C6D2DE'
  primary: '#1E51D2'
  primary-soft: '#E7EDFC'
  primary-deep: '#17409F'
  tip: '#A85F2E'
  tip-soft: '#F8EDE4'
  settled: '#0B7561'
  settled-soft: '#E1F0EC'
  owed: '#B32B44'
  owed-soft: '#FBE9EC'
  warning: '#9A6209'
  warning-soft: '#FBF1E0'
  avatar-1: '#B0603E'
  avatar-2: '#1E51D2'
  avatar-3: '#0B7561'
  avatar-4: '#9A6209'
  avatar-5: '#55677D'
typography:
  family:
    note: '"Instrument Sans", ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif'
  micro-label:
    size: 11px
    weight: 600
    tracking: '0.07em'
    transform: uppercase
  amount-hero:
    size: 42px
    weight: 600
    tracking: '-0.032em'
    numerals: tabular
  amount-lg:
    size: 34px
    weight: 600
    numerals: tabular
  amount-md:
    size: 24px
    weight: 600
    numerals: tabular
  amount-row:
    size: 15px
    weight: 500
    numerals: tabular
  title:
    size: 20px
    weight: 600
  body:
    size: 15px
    weight: 400
  label:
    size: 13px
    weight: 500
  meta:
    size: 13px
    weight: 400
rounded:
  sm: 10px
  md: 12px
  lg: 20px
  full: 999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '7': 32px
  '8': 48px
components:
  - balance-hero
  - tab-card
  - claim-row
  - participant-chip
  - presence-stack
  - sticky-claim-footer
  - breakdown-row
  - payment-sheet
  - token-chip
  - disclosure-row
  - settlement-stepper
  - all-square-card
  - activity-row
  - amount-pair
  - discrepancy-card
---

> ## ⚠ Amendment notice — read `docs/DECISIONS.md` first
>
> **This document remains the sole visual authority** for palette, typography, spacing,
> elevation, component appearance and the visual anti-patterns. Nothing below is retired.
>
> Specific sections have been superseded by evidence gathered after it was written, and the
> reasoning for each change lives in **`docs/DECISIONS.md`**, which is binding:
>
> - **D-13** — photography on Launch and first run, `paper`-on-`ink` primary action over an
>   image, monochrome lockup, navy scrim, Schibsted Grotesk wordmark. *(Already amended into
>   §Colors and §Typography below; D-13 records why.)*
> - **D-15** — §Layout: the 390px column is a **design width, not a layout cap**. The
>   implemented cap is `min(100%, 480px)`.
> - **D-16** — §Components, `all-square-card`: the wash is **46%**, not 40%, and uses two
>   tokens this file does not define (`tip-wash-top`, `tip-wash-mid`), because `colors/tip` is
>   too dark to sit behind 42px ink.
> - **D-09 / D-22** — §Components, `token-chip` "**No token logos**" is superseded on the
>   D-22 picker. Logos ship there. `Powered by Jupiter` ships as that picker's footer — an
>   approved exception to the banned-copy list for a contractual string (U-1 resolved). Do
>   not add logos or the string to a second surface.
> - **D-03 / D-22** — the anti-swap-UI position is **strengthened**, not weakened. D-22
>   amends "the mechanism does not get a screen": a token picker, a live quote and a
>   plainly stated price-protection figure are now a first-class surface. Banned copy still
>   applies at full force.
>
> The canonical demo fixture named below (Sukhumvit Dinner, ฿1,840.00) is a **design
> reference only**. Per **D-11**, no fixture or demo data ships in application source.


## Brand & Style

**Authority.** This final file is the sole visual authority. `EXPERIENCE.md` is the behavioral authority; Stitch prompts and canvas artboards are reference outputs and must be corrected when they disagree. The canonical demo fixture is Sukhumvit Dinner, five people, ฿1,840.00 total, with Andre owing ฿291.74 (`240.00 + 24.00 + 18.48 + 9.25 + 0.01`).

My Tab is a social app that happens to move money. Every visual decision defends that sentence.

The category it must not join is obvious on sight: dark canvases, purple-to-blue gradients, glass panels, neon accents, token logos used as navigation, a wallet balance where a greeting should be. That aesthetic tells a group of friends splitting a dinner that they have wandered into someone else's software. My Tab goes the other way — cool paper, navy ink, one deep confident blue, and amounts set large enough to read across a table.

The register is **premium financial craft applied to a social act**. It borrows its discipline from the best payments software — precise type, cool near-white surfaces, deep navy rather than black, hairline structure, restraint with color — and spends none of it on looking technical. The result should read the way a well-made statement reads: someone competent handled this, and nothing here is guessing.

The reference object is still a paper tab at a restaurant: something shared, marked up by several hands, settled together. But the paper is good paper. Surfaces are cool off-white rather than cream or clinical white. Depth comes from a hairline border plus the faintest ambient lift. The only chromatic warmth in the product is a tip or a completed tab — burnished terracotta, used twice in the whole system, so it still means something when it appears.

Light mode only. Telegram may be dark around it; My Tab stays paper.

## Colors

Every value has exactly one job. A color used for two meanings is a defect.

The palette is built on one idea: **the neutrals are cool and the accents are deep.** Nothing is bright. Saturation is spent on meaning — owed, settled, needs-attention — never on decoration. Every text pairing below clears WCAG AA at its real size; the two that were borderline were darkened until they passed rather than shipped as "close enough."

**Neutrals — the premium tell**

- **Paper (`#F4F7FA`)** — the app canvas, always. A cool near-white with a trace of blue, not a warm cream and not grey UI chrome.
- **Surface (`#FFFFFF`)** — cards, sheets, inputs. The written-on layer above the paper.
- **Sunk (`#EDF2F7`)** — inset panels inside a surface, such as an expanded disclosure. One step down, never a second border.
- **Ink (`#0A2038`)** — primary text. **Deep navy, never black.** This single substitution does more premium work than any other value in the system: black text reads as a default, navy text reads as a decision.
- **Muted Ink (`#55677D`)** — slate. Metadata, helper text, timestamps, secondary amounts.
- **Subtle Ink (`#61748B`)** — uppercase micro-labels only. One tier quieter than muted; never body copy.
- **Border (`#DFE7EF`)** — the workhorse hairline. One pixel, everywhere structure is needed.
- **Border Strong (`#C6D2DE`)** — only where a hairline genuinely disappears against a fill.

**Action**

- **Tab Blue (`#1E51D2`)** — the only action color **on the paper canvas**. Primary buttons, selection, links, focus. Deep and confident rather than bright; a saturated blue reads as a consumer app, this one reads as software that moves money. Never decorative, never a background wash, never a gradient stop.
- **Tab Blue Soft (`#E7EDFC`)** — the "this one is yours" tint. Selected rows, active chips. It marks ownership, nothing else.
- **Tab Blue Deep (`#17409F`)** — pressed and link-hover only.

**Photographic surfaces — Launch and first run only**

These are the two screens with no money on them, and the only two where a photograph is permitted. The cool-paper system withholds warmth from the ledger on purpose; it belongs here instead.

- **The primary action is `paper` on `ink`**, never Tab Blue. Blue over a photograph is the one element that visibly did not come from the image; `paper` is the exact canvas colour of every screen behind it, so the button reads as the app arriving rather than a control dropped onto a picture. It also keeps blue meaning one thing.
- **The lockup is monochrome white.** The two-colour mark is correct on paper, where the blue tear is a colour boundary against a light ground. Over an image it reads as a sticker.
- **A navy scrim, never a black one** — `rgba(10,32,56,…)`. Black scrim over navy ink is the one place the "never black" rule is most visible.
- No photograph appears on any surface carrying an amount. This is not a stylistic preference; it is the trust argument.

**Semantic — deep, never alarming**

- **Settled (`#0B7561`)** — a deep emerald with teal in it. Paid, received, all square, confirmed minimum-receive.
- **Owed (`#B32B44`)** — deep crimson. Owed, failed, disputed, destructive. Used at text weight, not as a filled alarm panel; this is a dinner bill, not an outage.
- **Warning (`#9A6209`)** — amber. Unassigned items, expiring quotes. The "needs a human" color, distinct from failure.
- **Tip (`#A85F2E`)** — burnished terracotta. Tips and the all-square celebration, and nothing else. The one warm note against a cool system; its scarcity is what makes it read as an occasion.
- Each has a `-soft` companion (`settled-soft`, `owed-soft`, `warning-soft`, `tip-soft`) for the rare tinted panel. A soft tint never carries text of its own color below 13px.

**Avatars (`avatar-1…5`)** — terracotta, blue, emerald, amber, slate, at matched lightness so a row of five reads as one family. Assigned deterministically by user id. White initials clear AA on all five.

**Avoid:** any gradient except the single all-square wash · any color not in this table · saturated fills behind body text · filled red error panels · pure black or pure grey · semantic color carried by hue alone (see the Accessibility Floor in `EXPERIENCE.md`).

## Typography

**Schibsted Grotesk SemiBold** sets the wordmark, and nothing else — not a heading, not a label, not a single line of UI text. A warmer grotesque than the UI face, with enough character to work as a mark and enough shared DNA that the two read as relatives. It is loaded on Launch only.

**Instrument Sans** with a system fallback stack, at a 15px body, set with a hair of negative tracking (`-0.006em`) throughout. It is a modern grotesque with tight apertures and engineered proportions — it reads considered rather than friendly, which is the whole difference between a consumer app and a financial one. Amounts are the display type; this product has no headlines competing with them.

`amount-hero` (42px) appears once per screen at most: the balance on Tabs, the total on the all-square card. `amount-lg` (34px) carries the obligation on the payment sheet and the amount in flight on payment progress. `amount-md` (24px) is the running personal subtotal in the claim footer. `amount-row` (15px) is every amount inside a list.

**Every numeral in the product is tabular.** Amounts stack in columns down the right edge of lists and must align on the decimal without exception. A proportional figure anywhere in this product is a bug.

Display sizes carry negative tracking that tightens as they grow — `-0.032em` at 42px, `-0.028em` at 34px, `-0.02em` at 24px, `-0.018em` on titles. Large type set at default tracking is the most common tell of an unconsidered interface.

`title` (20px) is a screen header. `micro-label` (11px, 600, `0.07em`, uppercase, in `colors/ink-subtle`) is the section heading — the one place all-caps is correct, and a deliberate borrowing from financial software, where a quiet letterspaced label above a group of figures signals structure without competing with it. `label` (13px, medium) is a control label. `meta` (13px, regular, muted) is everything explanatory. There are no display sizes above `amount-hero`.

Thai and Latin text share the stack and appear together in item names on scanned receipts — line height must accommodate Thai ascenders and descenders without clipping.

## Layout & Spacing

Scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48. Screen gutters are `spacing/4` (16px) and hold at 320px width. Card padding is `spacing/5` (20px). Related elements sit at `spacing/2`; unrelated sections at `spacing/6` or `spacing/7`.

Single column, always. Design width 390px; the layout must survive 320px and never scroll horizontally. On Telegram Desktop the same column centers on the paper canvas — there is no wide layout.

The vertical rhythm on every screen resolves to one dominant action. Where a screen has a primary action it is pinned to the bottom above the safe area on a `colors/surface` bar with a top `colors/border` — never floating, never a circular FAB.

## Elevation & Depth

**Depth is border-led, with one hairline of lift.** A card is `colors/surface` on `colors/paper` with a 1px `colors/border` plus `0 1px 2px rgba(10, 32, 56, 0.045)` — a shadow so faint it is felt rather than seen. The border still does the structural work; the lift only stops white-on-near-white from reading flat. Removing it should make the page look slightly cheaper, not obviously different. That is the correct amount.

Primary buttons carry `inset 0 -1px 0 rgba(10, 32, 56, 0.24)` — a single darker bottom edge that gives the fill a physical edge instead of a flat rectangle.

A real shadow is reserved for exactly one thing: a sheet that genuinely floats above content it obscures — the payment sheet, the token picker. Those get a soft shadow and a dimmed scrim beneath. Nothing else. No hover lift, no pressed elevation, no layered card stacks.

Hierarchy comes from typographic scale and whitespace. If a layout needs a shadow to be legible, the layout is wrong.

## Shapes

`rounded/sm` (10px) — inputs, buttons, small controls.
`rounded/md` (12px) — cards, list containers, item rows.
`rounded/lg` (20px) — the top corners of bottom sheets only.
`rounded/full` — avatars, participant chips, token chips, preset amount chips, status dots.

The contrast between soft-rectangular surfaces and fully-round people is deliberate: **people are circles, money is rectangles.** Avatars, presence stacks, and member chips read as human; cards, rows, and sheets read as document.

Do not round every container. Lists are separated by `colors/border` hairlines inside one card, not by giving each row its own card.

## Components

Visual specification only — behavior lives in `EXPERIENCE.md.Component Patterns`.

| Component | Visual spec |
|---|---|
| `lockup` | Mark left, wordmark right, as one object. Mark at `0.95em` against a cap height of ~`0.72em`, so it overshoots the word and reads level. `Schibsted Grotesk` 600 at `-0.032em`. Two-colour on paper, monochrome white over a photograph. |
| `balance-hero` | `amount-hero` in `colors/owed`, `colors/settled`, or `colors/ink` by state; `meta` sub-line beneath. No container, no card — it sits directly on `colors/paper`. |
| `tab-card` | `colors/surface`, `rounded/md`, 1px `colors/border`, `spacing/5` padding. Title in `body` semibold, `meta` sub-line, 4px progress bar, right-aligned `amount-row`. |
| `claim-row` | Full-bleed row inside a bordered list. Item name in `body`, price right-aligned `amount-row`, avatar stack beneath the name. Unclaimed carries a 3px `colors/warning` left edge; owned by the viewer takes a `colors/primary-soft` fill. |
| `participant-chip` | `rounded/full` avatar, 28px in stacks and 40px in selectors, `label` name beneath. Selected state is a 2px `colors/primary` ring, never a fill. |
| `presence-stack` | Overlapping 24px avatars at -8px offset, max 3 plus a `+n` counter, with a 6px `colors/settled` dot. |
| `sticky-claim-footer` | `colors/surface`, top 1px `colors/border`, two lines: `meta` reconciliation line, then `amount-md` personal subtotal paired with a full-height `colors/primary` action. |
| `breakdown-row` | Name left, `amount-row` right. Expanded state reveals indented `meta` sub-lines with their own right-aligned amounts. |
| `payment-sheet` | `colors/surface`, `rounded/lg` top corners, grab handle, soft shadow over a scrim. Fixed 52px `colors/primary` action at the bottom. |
| `token-chip` | `rounded/full`, `colors/primary-soft` fill with 1px `colors/primary` border when selected, otherwise `colors/surface` with `colors/border`. Token name in `label`, balance in `meta`. **No token logos.** |
| `disclosure-row` | Full-width row, `body` label, chevron right, 1px `colors/border` top and bottom. Collapsed by default. Contents are `meta` on `colors/paper`. |
| `settlement-stepper` | Vertical, 4 steps, 2px `colors/border` connector. Complete: `colors/settled` filled circle with check. Active: `colors/primary` ring, animated. Pending: hollow `colors/border` circle. Failed: `colors/owed` circle. |
| `all-square-card` | Full screen. `colors/tip` wash fading into `colors/paper` across the top 40%. Centered check in a ring, `amount-hero` headline, `presence-stack`, `colors/primary` action. |
| `activity-row` | 32px `rounded/full` icon tinted by event type, `body` sentence, right-aligned `amount-row` where applicable, `meta` relative timestamp. |
| `amount-pair` | The universal money line: `label` left, `amount-row` right. Every disclosed figure in the product uses this. |
| `discrepancy-card` | `colors/warning` text and 1px border on a 6%-opacity amber fill, `rounded/md`, `spacing/5` padding. Sticky at the top of Receipt Review. |

## Do's and Don'ts

**Do**

- Lead every screen with the amount, then the person, then the mechanism.
- Use `colors/border` hairlines to separate rows inside one card.
- Keep tabular numerals on every figure, in every state, including skeletons.
- Show a name and an avatar wherever a wallet address could have gone.
- Let one action dominate each screen.

**Don't**

- Ship a dark variant, a glass panel, or a neon accent. The all-square wash is the only gradient in the system.
- Set black text. Text is navy; the substitution is load-bearing.
- Leave large type at default tracking.
- Put a token logo, a price chart, a portfolio value, or a network selector anywhere.
- Use a sparkle, wand, or robot icon for receipt scanning.
- Wrap each section in its own rounded card.
- Use shadow for hierarchy on anything that is not a floating sheet.
- Lead a payment surface with an address, a mint, or transaction bytes.
