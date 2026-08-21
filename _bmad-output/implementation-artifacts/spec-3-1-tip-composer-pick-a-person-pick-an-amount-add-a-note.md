---
title: 'Story 3.1: Tip Composer — pick a person, pick an amount, add a note'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** Tipping must feel like sending a message, not initiating a transfer.

**Approach:** `features/tips/TipComposer.tsx` renders verified group members as `participant-chip`, THB preset/custom amounts converted to integer minor units then fixture USDC atomic, optional note/reaction stored on the tip record, and submits via `settlements.createTipIntent`.

## Code Map

- `features/tips/TipComposer.tsx` — composer surface
- `components/primitives/participant-chip.tsx` — recipient selector
- `lib/domain/fxFixture.ts` — THB minor → USDC atomic (fixture)
- `convex/lib/settlementIntentSync.ts` — note/reaction/displayAmountThbMinor on tip insert
- `convex/settlements.ts` — extended `createTipIntent` args
- `convex/schema.ts` — `tips.note`, `tips.reaction`, `tips.displayAmountThbMinor`
- `tests/features/tip-composer.test.tsx`

## Acceptance Criteria

- AC1: Verified active members only; single-select ring; no wallet addresses
- AC2: Presets + custom; integer minor units; fixture USDC atomic for settlement
- AC3: Note and reaction optional; stored on tip when supplied
- AC4: Pre-selected recipient via `preselectedRecipientUserId`

## Verification

- `npm test` — `tip-composer.test.tsx`, `fx-fixture.test.ts`
- `npm run build`

</intent-contract>
