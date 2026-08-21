import { type FiatMinor } from "./money";

/** Fixture FX: 625 USDC atomic per 2 THB minor (~32 THB/USD). Production uses Frankfurter snapshots. */
export const FIXTURE_USDC_ATOMIC_NUMERATOR = 625n;
export const FIXTURE_USDC_ATOMIC_DENOMINATOR = 2n;

/** Converts THB minor units to USDC atomic with upward rounding (fixture only). */
export function thbMinorToUsdcAtomicFixture(thbMinor: FiatMinor): bigint {
  const minor = BigInt(thbMinor);
  const product = minor * FIXTURE_USDC_ATOMIC_NUMERATOR;
  return (product + FIXTURE_USDC_ATOMIC_DENOMINATOR - 1n) / FIXTURE_USDC_ATOMIC_DENOMINATOR;
}
