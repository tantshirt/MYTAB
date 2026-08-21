# Project Context — My Tab

Standing context for every AI agent working in this repository. Loaded automatically by BMad skills via `persistent_facts`. Keep it short; when it grows, move detail into the artifact that owns it.

**Status as of 2026-08-21:** greenfield and implementation-ready at the Day 0 gate. Product brief, PRD, architecture, research, final UX, all 70 stories, sprint status, and adversarial architecture/security audits are reconciled. No application code exists yet.

## What we are building

**My Tab is the group tab that lives in Telegram. Start it, split it, tip the crew, and settle without leaving the chat.**

A Telegram Mini App where a group starts a bill, participants claim their own items, My Tab computes each obligation with transparent tax/service/discount/tip rules, and a participant settles on Solana — recipient always receives USDC, network fee always sponsored, no separate fee balance or seed phrase required. The initial judged milestone is ten days with a four-person team; the full 70-story scope continues afterward as needed. Bangkok/THB launch angle.

It must read as a **social coordination app with invisible crypto infrastructure** — never a wallet, a DeFi terminal, or an "AI app".

## Canonical artifacts

| Artifact | Path | Owns |
| --- | --- | --- |
| Product brief | `_bmad-output/planning-artifacts/briefs/brief-MYTAB-2026-08-21/brief.md` | Narrative, judge story, 10-day plan, demo script |
| PRD | `_bmad-output/planning-artifacts/prds/prd-MYTAB-2026-08-21/prd.md` | Numbered FR/NFR contract, IA, epic map, open questions |
| Architecture spine | `_bmad-output/planning-artifacts/architecture/architecture-MYTAB-2026-08-21/ARCHITECTURE-SPINE.md` | AD-1…AD-24 invariants, conventions, stack, structure |
| Architecture long form | `…/architecture-MYTAB-2026-08-21/source-architecture-spec-v1.3.md` | Full original spec; the spine is the binding distillation |
| Research | `_bmad-output/planning-artifacts/research/2026-08-21-stack-verification.md` | Vendor-doc verification, findings R-1…R-8 |
| UX spines | `_bmad-output/planning-artifacts/ux-designs/ux-MYTAB-2026-08-21/` | Final `DESIGN.md` + `EXPERIENCE.md`; these win over generated canvases and the older Stitch handoff |
| Epics and stories | `_bmad-output/planning-artifacts/epics.md` | Approved 8-epic, 70-story implementation backlog |
| Sprint status | `_bmad-output/implementation-artifacts/sprint-status.yaml` | Story sequencing and status tracking |

Requirements are cited by ID (`FR-S6`, `NFR-4`). Architecture decisions are cited by ID (`AD-9`). Never restate a requirement in prose when you can cite it.

## Stack (locked)

Next.js App Router · React 19 · TypeScript strict · Convex (database, realtime, HTTP ingress, functions, storage, scheduler) · Privy (Telegram auth + embedded Solana wallets + fee-payer sponsorship) · Vercel (app + optional Privy auth bridge) · DFlow (swap routing) · Solana mainnet via private RPC · Astryx design system (`@astryxdesign/core` + `@astryxdesign/theme-neutral`, forced light mode).

**Two deployment targets, not one.** Vercel deploys Next.js. Convex Cloud deploys the backend. Build command: `npx convex deploy --cmd 'npm run build'`.

## Hard rules

These are the ones agents get wrong. Full list in the architecture spine.

