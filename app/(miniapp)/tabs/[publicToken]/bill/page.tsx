"use client";

import { use, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { BillReview } from "@/features/claims";
import { useBillReviewData } from "@/features/claims/useBillReviewData";
import { SettleSheetHost, settleSearch } from "@/features/settlement/SettleSheetHost";
import { useResolvedTab } from "@/features/tabs/useTabData";
import { useLiveMutation } from "@/features/convex/useConvexData";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type BillPageProps = {
  params: Promise<{ publicToken: string }>;
};

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
