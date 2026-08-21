---
title: 'Story 2.8: Telegram-native runtime affordances'
type: feature
created: '2026-08-21'
status: done
---

## Intent

Safe area + viewport hooks, Telegram BackButton wiring, sanctioned haptics helper, expanded mode on launch, startParam for deep links.

## Code Map

- `features/telegram/TelegramRuntimeProvider.tsx` — expand, startParam
- `features/telegram/useSafeAreaInsets.ts`
- `features/telegram/useTelegramViewport.ts`
- `features/telegram/useTelegramBackButton.ts` — back + haptics

## Verification

- Manual in Telegram Mini App; hooks degrade silently in browser
