export const SETTLEMENT_INTENT_TTL_MS = 60_000;

/**
 * Solana slots are nominally 400ms but routinely run faster. A quote must expire
 * EARLIER than the chain would invalidate it, never later, so the estimate is
 * deliberately conservative: a shorter slot means the blockhash dies sooner in
 * wall-clock, so we assume the shorter one.
 */
const CONSERVATIVE_MS_PER_SLOT = 380;

/**
 * Never hand out a quote that dies while someone is still approving it in their
 * wallet. Subtracted from the chain window, not from our own policy TTL.
 */
const SIGNATURE_MARGIN_MS = 5_000;

export type BlockhashWindow = {
  /** Last block height at which the transaction's blockhash is still valid. */
  lastValidBlockHeight: number;
  /** Chain height when the blockhash was fetched. */
  currentBlockHeight: number;
};

/**
 * My Tab-owned quote expiry: the sooner of our 60s policy and the chain's own
 * blockhash window (Story 6.4 AC1).
 *
 * The previous implementation took `lastValidBlockHeight` and did
 * `void lastValidBlockHeight; return SETTLEMENT_INTENT_TTL_MS` — it accepted the
 * chain's deadline and discarded it, so a quote could still read as live after
 * its blockhash had expired. The person would approve in their wallet and the
 * broadcast would fail, which is the worst place to discover it.
 *
 * A height alone cannot produce a duration; it is meaningless without the height
 * it is measured from. That is why the old signature could never have worked and
 * why this one takes both.
 */
export function computeIntentExpiresAt(now: number, window?: BlockhashWindow): number {
  return now + resolveIntentTtlMs(window);
}

/** Exposed so callers can decide to rebuild rather than issue a dead quote. */
export function resolveIntentTtlMs(window?: BlockhashWindow): number {
  if (!window) {
    // No chain window supplied — our policy TTL is the only bound available.
    return SETTLEMENT_INTENT_TTL_MS;
  }

  const slotsRemaining = window.lastValidBlockHeight - window.currentBlockHeight;
  if (!Number.isFinite(slotsRemaining) || slotsRemaining <= 0) {
    // Already expired, or nonsense input. Zero means "do not issue this quote".
    return 0;
  }

  const chainWindowMs = slotsRemaining * CONSERVATIVE_MS_PER_SLOT - SIGNATURE_MARGIN_MS;
  if (chainWindowMs <= 0) {
    return 0;
  }

  return Math.min(SETTLEMENT_INTENT_TTL_MS, chainWindowMs);
}
