"use client";

import { use, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { BillReview, FIXTURE_BILL_REVIEW, type BillReviewProps } from "@/features/claims";
import { SettleSheetHost, settleSearch } from "@/features/settlement/SettleSheetHost";
import { useResolvedTab } from "@/features/tabs/useTabData";
import { useLiveMutation, useLiveQuery } from "@/features/convex/useConvexData";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type BillPageProps = {
  params: Promise<{ publicToken: string }>;
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
 */
type BillReviewData = {
  bill: BillReviewProps;
  /** The draft revision `lockBill` must be checked against. */
  revision: number;
};

function useBillReviewData(tabId: string | null): BillReviewData {
  const result = useLiveQuery(
    api.allocations.getBillReview,
    tabId ? { tabId: tabId as Id<"tabs"> } : "skip",
  );

  return useMemo<BillReviewData>(() => {
    if (result.fixture) {
      return { bill: { ...FIXTURE_BILL_REVIEW }, revision: 0 };
    }

    const view = result.data;
    if (!view) {
      return {
        bill: {
          tabName: "",
          isOrganizer: false,
          isLocked: false,
          billTotalMinor: 0,
          reconciles: true,
          organizerDisplayName: "Organizer",
          breakdowns: [],
        },
        revision: 0,
      };
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
  }, [result.fixture, result.data]);
}

function BillReviewSurface({ publicToken }: { publicToken: string }) {
  const router = useRouter();
  const session = useResolvedTab(publicToken);
  const tabId = session.status === "ready" ? session.tabId : null;
  const { bill, revision } = useBillReviewData(tabId);
  const { isTelegramWebApp } = useTelegramRuntime();

  const lockBill = useLiveMutation(api.allocations.lockBill);
  // `lockBill` throws `RevisionSyncError` on a stale write rather than returning
  // `{ stale: true }`, so it surfaces the same one-line notice on this surface.
  const [isStale, setIsStale] = useState(false);

  /*
   * `api.allocations.lockBill({ tabId, clientRevision })` — the invariant, the
   * snapshot and the obligations happen in that one transaction, and the
   * organizer lands back on the board where everyone's footer has already
   * become "Settle up" through their own subscription.
   */
  const handleLock = useCallback(() => {
    if (!lockBill || !tabId) {
      router.push(`/tabs/${publicToken}`);
      return;
    }
    setIsStale(false);
    void lockBill({ tabId: tabId as Id<"tabs">, clientRevision: revision })
      .then(() => router.push(`/tabs/${publicToken}`))
      .catch(() => setIsStale(true));
  }, [lockBill, tabId, revision, router, publicToken]);

  // §4.2 — the no-claims empty state's "Back to the tab" action.
  const handleBack = useCallback(() => {
    router.push(`/tabs/${publicToken}`);
  }, [router, publicToken]);

  const handleSettle = useCallback(() => {
    // The Payment Sheet is a sheet over the Claim Board, keyed on `?settle=`.
    router.push(`/tabs/${publicToken}${settleSearch(publicToken)}`);
  }, [router, publicToken]);

  return (
    <AppShell>
      <BillReview
        {...bill}
        isStale={isStale || bill.isStale}
        onLock={isTelegramWebApp ? handleLock : undefined}
        onSettle={handleSettle}
        onBack={handleBack}
      />
      <SettleSheetHost />
    </AppShell>
  );
}

/** Bill Review — `/tabs/[publicToken]/bill` (POLISH-SPEC §1.7). */
export default function BillPage({ params }: BillPageProps) {
  const { publicToken } = use(params);

  return (
    <AuthGate>
      <BillReviewSurface publicToken={publicToken} />
    </AuthGate>
  );
}
