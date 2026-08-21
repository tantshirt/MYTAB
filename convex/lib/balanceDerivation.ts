import type { FiatMinor } from "../../lib/domain/money";
import {
  deriveWithinGroupBalance,
  type LedgerOffset,
  type ObligationRecord,
} from "../../lib/domain/balance";

export type ObligationLedgerRow = {
  obligationId: string;
  tabId: string;
  billId: string;
  debtorUserId: string;
  creditorUserId: string;
  amountMinor: number;
  eventKind: string;
  confirmed: boolean;
};

/** Maps Convex ledger rows to domain inputs (Story 7.5). */
export function buildBalanceInputs(input: {
  obligations: Array<{
    id: string;
    tabId: string;
    billId: string;
    debtorUserId: string;
    creditorUserId: string;
    amountMinor: number;
    revision: number;
    superseded: boolean;
  }>;
  ledgerEvents: ObligationLedgerRow[];
}): { obligations: ObligationRecord[]; offsets: LedgerOffset[] } {
  const obligations: ObligationRecord[] = input.obligations.map((o) => ({
    id: o.id,
    tabId: o.tabId,
    billId: o.billId,
    debtorUserId: o.debtorUserId,
    creditorUserId: o.creditorUserId,
    amountMinor: o.amountMinor as FiatMinor,
    revision: o.revision,
    superseded: o.superseded,
  }));

  const offsets: LedgerOffset[] = input.ledgerEvents
    .filter((e) => e.eventKind !== "cash_proposed")
    .map((e) => ({
      obligationId: e.obligationId,
      tabId: e.tabId,
      billId: e.billId,
      debtorUserId: e.debtorUserId,
      creditorUserId: e.creditorUserId,
      amountMinor: e.amountMinor as FiatMinor,
      kind:
        e.eventKind === "waiver_offset"
          ? "waiver_offset"
          : e.eventKind === "cash_offset"
            ? "cash_offset"
            : "settlement_offset",
      confirmed: e.confirmed,
    }));

  return { obligations, offsets };
}

export { deriveWithinGroupBalance };
