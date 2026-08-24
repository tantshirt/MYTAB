"use client";

import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { useLiveQuery, useRetryNonce } from "@/features/convex/useConvexData";
import { formatCurrencyMinor } from "@/lib/domain/format";
import { formatCurrencyMinorForA11y } from "@/lib/domain/a11yAmount";
import { fiatMinorFromInteger } from "@/lib/domain/money";

export type OweRow = {
  obligationId: string;
  tabId: string;
  tabName: string;
  creditorUserId: string;
  creditorDisplayName: string;
  /** Already formatted, never rounded — e.g. "฿291.74". */
  amount: string;
  amountA11yLabel: string;
  /** Sorts and greys a row whose bill moved under it. */
  staleRevision: boolean;
  pendingCashProposalId?: string | null;
  canAcknowledgeCash?: boolean;
};

export type OweData = {
  status: "loading" | "ready" | "error";
  rows: OweRow[];
  owedRows: OwedRow[];
  retry: () => void;
};

export type OwedRow = {
  obligationId: string;
  tabName: string;
  debtorUserId: string;
  debtorDisplayName: string;
  amount: string;
  amountA11yLabel: string;
  pendingCashProposalId?: string | null;
  canAcknowledgeCash?: boolean;
  reminderStatus?: "queued" | "claimed" | "sent" | "failed" | "unknown" | null;
};

export function coordinateReciprocalReads<T, U>(input: {
  owingData?: readonly T[];
  owedData?: readonly U[];
  owingResolved: boolean;
  owedResolved: boolean;
  owingError: unknown;
  owedError: unknown;
}): { status: OweData["status"]; owingData: readonly T[]; owedData: readonly U[] } {
  const owingData = input.owingData ?? [];
  const owedData = input.owedData ?? [];
  if (input.owingError || input.owedError) {
    return { status: "error", owingData, owedData };
  }
  return {
    status: input.owingResolved && input.owedResolved ? "ready" : "loading",
    owingData,
    owedData,
  };
}

/**
 * The single prop-resolution seam for "What I owe".
 *
 * One live read — `api.obligations.listForViewer`, filtered to `open`. That
 * query walks `by_debtor_user_id`, so the row set is the viewer's own by
 * construction and nothing another person owes is reachable through it. The
 * client never names a group; scope is resolved server-side.
 *
 * Every amount here is `remainingMinor`, not `displayAmountMinor`: a part-paid
 * obligation must show what is *left*, and a figure that ignores an offset is a
 * wrong figure, not a simplification.
 */
export function useOweData(): OweData {
  const { nonce, retry } = useRetryNonce();
  const obligations = useLiveQuery(
    api.obligations.listForViewer,
    { status: "open" as const },
    nonce,
  );
  const owed = useLiveQuery(api.obligations.listOwedToViewer, { status: "open" as const }, nonce);

  return useMemo<OweData>(() => {
    const obligationsResolved = obligations.data !== undefined || obligations.fixture;
    const owedResolved = owed.data !== undefined || owed.fixture;
    const coordinated = coordinateReciprocalReads({
      owingData: obligations.data,
      owedData: owed.data,
      owingResolved: obligationsResolved,
      owedResolved,
      owingError: obligations.error,
      owedError: owed.error,
    });

    const rows = coordinated.owingData
      .filter((row) => row.remainingMinor > 0)
      .map<OweRow>((row) => {
        const remaining = fiatMinorFromInteger(row.remainingMinor);
        return {
          obligationId: row._id,
          tabId: row.tabId,
          tabName: row.tabName,
          creditorUserId: row.creditorUserId,
          creditorDisplayName: row.creditorDisplayName,
          amount: formatCurrencyMinor(remaining, row.currency),
          amountA11yLabel: formatCurrencyMinorForA11y(remaining, row.currency),
          staleRevision: row.staleRevision,
          pendingCashProposalId: row.pendingCashProposalId,
          canAcknowledgeCash: row.canAcknowledgeCash,
        };
      });

    const owedRows = coordinated.owedData
      .filter((row) => row.remainingMinor > 0)
      .map<OwedRow>((row) => {
        const remaining = fiatMinorFromInteger(row.remainingMinor);
        return {
          obligationId: row._id,
          tabName: row.tabName,
          debtorUserId: row.debtorUserId,
          debtorDisplayName: row.debtorDisplayName,
          amount: formatCurrencyMinor(remaining, row.currency),
          amountA11yLabel: formatCurrencyMinorForA11y(remaining, row.currency),
          pendingCashProposalId: row.pendingCashProposalId,
          canAcknowledgeCash: row.canAcknowledgeCash,
          reminderStatus: row.reminderStatus,
        };
      });
    return { status: coordinated.status, rows, owedRows, retry };
  }, [obligations.data, obligations.error, obligations.fixture, owed.data, owed.error, owed.fixture, retry]);
}
