---
title: 'Story 1.5: A Privy access token authenticates a Convex query'
type: feature
created: '2026-08-21'
status: done
review_loop_iteration: 0
followup_review_recommended: true
baseline_revision: '4dab38ad7c3920a6dae08e1de5d18b2f8f271a5f'
context:
  - '{project-root}/docs/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-zero-click-privy-telegram-login-with-an-embedded-solana-wallet.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/research/2026-08-21-stack-verification.md'
warnings:
  - 'AC2 Day 0 gate (live token in deployed Mini App) requires manual spike — record kid/alg/aud/iss against OQ-1'
deferred:
  - 'Story 1.6: Token bridge — build only if OQ-1 spike fails'
  - 'AC3 requireIdentity helper — shared helper lands with first private-data functions'
  - 'AC6 authorization matrix — table-driven suite lands with public API growth'
---

<intent-contract>

## Intent

**Problem:** Convex must trust Privy access tokens so every private function can use `ctx.auth` instead of client-supplied user IDs.

**Approach:** Configure Convex custom JWT auth with a base64 data URI JWKS built from the Privy app verification key, wire `ConvexProviderWithAuth` through `PrivyConvexProvider`, expose a `viewer` query and `useViewer` hook, and support fixture mode when Convex URL or Privy app id is absent.

## Boundaries & Constraints

**Always:** Provider order unchanged (AD-15). `PRIVY_VERIFICATION_KEY` and `PRIVY_APP_ID` live in Convex env only. Both `privy.io` and `https://privy.io` issuers registered (OQ-1). Fixture mode mocks viewer locally.

**Never:** Token bridge (Story 1.6) in this story. Client-supplied DIDs or user IDs as function arguments. Hosted JWKS route on the primary path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Live auth | Valid Privy access token | `viewer` returns Privy DID (`sub`) | Unauthenticated → `null` |
| Fixture mode | No Convex URL or Privy app id | `useViewer` returns fixture user id | No Convex client mounted |
| Token refresh | Privy session active | Convex re-authenticates silently | Adapter returns `null` on fetch failure |
| Missing Convex env | No `PRIVY_VERIFICATION_KEY` at deploy | Fixture JWKS in auth.config for build | Production deploy must set Convex env |
| OQ-1 issuer mismatch | Real token `iss` ≠ configured issuer | Day 0 gate fails → activate Story 1.6 | Record spike outcome in AC5 |

</intent-contract>

## Code Map

- `convex/auth.config.ts` — UPDATE: customJwt providers for both Privy issuers + data URI JWKS
- `convex/lib/privyAuth.ts` — NEW: JWKS data URI builder, provider factory, fixture key
- `convex/lib/identity.ts` — NEW: `getViewerSubject` helper
- `convex/users.ts` — UPDATE: `viewer` query
- `convex/_generated/*` — NEW: minimal codegen stubs (no linked deployment)
- `lib/privy/convex-auth.ts` — NEW: `getAccessToken` → Convex adapter
- `lib/privy/jwks.ts` — NEW: re-export JWKS helpers for tests
- `lib/privy/config.ts` — UPDATE: Convex URL + fixture mode helpers
- `lib/privy/index.ts` — UPDATE: exports
- `lib/env/contract.ts` — UPDATE: `PRIVY_APP_ID`, `PRIVY_VERIFICATION_KEY` in Convex-only keys
- `features/auth/PrivyConvexProvider.tsx` — UPDATE: `ConvexProviderWithAuth` + Privy adapter
- `features/auth/useViewer.ts` — NEW: client hook subscribing to `viewer`
- `.env.example` — UPDATE: document Convex-only Privy auth vars
- `tests/convex/auth.test.ts` — NEW: auth config shape, viewer null when unauthenticated, adapter

## Tasks & Acceptance

**Execution:**
- Configure `convex/auth.config.ts` with dual issuer customJwt + data URI JWKS from `PRIVY_VERIFICATION_KEY`
- Implement `PrivyConvexProvider` with `ConvexProviderWithAuth` and Privy `getAccessToken`
- Add `convex/users.viewer` query and `useViewer` hook with fixture fallback
- Add minimal `convex/_generated` stubs for offline build
- Add unit tests and update env contract

**Acceptance Criteria:**
- AC1: customJwt, ES256, applicationID, data URI JWKS, no hosted JWKS on primary path
- AC2: Day 0 gate — manual live-token spike in deployed Mini App (pending deploy)
- AC3: `getViewerSubject` helper — `requireIdentity` deferred to later private-data functions
- AC4: `viewer` takes no client-supplied identity args
- AC5: OQ-1 spike outcome recorded at deploy verification
- AC6: Authorization matrix deferred until public API grows

## OQ-1 / Spike Notes

Both issuer variants are pre-registered:

```text
issuer: "privy.io"
issuer: "https://privy.io"
```

On Day 0 deploy, decode a real Privy access token and record header `kid`, `alg`, claim `aud`, claim `iss`. If neither issuer matches Convex normalization, activate Story 1.6 immediately.

## Spec Change Log

- 2026-08-21: Initial spec and implementation

## Review Triage Log

## Auto Run Result

- Summary: Privy→Convex JWT auth path with dual-issuer auth.config, ConvexProviderWithAuth bridge, viewer query/hook, fixture mode, and auth unit tests.
- Files changed: convex/auth.config.ts, convex/lib/*, convex/users.ts, convex/_generated/*, features/auth/*, lib/privy/*, lib/env/contract.ts, .env.example, tests/convex/auth.test.ts
- Verification: `npm test && npm run build`

## Verification

**Commands:**
- `npm test` — auth config, viewer identity, adapter tests pass
- `npm run build` — Next.js build succeeds with codegen stubs

**Manual (Day 0 gate):**
- Deploy with `PRIVY_APP_ID` + `PRIVY_VERIFICATION_KEY` in Convex env
- Open deployed Telegram Mini App, confirm `viewer` returns non-null Privy DID
- Record real token `kid`, `alg`, `aud`, `iss` against OQ-1
