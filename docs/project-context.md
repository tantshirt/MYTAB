# Project Context — My Tab

Standing context for every AI agent working in this repository. Keep it short; when it grows, move detail into the artifact that owns it.

> **Read `docs/DECISIONS.md` first, then `CLAUDE.md`, then the planning artifacts.** Where a planning artifact conflicts with `DECISIONS.md`, **`DECISIONS.md` wins**. This file has been brought to current truth; the artifacts below have not, and each carries an amendment banner saying so.

**Status:** the repository is **no longer greenfield**. The scaffold, the money domain, Telegram ingress, session tokens, the settlement pipeline, the transaction validation gate, the DFlow routed path, the Telegram surface and the full UI are implemented, with roughly 1,100 unit tests. **Nothing has touched a live cluster.** Every integration is unit-tested with injected transports; the gates are real and what is behind them is unproven. `docs/MAINNET-CUTOVER.md` is the checklist that changes that. Fixture removal (D-11) is in flight across `lib/`, `convex/` and `features/`.

## What we are building

**My Tab is the group tab that lives in Telegram. Start it, split it, tip the crew, and settle without leaving the chat.**

A Telegram Mini App where a group starts a bill, participants claim their own items, My Tab computes each obligation with transparent tax/service/discount/tip rules, and a participant settles on **Solana mainnet** — in **whatever token they hold** (D-05), routed through DFlow when it is not already USDC (D-03). The recipient always receives USDC and the network fee is always sponsored: no separate fee balance, no seed phrase, no "connect wallet". Bangkok/THB launch angle.

It must read as a **social coordination app with invisible crypto infrastructure** — never a wallet, a DeFi terminal, or an "AI app".

## Canonical artifacts

`docs/DECISIONS.md` sits above all of these.

| Artifact | Path | Owns |
| --- | --- | --- |
| **Decision log** | `docs/DECISIONS.md` | **Binding. Supersedes every row below where they conflict.** |
| Agent rules | `CLAUDE.md` | Reading order, invariants, the five gates, prohibitions |
| Mainnet runbook | `docs/MAINNET-CUTOVER.md` | Everything that must be true before real money moves |
| DFlow reference | `docs/dflow-api-reference.md` | Verified vendor behaviour, including the devnet proof (§9.2) |
| Invite flow | `_bmad-output/planning-artifacts/ux-designs/ux-MYTAB-2026-08-21/INVITE-FLOW.md` | **Ingress — everything before the Claim Board.** Wins over `EXPERIENCE.md` on ingress only |
| Product brief | `…/briefs/brief-MYTAB-2026-08-21/brief.md` | Narrative, judge story, demo script. Binding decisions 2, 4, 7 superseded |
| PRD | `…/prds/prd-MYTAB-2026-08-21/prd.md` | Numbered FR/NFR contract, IA, epic map. FR-S4, FR-S6, OQ-2 superseded |
| Architecture spine | `…/architecture/architecture-MYTAB-2026-08-21/ARCHITECTURE-SPINE.md` | AD-1…AD-24 invariants. AD-10 refined, AD-20 refined |
| Architecture long form | `…/architecture-MYTAB-2026-08-21/source-architecture-spec-v1.3.md` | Full original spec; the spine is the binding distillation |
| Research | `…/research/2026-08-21-stack-verification.md` | Vendor-doc verification, findings R-1…R-8 |
| Visual authority | `DESIGN.md` (symlink) | Palette, type, components. Amended for photography (D-13), wash (D-16) |
| Behavioral authority | `…/ux-designs/ux-MYTAB-2026-08-21/EXPERIENCE.md` | Behavior from the Claim Board onward. Foundation and IA superseded by `INVITE-FLOW.md` |
| Polish spec | `…/ux-designs/ux-MYTAB-2026-08-21/POLISH-SPEC.md` | Surface-by-surface implementation audit. §2.3 overflow guidance superseded (D-14) |
| Epics and stories | `_bmad-output/planning-artifacts/epics.md` | 8-epic, 70-story backlog. Stories 2.5, 2.6, 7.10, 8.6 amended |

Requirements are cited by ID (`FR-S6`, `NFR-4`). Architecture decisions are cited by ID (`AD-9`). Decisions are cited by ID (`D-11`). Never restate a requirement in prose when you can cite it.

## Stack (locked)

