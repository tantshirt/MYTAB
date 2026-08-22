/**
 * Fixture identifiers for the Privy server-wallet paths.
 *
 * These live under `lib/` rather than `convex/` so that no module under
 * `convex/` exports a `FIXTURE_*` symbol. They are inert data; the gate that
 * keeps them out of a real deployment is `assertFixturePathAllowed`, asserted by
 * every call site in `convex/internal/privy.ts` before one of these can be
 * returned.
 *
 * Returning any of these from a deployment would mean settling to an address
 * nobody controls, or recording a signature that was never broadcast.
 */

/** Fixture Privy wallet id — local dev and tests only. */
export const FIXTURE_PRIVY_WALLET_ID = "privy-fixture-wallet-id";

/** Fixture Solana address — local dev and tests only. */
export const FIXTURE_SOLANA_ADDRESS = "FixTure111111111111111111111111111111111";

/** Fixture sponsor co-signature marker — local dev and tests only. */
export const FIXTURE_SPONSOR_SIGNATURE = "fixture-sponsor-signature-v1";
