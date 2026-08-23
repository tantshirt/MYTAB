"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ObligationPaymentSheet } from "./ObligationPaymentSheet";
import { usePayObligation } from "./usePayObligation";
import { useSettleSheetData } from "@/features/settlement/useSettleSheetData";
import { useLiveMutation } from "@/features/convex/useConvexData";
import { SheetContainer } from "@/components/settlement-sheet/SheetContainer";
import { ErrorState } from "@/components/primitives/error-state";
import { STATE_COPY } from "@/components/primitives/state-copy";
import { WalletConnectHost } from "@/features/auth/WalletConnectHost";
import { writePendingWalletAction } from "@/features/auth/pendingWalletAction";

/**
 * The Payment Sheet is a *sheet*, not a route (POLISH-SPEC §1.0).
 *
 * It is dismissible until Pay is tapped, so it must not own a URL of its own —
 * but it still has to survive a reload and answer to Telegram's BackButton,
 * so it is keyed on a search param: `?settle=<obligationId>`.
 *
 * Mount `<SettleSheetHost />` on any surface that can open it (Claim Board,
 * Group, Activity) and open it with `settleSearch(obligationId)`.
 */
export const SETTLE_PARAM = "settle";

/** Build the query string that opens the sheet on the current surface. */
export function settleSearch(obligationId: string): string {
  return `?${SETTLE_PARAM}=${encodeURIComponent(obligationId)}`;
}

/** §4.3, Payment Sheet — the sheet exists, and there is no price to put in it. */
export const NO_QUOTE_MESSAGE = "Couldn't get a price right now.";

function SettleSheet({ obligationId }: { obligationId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const data = useSettleSheetData(obligationId, refreshNonce);
  const createIntent = useLiveMutation(api.settlements.createObligationIntent);
  const { pay } = usePayObligation();

  const [selectedTokenId, setSelectedTokenId] = useState("");
  const [roundUpEnabled, setRoundUpEnabled] = useState(false);
  // Once Pay is tapped the sheet is committed: scrim tap, swipe-down and Escape all
  // come off together, and it transitions forward to Payment Progress (EXPERIENCE,
  // `payment-sheet`). It is never dismissible backward again.
  const [committed, setCommitted] = useState(false);

  useEffect(() => {
    if (!selectedTokenId && data.tokens[0]) {
      setSelectedTokenId(data.tokens[0].id);
    }
  }, [data.tokens, selectedTokenId]);

  const dismiss = useCallback(() => {
    // Dismissal removes the key rather than pushing a new entry, so Telegram's
    // BackButton does not have to walk back through the sheet twice.
    router.replace(pathname);
  }, [router, pathname]);

  const refresh = useCallback(() => {
    setRefreshNonce((value) => value + 1);
  }, []);

  const handleSelectToken = useCallback(
    (tokenId: string) => {
      setSelectedTokenId(tokenId);
      if (!createIntent) {
        return;
      }
      void createIntent({
        obligationId: obligationId as Id<"obligations">,
        inputMint: tokenId,
        idempotencyKey: crypto.randomUUID(),
      })
        .then(() => {
          refresh();
        })
        .catch(() => {
          refresh();
        });
    },
    [createIntent, obligationId, refresh],
  );

  const handlePay = useCallback(() => {
    if (!data.intentId) {
      return;
    }
    setCommitted(true);
    void pay({
      intentId: data.intentId,
      walletKind: data.walletKind,
      walletProvider: data.walletProvider,
      preparedTxBase64: data.preparedTxBase64,
    }).then((result) => {
      if (!result.ok) {
        setCommitted(false);
        return;
      }
      router.replace(`/pay/${data.intentId}`);
    });
  }, [data, pay, router]);

  /*
   * Every figure on this sheet is money — a spend, a floor, a rate, a balance.
   * With no quote there is no honest placeholder for any of them, so the sheet
   * says so and offers the one action that can change the answer. It never
   * renders amounts nobody owes under a live Pay button.
   */
  if (data.status !== "ready") {
    if (data.unavailableReason === "NO_WALLET") {
      return (
        <WalletConnectHost
          reason="pay"
          onLinked={() => {
            writePendingWalletAction({ kind: "pay", obligationId });
            refresh();
          }}
          onSkip={dismiss}
        />
      );
    }
    return (
      <SheetContainer label="Payment sheet" dismissible onDismiss={dismiss}>
        <ErrorState
          headline={NO_QUOTE_MESSAGE}
          actions={[{ label: STATE_COPY.retry, onPress: refresh }]}
        />
      </SheetContainer>
    );
  }

  return (
    <SheetContainer label="Payment sheet" dismissible={!committed} onDismiss={dismiss}>
      <ObligationPaymentSheet
        billAmount={data.billAmount}
        billAmountLabel={data.billAmountLabel}
        recipientName={data.recipientName}
        recipientId={data.recipientId}
        destinationAsset={data.destinationAsset}
        tokens={data.tokens}
        selectedTokenId={selectedTokenId}
        onSelectToken={handleSelectToken}
        spendLabel={data.spendLabel}
        minimumReceiveAmount={data.minimumReceiveAmount}
        maximumSpend={data.maximumSpend}
        rateLabel={data.rateLabel}
        roundUpLabel={data.roundUpLabel}
        roundUpAmountLabel={data.roundUpAmountLabel}
        roundUpEnabled={roundUpEnabled}
        onToggleRoundUp={setRoundUpEnabled}
        quoteRemainingMs={data.quoteRemainingMs}
        quoteExpired={data.quoteExpired}
        quoteResolving={data.quoteResolving}
        staleRevision={data.staleRevision}
        held={data.held}
        onPay={handlePay}
        onRefreshQuote={refresh}
        onRefreshBill={refresh}
      />
    </SheetContainer>
  );
}

function SettleSheetSwitch() {
  const searchParams = useSearchParams();
  const obligationId = searchParams.get(SETTLE_PARAM);

  if (!obligationId) {
    return null;
  }

  return <SettleSheet obligationId={obligationId} />;
}

/**
 * Renders the Payment Sheet when `?settle=<obligationId>` is present, and
 * nothing at all otherwise.
 */
export function SettleSheetHost() {
  return (
    <Suspense fallback={null}>
      <SettleSheetSwitch />
    </Suspense>
  );
}
