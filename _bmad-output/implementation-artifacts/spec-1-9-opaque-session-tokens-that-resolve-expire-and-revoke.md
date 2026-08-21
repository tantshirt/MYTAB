---
title: 'Story 1.9: Opaque session tokens that resolve, expire, and revoke'
type: feature
created: '2026-08-21'
status: done
---

## Intent

Opaque randomly generated session tokens hashed at rest; tab_session (24h reusable) and action_token (10m single-use); resolve/revoke in Convex; cron expiry sweep; HTTP deep-link stub.

## Code Map

- `convex/schema.ts` — `sessionTokens` table
- `convex/lib/sessionTokenSync.ts` — generate, hash, TTL, failure codes
- `convex/lib/sessionTokenOps.ts` — mint, resolve, revoke, consume, sweep
- `convex/sessionTokens.ts` — resolveTabSession, revokeToken, consumeToken
- `convex/internal/sessionTokens.ts` — mintDeepLinkToken internal mutation
- `convex/crons.ts` — hourly expired token sweep
- `convex/http.ts` — POST `/telegram/deep-link` stub

## Verification

- `npm test` — `tests/convex/session-tokens.test.ts`