Next.js App Router · React 19 · TypeScript strict · Convex (database, realtime, HTTP ingress, functions, storage, scheduler) · Privy (Telegram auth + embedded Solana wallets + fee-payer sponsorship) · Vercel (app + optional Privy auth bridge) · DFlow (routed settlement, mainnet only) · Jupiter Token API V2 (token metadata, server-side only — D-09) · Solana **mainnet-beta** via private RPC, cluster read from `lib/solana/cluster.ts` (D-01) · Astryx (`@astryxdesign/core` + `@astryxdesign/theme-neutral`) as a **theme layer** with custom primitives (D-20), forced light mode.

**Two deployment targets, not one.** Vercel deploys Next.js. Convex Cloud deploys the backend. Build command: `npx convex deploy --cmd 'npm run build'`. `NEXT_PUBLIC_CONVEX_URL` is injected at build time and the `.site` host is **derived** from it — never configured (D-19).

## Gates

`npx tsc --noEmit` · `npm test` · `npx next build` · `npm run smoke` · `npm run sweep`.

A green `next build` is **not** a passing gate — it compiles the bundle and never executes it, and a module-scope `ReferenceError` took production down with a green build (D-12). CI runs the first four; `sweep` is local-only.

**Never run `npx convex env list`** — it prints secret values in plaintext. **Never run `git stash`** — multiple agents share this tree.

## Hard rules

These are the ones agents get wrong. Full list in the architecture spine; overrides in `docs/DECISIONS.md`.

1. **Convex owns product truth and Telegram ingress** (AD-1). Bot webhooks and Mini App launch validation terminate at Convex HTTP Actions. Vercel routes are limited to the optional Privy bridge and public-key endpoints. No domain logic, authorization, or ledger write in `app/api/`.
2. **No second backend** (AD-2). No PostgreSQL, Supabase, Prisma, Drizzle, Redis, Express/Fastify, extra websocket layer, or Vercel Cron. Do not reach for them when Convex feels awkward — say so instead.
3. **Integer money only** (AD-6). Fiat = int64 minor units, crypto = atomic-unit `bigint`/decimal string. No JS floats on anything persisted. Every money field name ends in `Minor` or `Atomic`.
4. **Durable intent before external effect** (AD-8). Mutation writes state → schedules an internal action → action calls the outside world → internal mutation records the result. The client never calls a public action to start a money flow.
5. **One sponsorship path** (AD-9). User signs without broadcasting → Convex re-parses and verifies the exact message → the Privy fee-payer wallet co-signs → Convex broadcasts. Never add client-side `sponsor: true` or a raw keypair alongside it. Signing is `signTransaction`, deliberately not `signAndSendTransaction`, because Convex must own the broadcast.
6. **Confirmation moves the ledger, not submission** (AD-11). A signature proves broadcast. Parse the on-chain result before touching a balance.
7. **Server owns recipient and amount** (AD-13). Addresses come from Convex records synced from Privy — never from a request body, a deep link, or a client field. Deep links carry only an opaque token. Two request arguments agreeing with each other is not an authorization check (D-18 H7).
8. **Every public Convex function checks auth** through the shared helpers (`requireIdentity`, `requireGroupMember`, `requireBillOrganizer`, `requireTabParticipant`, `requireIntentOwner`). The UI never enforces authorization.
9. **Never weaken the transaction validation gate to make a flow pass.** Every change to it so far has tightened it; none has relaxed it. If a route needs something the gate rejects, constrain the route or resolve the unknown and validate the expanded set under identical rules (D-02).
10. **No server secret gets a `NEXT_PUBLIC_` prefix** (AD-19).
11. **Astryx is the only third-party UI dependency** (AD-20, refined by D-20). It supplies the theme; the primitives in `components/` are ours. No shadcn/ui, no second component library. Do not add `@stylexjs/babel-plugin` to the App Router app — it disables SWC and breaks `next/font`.
12. **Telegram mutations require two proofs.** Privy identity proves the person; authenticated `/telegram/bootstrap` verifies raw `initData` and creates a five-minute server-side Telegram context. That context **must be renewed** at 60% of TTL and on resume — it expired mid-meal and every write failed silently (D-17). Outside Telegram is sanitized read-only.
13. **`tabParticipants` is the authoritative roster** (D-06). The token admits; the roster authorizes. `getChatMember` authorizes speaking to a group; `tabParticipants` authorizes acting on a bill. Bot-admin is a group-door requirement, not a product prerequisite. After lock, a roster row alone authorizes settling your own obligation (D-07).
14. **Opaque token classes are not interchangeable.** `tab_session` and `tip_session` are reusable selectors within TTL and authorization scope, and carry a **seat policy** (`{kind:"chat"}` or `{kind:"fixed", seats:n}`). `single_use_action` is subject/purpose-bound and consumed once. Store hashes only.
15. **Canonical net value is USDC atomic.** Bills retain display-currency minor units plus a locked USDC atomic target. THB FX uses Frankfurter v2 `USD/THB` filtered to the Bank of Thailand provider, parsed **by regex from the raw response text** because `JSON.parse` would coerce the rate to a double, kept as an exact integer rational, rounded upward so the recipient is never short. Freshness 36h weekday / 96h weekend-holiday; production fails closed; manual rationals are non-production and badged. Never sum unlike fiat currencies.
16. **AD-21 owns payment state.** Persist exactly `created | quoting | ready_for_signature | user_signed | submitted | unknown | confirmed | failed | expired | superseded`. `awaiting_wallet`, `presigned` and `confirming` are UI-derived labels only. Only `created|quoting|ready_for_signature` may expire or become superseded. `user_signed`, `submitted` and `unknown` block reopen/replacement until safely resolved; late confirmations reconcile idempotently.
17. **Routed input is any verified token the payer holds** (D-05); output is the cluster's USDC mint. Native SOL is normalized to wrapped SOL server-side, only inside the validated transaction. Asynchronous execution is rejected, and `allowAsyncExec=false` is asserted present in the serialised query because the API default is `true` (D-04).
18. **Waivers and cash are real ledger offsets.** Immutable, authorized, capped, audited; neither masquerades as on-chain confirmation. Only the obligation recipient may waive.
19. **Resource-consuming operations are bounded** (AD-24). Atomically reserve per-user, per-group, concurrency, time-window and global budgets before tab creation, receipt upload/extraction and provider calls. Receipt tickets are one-use and byte/type/dimension validated; invalid blobs are deleted immediately. Pauses preserve reads and manual entry.
20. **Fail closed, never degrade silently** (D-11). A missing secret is never permission to run a fixture. `lib/solana/runtimeGuard.ts` requires an explicit opt-in **and** a non-deployed runtime; a deployed devnet counts as real.

