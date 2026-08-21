import { createHash } from "node:crypto";

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
  return createHash("sha256").update(payload).digest("hex");
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
  return createHash("sha256").update(payload).digest("hex");
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
  return createHash("sha256").update(payload).digest("hex");
}
