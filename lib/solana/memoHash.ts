import { sha256Hex } from "../crypto/convexCrypto";

/**
 * Hash-only memo commitment for a tip intent (Story 3.3 AC6, NFR-7).
 * Never embeds names, amounts, notes, Telegram IDs, or addresses in the memo.
 */
export function computeTipIntentCommitmentHash(input: {
  tipId: string;
  targetOutputAtomic: string;
  outputMint: string;
  outputDecimals: number;
}): string {
  const payload = [
    "tip",
    input.tipId,
    input.targetOutputAtomic,
    input.outputMint,
    String(input.outputDecimals),
  ].join("|");
  return sha256Hex(payload);
}

/** Hash-only memo commitment for a bill obligation (Story 6.1 AC6). */
export function computeObligationCommitmentHash(input: {
  obligationId: string;
  billSnapshotHash: string;
  targetOutputAtomic: string;
  outputMint: string;
  outputDecimals: number;
}): string {
  const payload = [
    "obligation",
    input.obligationId,
    input.billSnapshotHash,
    input.targetOutputAtomic,
    input.outputMint,
    String(input.outputDecimals),
  ].join("|");
  return sha256Hex(payload);
}

/** Deterministic bill snapshot hash from locked revision data (Story 6.1 AC6). */
export function computeBillSnapshotHash(input: {
  tabId: string;
  lockedRevision: number;
  obligationAmountAtomic: string;
  outputMint: string;
}): string {
  const payload = [
    input.tabId,
    String(input.lockedRevision),
    input.obligationAmountAtomic,
    input.outputMint,
  ].join("|");
  return sha256Hex(payload);
}

/**
 * The single source of truth for the memo an intent must carry.
 *
 * Used by the builder to emit it and by the pre-sponsor gate to assert it, so a
 * memo can never be repointed at a different obligation than the one being paid.
 */
export function computeSettlementMemo(input: {
  tipId?: string;
  obligationId?: string;
  billSnapshotHash?: string;
  targetOutputAtomic: string;
  outputMint: string;
  outputDecimals: number;
}): string {
  if (input.obligationId && input.billSnapshotHash) {
    return computeObligationCommitmentHash({
      obligationId: input.obligationId,
      billSnapshotHash: input.billSnapshotHash,
      targetOutputAtomic: input.targetOutputAtomic,
      outputMint: input.outputMint,
      outputDecimals: input.outputDecimals,
    });
  }
  return computeTipIntentCommitmentHash({
    tipId: input.tipId ?? input.obligationId ?? "unknown",
    targetOutputAtomic: input.targetOutputAtomic,
    outputMint: input.outputMint,
    outputDecimals: input.outputDecimals,
  });
}
