---
title: 'Story 3.10: The tip confirmation message in the group'
type: feature
created: '2026-08-21'
status: done
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** Confirmed tips should produce one warm group message naming both people and the amount.

**Approach:** `applyConfirmedInternal` schedules `enqueueTipConfirmation` after ledger write; idempotent `telegramOutboundMessages` row per tip; fixture stub marks posted without Telegram API.

## Code Map

- `convex/lib/telegramNotify.ts` — message format + queue + fixture deliver
- `convex/internal/settlementScheduler.ts` — `enqueueTipConfirmation`, `deliverTipConfirmationStub`
- `convex/settlements.ts` — schedules enqueue on tip confirmation
- `convex/schema.ts` — `telegramOutboundMessages`
- `tests/convex/telegram-notify.test.ts`

## Acceptance Criteria

- AC1: Queued only after parsed confirmation (not on submission)
- AC2: Names sender, recipient, and THB display amount
- AC3: No wallet address, link, or unrelated amounts
- AC4: Exactly one outbound row per tip (idempotent on retry)

## Verification

- `npm test` — `telegram-notify.test.ts`
- `npm run build`

</intent-contract>
