---
title: 'Story 2.7: The Group surface'
type: feature
created: '2026-08-21'
status: done
---

## Intent

GroupSurface shows currency defaults, member list with wallet readiness and deterministic avatar tints, open tab cards, and empty state.

## Code Map

- `features/groups/GroupSurface.tsx`
- `convex/tabs.ts` — listOpenTabsForGroup, getGroupDefaults
- `app/(miniapp)/page.tsx` — fixture GroupSurface on Tabs home

## Verification

- `npm test` — `tests/features/group-surface.test.tsx`
