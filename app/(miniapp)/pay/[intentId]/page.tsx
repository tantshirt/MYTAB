"use client";

import { use, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { PaymentProgress } from "@/components/settlement-sheet";
import { useHiddenTelegramBackButton } from "@/features/telegram/useBackAffordance";
import { useLiveQuery } from "@/features/convex/useConvexData";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatAmountLabelForA11y } from "@/lib/domain/a11yAmount";
import type { SettlementStatus } from "@/convex/lib/settlementState";

type PayPageProps = {
  params: Promise<{ intentId: string }>;
};

type PaymentProgressData = {
  status: SettlementStatus;
  recipientName: string;
  failureCode: string | null;
  /**
   * The amount in flight. §1.9: the amount is the heading, not "Sending
   * payment" — but only when it is actually known.
   */
  amountLabel: string | null;
  /** Where "Back to tab" lands. */
  tabHref: string;
};

/**
 * Single prop-resolution point for Payment Progress.
 *
 * Live read: `api.settlements.getIntent({ intentId })`. The intent is a live
 * subscription — this surface exists as a route precisely so a payment in
 * flight survives a reload (POLISH-SPEC §1.0) — and every step advances only on
 * a server-confirmed transition, never optimistically (AD-11).
 *
 * PARTIALLY BLOCKED: `getIntent` returns `{ intentId, status, failureCode,
 * transactionSignature, expiresAt }` only. The recipient's name, the display
 * amount and the originating tab are all on the `settlementIntents` document
 * but not projected, so `amount` is passed as `null` (the component falls back
 * to its state-driven heading rather than inventing a figure) and "Back to tab"
 * lands on Tabs. Widening `getIntent` — or an
 * `settlements.getIntentForProgress` — is what unblocks the §1.9 heading.
 */
function usePaymentProgressData(intentId: string): PaymentProgressData {
  const result = useLiveQuery(api.settlements.getIntent, {
    intentId: intentId as Id<"settlementIntents">,
  });

  return useMemo<PaymentProgressData>(() => {
    if (result.fixture) {
      return {
        status: "submitted" as SettlementStatus,
        recipientName: "Maya",
        failureCode: null,
        amountLabel: "฿291.74",
        tabHref: "/",
      };
    }

    return {
      status: (result.data?.status ?? "created") as SettlementStatus,
      recipientName: "them",
      failureCode: result.data?.failureCode ?? null,
      amountLabel: null,
      tabHref: "/",
    };
  }, [result.fixture, result.data]);
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
      <PaymentProgress
        status={intent.status}
        recipientName={intent.recipientName}
        failureCode={intent.failureCode}
        amount={intent.amountLabel}
        amountA11yLabel={
          intent.amountLabel ? formatAmountLabelForA11y(intent.amountLabel) : undefined
        }
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
