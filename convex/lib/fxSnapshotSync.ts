import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  FIXTURE_USDC_ATOMIC_DENOMINATOR,
  FIXTURE_USDC_ATOMIC_NUMERATOR,
} from "../../lib/domain/fxFixture";

export const FX_POLICY_VERSION = "fixture-v1";
export const FX_DIRECTION = "USDC_ATOMIC_PER_THB_MINOR" as const;
export const FIXTURE_FX_PROVIDER = "fixture:manual";

const FIXTURE_FRESHNESS_MS = 96 * 60 * 60 * 1000;

/** Creates a fixture FX snapshot for non-production authoring (Story 4.1 AC6). */
export async function createFixtureFxSnapshot(
  ctx: MutationCtx,
  now: number,
): Promise<Id<"fxSnapshots">> {
  const providerAsOf = now;
  const expiresAt = now + FIXTURE_FRESHNESS_MS;

  return ctx.db.insert("fxSnapshots", {
    baseCurrency: "THB",
    quoteMint: "USDC",
    direction: FX_DIRECTION,
    numeratorAtomic: FIXTURE_USDC_ATOMIC_NUMERATOR,
    denominatorMinor: FIXTURE_USDC_ATOMIC_DENOMINATOR,
    provider: FIXTURE_FX_PROVIDER,
    providerAsOf,
    fetchedAt: now,
    expiresAt,
    policyVersion: FX_POLICY_VERSION,
    isFixture: true,
  });
}
