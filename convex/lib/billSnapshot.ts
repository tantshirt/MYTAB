import { computeBillSnapshotHash } from "../../lib/solana/memoHash";

export type BillSnapshotInput = {
  tabId: string;
  lockedRevision: number;
  obligationAmountAtomic: bigint;
  outputMint: string;
};

/** Computes the immutable bill snapshot hash stored on obligation and settlement records. */
export function computeBillSnapshotForObligation(input: BillSnapshotInput): string {
  return computeBillSnapshotHash({
    tabId: input.tabId,
    lockedRevision: input.lockedRevision,
    obligationAmountAtomic: input.obligationAmountAtomic.toString(),
    outputMint: input.outputMint,
  });
}
