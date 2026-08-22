# CLAUDE.md — read this before you touch anything

## What My Tab is

My Tab is a Telegram Mini App for splitting a restaurant bill: a group starts a tab, everyone claims their own items on their own phone at the same time, and My Tab computes each person's exact share with transparent tax, service charge, discount, tip and rounding. Each person settles on **Solana mainnet** in whatever token they hold — routed through DFlow when it is not already USDC — and the recipient always receives USDC while a sponsored fee payer covers the network fee. It is a social app that happens to move money; every product and design decision defends that sentence, and no user-facing surface is allowed to look like a wallet, a swap UI, or a DeFi terminal.

## Reading order — this is not optional

1. **`docs/DECISIONS.md`** — the decision log. Read it first, all of it.
2. **This file** — the invariants and the gates.
3. The planning artifacts, in the order `README.md` lists them: the PRD, `ARCHITECTURE-SPINE.md`, `DESIGN.md`, `EXPERIENCE.md`, `INVITE-FLOW.md`, `POLISH-SPEC.md`, `epics.md`.

**Where a planning artifact conflicts with `docs/DECISIONS.md`, `DECISIONS.md` wins.** The artifacts are the historical record and their *reasoning* still matters — but roughly twenty of their conclusions have been superseded by evidence gathered after they were written. Every superseded section carries an amendment banner pointing here. If you find yourself about to "restore" devnet, delete the invite door, re-add fixture data, or reject address lookup tables on the routed path, you are re-implementing an abandoned plan: stop and read the decision that killed it.

If you believe a decision is wrong, say so and cite evidence. Do not silently revert one.

## Invariants — never violate these

**Money**

- **Integer money only** (AD-6). Fiat is int64 minor units; crypto is atomic-unit `bigint` or decimal string. No JS float ever touches a persisted amount. Every money field name ends in `Minor` or `Atomic`.
- **Never round an amount in copy.** ฿291.74 is ฿291.74 on every surface. "About ฿292" is a defect — the entire trust argument is that the maths is exact. A stale or expired figure holds its last value at 40% opacity; it never becomes a dash and it is never blanked.
- Money, allocation and remainder logic lives in `lib/domain/` as pure functions with unit tests. It never imports Convex and never performs I/O.

**Authorization**

- **Deny by default.** Every public Convex function authorizes through the shared helpers before it does anything else. The UI never enforces authorization.
- **Every party is read from a stored row, never from an argument.** Recipient addresses, payer identity, tab ownership, group scope: all come from Convex records. Two request arguments agreeing with each other is not an authorization check — that exact mistake shipped a token-minting endpoint (D-16, hole H7). Deep links carry only an opaque token.
- Refuse with a code that leaks nothing (403, not 404-with-detail). A stranger must not learn whether a tab exists.

**The transaction validation gate**

- **Never weaken the gate to make a flow pass.** If a route needs something the gate rejects, either constrain the route or resolve the unknown and validate the expanded set under the *identical* rules. Every change to the gate so far has tightened it; none has relaxed it. Keep that record.
- Unresolved accounts are never signed. On the routed path, lookup tables are resolved at the response's `contextSlot` and every resolved account faces the full rule set (D-02). On the direct path they are rejected outright.

**Failure**

- **Fail closed rather than degrade silently.** A missing secret is never permission to run a fixture. One shared guard (`lib/solana/runtimeGuard.ts`) requires an explicit opt-in **and** a non-deployed runtime; a deployed devnet counts as real. Silent degradation is the single failure mode that has cost this project the most: a stub co-signed real money, a hardcoded FX rate priced real obligations, and a five-minute context expiry made every write fail with no message on screen.
- Never invent an error to fill a gap. If a provider returns a bare `false` with no reason, wait for the reason rather than fabricating one.

**Design**