## Product voice

Use: "Start a tab" · "Claim yours" · "2 items need an owner" · "You owe ฿291.74" · "Ready to settle" · "Tip sent" · "All square" · "Quote expired. Refresh it."

Never in user-facing copy: execute · swap · route · approve · broadcast · transaction · signature · mint · ATA · gas · lamports · slippage · blockhash · RPC · wallet address · AI · powered by · seamless. Say **price protection**. The receipt feature is **Scan receipt** — never "AI", "magic", or a sparkle icon. Numbers are never rounded in copy. Zero platform fee, and no zero-fee row.

Visual anti-patterns: dark-first, purple-blue AI gradients, glassmorphism, neon crypto colors, token logos as navigation, chart walls.

## Known unknowns

The live list is the **Unresolved** section of `docs/DECISIONS.md` (U-1…U-7). In brief: the Jupiter attribution string collides with the banned-copy list and the token-logo ban; bot-admin-optional (`INVITE-FLOW.md` amendment 2b) is untested against a real supergroup; `npm run sweep` is not in CI; whether Astryx should remain a dependency at all; the cutover gaps in `MAINNET-CUTOVER.md` §7; ingress blockers `INVITE-FLOW.md` §9.11 B2, B3, B5, B7, B8, B9; and the fact that nothing has run against a live cluster.

Resolved and no longer open: OQ-1 (Convex/Privy issuer — the custom-JWT path works), OQ-2 (**superseded** by D-05), OQ-3 (OpenAI Responses API receipt adapter, Convex-only key), OQ-4 (zero platform fee — and **omitted**, not declared zero, per D-04).

## Working agreements

- Money, allocation and remainder logic lives in `lib/domain/` as pure functions with unit tests. It never imports Convex and never performs I/O.
- Do not add a dependency without an owner and a removal plan. Do not use `--legacy-peer-deps` to fix an install — a peer conflict is a real failure and one already shipped that way.
- Preview environments must never send real Telegram messages or spend real sponsor funds.
- When you find a defect the documents did not predict, add an entry to `docs/DECISIONS.md` with the evidence. A decision without its reasoning does not survive the next agent.
