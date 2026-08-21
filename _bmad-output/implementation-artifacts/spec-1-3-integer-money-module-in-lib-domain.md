---
title: 'Story 1.3: Integer money module in lib/domain'
type: feature
created: '2026-08-21'
status: in-progress
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '4dab38ad7c3920a6dae08e1de5d18b2f8f271a5f'
context:
  - '{project-root}/docs/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-1-project-scaffold-with-coordinated-vercel-and-convex-deployment.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Money amounts must never drift through JavaScript floats. Every later epic computes bills, tips, allocations, and settlement against one audited pure module.

**Approach:** Implement `lib/domain/` with branded `FiatMinor` (signed int64 satang) and `CryptoAtomic` (bigint + explicit decimals), parse/format boundaries, stable domain errors, and bounds guards. Unit tests prove AC1–AC6 without Convex or network.

## Boundaries & Constraints

**Always:** Pure functions only (AD-6). Fiat uses checked int64 arithmetic. Crypto uses bigint. Display formatting is display-boundary only. Field names end in `Minor` or `Atomic`.

**Never:** Import from `convex/`, perform I/O, read env vars, accept non-integer JS numbers, return floats for money values.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| THB parse | `"291.74"` | `29174` FiatMinor | Invalid format throws |
| Float rejection | `291.74` number | — | Throws NON_INTEGER_NUMBER |
| USDC atomic | `"1500000"` + 6 decimals | CryptoAtomic bigint | Invalid string throws |
| Max bill | `1_000_000_001` satang | — | OUT_OF_BOUNDS |
| Tip bounds | `99` or `10_000_001` satang | — | OUT_OF_BOUNDS |
| Percentage | `10001` bps | — | PERCENTAGE_OUT_OF_BOUNDS |
| Zero denominator | `0` split parts | — | ZERO_DENOMINATOR |
| int64 overflow | chained add past MAX | — | FIAT_OVERFLOW |

</intent-contract>

## Code Map

- `lib/domain/errors.ts` — NEW: stable DomainError codes
- `lib/domain/money.ts` — NEW: FiatMinor, CryptoAtomic, checked int64 ops
- `lib/domain/parse.ts` — NEW: THB string → FiatMinor, reject floats
- `lib/domain/format.ts` — NEW: FiatMinor → `฿291.74` display
- `lib/domain/crypto.ts` — NEW: USDC atomic bigint + JSON decimal string
- `lib/domain/bounds.ts` — NEW: max bill, tip, bps, overflow guards
- `lib/domain/index.ts` — NEW: public exports
- `tests/domain/money.test.ts` — NEW: AC1
- `tests/domain/crypto.test.ts` — NEW: AC2
- `tests/domain/float-rejection.test.ts` — NEW: AC3
- `tests/domain/bounds.test.ts` — NEW: AC6
- `tests/domain/purity.test.ts` — NEW: AC4

## Tasks & Acceptance

**Execution:**
- `lib/domain/errors.ts` — DomainError with stable codes
- `lib/domain/money.ts` — branded types, assertIntegerNumber, checked add/sub/mul
- `lib/domain/parse.ts` — parseThbStringToMinor, thbMinorFromInteger
- `lib/domain/format.ts` — formatFiatMinorThb
- `lib/domain/crypto.ts` — CryptoAmount, serialize/deserialize JSON boundary
- `lib/domain/bounds.ts` — readiness-contract limits and guards
- `lib/domain/index.ts` — re-export public surface
- `tests/domain/*.test.ts` — cover AC1, AC2, AC3, AC4, AC6
- `npm test` — all domain tests pass

**Acceptance Criteria:**
- AC1: 291.74 baht → 29174 satang; format only at display boundary
- AC2: USDC atomic bigint + decimals; JSON decimal string serialization
- AC3: Non-integer JS numbers throw; no money function returns float
- AC4: No convex imports, no I/O, no env reads
- AC5: Money fields named with Minor/Atomic suffix
- AC6: Bounds, overflow, zero denominator fail closed with stable codes

## Spec Change Log

- 2026-08-21: Initial spec, status in-progress during implementation

## Review Triage Log

## Auto Run Result

- Summary: Pure integer money module in lib/domain with FiatMinor/CryptoAtomic types, THB parse/format, USDC JSON serialization, bounds guards, and 22 domain unit tests.
- Files changed: lib/domain/*.ts, tests/domain/*.test.ts, spec-1-3-integer-money-module-in-lib-domain.md
- Verification: npm test — 42/42 pass (22 domain + 20 existing)

## Verification

**Commands:**
- `npm test` — expected: all domain tests pass
