"use client";

import { use, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { PaymentProgress } from "@/components/settlement-sheet";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import type { SettlementStatus } from "@/convex/lib/settlementState";
import { MYTAB_COLORS, MYTAB_LAYOUT } from "@/lib/theme/tokens";

type PayPageProps = {
  params: Promise<{ intentId: string }>;
};

type PaymentProgressData = {
  status: SettlementStatus;
  recipientName: string;
  failureMessage: string | null;
  /** Where "Back to tab" lands. */
  tabHref: string;
};

/**
 * Single prop-resolution point for Payment Progress.
 *
 * TODO(live-data): replace the fixture with
 * `useQuery(api.settlements.getIntent, { intentId })`. The intent is a live
 * subscription — this surface exists as a route precisely so a payment in
 * flight survives a reload (POLISH-SPEC §1.0).
 */
function usePaymentProgressData(intentId: string): PaymentProgressData {
  return useMemo(
    () => ({
      status: "submitted" as SettlementStatus,
      recipientName: "Maya",
      failureMessage: null,
      tabHref: "/",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentId is the seam key.
    [intentId],
  );
}

function PaymentProgressSurface({ intentId }: { intentId: string }) {
  const router = useRouter();
  const { isTelegramWebApp } = useTelegramRuntime();
  const intent = usePaymentProgressData(intentId);

  // The surface is forward-only: no in-app chevron, and Telegram's BackButton
  // is hidden rather than wired (POLISH-SPEC §1.9).
  useEffect(() => {
    if (!isTelegramWebApp) {
      return;
    }
    const backButton = (
      window.Telegram?.WebApp as { BackButton?: { hide: () => void } } | undefined
    )?.BackButton;
    backButton?.hide();
  }, [isTelegramWebApp]);

  const handleBackToTab = useCallback(() => {
    router.replace(intent.tabHref);
  }, [router, intent.tabHref]);

  const handleTryAgain = useCallback(() => {
    router.replace(intent.tabHref);
  }, [router, intent.tabHref]);

  return (
    // Full-bleed: no AppShell, so no header, no tab bar and no column gutters.
    <div
      style={{
        minHeight: "100dvh",
        background: MYTAB_COLORS.paper,
        color: MYTAB_COLORS.ink,
        fontFamily: "var(--mytab-font-family)",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flex: 1,
          width: "100%",
          maxWidth: MYTAB_LAYOUT.maxColumnWidth,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <PaymentProgress
          status={intent.status}
          recipientName={intent.recipientName}
          failureMessage={intent.failureMessage}
          onTryAgain={handleTryAgain}
          onBackToTab={handleBackToTab}
        />
      </div>
    </div>
  );
}

/** Payment Progress — `/pay/[intentId]`, full-bleed (POLISH-SPEC §1.9). */
export default function PayPage({ params }: PayPageProps) {
  const { intentId } = use(params);

  return (
    <AuthGate>
      <PaymentProgressSurface intentId={intentId} />
    </AuthGate>
  );
}
