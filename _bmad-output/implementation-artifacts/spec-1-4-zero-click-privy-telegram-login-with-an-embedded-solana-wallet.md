---
title: 'Story 1.4: Zero-click Privy Telegram login with an embedded Solana wallet'
type: feature
created: '2026-08-21'
status: done
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '4dab38ad7c3920a6dae08e1de5d18b2f8f271a5f'
context:
  - '{project-root}/docs/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-integer-money-module-in-lib-domain.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
warnings: []
deferred:
  - 'Story 1.5: ConvexProviderWithAuth JWT bridge (PrivyConvexProvider stub only)'
---

<intent-contract>

## Intent

**Problem:** Users opening My Tab from Telegram must arrive authenticated with an embedded Solana wallet — no login screen, connect-wallet step, or seed phrase.

**Approach:** Wire Telegram runtime detection, Privy zero-click Telegram login with embedded Solana wallet auto-create, Launch/AuthGate surfaces, and the fixed provider stack. Fixture mode enables local dev without a Privy app id. Convex JWT wiring is deferred to Story 1.5.

## Boundaries & Constraints

**Always:** Provider order `TelegramRuntimeProvider` → `PrivyProvider` → `PrivyConvexProvider` → theme (AD-15). `NEXT_PUBLIC_PRIVY_APP_ID` is the only public Privy env var. Telegram login only; no external wallet in P0. Client Components for live surfaces.

**Never:** Convex JWT in this story. Client-supplied identity. Trust `initDataUnsafe` for authorization. `@privy-io/server-auth` unless a server route needs it (not in 1.4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Telegram Mini App open | Valid WebApp context | Privy auto-authenticates, embedded Solana wallet created/restored | Launch surface until ready |
| Missing app id | No `NEXT_PUBLIC_PRIVY_APP_ID` | Fixture auth; AuthGate renders children | Fail-closed config fixture |
| Token refresh OK | Authenticated session | Silent refresh, children visible | No UI change |
| Token refresh fail | getAccessToken throws | Inline "Reconnecting…" bar, children stay visible | No modal/logout |
| Outside Telegram | No WebApp | Reads may work; auth still via Privy when configured | No connect-wallet UI |

</intent-contract>

## Code Map

- `package.json` — ADD: `@privy-io/react-auth@3.37.4`
- `lib/privy/config.ts` — NEW: app id resolution, fixture mode, Privy client config
- `lib/privy/index.ts` — NEW: public exports
- `features/telegram/TelegramRuntimeProvider.tsx` — NEW: WebApp detection, initData context
- `features/auth/PrivyConvexProvider.tsx` — NEW: passthrough stub (TODO 1.5)
- `features/auth/fixture-auth.tsx` — NEW: mock auth for fixture mode
- `features/auth/LaunchSurface.tsx` — NEW: wordmark + indeterminate indicator + copy
- `features/auth/AuthGate.tsx` — NEW: Launch while loading, Reconnecting bar on refresh failure
- `components/theme/MyTabThemeProvider.tsx` — NEW: Astryx theme wrapper stub
- `app/providers.tsx` — UPDATE: full provider stack
- `app/(miniapp)/page.tsx` — UPDATE: AuthGate wrapper
- `next.config.ts` — UPDATE: Solana webpack externals for Privy
- `lib/env/contract.ts` — UPDATE: allow `NEXT_PUBLIC_PRIVY_APP_ID`
- `.env.example` — UPDATE: document `NEXT_PUBLIC_PRIVY_APP_ID`
- `tests/auth/provider-order.test.ts` — NEW: AD-15 order assertion
- `tests/auth/launch-surface.test.tsx` — NEW: Launch copy/UI assertions
- `tests/privy/purity.test.ts` — NEW: no convex imports in lib/privy
- `tests/privy/config.test.ts` — NEW: fixture mode + Privy config shape

## Tasks & Acceptance

**Execution:**
- Pin `@privy-io/react-auth` compatible with React 19
- Implement TelegramRuntimeProvider with initData context
- Implement lib/privy/config with fixture fail-closed behavior
- Wire provider stack in app/providers.tsx
- Implement LaunchSurface and AuthGate
- Wire AuthGate in miniapp home page
- Privy config: telegram login, embedded Solana auto-create, no external wallet
- Leave PrivyConvexProvider as passthrough with TODO for 1.5
- Add tests and update .env.example

**Acceptance Criteria:**
- AC1: Zero-click Telegram auth path; provider order AD-15
- AC2: Embedded Solana wallet auto-create on login (`users-without-wallets`)
- AC3: Launch surface shows wordmark, indeterminate indicator, "Getting your tab ready…", no buttons
- AC4: Silent refresh; inline "Reconnecting…" on genuine failure
- AC5: Convex-subscribing surfaces are client components

## Spec Change Log

- 2026-08-21: Initial spec during Story 1.4 implementation

## Review Triage Log

## Auto Run Result

- Summary: Zero-click Privy Telegram auth stack with TelegramRuntimeProvider, Privy config/fixture mode, Launch/AuthGate surfaces, provider order AD-15, and PrivyConvex passthrough stub for Story 1.5.
- Files changed: lib/privy/, features/telegram/, features/auth/, components/theme/, app/providers.tsx, app/(miniapp)/page.tsx, tests/auth/, tests/privy/, .env.example, lib/env/contract.ts, next.config.ts, tsconfig.json, package.json, package-lock.json, spec-1-4
- Verification: npm test — 47/47 pass; npm run build — succeeds (Privy optional peer warnings only)

## Verification

**Commands:**
- `npm test` — expected: all tests pass including provider order, launch surface, privy purity
- `npm run build` — expected: Next.js build succeeds
