"use client";

import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { useLiveQuery, useRetryNonce } from "@/features/convex/useConvexData";
import { formatFiatMinorThb } from "@/lib/domain/format";
import { formatThbMinorForA11y } from "@/lib/domain/a11yAmount";
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
};

export type OweData = {
  status: "loading" | "ready" | "error";
  rows: OweRow[];
  retry: () => void;
};

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

  return useMemo<OweData>(() => {
    if (obligations.error) {
      return { status: "error", rows: [], retry };
    }
    if (obligations.data === undefined) {
      // `fixture: true` means there is nothing to read, not "still reading" —
      // the surface owes that case an empty state, never a spinner.
      return { status: obligations.fixture ? "ready" : "loading", rows: [], retry };
    }

    const rows = obligations.data
      .filter((row) => row.remainingMinor > 0)
      .map<OweRow>((row) => {
        const remaining = fiatMinorFromInteger(row.remainingMinor);
        return {
          obligationId: row._id,
          tabId: row.tabId,
          tabName: row.tabName,
          creditorUserId: row.creditorUserId,
          creditorDisplayName: row.creditorDisplayName,
          amount: formatFiatMinorThb(remaining),
          amountA11yLabel: formatThbMinorForA11y(remaining),
          staleRevision: row.staleRevision,
        };
      });

    return { status: "ready", rows, retry };
  }, [obligations.data, obligations.error, obligations.fixture, retry]);
}
