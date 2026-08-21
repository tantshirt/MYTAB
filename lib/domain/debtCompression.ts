import type { FiatMinor } from "./money";
import type { UserNetPosition } from "./balance";

/** A suggested transfer between two people (Story 7.11). */
export type CompressedTransfer = {
  fromUserId: string;
  toUserId: string;
  amountMinor: FiatMinor;
};

/**
 * Greedy debt compression over confirmed net positions (Story 7.11 AC2).
 * Does not claim mathematical minimum (AC3).
 */
export function compressDebts(positions: UserNetPosition[]): CompressedTransfer[] {
  type Bucket = { userId: string; amountMinor: FiatMinor };

  const debtors: Bucket[] = positions
    .filter((p) => p.netMinor < 0)
    .map((p) => ({ userId: p.userId, amountMinor: Math.abs(p.netMinor) as FiatMinor }))
    .sort((a, b) => b.amountMinor - a.amountMinor);

  const creditors: Bucket[] = positions
    .filter((p) => p.netMinor > 0)
    .map((p) => ({ userId: p.userId, amountMinor: p.netMinor }))
    .sort((a, b) => b.amountMinor - a.amountMinor);

  const transfers: CompressedTransfer[] = [];
  let di = 0;
  let ci = 0;

  while (di < debtors.length && ci < creditors.length) {
    const debtor = debtors[di]!;
    const creditor = creditors[ci]!;
    const amountMinor = Math.min(debtor.amountMinor, creditor.amountMinor) as FiatMinor;

    if (amountMinor > 0) {
      transfers.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amountMinor,
      });
    }

    debtor.amountMinor = (debtor.amountMinor - amountMinor) as FiatMinor;
    creditor.amountMinor = (creditor.amountMinor - amountMinor) as FiatMinor;

    if (debtor.amountMinor === 0) {
      di += 1;
    }
    if (creditor.amountMinor === 0) {
      ci += 1;
    }
  }

  return transfers;
}

/** Honest copy for compression suggestions (Story 7.11 AC3). */
export const DEBT_COMPRESSION_DISCLAIMER =
  "Fewer transfers that settle everyone — not guaranteed to be the fewest possible.";
