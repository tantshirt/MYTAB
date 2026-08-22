"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ObligationPaymentSheet } from "./ObligationPaymentSheet";
import type { PaymentTokenOption } from "@/components/settlement-sheet/PaymentTokenSelector";
import { MYTAB_COLORS, MYTAB_LAYOUT } from "@/lib/theme/tokens";

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
  destinationAsset: string;
  maximumSpend: string;
  minimumReceive: string;
  quoteRemainingMs: number;
  quoteExpired: boolean;
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
      billAmountLabel: "Your share of Sukhumvit Dinner",
      billAmount: "฿291.74",
      recipientName: "Maya",
      destinationAsset: "USDC",
      maximumSpend: "≈ 0.0424 SOL",
      minimumReceive: "8.25 USDC",
      quoteRemainingMs: 42_000,
      quoteExpired: false,
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

  const dismiss = useCallback(() => {
    // Dismissal removes the key rather than pushing a new entry, so Telegram's
    // BackButton does not have to walk back through the sheet twice.
    router.replace(pathname);
  }, [router, pathname]);

  const handlePay = useCallback(() => {
    // Past this point the payment is in flight, so it becomes a route (§1.0).
    router.replace(`/pay/${data.intentId}`);
  }, [router, data.intentId]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Payment sheet"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        style={{
          position: "absolute",
          inset: 0,
          border: "none",
          padding: 0,
          background: "rgba(10, 32, 56, 0.38)",
          cursor: "pointer",
        }}
      />
      {/* TODO(P1-16): replace this container with components/settlement-sheet/SheetContainer.tsx
          (grab handle, drag-to-dismiss, focus trap, Escape) once §1.8 lands. */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: MYTAB_LAYOUT.maxColumnWidth,
          margin: "0 auto",
          background: MYTAB_COLORS.surface,
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -8px 32px rgba(10, 32, 56, 0.12)",
          maxHeight: "calc(100dvh - 64px)",
          overflowY: "auto",
          overscrollBehavior: "contain",
          paddingBottom: "calc(22px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 36,
            height: 4,
            borderRadius: 999,
            background: MYTAB_COLORS.border,
            margin: "10px auto 10px",
          }}
        />
        <ObligationPaymentSheet
          tokens={data.tokens}
          selectedTokenId={selectedTokenId}
          onSelectToken={setSelectedTokenId}
          routedPayment
          staleRevision={data.staleRevision}
          onRefreshStale={() => router.refresh()}
          roundUpEnabled={roundUpEnabled}
          roundUpLabel={data.roundUpLabel}
          roundUpAmountLabel={data.roundUpAmountLabel}
          onToggleRoundUp={setRoundUpEnabled}
          billAmountLabel={data.billAmountLabel}
          billAmount={data.billAmount}
          recipientName={data.recipientName}
          destinationAsset={data.destinationAsset}
          paymentToken={
            data.tokens.find((token) => token.id === selectedTokenId)?.name ?? "USDC"
          }
          maximumSpend={data.maximumSpend}
          minimumReceive={data.minimumReceive}
          quoteRemainingMs={data.quoteRemainingMs}
          quoteExpired={data.quoteExpired}
          onPay={handlePay}
          onRefreshQuote={() => router.refresh()}
        />
      </div>
    </div>
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
