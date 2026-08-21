---
title: 'Story 1.7: Verified Telegram identity bound to the Privy DID'
type: feature
created: '2026-08-21'
status: done
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-5-a-privy-access-token-authenticates-a-convex-query.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** My Tab must bind a verified Telegram identity to the Privy DID using server-validated raw `initData`, not client claims.

**Approach:** Add `users` and `telegramContexts` tables, pure initData HMAC verification, authenticated `POST /telegram/bootstrap` HTTP Action, internal `bindTelegramIdentity` mutation, shared auth helpers, and client bootstrap after Privy auth.

## Boundaries & Constraints

**Always:** Validate HMAC before extracting fields. Five-minute `auth_date` and context TTL. Privy bearer JWT required on bootstrap. Internal mutations only. Fixture verifier when `TELEGRAM_BOT_TOKEN` is absent.

**Never:** Store raw Privy tokens. Read or trust `initDataUnsafe` server-side. Public bootstrap mutation. Vercel write bridge.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid bootstrap | Privy JWT + valid initData | User linked, context refreshed | 200 OK |
| Invalid HMAC | Tampered initData | No write | 400 INVALID_INIT_DATA |
| Stale auth_date | initData > 5 min old | No write | 400 EXPIRED_AUTH_DATE |
| Cross-DID replay | Same initData hash, different DID | Audited reject | 409 INIT_DATA_REPLAY |
| Same-DID reload | Same initData hash | Idempotent refresh | 200 OK |
| Mutation without context | Privy only | — | TELEGRAM_CONTEXT_REQUIRED |
| Fixture mode | No bot token | Fixture HMAC path | Tests pass offline |

</intent-contract>

## Code Map

- `convex/schema.ts` — users + telegramContexts tables and indexes
- `convex/lib/auth.ts` — requireIdentity, getCurrentUser, requireTelegramContext
- `convex/lib/telegramVerify.ts` — Convex bot token + fixture wrapper
- `lib/telegram/verify.ts` — pure HMAC verification (shared/tests)
- `lib/telegram/client.ts` — Convex `.site` URL helper
- `convex/http.ts` — POST /telegram/bootstrap
- `convex/internal/telegram.ts` — bindTelegramIdentity internal mutation
- `features/telegram/useTelegramBootstrap.ts` — client bootstrap hook
- `features/telegram/TelegramBootstrapGate.tsx` — wired in AuthGate
- `features/auth/AuthGate.tsx` — bootstrap after Privy auth
- `tests/convex/telegram-verify.test.ts` — HMAC + freshness tests
- `tests/convex/auth-helpers.test.ts` — auth helper tests

## Tasks & Acceptance

**Execution:**
- Schema with users (privyDid, telegramUserId, profile fields) and telegramContexts (5-min TTL)
- Pure initData verify + fixture mode
- HTTP bootstrap with Privy JWT auth
- Internal bindTelegramIdentity with replay protection
- Client hook + AuthGate wiring
- Unit tests

**Acceptance Criteria:**
- AC1: Server-verified initData binds identity via HTTP Action + internal mutation only
- AC2: users stores separate privyDid and telegramUserId after both verifications
- AC3: getCurrentUser uses by_privy_did index
- AC4: Only displayName, username, avatarUrl persisted; no Privy token storage
- AC5: Privy-only session (no parallel Telegram token)
- AC6: requireTelegramContext throws TELEGRAM_CONTEXT_REQUIRED

## Verification

**Commands:**
- `npm test` — telegram-verify + auth-helpers tests
- `npm run build` — Next.js build succeeds

**Manual (Day 0 gate):**
- Open deployed Mini App in Telegram group
- Confirm bootstrap returns 200 and viewer/user link exists in Convex dashboard

## Spec Change Log

- 2026-08-21: Initial spec and implementation
