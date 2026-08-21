---
title: 'Story 2.2: A My Tab group resolved from the verified Telegram chat'
type: feature
created: '2026-08-21'
status: done
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-telegram-webhook-ingress-that-verifies-normalizes-and-returns-fast.md'
---

<intent-contract>

## Intent

**Problem:** My Tab must treat Telegram groups as first-class server-owned entities with member profiles scoped to verified chat ids from webhook ingress — never client claims.

**Approach:** Add `groups` and `groupMembers` tables, `resolveGroupFromChat` internal helper invoked from webhook processing, `requireGroupMember` auth helper, and `groups.getGroup` query exposing display fields and wallet readiness.

## Boundaries & Constraints

**Always:** Group creation/resolution keyed by server-verified `chat.id` from webhook. Member upserts from message and `chat_member` updates. Profile fields limited to rendered UI data.

**Never:** Accept client-supplied chat id or membership. Infer membership from links or initData alone in public mutations.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First group message | New supergroup chat id | Group + active member created | — |
| Repeat message | Known chat id | Group display name refreshed | Member upserted |
| chat_member left | Lifecycle update | membershipStatus left | Write scope revoked |
| my_chat_member | Bot admin change | botIsAdmin updated on group | — |
| getGroup query | Active member + wallet | walletReady true/false | — |
| Non-member query | Unknown telegram user | — | NOT_GROUP_MEMBER |

</intent-contract>

## Code Map

- `convex/schema.ts` — `groups`, `groupMembers` tables and indexes
- `convex/lib/groupSync.ts` — `resolveGroupFromChat` upsert logic
- `convex/internal/telegram.ts` — webhook processing invokes group sync
- `convex/lib/auth.ts` — `requireGroupMember` shared helper
- `convex/groups.ts` — `getGroup` query with wallet readiness
- `tests/convex/telegram-webhook.test.ts` — group resolution coverage

## Tasks & Acceptance

**Execution:**
- Schema for groups keyed by `telegramChatId`
- groupMembers with role, membershipStatus, verificationSource, verifiedAt
- resolveGroupFromChat from verified webhook updates (message + membership stub)
- requireGroupMember for future public group-scoped functions
- getGroup exposes displayName, avatar, member join state, role, walletReady

**Acceptance Criteria:**
- AC1: Groups created/matched from verified webhook chat id only
- AC2: Read model exposes display name, avatar, member state, role, wallet readiness
- AC3: requireGroupMember resolves from groupMembers and throws otherwise
- AC4: Only rendered profile fields stored; no message body retention
- AC5: Membership lifecycle stub via chat_member webhook updates (full getChatMember in later story)

## Verification

**Commands:**
- `npm test` — group resolution tests in telegram-webhook suite
- `npm run build` — Next.js build succeeds

**Manual:**
- Deliver webhook message update and inspect `groups` / `groupMembers` rows in Convex dashboard
