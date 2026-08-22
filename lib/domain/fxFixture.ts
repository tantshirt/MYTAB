/**
 * The manual THB->USDC rational.
 *
 * This is a **non-production-only** affordance (binding decision 6). It exists
 * so local dev and tests can author tabs without reaching a provider, and it is
 * always persisted with `isFixture: true` and `provider: "manual:non-production"`
 * so every surface can badge it visibly. The gate that keeps it out of real
 * deployments lives in `lib/solana/runtimeGuard.ts` — this module is pure and
 * cannot see the environment.
 */

import {
  FX_PROVIDER_MANUAL,
  thbMinorToUsdcAtomic,
  usdThbRateTextToRational,
  type FxRational,
} from "./fx";
import { type FiatMinor } from "./money";

/** The manual rate, as a decimal string — never a float. 32 THB per USD. */
export const MANUAL_USD_THB_RATE_TEXT = "32";

/** Manual rational in the `USDC_ATOMIC_PER_THB_MINOR` direction: 625 atomic per 2 THB minor. */
export const MANUAL_FX_RATIONAL: FxRational = usdThbRateTextToRational(
  MANUAL_USD_THB_RATE_TEXT,
);

export const FIXTURE_USDC_ATOMIC_NUMERATOR = MANUAL_FX_RATIONAL.numeratorAtomic;
export const FIXTURE_USDC_ATOMIC_DENOMINATOR = MANUAL_FX_RATIONAL.denominatorMinor;

export const FIXTURE_FX_PROVIDER = FX_PROVIDER_MANUAL;

/**
 * Converts THB minor units to USDC atomic with upward rounding, using the
 * manual rational. Production paths must use the persisted snapshot's rational
 * via {@link thbMinorToUsdcAtomic} instead.
 */
export function thbMinorToUsdcAtomicFixture(thbMinor: FiatMinor): bigint {
  return thbMinorToUsdcAtomic(thbMinor, MANUAL_FX_RATIONAL);
}