- **Tabular numerals everywhere.** A proportional figure anywhere in this product is a bug. Amounts align on the decimal.
- **Names truncate; amounts never truncate.** The amount column is a reserved column, not content-sized. `min-width: 0` on the name, `flex: none` on the figure.
- **Touch targets ≥ 44px**, including claim rows, token chips and avatar chips.
- **320px floor.** The layout holds at 320px with the largest supported type size, with no horizontal scroll anywhere.
- **Light mode only, unconditionally.** Telegram is frequently dark around it; My Tab stays paper. No dark variant, no glass, no neon, no gradient except the single all-square wash.
- Use `overflow-x: clip`, never `overflow-x: hidden` (D-14).
- **Banned in user-facing copy:** execute · swap · route · approve · broadcast · transaction · signature · mint · ATA · gas · lamports · slippage · blockhash · RPC · wallet address · AI · powered by · seamless. Say "price protection", not "slippage". The receipt feature is "Scan receipt" — never "AI", never "magic", never a sparkle.

## The five gates

Run all five before you claim work is done. Exact commands:

```bash
npx tsc --noEmit    # typecheck
npm test            # vitest, ~1100 unit tests
npx next build      # production bundle
npm run smoke       # boots next start, drives headless Chrome over every route
npm run sweep       # geometric layout audit across viewports and surfaces
```

**A green `npx next build` is NOT sufficient, and never has been.** `next build` compiles and typechecks the bundle; it never *executes* it. A `ReferenceError: require is not defined` at module scope took every route in production down to a blank screen while the build stayed green (commit `fc8fd93`). Reverting that fix reproduces it exactly: green build, 10/10 smoke failures. `npm run smoke` is the step that executes the code.

`npm run sweep` exists for the same class of blindness in the other direction. With `html, body { overflow-x: clip }` in place, `scrollingElement.scrollWidth` can never exceed the viewport however badly the layout breaks — so the obvious overflow check reports clean on a broken page. Sweep measures element rectangles geometrically instead, and carries a dedicated inert-sticky check.

CI (`.github/workflows/ci.yml`) runs the first four. **`npm run sweep` is local-only — run it yourself after any layout, typography or component change.**

## Hard prohibitions

- **Never run `npx convex env list`.** It prints secret values in plaintext into the transcript. Every secret it has printed has to be treated as compromised and rotated (`docs/MAINNET-CUTOVER.md` §0 exists because of this). If you need to know whether a variable is *set*, ask, or read `lib/env/contract.ts` and `.env.example`.
- **Never run `git stash`** in this tree. Multiple agents work in it concurrently; a stash silently removes someone else's uncommitted work from the working tree with no signal that it happened.
- Never commit `.env*`, keys, wallet material, bot tokens, signed transactions or receipt images.
- Never add a dependency without an owner and a removal plan. Never add `--legacy-peer-deps` to fix an install — a peer conflict is a real failure and one already shipped this way (commit `0839745`).
- Never add a second backend (AD-2): no PostgreSQL, Supabase, Prisma, Drizzle, Redis, Express/Fastify, extra websocket layer, or Vercel Cron. If Convex feels awkward, say so rather than reaching for one.
- Never put a server secret behind a `NEXT_PUBLIC_` prefix (AD-19).
- Never add `NEXT_PUBLIC_CONVEX_SITE_URL`. The `.site` host is *derived* from the `.cloud` host precisely so the two cannot drift; an audit already recommended adding it and was wrong (commit `0b91f1f`).

## Working notes

- **Two deployment targets, not one.** Vercel deploys Next.js; Convex Cloud deploys the backend. Build command: `npx convex deploy --cmd 'npm run build'`.
- **Convex owns product truth and all Telegram ingress** (AD-1). Bot webhooks and Mini App launch validation terminate at Convex HTTP Actions. No domain logic, authorization, or ledger write in `app/api/`.
- **Durable intent before external effect** (AD-8): mutation writes state → schedules an internal action → the action calls the outside world → an internal mutation records the result. The client never calls a public action to start a money flow.
- **Confirmation moves the ledger, not submission** (AD-11). A signature proves broadcast, nothing more.
- Cite requirements by ID (`FR-S6`, `NFR-4`) and architecture decisions by ID (`AD-9`). Do not restate a requirement in prose when you can cite it.
- **Nothing in this repo has touched a live cluster yet.** The gates are real; what is behind them is unproven. Do not write documentation or commit messages that imply otherwise. `docs/MAINNET-CUTOVER.md` is the checklist.
