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
  /** Where "Back to tab" lands. */
  tabHref: string;
};

/**
 * Single prop-resolution point for Payment Progress.
 *
 * Live read: `api.settlements.getIntent({ intentId })`. The intent is a live
 * subscription — this surface exists as a route precisely so a payment in
 * flight survives a reload (POLISH-SPEC §1.0) — and every step advances only on
 * a server-confirmed transition, never optimistically (AD-11).
 *
 * PARTIALLY BLOCKED: `getIntent` returns `{ intentId, status, failureCode,
 * transactionSignature, expiresAt }` only. The recipient's name, the display
 * amount and the originating tab are all on the `settlementIntents` document
 * but not projected, so `amountLabel` is `null` — the component falls back to
 * its state-driven heading rather than inventing a figure — the recipient is
 * "them", and "Back to tab" lands on Tabs. Widening `getIntent`, or a
 * `settlements.getIntentForProgress`, is what unblocks the §1.9 heading.
 */
export function usePaymentProgressData(intentId: string): PaymentProgressData {
  const result = useLiveQuery(api.settlements.getIntent, {
    intentId: intentId as Id<"settlementIntents">,
  });

  return useMemo<PaymentProgressData>(
    () => ({
      status: (result.data?.status ?? "created") as SettlementStatus,
      recipientName: "them",
      failureCode: result.data?.failureCode ?? null,
      amountLabel: null,
      tabHref: "/",
    }),
    [result.data],
  );
}
