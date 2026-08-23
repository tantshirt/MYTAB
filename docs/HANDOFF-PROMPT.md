# Handoff prompt — My Tab, 2026-08-23

Copy everything below the line into the next agent. It assumes the agent has the repo.

---

You are picking up **My Tab**, a Telegram Mini App for splitting a restaurant bill, settled on
Solana mainnet through DFlow. Phases 0–6 and the U-8 house-style tab card are **committed**.
Do not re-implement them. Owner decisions below are what remain.

## Read these, in this order, before you touch anything

1. **`CLAUDE.md`** — the invariants and the five gates. Every rule in it is binding.
2. **`docs/DECISIONS.md`** — the decision log, D-01 through D-32 plus the Unresolved list.
   Where any other document conflicts with it, it wins.
3. **`docs/FLOWS.md`** — the 2026-08-22 planning output. Four flow maps, a twelve-item dead-end
   audit with file:line evidence, D-21…D-32, and the build plan.

`docs/FLOWS.md` is where your work is specified. `docs/DECISIONS.md` is what constrains it.

## The state of the tree

- Nothing in this repository has ever touched a live cluster. Every integration is unit-tested
  with injected transports. Do not write documentation or commit messages implying otherwise.
- The five gates are real and must all pass: `npx tsc --noEmit` · `npm test` · `npx next build`
  · `npm run smoke` · `npm run sweep`. A green `next build` is **not** sufficient — it compiles
  and typechecks but never executes. `npm run smoke` executes. `npm run sweep` is local-only
  and is the only gate that catches an inert sticky element or a truncated amount.
- **Phase 0 is built:** `setMyCommands` / `setChatMenuButton`, private `/start`, Open-tab
  token reuse on the status card.

## What was decided on 2026-08-22 / 2026-08-23

D-21 through D-32, listed in `docs/DECISIONS.md`. The five that reverse prior positions:

- **D-21** — external wallets become the primary door. Supersedes FR-A1/FR-W1 and
  `lib/privy/config.ts:32`. Privy embedded is now the fallback for someone with no wallet.
- **D-22** — DFlow gets a screen: token picker with balances, live quote, price protection.
  Supersedes D-03's "the mechanism does not get a screen." **The banned-copy list is
  unchanged and applies at full force** — say *price protection*, never *swap*, *route*,
  *execute*, *slippage*.
- **D-25** — launch is an explicit connect gate. Supersedes design principle 6's "no login
  screen, no connect wallet."
- **D-26** — the audience is crypto-native. Revises the Andre persona in `PRODUCT.md`.
- **D-32** — receipt extraction goes through **Vercel AI Gateway** from a Convex Node action.
  Amends AD-18 / OQ-3 on the transport only. Secret is `AI_GATEWAY_API_KEY` (Convex-only),
  not a raw `OPENAI_API_KEY`. First-candidate model `google/gemini-2.0-flash`. Do not vendor
  PaddleOCR, Donut, doctr, or Mindee. Copy: **Scan receipt**.

**U-1, U-8, and U-9 are resolved.** D-30 / Phase 6 is **built** (held state +
`reconciliationIncidents`). U-6 B5, B7, B8, B9 are closed.
**U-8** is one house-style 35mm still (`public/tab-card/house.webp`), sent once via
`sendPhoto`, reused by Telegram `file_id`. Runtime Convex does not call Kie.
**U-10 is documented** (MWA is iOS-incompatible; named universal links are load-bearing);
return-to-Telegram is still unproven on a physical iPhone.

## Current state — Phases 1–6 and the tab card are committed

Phase 5b is live plumbing: first `tab_opened` uploads the house still; later states
edit the caption only. Live receipt model pin still needs a Thai/English fixture eval
against the gateway (`AI_GATEWAY_API_KEY` in Convex). Set
`OPERATOR_RECONCILIATION_SECRET` in Convex for the operator list. Rotate the kie.ai
key that appeared in chat after `KIE_API_KEY` is set in Convex.

## Start here — remaining owner decisions, not silent code

1. **U-10 device** — prove Phantom / Solflare / Backpack return into the Telegram
   WebView on a real iPhone.
2. **Receipt fixture eval** — pin `google/gemini-2.0-flash` or fall back to
   `openai/gpt-4o-mini` after Thai/English restaurant photos.
3. Secrets in Convex: confirm `AI_GATEWAY_API_KEY` and
   `OPERATOR_RECONCILIATION_SECRET` are set (never `npx convex env list`). Rotate
   `KIE_API_KEY` on kie.ai after the generate succeeded.

## Rules you will be tempted to break

- **Never weaken the transaction validation gate to make a flow pass.** D-21 introduces a
  second, client-signed path. It faces the identical rule set. Every change to the gate so far
  has tightened it; keep that record.
- **Never accept a wallet address as a request argument.** `linkExternalWallet` requires a
  signed challenge verified in Convex. `syncEmbeddedWallet` is safe only because Privy vouches
  server-side; an external address has no voucher. Accepting one is the exact pattern that
  shipped hole H7 (D-16): *two request arguments agreeing with each other is not an
  authorization check.*
- **Integer money only.** No JS float touches a persisted amount. Every money field name ends
  in `Minor` or `Atomic`. Money and allocation logic lives in `lib/domain/` as pure functions
  with unit tests, importing no Convex and performing no I/O.
- **Never round an amount in copy.** ฿291.74 is ฿291.74 everywhere. A stale figure holds its
  last value at 40% opacity; it never becomes a dash.
- **Fail closed, never degrade silently.** A missing secret is never permission to run a
  fixture. This pattern caused every serious defect in this codebase's history.
- **Never run `npx convex env list`** — it prints secrets in plaintext. **Never run
  `git stash`** — multiple agents work in this tree.
- Never add a second backend, never add `--legacy-peer-deps`, never put a server secret behind
  `NEXT_PUBLIC_`, never add `NEXT_PUBLIC_CONVEX_SITE_URL`.

## Open questions — do not resolve these silently

1. **Wallet-standard on iOS (U-10).** Mobile Wallet Adapter is Android-oriented; on iOS the
   practical path is per-wallet universal links. If that holds, Phantom / Solflare / Backpack
   are load-bearing on iOS rather than a convenience layer over a generic standard. **Verify
   this on a physical iPhone** — return-to-Telegram after a universal-link sign is still
   unproven.

Plus everything in `docs/DECISIONS.md` §Unresolved that is still open.

## Secrets

- **`AI_GATEWAY_API_KEY`** — Convex env only (D-32). Needed for Phase 1b. Never `NEXT_PUBLIC_`.
- **`KIE_API_KEY`** — Convex env only (U-8). One-shot / owner-requested regenerate of the
  house still. Never `NEXT_PUBLIC_`. Never a committed file. Runtime Convex does not call
  Kie on every dinner. Rotate any key that appeared in a transcript.

## How to work

Cite requirements by ID (`FR-S6`, `NFR-4`) and architecture decisions by ID (`AD-9`, `D-22`).
If you believe a decision is wrong, say so and cite evidence — do not silently revert one.
Run all five gates before claiming any phase is done, and report failures with their output.
