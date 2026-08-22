"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ObligationPaymentSheet } from "./ObligationPaymentSheet";
import { SheetContainer } from "@/components/settlement-sheet/SheetContainer";
import type { PaymentTokenOption } from "@/components/settlement-sheet/PaymentTokenSelector";

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

export type SettleSheetData = {
  intentId: string;
  billAmountLabel: string;
  billAmount: string;
  recipientName: string;
  recipientId: string;
  destinationAsset: string;
  spendLabel: string;
  maximumSpend: string;
  minimumReceiveAmount: string;
  rateLabel: string;
  quoteRemainingMs: number;
  quoteExpired: boolean;
  /** `created` / `quoting` — the quote is not resolved yet and Pay is disabled. */
  quoteResolving: boolean;
  staleRevision: boolean;
  roundUpLabel: string;
  roundUpAmountLabel: string;
  tokens: PaymentTokenOption[];
};

/**
 * Single prop-resolution point for the Payment Sheet.
 *
 * TODO(live-data): replace the fixture return with
 * `useQuery(api.settlements.getObligationQuote, { obligationId })` and delete
 * the constant below. Nothing outside this function knows where the data
 * comes from.
 */
function useSettleSheetData(obligationId: string): SettleSheetData {
  return useMemo(
    () => ({
      intentId: `intent_${obligationId}`,
      billAmountLabel: "your share of Sukhumvit Dinner",
      billAmount: "฿291.74",
      recipientName: "Maya",
      recipientId: "maya",
      destinationAsset: "USDC",
      spendLabel: "≈ 0.0412 SOL",
      maximumSpend: "0.0418 SOL",
      minimumReceiveAmount: "8.25 USDC",
      rateLabel: "฿35.36 per USDC",
      quoteRemainingMs: 42_000,
      quoteExpired: false,
      quoteResolving: false,
      staleRevision: false,
      roundUpLabel: "Round up to ฿300",
      roundUpAmountLabel: "+฿8.26",
      tokens: [
        { id: "usdc", name: "USDC", balanceLabel: "12.40 USDC", affordable: true },
        { id: "sol", name: "SOL", balanceLabel: "0.0612 SOL", affordable: true },
        { id: "usdt", name: "USDT", balanceLabel: "1.02 USDT", affordable: false },
      ],
    }),
    [obligationId],
  );
}

function SettleSheet({ obligationId }: { obligationId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const data = useSettleSheetData(obligationId);

  const [selectedTokenId, setSelectedTokenId] = useState(data.tokens[0]?.id ?? "");
  const [roundUpEnabled, setRoundUpEnabled] = useState(false);
  // Once Pay is tapped the sheet is committed: scrim tap, swipe-down and Escape all
  // come off together, and it transitions forward to Payment Progress (EXPERIENCE,
  // `payment-sheet`). It is never dismissible backward again.
  const [committed, setCommitted] = useState(false);

  const dismiss = useCallback(() => {
    // Dismissal removes the key rather than pushing a new entry, so Telegram's
    // BackButton does not have to walk back through the sheet twice.
    router.replace(pathname);
  }, [router, pathname]);

  const handlePay = useCallback(() => {
    setCommitted(true);
    // Past this point the payment is in flight, so it becomes a route (§1.0).
    router.replace(`/pay/${data.intentId}`);
  }, [router, data.intentId]);

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
        onSelectToken={setSelectedTokenId}
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
        onPay={handlePay}
        onRefreshQuote={() => router.refresh()}
        onRefreshBill={() => router.refresh()}
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
