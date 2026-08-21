import { thbMinorToUsdcAtomicFixture } from "./fxFixture";
import type { ParticipantBreakdown } from "./allocation";
import { fiatMinorFromInteger, type FiatMinor } from "./money";

export type ObligationSnapshot = {
  participantId: string;
  displayAmountThbMinor: FiatMinor;
  settlementAmountAtomic: bigint;
};

/** Converts locked participant breakdowns into obligation snapshots (fixture FX). */
export function buildObligationSnapshots(
  breakdowns: readonly ParticipantBreakdown[],
): ObligationSnapshot[] {
  return breakdowns
    .filter((row) => row.totalMinor > 0)
    .map((row) => ({
      participantId: row.participantId,
      displayAmountThbMinor: row.totalMinor,
      settlementAmountAtomic: thbMinorToUsdcAtomicFixture(row.totalMinor),
    }));
}

export type BillLockSnapshotPayload = {
  revision: number;
  itemSubtotalMinor: FiatMinor;
  billTotalMinor: FiatMinor;
  taxMinor: FiatMinor;
  serviceMinor: FiatMinor;
  discountMinor: FiatMinor;
  groupTipMinor: FiatMinor;
  fxNumeratorAtomic: bigint;
  fxDenominatorMinor: bigint;
  fxProvider: string;
  fxPolicyVersion: string;
  recipientUserId: string;
  recipientAsset: string;
  participantBreakdowns: ParticipantBreakdown[];
  obligations: ObligationSnapshot[];
};

export function emptyBillTotals() {
  return {
    itemSubtotalMinor: fiatMinorFromInteger(0),
    taxMinor: fiatMinorFromInteger(0),
    serviceMinor: fiatMinorFromInteger(0),
    discountMinor: fiatMinorFromInteger(0),
    groupTipMinor: fiatMinorFromInteger(0),
    billTotalMinor: fiatMinorFromInteger(0),
  };
}
