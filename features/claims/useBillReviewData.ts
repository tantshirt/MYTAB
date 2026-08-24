"use client";

import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLiveQuery } from "@/features/convex/useConvexData";
import type { BillReviewProps } from "./BillReview";

export type BillReviewData = {
  bill: BillReviewProps;
  /** The draft revision `lockBill` must be checked against. */
  revision: number;
};

/** Nothing read yet. §4.2 — "Nobody has claimed anything yet." with "Back to the tab". */
const EMPTY_BILL_REVIEW: BillReviewProps = {
  tabName: "",
  displayCurrency: "THB",
  isOrganizer: false,
  isLocked: false,
  billTotalMinor: 0,
  reconciles: true,
  organizerDisplayName: "Organizer",
  breakdowns: [],
};

/**
 * Single prop-resolution point for Bill Review.
 *
 * Live read: `api.allocations.getBillReview({ tabId })`. It already returns
 * `reconciles`, `viewerIsOrganizer` and `organizerDisplayName`, so the mapping
 * below is a rename and nothing more.
 *
 * `servicePercent` / `taxPercent` are not in the payload — `getBillReview`
 * returns computed breakdowns, not the adjustment rates. Omitted rather than
 * guessed: the labels fall back to "Service charge" / "VAT" unlabelled by rate.
 *
 * With nothing to read the breakdown is empty, which is §4.2's "Nobody has
 * claimed anything yet." A bill review is a page of other people's money; there
 * is no version of it that may be invented.
 */
export function useBillReviewData(tabId: string | null): BillReviewData {
  const result = useLiveQuery(
    api.allocations.getBillReview,
    tabId ? { tabId: tabId as Id<"tabs"> } : "skip",
  );

  return useMemo<BillReviewData>(() => {
    const view = result.data;
    if (!view) {
      return { bill: EMPTY_BILL_REVIEW, revision: 0 };
    }

    // `ParticipantBreakdown` carries ids, not names; the names are on the
    // participant list in the same payload.
    const names = new Map(
      view.participants.map((participant) => [
        String(participant.userId),
        participant.displayName,
      ]),
    );

    return {
      revision: view.tab.revision,
      bill: {
        tabName: view.tab.name,
        displayCurrency: view.tab.displayCurrency,
        isOrganizer: view.viewerIsOrganizer,
        isLocked: view.isLocked,
        viewerUserId: view.viewerUserId,
        billTotalMinor: view.totals.billTotalMinor,
        reconciles: view.reconciles,
        organizerDisplayName: view.organizerDisplayName,
        breakdowns: view.breakdowns.map((row) => ({
          participantId: row.participantId,
          displayName: names.get(row.participantId) ?? "Guest",
          itemShareMinor: row.itemShareMinor,
          serviceMinor: row.serviceMinor,
          taxMinor: row.taxMinor,
          tipMinor: row.tipMinor,
          discountMinor: row.discountMinor,
          roundingMinor: row.roundingMinor,
          totalMinor: row.totalMinor,
        })),
      },
    };
  }, [result.data]);
}
