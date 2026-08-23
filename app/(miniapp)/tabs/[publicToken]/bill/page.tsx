"use client";

import { use, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { WalletConnectHost } from "@/features/auth/WalletConnectHost";
import { writePendingWalletAction } from "@/features/auth/pendingWalletAction";
import { AppShell } from "@/components/layout/AppShell";
import { BillReview } from "@/features/claims";
import { useBillReviewData } from "@/features/claims/useBillReviewData";
import { SettleSheetHost, settleSearch } from "@/features/settlement/SettleSheetHost";
import { useResolvedTab } from "@/features/tabs/useTabData";
import { useLiveMutation, useLiveQuery } from "@/features/convex/useConvexData";
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
  const tabObligations = useLiveQuery(
    api.obligations.forTab,
    tabId ? { tabId: tabId as Id<"tabs"> } : "skip",
  );
  const linked = useLiveQuery(api.wallets.hasLinkedWallet, {});
  // `lockBill` throws `RevisionSyncError` on a stale write rather than returning
  // `{ stale: true }`, so it surfaces the same one-line notice on this surface.
  const [isStale, setIsStale] = useState(false);
  const [needsWallet, setNeedsWallet] = useState(false);

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
    if (linked.data?.linked !== true) {
      writePendingWalletAction({
        kind: "lock",
        publicToken,
        tabId,
        revision,
      });
      setNeedsWallet(true);
      return;
    }
    setIsStale(false);
    void lockBill({ tabId: tabId as Id<"tabs">, clientRevision: revision })
      .then(() => router.push(`/tabs/${publicToken}`))
      .catch((error: unknown) => {
        const code = error instanceof Error ? error.message : "";
        if (code.includes("RECIPIENT_WALLET_REQUIRED")) {
          writePendingWalletAction({
            kind: "lock",
            publicToken,
            tabId,
            revision,
          });
          setNeedsWallet(true);
          return;
        }
        setIsStale(true);
      });
  }, [lockBill, tabId, revision, router, publicToken, linked.data?.linked]);

  // §4.2 — the no-claims empty state's "Back to the tab" action.
  const handleBack = useCallback(() => {
    router.push(`/tabs/${publicToken}`);
  }, [router, publicToken]);

  const handleSettle = useCallback(() => {
    const obligationId = tabObligations.data?.viewerObligationId;
    if (!obligationId) {
      return;
    }
    router.push(`/tabs/${publicToken}${settleSearch(obligationId)}`);
  }, [router, publicToken, tabObligations.data?.viewerObligationId]);

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
      {needsWallet ? (
        <WalletConnectHost
          reason="lock"
          onLinked={() => {
            setNeedsWallet(false);
            handleLock();
          }}
          onSkip={() => setNeedsWallet(false)}
        />
      ) : null}
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
