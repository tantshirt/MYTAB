---
title: 'Story 2.6: A deep link lands in a scoped session with the tab bar hidden'
type: feature
created: '2026-08-21'
status: done
---

## Intent

/tabs/[publicToken] opens scoped tab surface with hidden bottom tab bar; invalid tokens land on Tabs with plain copy; fixture Sukhumvit Dinner demo.

## Code Map

- `features/tabs/TabDeepLinkSurface.tsx` — deep link surface + back control
- `components/layout/AppShell.tsx` — hideTabBar prop
- `convex/sessionTokens.ts` — resolveTabSession mutation
- `app/(miniapp)/tabs/[publicToken]/page.tsx` — route entry

## Verification

- Manual: open /tabs/{token} in fixture mode; tab bar hidden
