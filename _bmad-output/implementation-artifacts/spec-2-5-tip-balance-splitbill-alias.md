---
title: 'Story 2.5: `/tip`, `/balance`, and the `/splitbill` alias'
type: feature
created: '2026-08-21'
status: done
---

## Intent

Register /tab, /splitbill, /tip, /balance; splitbill aliases tab; tip posts card; balance mints scoped token without group message.

## Code Map

- `convex/lib/tabCommandSync.ts` — BOT_COMMANDS, normalizeBotCommand, routeBotCommand
- `convex/lib/telegramUpdateSync.ts` — routes commands in processTelegramUpdate

## Verification

- `npm test` — `tests/convex/tab-commands.test.ts`
