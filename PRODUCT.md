---
name: My Tab
register: product
status: final
created: '2026-08-22'
updated: '2026-08-22'
sources:
  - docs/DECISIONS.md
  - _bmad-output/planning-artifacts/briefs/brief-MYTAB-2026-08-21/brief.md
  - _bmad-output/planning-artifacts/prds/prd-MYTAB-2026-08-21/prd.md
  - _bmad-output/planning-artifacts/ux-designs/ux-MYTAB-2026-08-21/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-MYTAB-2026-08-21/EXPERIENCE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-MYTAB-2026-08-21/INVITE-FLOW.md
---

# My Tab — Product Context

> Synthesized from the artifacts listed above. **`docs/DECISIONS.md` is binding and wins over
> every other source, including this file.** `DESIGN.md` (root, symlinked to the UX artifact) is
> the visual authority; `EXPERIENCE.md` is the behavioral authority from the Claim Board onward;
> `INVITE-FLOW.md` is the authority on everything before it. Each carries an amendment banner
> naming the decisions that supersede specific sections.
>
> Amendments from the 2026-08-22 session, recorded in `docs/DECISIONS.md`:
>
> - **D-21 / D-25 / D-27** — principle 6's "no connect wallet" is superseded for wallet
>   provenance. Telegram identity stays invisible. Launch is a connect *prompt*, not a wall;
>   the board is reachable with no wallet.
> - **D-22** — DFlow gets a picker. Banned copy still applies at full force.
> - **D-23 / D-29** — principle 4 is extended: *k*-of-*n*, integer only.
> - **D-26** — §Users, Andre: the audience is crypto-native. He still claims at the table
>   with 8% battery; he is no longer someone who has never heard of a wallet.

## Register

**Product.** Design serves the product. This is an app surface — a Telegram Mini App
running inside Telegram's in-app browser. **Design width 390px; the column is capped at
`min(100%, 480px)` so a large phone gets its whole screen and Desktop gets a centred single
column; 320px functional floor.** There is a marketing story, but it is not built here.
Every screen in this repo is a working surface a person uses at a restaurant table with 8%
battery.

## What it is

**My Tab is the group tab that lives in Telegram.** Start it, split it, tip the crew,
and settle without leaving the chat. A group photographs a restaurant bill, everyone
claims their own items on their own phone at the same time, My Tab computes each
person's exact share with transparent tax/service/tip/rounding, and each person settles
in **whatever token they hold** — the recipient always receives USDC on Solana mainnet, and
the network fee is sponsored so nobody sees "gas."

**Starting a tab does not require a group chat.** A tab can begin in a Telegram group where
the bot is present, or from inside the Mini App from anywhere; the organizer shares a
seat-bounded invite through Telegram's own share sheet, sent by the person rather than by
the bot. One roster, two doors — the token admits, the roster authorizes. Promoting the bot
to group administrator is an upgrade that unlocks group cards, not a step anyone has to
complete before splitting a bill.

It is **a social app that happens to move money.** Every decision defends that sentence.

## Users & Context

Protagonists are fixed across every flow. They are a narrative cast for design and copy
work — **not a dataset that ships.** No sample bill, no seeded group and no demo affordance
exists in the product; a real deployment can only ever show real money.

- **Maya**, 31 — organizes the Thursday dinner for a twelve-person Bangkok group chat and
  always ends up fronting the bill. She is the organizer: names the tab, scans the
  receipt, invites the five people who actually ate, locks the bill.
- **Andre**, 28 — in the group, holds a wallet, claims at the table with 8% battery.
  He is the participant: taps a link, taps his dishes, pays from the wallet he already
  has. A Privy embedded wallet is the fallback for someone who has none, not his default.
  *(Revised by D-26.)*
- **Noi, Ploy, Tim** — round out the table. Two of them will claim the same dish. One of
  them was at dinner and is not in the group chat, which is exactly why the invite door
  exists.

**Context of use:** standing at a restaurant table, plates being cleared, several phones
out at once, someone already asking about the taxi. Low battery, one-handed, in public,
in a hurry. Nobody will read anything longer than a sentence. A dinner takes longer than
five minutes, and the software has to still be working when it ends.

**The job:** settle a shared bill without an argument and without anyone installing
anything.

## Brand personality

**Exact · Calm · Social.**

The register is **premium financial craft applied to a social act.** It borrows discipline
from the best payments software — precise type, cool near-white surfaces, deep navy rather
than black, hairline structure, restraint with color — and spends none of it on looking
technical. The reference object is a paper tab at a restaurant, marked up by several
hands, settled together. But the paper is good paper.

Voice: **a friend who is good with numbers.** Plain, specific, never apologetic, never
celebratory about ordinary events. Amounts are stated, not softened. Failures name the
next action in the same breath.

