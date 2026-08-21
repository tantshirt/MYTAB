---
title: 'Story 2.4: One status message per tab, edited in place'
type: feature
created: '2026-08-21'
status: done
---

## Intent

One telegramStatusMessages record per tab; edit-in-place stub; preview environments skip real posts.

## Code Map

- `convex/schema.ts` — `telegramStatusMessages`
- `convex/lib/telegramBot.ts` — upsertTelegramStatusMessageRecord, editTelegramStatusMessage

## Verification

- Covered by tab command integration tests and fixture bot logging
