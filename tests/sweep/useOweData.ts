"use client";

import { useRetryNonce } from "@/features/convex/useConvexData";
import { formatFiatMinorThb } from "@/lib/domain/format";
import { formatThbMinorForA11y } from "@/lib/domain/a11yAmount";
import { fiatMinorFromInteger } from "@/lib/domain/money";
import type { OweData, OweRow } from "../../features/balances/useOweData";

export type { OweData, OweRow };

/**
 * Sweep stand-in — see `tests/sweep/README.md`.
 *
 * The rows are chosen to break the layout if it can be broken: a name long
 * enough to force truncation beside a five-digit amount, a stale row (the 40%
 * figure that must still occupy its full column), and a satang-precise figure
 * that must align on the decimal with the others.
 */
const ROWS: OweRow[] = [
  {
    obligationId: "obl-sweep-1",
    tabId: "tabs:fixture-primary",
    tabName: "Sukhumvit Dinner",
    creditorUserId: "user-maya",
    creditorDisplayName: "Maya",
    amount: formatFiatMinorThb(fiatMinorFromInteger(29174)),
    amountA11yLabel: formatThbMinorForA11y(fiatMinorFromInteger(29174)),
    staleRevision: false,
  },
  {
    obligationId: "obl-sweep-2",
    tabId: "tabs:fixture-secondary",
    tabName: "After-dinner drinks at the rooftop place",
    creditorUserId: "user-tim",
    creditorDisplayName: "Tim Charoenwattananukul",
    amount: formatFiatMinorThb(fiatMinorFromInteger(1284050)),
    amountA11yLabel: formatThbMinorForA11y(fiatMinorFromInteger(1284050)),
    staleRevision: false,
  },
  {
    obligationId: "obl-sweep-3",
    tabId: "tabs:fixture-tertiary",
    tabName: "Somtum Der",
    creditorUserId: "user-noi",
    creditorDisplayName: "Noi",
    amount: formatFiatMinorThb(fiatMinorFromInteger(6009)),
    amountA11yLabel: formatThbMinorForA11y(fiatMinorFromInteger(6009)),
    staleRevision: true,
  },
];

export function useOweData(): OweData {
  const { retry } = useRetryNonce();
  return { status: "ready", rows: ROWS, owedRows: [], retry };
}
