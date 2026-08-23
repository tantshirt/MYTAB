"use client";

import { use, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { PaymentProgress } from "@/components/settlement-sheet";
import { useHiddenTelegramBackButton } from "@/features/telegram/useBackAffordance";
import { usePaymentProgressData } from "@/features/settlement/usePaymentProgressData";
import { usePayObligation } from "@/features/settlement/usePayObligation";
import { formatAmountLabelForA11y } from "@/lib/domain/a11yAmount";

type PayPageProps = {
  params: Promise<{ intentId: string }>;
};

function PaymentProgressSurface({ intentId }: { intentId: string }) {
  const router = useRouter();
  const intent = usePaymentProgressData(intentId);
  const { pay } = usePayObligation();
  const signing = useRef(false);

  useEffect(() => {
    if (intent.status !== "ready_for_signature" || !intent.preparedTxBase64 || signing.current) {
      return;
    }
    signing.current = true;
    void pay({
      intentId,
      walletKind: intent.walletKind,
      walletProvider: intent.walletProvider,
      preparedTxBase64: intent.preparedTxBase64,
    }).then((result) => {
      if (!result.ok) {
        signing.current = false;
      }
    });
  }, [intent, intentId, pay]);

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
      <PaymentProgress
        status={intent.status}
        recipientName={intent.recipientName}
        failureCode={intent.failureCode}
        amount={intent.amountLabel}
        amountA11yLabel={
          intent.amountLabel ? formatAmountLabelForA11y(intent.amountLabel) : undefined
        }
        billName={intent.billName}
        recipientReceivesLabel={intent.recipientReceivesLabel}
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
