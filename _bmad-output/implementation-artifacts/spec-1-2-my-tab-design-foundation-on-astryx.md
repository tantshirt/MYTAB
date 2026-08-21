---
title: 'Story 1.2: My Tab design foundation on Astryx'
type: feature
created: '2026-08-21'
status: done
---

## Intent

Complete My Tab token set, Instrument Sans via next/font, Astryx theme provider, tabular numerals, and app shell layout frame.

## Code Map

- `lib/theme/tokens.ts` — 21 colors, 4 radii, 8 spacing steps, typography roles
- `lib/theme/myTabTheme.ts` — defineTheme extending neutralTheme, light only
- `lib/theme/fonts.ts` — Instrument Sans via next/font
- `lib/theme/globalStyles.ts` — tabular numerals + type scale CSS
- `components/theme/MyTabThemeProvider.tsx` — full Theme wrapper
- `components/layout/AppShell.tsx` — 390px column, gutters, bottom tab bar
- `app/layout.tsx` — font wiring

## Verification

- `npm test` — `tests/theme/my-tab-theme.test.ts`
- `npm run build`
