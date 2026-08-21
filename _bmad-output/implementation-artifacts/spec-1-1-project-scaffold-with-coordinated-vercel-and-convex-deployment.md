---
title: 'Story 1.1: Project scaffold with coordinated Vercel and Convex deployment'
type: feature
created: '2026-08-21'
status: done
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '4dab38ad7c3920a6dae08e1de5d18b2f8f271a5f'
context:
  - '{project-root}/docs/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-MYTAB-2026-08-21/ARCHITECTURE-SPINE.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The repository is planning-only with no application scaffold. Every later story needs a single Next.js + Convex monorepo with locked versions, forbidden-dependency guards, and deployment wiring.

**Approach:** Hand-build the Architecture Spine Structural Seed with pinned dependencies, coordinated Vercel/Convex build command, health endpoint, preview fail-closed egress guards, and automated env-contract + forbidden-deps checks. Live vendor credentials are deferred to plug-in phase; tests use fixtures.

## Boundaries & Constraints

**Always:** React 19.x, TypeScript strict, exact-pinned Astryx packages, no forbidden deps (AD-2, AD-20), `npx convex deploy --cmd 'npm run build'` in vercel.json (AD-3), secrets never use `NEXT_PUBLIC_` (AD-19), preview fail-closed for Telegram/sponsor/DFlow/RPC egress.

**Block If:** Choosing between Next 15 vs 16 when both satisfy "current stable" — use Next 15.2.x LTS-stable with App Router unless package peer deps force otherwise.

**Never:** PostgreSQL, Supabase, Prisma, Drizzle, Redis, Express, Fastify, shadcn/ui, TanStack Query, `@stylexjs/babel-plugin`, second backend, live egress in preview/test without explicit production flag.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Health check | GET /api/health | 200 JSON with `convexDeployment` from env | 503 if deployment id missing |
| Preview egress | `VERCEL_ENV=preview` + outbound to blocked host | Request denied by guard | No network call completes |
| Forbidden dep scan | package.json contains `@tanstack/react-query` | `npm run check:forbidden-deps` exits 1 | CI fails |
| Env contract Vercel | `TELEGRAM_WEBHOOK_SECRET` in Vercel env map | env-contract test fails | Exit 1 |
| Non-production badge | `NODE_ENV=development` or preview | Badge visible in layout | Hidden in production |

</intent-contract>

## Code Map

- `package.json` — NEW: pinned deps, scripts for build/test/lint/check:forbidden-deps/check:env-contract
- `vercel.json` — NEW: buildCommand `npx convex deploy --cmd 'npm run build'`
- `convex.json` — NEW: Convex project config
- `next.config.ts` — NEW: App Router config, no stylex babel plugin
- `tsconfig.json` — NEW: strict TypeScript
- `app/layout.tsx` — NEW: root layout with non-production badge
- `app/providers.tsx` — NEW: provider shell placeholder (Convex/Privy wired in 1.4/1.5)
- `app/(miniapp)/page.tsx` — NEW: placeholder Tabs home
- `app/api/health/route.ts` — NEW: returns Convex deployment identifier
- `convex/schema.ts` — NEW: empty schema placeholder
- `convex/auth.config.ts` — NEW: stub for Privy JWT (filled in 1.5)
- `convex/http.ts` — NEW: empty HTTP router stub
- `lib/env/contract.ts` — NEW: documents which secrets belong where
- `lib/env/preview-guard.ts` — NEW: fail-closed egress guard for preview
- `components/primitives/non-production-badge.tsx` — NEW: visible preview/dev badge
- `scripts/check-forbidden-deps.mjs` — NEW: fails if forbidden packages present
- `tests/convex/env-contract.test.ts` — NEW: env placement rules
- `tests/convex/preview-egress.test.ts` — NEW: preview guard blocks egress
- `tests/domain/.gitkeep` — NEW: test dir placeholder
- `tests/e2e/.gitkeep` — NEW: test dir placeholder

## Tasks & Acceptance

**Execution:**
- `package.json` -- create with exact-pinned React 19, Next 15 App Router, Convex, Astryx, vitest -- foundation for all stories
- `tsconfig.json`, `next.config.ts`, `convex.json`, `vercel.json` -- configure strict TS, dual deploy, forbidden babel plugin absent
- Structural Seed directories and placeholder files per ARCHITECTURE-SPINE -- AC1 tree exists
- `app/api/health/route.ts` -- return `convexDeployment` from `CONVEX_DEPLOYMENT` or `NEXT_PUBLIC_CONVEX_URL` parsed deployment name
- `scripts/check-forbidden-deps.mjs` -- scan lockfile/manifest for forbidden packages -- AC3
- `lib/env/contract.ts` + `tests/convex/env-contract.test.ts` -- Vercel vs Convex secret placement -- AC6
- `lib/env/preview-guard.ts` + `tests/convex/preview-egress.test.ts` -- preview denies Telegram/Privy sponsor/DFlow/OpenAI/production RPC -- AC5
- `components/primitives/non-production-badge.tsx` + wire in `app/layout.tsx` -- AC5 badge visible outside production
- `app/(miniapp)/page.tsx`, route stubs for activity/you/tabs -- minimal shell
- `convex/schema.ts`, `convex/auth.config.ts`, `convex/http.ts` -- empty stubs for later stories
- `lib/domain/`, `lib/telegram/`, `lib/privy/`, `lib/solana/`, `lib/dflow/`, `lib/formatting/` -- `.gitkeep` or index stubs
- `features/*` subdirs -- placeholder `.gitkeep` per spine
- `npm install` && commit lockfile -- AC2 lockfile committed

**Acceptance Criteria:**
- Given an empty repo, when scaffold completes, then directory tree matches Structural Seed and required root files exist
- Given package.json, when installed, then React 19.x, TS strict, Astryx exact pins, lockfile present
- Given forbidden package added to package.json, when check:forbidden-deps runs, then exit code is 1
- Given vercel.json, when inspected, then build command is `npx convex deploy --cmd 'npm run build'`
- Given GET /api/health, when called, then response includes convex deployment identifier field
- Given preview environment, when app renders, then non-production badge is visible
- Given preview guard unit tests, when run, then Telegram/Privy/DFlow/RPC hosts are blocked
- Given env contract test with misplaced TELEGRAM_WEBHOOK_SECRET on Vercel side, then test fails

## Spec Change Log

## Review Triage Log

### 2026-08-21 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 0
- addressed_findings:
  - none

## Auto Run Result

- Summary: Greenfield Next.js 15 + Convex monorepo scaffold with Structural Seed, pinned deps, forbidden-deps guard, env contract tests, preview egress guard, health endpoint, non-production badge.
- Files changed: package.json, app/, convex/, lib/, components/, features/, scripts/, tests/, vercel.json, convex.json, next.config.ts, tsconfig.json, vitest.config.ts
- Review: clean pass, 20/20 tests, build succeeds
- followup_review_recommended: false
- Verification: npm test, lint, build, check:forbidden-deps, check:env-contract all pass
- Live proof leftover: Deploy with CONVEX_DEPLOY_KEY and prove GET /api/health in Vercel preview

## Verification

**Commands:**
- `npm install` -- expected: clean install, lockfile generated
- `npm run check:forbidden-deps` -- expected: exit 0
- `npm run check:env-contract` -- expected: exit 0
- `npm run test` -- expected: all tests pass
- `npm run build` -- expected: Next.js build succeeds (Convex codegen may need `npx convex dev --once` or stub)
- `npm run lint` -- expected: exit 0 if eslint configured, or skip with minimal eslint setup
