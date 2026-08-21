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
