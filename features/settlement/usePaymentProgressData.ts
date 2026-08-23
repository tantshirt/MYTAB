"use client";

import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLiveQuery } from "@/features/convex/useConvexData";
import type { SettlementStatus } from "@/convex/lib/settlementState";

export type PaymentProgressData = {
  status: SettlementStatus;
  recipientName: string;
  failureCode: string | null;
  /**
   * The amount in flight. §1.9: the amount is the heading, not "Sending
   * payment" — but only when it is actually known.
   */
  amountLabel: string | null;
  billName: string | null;
  /** What the recipient received, e.g. "8.25 USDC". */
  recipientReceivesLabel: string | null;
  /** Where "Back to tab" lands. */
  tabHref: string;
};

/**
 * Single prop-resolution point for Payment Progress.
 *
 * Live read: `api.settlements.getIntent({ intentId })`. Confirmation moves the
 * ledger, not submission (AD-11). The confirmed line is the stored guarantee
 * (`otherAmountThreshold` / locked output) — what they received, not a route.
 */
export function usePaymentProgressData(intentId: string): PaymentProgressData {
  const result = useLiveQuery(api.settlements.getIntent, {
    intentId: intentId as Id<"settlementIntents">,
  });

  return useMemo<PaymentProgressData>(
    () => ({
      status: (result.data?.status ?? "created") as SettlementStatus,
      recipientName: result.data?.recipientName ?? "them",
      failureCode: result.data?.failureCode ?? null,
      amountLabel: result.data?.amountLabel ?? null,
      billName: result.data?.billName ?? null,
      recipientReceivesLabel: result.data?.recipientReceivesLabel ?? null,
      tabHref: result.data?.tabHref ?? "/",
    }),
    [result.data],
  );
}
