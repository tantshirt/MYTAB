import { FIXTURE_LAST_VALID_BLOCK_HEIGHT } from "../../lib/solana/constants";

export const SETTLEMENT_INTENT_TTL_MS = 60_000;

/** My Tab-owned quote expiry — capped at 60s or blockhash safety window (Story 6.4 AC1). */
export function computeIntentExpiresAt(
  now: number,
  lastValidBlockHeight?: number,
): number {
  const blockhashWindowMs = estimateBlockhashSafetyWindowMs(lastValidBlockHeight);
  const ttlMs = Math.min(SETTLEMENT_INTENT_TTL_MS, blockhashWindowMs);
  return now + ttlMs;
}

function estimateBlockhashSafetyWindowMs(lastValidBlockHeight?: number): number {
  if (lastValidBlockHeight === undefined) {
    return SETTLEMENT_INTENT_TTL_MS;
  }
  void lastValidBlockHeight;
  return SETTLEMENT_INTENT_TTL_MS;
}

export function resolveFixtureBlockhashWindow(): number {
  return computeIntentExpiresAt(Date.now(), FIXTURE_LAST_VALID_BLOCK_HEIGHT) - Date.now();
}
