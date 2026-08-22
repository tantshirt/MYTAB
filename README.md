# My Tab

> ## ⚠ This README is out of date — read `docs/DECISIONS.md` and `CLAUDE.md` first
>
> **Application source code exists.** The scaffold, money domain, Telegram ingress, session
> tokens, settlement pipeline, transaction validation gate, DFlow routed path, Telegram surface
> and full UI are implemented, with roughly 1,100 unit tests. **Nothing has touched a live
> cluster** — see `docs/MAINNET-CUTOVER.md`.
>
> The "Governing documents" reading order below is superseded: read **`docs/DECISIONS.md`**
> first, then **`CLAUDE.md`**, then the artifacts. Where an artifact conflicts with
> `DECISIONS.md`, `DECISIONS.md` wins.
>
> The gates are real and named: `npx tsc --noEmit` · `npm test` · `npx next build` ·
> `npm run smoke` · `npm run sweep`. A green `next build` is not sufficient (**D-12**). Devnet-
> first sequencing is superseded (**D-01**).


My Tab is a Telegram Mini App for starting a group bill, claiming items, calculating exact obligations, tipping participants, and settling on Solana while the recipient receives USDC and My Tab sponsors the network fee.

This repository is intentionally at the **implementation-ready planning stage**. It contains the complete product, architecture, security, UX, test, and sprint contracts. Application source code has not started yet.

## Current status

- Product scope is preserved in full: 8 epics and 70 stories.
- The pre-implementation audit has been reconciled into the governing documents.
- Payment, identity, Telegram membership, ledger, retry, sponsorship, receipt-privacy, and test invariants are defined before code begins.
- Development must start with the deployed Day 0 integration gate described in the architecture spine.

## Governing documents

Read these in order:

1. [`docs/project-context.md`](docs/project-context.md) — short standing context and non-negotiable rules.
2. [`prd.md`](_bmad-output/planning-artifacts/prds/prd-MYTAB-2026-08-21/prd.md) — canonical requirements, scope, state machines, and acceptance contract.
3. [`ARCHITECTURE-SPINE.md`](_bmad-output/planning-artifacts/architecture/architecture-MYTAB-2026-08-21/ARCHITECTURE-SPINE.md) — binding technical and security decisions.
4. [`DESIGN.md`](_bmad-output/planning-artifacts/ux-designs/ux-MYTAB-2026-08-21/DESIGN.md) and [`EXPERIENCE.md`](_bmad-output/planning-artifacts/ux-designs/ux-MYTAB-2026-08-21/EXPERIENCE.md) — visual and interaction contracts.
5. [`epics.md`](_bmad-output/planning-artifacts/epics.md) — all implementation stories and acceptance criteria.
6. [`sprint-status.yaml`](_bmad-output/implementation-artifacts/sprint-status.yaml) — story ordering and readiness state.
7. [`IMPLEMENTATION-READINESS.md`](IMPLEMENTATION-READINESS.md) — development entry gate and QC handoff.
8. [`docs/security-review-2026-08-21.md`](docs/security-review-2026-08-21.md) — repository-wide pre-implementation security review, remediations, and deferred runtime coverage.

If a long-form source document or prototype conflicts with these artifacts, the canonical PRD, architecture spine, and final UX spines win.

## Required first milestone

Do not begin broad feature implementation until a deployed Telegram Mini App proves all Day 0 checks:

1. Next.js loads inside Telegram from Vercel.
2. Privy seamless Telegram authentication provisions or restores the embedded Solana wallet.
3. A real Privy access token authenticates a Convex query.
4. Verified Telegram launch data binds the correct Telegram identity to the authenticated Privy DID.
5. One exact USDC payment completes the user-sign → server-validate → sponsor-co-sign → broadcast → parsed-confirmation path.

The full feature set remains planned after this gate; the gate controls sequence, not scope.

Before Epic 6 begins, the separate deployed DFlow gate must prove native SOL → exact USDC with synchronous execution, complete ALT resolution, both validator passes, sponsor co-signing, broadcast, and finalized semantic confirmation.

## Planning validation

When the local BMad tooling is installed, run the architecture structural check from the repository root:

```bash
uv run .agents/skills/bmad-architecture/scripts/lint_spine.py \
  --workspace _bmad-output/planning-artifacts/architecture/architecture-MYTAB-2026-08-21
```

Build, lint, unit-test, and end-to-end commands are deliberately marked as pending until the application scaffold creates the corresponding package scripts.

## Repository hygiene

- Never commit `.env*`, private keys, wallet material, API tokens, deployment keys, Telegram bot tokens, signed transactions, or receipt images.
- Locally installed agent/workflow frameworks are ignored; only project-owned planning outputs are published.
- Preview deployments must not send real Telegram messages or spend sponsor funds.
