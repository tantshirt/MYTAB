---
title: 'Story 2.1: Telegram webhook ingress that verifies, normalizes, and returns fast'
type: feature
created: '2026-08-21'
status: done
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-verified-telegram-identity-bound-to-the-privy-did.md'
---

<intent-contract>

## Intent

**Problem:** Telegram bot updates must enter Convex through one verified HTTP ingress that deduplicates by update id and returns before slow work.

**Approach:** Add `POST /telegram/webhook` in `convex/http.ts`, pure normalization/secret helpers in `lib/telegram/webhook.ts`, Convex env wrapper, `telegramUpdates` idempotency table, and internal `processUpdate` mutation that schedules no slow work inline.

## Boundaries & Constraints

**Always:** Constant-time `X-Telegram-Bot-Api-Secret-Token` verification before parsing. Internal mutations only. Persist idempotency in Convex. Return 200 quickly after durable acceptance.

**Never:** Vercel webhook route. Public mutation ingress. Bill logic, authorization, DFlow, or ledger writes in the HTTP handler.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid secret + message | Group `/tab` update | 200, one processed row | — |
| Missing/wrong secret | Any body | 401, no mutation | No state change |
| Duplicate update_id | Same payload twice | 200, one effect | Second call duplicate |
| Unsupported update | callback_query only | 200 ignored | No group write |
| Invalid JSON/body | Malformed payload | 400 | No mutation |
| Fixture mode | No webhook secret env | Fixture secret accepted | Tests/build offline |

</intent-contract>

## Code Map

- `lib/telegram/webhook.ts` — secret verify, bot id extract, update normalization
- `convex/lib/telegramWebhook.ts` — env + fixture secret wrapper
- `convex/lib/telegramUpdateSync.ts` — idempotent process helper
- `convex/schema.ts` — `telegramUpdates` table + index
- `convex/http.ts` — POST `/telegram/webhook`
- `convex/internal/telegram.ts` — `processUpdate` internal mutation
- `tests/convex/telegram-webhook.test.ts` — verification + idempotency tests

## Tasks & Acceptance

**Execution:**
- Single Convex HTTP ingress with secret verification
- Normalize message, chat_member, my_chat_member; ignore unsupported
- Idempotency by `(botId, updateId)` in `telegramUpdates`
- Fixture webhook secret when `TELEGRAM_WEBHOOK_SECRET` absent
- Unit tests for secret, normalization, replay

**Acceptance Criteria:**
- AC1: One ingress; constant-time secret verify; rejects bad secret with no mutation
- AC2: Adapter only — verify, normalize, invoke internal mutation, return
- AC3: Returns without waiting for slow downstream work
- AC4: Identical update delivered twice produces exactly one effect; test replays payload
- AC5: Unsupported updates return 200 with no domain state change

## Verification

**Commands:**
- `npm test` — telegram-webhook tests
- `npm run build` — Next.js build succeeds

**Manual:**
- POST sample update to `/telegram/webhook` with fixture secret in dev
- Replay same `update_id` and confirm single `telegramUpdates` row