The one warm note is a photograph, and it is permitted on exactly two screens — Launch and
first run — because they are the only two that carry no amount. **No photograph appears on
any surface carrying a figure.** That is not a stylistic preference; it is the trust
argument.

## Anti-references

The category it must not join is obvious on sight:

- **The wallet app** — balance-first home, token list, connect-wallet gate, portfolio
  value, network selector. Puts the mechanism where the social context belongs and makes
  My Tab legible as a crypto app in under a second.
- **The DeFi terminal** — dark canvas, purple-to-blue gradient, glass panels, neon accents,
  token logos used as navigation, route diagrams, slippage sliders, price-impact warnings.
  **This one is now a live risk rather than a hypothetical**, because the product genuinely
  routes a swap when the payer does not hold USDC. The mechanism lives behind one collapsed
  disclosure row and gets no screen of its own. The payer sees one number: the amount the
  recipient is guaranteed to receive.
- **Splitwise as a destination** — the ledger is not the product. My Tab's ledger is a
  consequence of settling.
- **AI framing** — sparkles, wands, "magic", confidence percentages, a chat affordance.
  The model reads a receipt. Presenting it as intelligence invites the question of whether
  it can be trusted with money.
- **Celebration on every payment** — confetti per transaction spends the emotional peak on
  a routine act. The celebration fires once, when the *group* completes.
- **Notification pressure** — reminder pings, nudges, badge counts. The group chat already
  applies social pressure far more effectively. Exactly five events ever post to a group
  chat; the completion share is sent by the person through Telegram's own share sheet, not
  by the bot.

## Strategic design principles

1. **Amount, then person, then mechanism.** Every screen leads with the number, names the
   human, and hides the plumbing behind one collapsed disclosure.
2. **Every amount is attributable.** No figure appears without a label. The breakdown is
   always one tap away, never one screen away. Rounding is disclosed as its own line.
3. **Numbers are never rounded in copy.** ฿291.74 is ฿291.74 on every surface. "About ฿292"
   is a defect — the entire trust argument is that the math is exact. A stale figure holds
   its last value at 40% opacity; it never becomes a dash.
4. **Claiming is additive, never exclusive.** Two people tapping the same dish get
   "Split 2 ways", not a conflict dialog. The software never arbitrates a disagreement a
   real table would have resolved by sharing.
5. **One dominant action per screen**, pinned above the safe area. Never a floating FAB.
6. **Authentication is invisible, and so is admission.** No login screen, no "connect
   wallet", no wallet selection inside Telegram — and no onboarding chore before a first
   tab. "Start a tab" always works, from anywhere.
7. **Light mode only, unconditionally.** Telegram is frequently dark around it. My Tab
   stays paper.
8. **Motion is functional.** Three sanctioned animations: an avatar arriving in a stack
   (~200ms), a check drawing on confirmation (~400ms), the all-square wash (~600ms, once
   per bill). Everything else is an instant state swap.
9. **It must feel native, not webbed.** Telegram's own chrome (header color, back control,
   haptics, safe areas, swipe behavior) is part of the product surface, not something the
   page sits inside.
10. **Fail visibly, never silently.** A refusal names its cause and the next action —
    expired means ask for a new link, full means ask for a seat, revoked means the tab
    moved on. A surface that quietly shows an empty board instead of a reason is a defect,
    and a surface that shows a plausible-looking number it did not actually compute is a
    much worse one.

## Accessibility floor

- WCAG AA at real size for every text pairing. Two borderline pairs were darkened rather
  than shipped as "close enough."
- **Semantic color never travels alone.** Every state carried by owed/settled/warning also
  carries a word or a glyph.
- Touch targets ≥ 44px, including claim rows, token chips, and avatar chips.
- Screen readers: every interactive element announces role and state. The settlement
  stepper announces each transition once as a live region.
- Amounts read as money, not digits: "291 baht 73".
- Reduce Motion removes all three animations and all haptics; states change instantly.
- Dynamic type: body scales with the platform setting; `amount-hero` may compress but never
  truncates and never wraps mid-figure. **Names truncate; amounts never do** — the amount
  column is a reserved column, not content-sized.
- Layout holds at 320px with the largest supported type size. No horizontal scroll anywhere.
  Use `overflow-x: clip`, never `hidden` — `hidden` makes an element a scroll container and
  silently un-pins every sticky element on the page.

## Banned in user-facing copy

execute · swap · route · approve · broadcast · transaction · signature · mint · ATA · gas ·
lamports · slippage · blockhash · RPC · wallet address · AI · powered by · seamless

> **Open conflict:** Jupiter's licence requires the attribution string "Powered by Jupiter"
> wherever its token metadata is surfaced, and "powered by" is on this list. Nothing renders
> it today. See `docs/DECISIONS.md` U-1 — it needs an owner decision before the token
> selector ships.
