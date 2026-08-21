---
title: 'Story 2.3: `/tab` starts a tab and posts the deep-link card'
type: feature
created: '2026-08-21'
status: done
---

## Intent

/tab creates a draft tab, mints tab_session token, posts fixture Telegram status card with [Open tab] deep link.

## Code Map

- `convex/schema.ts` — `tabs`, `tabCreationCounts`, `telegramStatusMessages`
- `convex/lib/tabCommandSync.ts` — startTabForGroup, rate limits, dedup window
- `convex/lib/telegramBot.ts` — post/edit status message stubs
- `convex/lib/telegramDeepLink.ts` — deep link URL builder
- `convex/lib/telegramUpdateSync.ts` — command routing after group resolve

## Verification

- `npm test` — `tests/convex/tab-commands.test.ts`, webhook idempotency tests