1. **Convex owns product truth and Telegram ingress** (AD-1). Telegram bot webhooks and Mini App launch validation terminate at Convex HTTP Actions, which verify Telegram material and call internal functions. Vercel routes are limited to the optional Privy bridge/webhook and public-key endpoints. No domain logic, authorization, or ledger write in `app/api/`.
2. **No second backend** (AD-2). No PostgreSQL, Supabase, Prisma, Drizzle, Redis, Express/Fastify, extra websocket layer, or Vercel Cron. Do not reach for them when Convex feels awkward — say so instead.
3. **Integer money only** (AD-6). Fiat = int64 minor units, crypto = atomic-unit `bigint`/decimal string. No JS floats on anything persisted. Every money field name ends in `Minor` or `Atomic`.
4. **Durable intent before external effect** (AD-8). Mutation writes state → schedules an internal action → action calls the outside world → internal mutation records the result. The client never calls a public action to start a money flow.
5. **One sponsorship path** (AD-9). User signs without broadcasting → Convex re-parses and verifies the exact message → Privy fee-payer wallet co-signs → Convex broadcasts. Never add client-side `sponsor: true` or a raw keypair alongside it.
6. **Confirmation moves the ledger, not submission** (AD-11). A signature proves broadcast. Parse the on-chain result before touching a balance.
7. **Server owns recipient and amount** (AD-13). Addresses come from Convex records synced from Privy — never from a request body, a deep link, or a client field. Deep links carry only an opaque token.
8. **Every public Convex function checks auth** through the shared helpers (`requireIdentity`, `requireGroupMember`, `requireBillOrganizer`, `requireParticipant`, `requireIntentOwner`). The UI never enforces authorization.
9. **No server secret gets a `NEXT_PUBLIC_` prefix** (AD-19). Convex holds DFlow, Telegram bot and webhook secret, vision, FX, Privy server secret, provider-webhook secrets, and RPC key. Vercel holds the deploy key plus, only if the AD-5 fallback is activated, Privy verification credentials and the token-bridge signing key.
10. **Astryx is the only component system** (AD-20). No shadcn/ui. Do not add `@stylexjs/babel-plugin` to the App Router app — it disables SWC and breaks `next/font`.
11. **Telegram mutations require two proofs.** Privy identity proves the person; authenticated `/telegram/bootstrap` verifies raw `initData` and creates a five-minute server-side Telegram context proving user/chat/session scope. The bot must be a group administrator and membership is rechecked at privileged boundaries. Outside Telegram is sanitized read-only.
12. **Opaque token classes are not interchangeable.** `tab_session` and `tip_session` are reusable selectors within TTL and authorization scope. `single_use_action` is subject/purpose-bound and consumed once. Store hashes only.
13. **Canonical net value is USDC atomic.** Bills retain display-currency minor units plus a locked USDC atomic target. THB FX uses Frankfurter v2 `USD/THB` filtered to the Bank of Thailand provider, normalized as `numeratorAtomic/denominatorMinor`; freshness is 36h weekday/96h weekend-holiday, production fails closed, and manual rationals are non-production only. Never sum unlike fiat currencies.
14. **AD-21 owns payment state.** Persist exactly `created | quoting | ready_for_signature | user_signed | submitted | unknown | confirmed | failed | expired | superseded`. `awaiting_wallet`, `presigned`, and `confirming` are UI-derived labels only. Only `created|quoting|ready_for_signature` may expire or become superseded. `user_signed`, `submitted`, and `unknown` block reopen/replacement until safely resolved; late confirmations reconcile idempotently.
15. **P0 routed input is Solana only.** Normalize native SOL to wrapped SOL only inside the validated sync-only DFlow transaction; output is mainnet USDC. Reject asynchronous execution.
16. **Waivers and cash are real ledger offsets.** They are immutable, authorized, capped, and audited; neither masquerades as on-chain confirmation.
17. **Resource-consuming operations are bounded** (AD-24). Atomically reserve per-user, per-group, concurrency, time-window, and global budgets before tab creation, receipt upload/extraction, and provider calls. Receipt tickets are one-use and byte/type/dimension validated; invalid blobs are deleted immediately. Pauses preserve reads and manual entry.

## Product voice

Use: "Start a tab" · "Claim yours" · "2 items need an owner" · "You owe ฿291.74" · "Ready to settle" · "Tip sent" · "All square" · "Quote expired. Refresh it."

Never in user-facing copy: "Execute swap" · "Approve route" · "Destination ATA" · "Broadcast transaction" · "AI-powered split" · "Insufficient lamports" · "slippage". Say **price protection**. The receipt feature is called **Scan receipt** — never "AI", "magic", or a sparkle icon. The judged build charges zero platform fee and shows no zero-fee row.

Visual anti-patterns: dark-first, purple-blue AI gradients, glassmorphism, neon crypto colors, token logos as navigation, chart walls.

## Known unknowns

- **OQ-1 / R-1 (Day 0 blocker):** Convex may normalize a bare `issuer` to `https://…` while Privy tokens carry `iss: "privy.io"`. Prove the custom-JWT path with a real token before any UI work; the Vercel token-bridge fallback is pre-designed (AD-5).
- **R-4:** the DFlow order response has no order ID and no expiry. My Tab owns quote TTL and idempotency; `otherAmountThreshold` is the minimum-output field to check.
- OQ-2 is resolved to native SOL → USDC, sync-only. OQ-3 is resolved to the OpenAI Responses API receipt adapter with a fixture-pinned vision-capable model and Convex-only key. OQ-4 is resolved to zero platform fee. Remaining open question OQ-5 lives in the PRD.

## Working agreements

- Money, allocation, and remainder logic lives in `lib/domain/` as pure functions with unit tests. It never imports Convex or performs I/O.
- Day 7 is the judged-branch stabilization checkpoint, not a feature cut. Risk gates determine order; all 70 approved stories remain committed and delivery may continue after the ten-day judged milestone.
- Do not add a dependency without an owner and a removal plan.
- Preview environments must never send real Telegram messages or spend real sponsor funds.

## Next after code exists

Run `bmad-project-context` with `setup` intent to generate the verified `AGENTS.md` block (real commands, path-checked claims) and absorb this file into it.
