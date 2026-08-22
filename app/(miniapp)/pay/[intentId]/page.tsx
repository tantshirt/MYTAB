"use client";

import { use, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { PaymentProgress } from "@/components/settlement-sheet";
import { useHiddenTelegramBackButton } from "@/features/telegram/useBackAffordance";
import { formatAmountLabelForA11y } from "@/lib/domain/a11yAmount";
import type { SettlementStatus } from "@/convex/lib/settlementState";

type PayPageProps = {
  params: Promise<{ intentId: string }>;
};

type PaymentProgressData = {
  status: SettlementStatus;
  recipientName: string;
  failureMessage: string | null;
  /** The amount in flight. §1.9: the amount is the heading, not "Sending payment". */
  amountLabel: string;
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
      amountLabel: "฿291.74",
      tabHref: "/",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentId is the seam key.
    [intentId],
  );
}

function PaymentProgressSurface({ intentId }: { intentId: string }) {
  const router = useRouter();
  const intent = usePaymentProgressData(intentId);

  // The surface is forward-only: no in-app chevron, and Telegram's BackButton
  // is hidden rather than wired (POLISH-SPEC §1.9, §2.4).
  useHiddenTelegramBackButton(true);

  const handleBackToTab = useCallback(() => {
    router.replace(intent.tabHref);
  }, [router, intent.tabHref]);

  const handleTryAgain = useCallback(() => {
    router.replace(intent.tabHref);
  }, [router, intent.tabHref]);

  return (
    // Full-bleed: no tab bar and no column gutters. The shell box, paper
    // background and safe-area padding now come from `(miniapp)/layout.tsx`,
    // which is the only thing that mounts them (POLISH-SPEC §2.9.1).
    <AppShell hideTabBar fullBleed bottomBar="paper">
      {/*
        `amount`, `amountA11yLabel` and `intentId` are all optional on the
        component, so omitting them compiled and silently fell back to the
        state-driven heading — and left the success haptic latched on the
        literal "current" rather than on this payment (§1.9).
      */}
      <PaymentProgress
        status={intent.status}
        recipientName={intent.recipientName}
        failureMessage={intent.failureMessage}
        amount={intent.amountLabel}
        amountA11yLabel={formatAmountLabelForA11y(intent.amountLabel)}
        intentId={intentId}
        onTryAgain={handleTryAgain}
        onBackToTab={handleBackToTab}
      />
    </AppShell>
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
