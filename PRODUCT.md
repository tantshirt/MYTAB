---
name: My Tab
register: product
status: final
created: '2026-08-22'
sources:
  - _bmad-output/planning-artifacts/briefs/brief-MYTAB-2026-08-21/brief.md
  - _bmad-output/planning-artifacts/prds/prd-MYTAB-2026-08-21/prd.md
  - _bmad-output/planning-artifacts/ux-designs/ux-MYTAB-2026-08-21/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-MYTAB-2026-08-21/EXPERIENCE.md
---

# My Tab — Product Context

> Synthesized from the binding BMad planning artifacts listed above. Those artifacts remain
> the authority. `DESIGN.md` (root, symlinked to the UX artifact) is the visual authority;
> `EXPERIENCE.md` in the same folder is the behavioral authority.

## Register

**Product.** Design serves the product. This is an app surface — a Telegram Mini App
running inside Telegram's in-app browser at a 390px design width, 320px functional floor.
There is a marketing story, but it is not built here. Every screen in this repo is a
working surface a person uses at a restaurant table with 8% battery.

## What it is

**My Tab is the group tab that lives in Telegram.** Start it, split it, tip the crew,
and settle without leaving the chat. A group photographs a restaurant bill, everyone
claims their own items on their own phone at the same time, My Tab computes each
person's exact share with transparent tax/service/tip/rounding, and each person settles
in whatever token they hold — the recipient always receives USDC, and the network fee is
sponsored so nobody sees "gas."

It is **a social app that happens to move money.** Every decision defends that sentence.

## Users & Context

Protagonists are fixed across every flow and mirror the demo dataset:

- **Maya**, 31 — organizes the Thursday dinner for a twelve-person Bangkok group chat and
  always ends up fronting the bill. She is the organizer: names the tab, scans the
  receipt, locks the bill.
- **Andre**, 28 — in the group, has never owned a crypto wallet, and does not intend to
  start now. He is the participant: taps a link, taps his dishes, taps pay.
- **Noi, Ploy, Tim** — round out the table. Two of them will claim the same dish.

**Context of use:** standing at a restaurant table, plates being cleared, several phones
out at once, someone already asking about the taxi. Low battery, one-handed, in public,
in a hurry. Nobody will read anything longer than a sentence.

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

## Anti-references

The category it must not join is obvious on sight:

- **The wallet app** — balance-first home, token list, connect-wallet gate, portfolio
  value, network selector. Puts the mechanism where the social context belongs and makes
  My Tab legible as a crypto app in under a second.
- **The DeFi terminal** — dark canvas, purple-to-blue gradient, glass panels, neon accents,
  token logos used as navigation, route diagrams, slippage sliders, price-impact warnings.
- **Splitwise as a destination** — the ledger is not the product. My Tab's ledger is a
  consequence of settling.
- **AI framing** — sparkles, wands, "magic", confidence percentages, a chat affordance.
  The model reads a receipt. Presenting it as intelligence invites the question of whether
  it can be trusted with money.
- **Celebration on every payment** — confetti per transaction spends the emotional peak on
  a routine act. The celebration fires once, when the *group* completes.
- **Notification pressure** — reminder pings, nudges, badge counts. The group chat already
  applies social pressure far more effectively.

## Strategic design principles

1. **Amount, then person, then mechanism.** Every screen leads with the number, names the
   human, and hides the plumbing behind one collapsed disclosure.
2. **Every amount is attributable.** No figure appears without a label. The breakdown is
   always one tap away, never one screen away. Rounding is disclosed as its own line.
3. **Numbers are never rounded in copy.** ฿291.74 is ฿291.74 on every surface. "About ฿292"
   is a defect — the entire trust argument is that the math is exact.
4. **Claiming is additive, never exclusive.** Two people tapping the same dish get
   "Split 2 ways", not a conflict dialog. The software never arbitrates a disagreement a
   real table would have resolved by sharing.
5. **One dominant action per screen**, pinned above the safe area. Never a floating FAB.
6. **Authentication is invisible.** No login screen, no "connect wallet", no wallet
   selection inside Telegram.
7. **Light mode only, unconditionally.** Telegram is frequently dark around it. My Tab
   stays paper.
8. **Motion is functional.** Three sanctioned animations: an avatar arriving in a stack
   (~200ms), a check drawing on confirmation (~400ms), the all-square wash (~600ms, once
   per bill). Everything else is an instant state swap.
9. **It must feel native, not webbed.** Telegram's own chrome (header color, back control,
   haptics, safe areas, swipe behavior) is part of the product surface, not something the
   page sits inside.

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
  truncates and never wraps mid-figure.
- Layout holds at 320px with the largest supported type size. No horizontal scroll anywhere.

## Banned in user-facing copy

execute · swap · route · approve · broadcast · transaction · signature · mint · ATA · gas ·
lamports · slippage · blockhash · RPC · wallet address · AI · powered by · seamless
