import { thbMinorToUsdcAtomic, type FxRational } from "./fx";
import { MANUAL_FX_RATIONAL } from "./fxFixture";
import type { ParticipantBreakdown } from "./allocation";
import { fiatMinorFromInteger, type FiatMinor } from "./money";

export type ObligationSnapshot = {
  participantId: string;
  displayAmountThbMinor: FiatMinor;
  settlementAmountAtomic: bigint;
};

/**
 * Converts locked participant breakdowns into obligation snapshots.
 *
 * The rational must come from the tab's FX snapshot — these amounts are what
 * the recipient is actually paid. Rounding is upward, so no participant's
 * settlement target falls below their locked display amount. The manual default
 * exists only for non-production callers that have no snapshot.
 */
export function buildObligationSnapshots(
  breakdowns: readonly ParticipantBreakdown[],
  rational: FxRational = MANUAL_FX_RATIONAL,
): ObligationSnapshot[] {
  return breakdowns
    .filter((row) => row.totalMinor > 0)
    .map((row) => ({
      participantId: row.participantId,
      displayAmountThbMinor: row.totalMinor,
      settlementAmountAtomic: thbMinorToUsdcAtomic(row.totalMinor, rational),
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
