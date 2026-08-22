"use client";

import { useEffect, useRef } from "react";
import { SETTLEMENT_STATUS, type SettlementStatus } from "@/convex/lib/settlementState";
import { SettlementStepper } from "./SettlementStepper";
import {
  buildSettlementProgressView,
  type SettlementProgressAction,
  type SettlementStepKey,
} from "@/lib/settlement/stepperCopy";
import { useHaptics } from "@/features/telegram/useHaptics";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type PaymentProgressProps = {
  status: SettlementStatus;
  recipientName: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  failedAt?: SettlementStepKey;
  billName?: string | null;
  recipientReceivesLabel?: string | null;
  /** The amount in flight, e.g. "฿291.74". The amount is the heading (§1.9). */
  amount?: string | null;
  /** Spoken form of the amount, e.g. "291 baht 74". */
  amountA11yLabel?: string;
  /** Latches the success haptic, so a re-render never fires it twice. */
  intentId?: string;
  /** Overrides the sanctioned success haptic. Defaults to `useHaptics().paymentConfirmed`. */
  onSuccessHaptic?: () => void;
  onTryAgain?: () => void;
  onBackToTab?: () => void;
  onBackToSheet?: () => void;
};

const ACTION_LABEL: Record<SettlementProgressAction, string> = {
  try_again: "Try again",
  back_to_tab: "Back to tab",
  back_to_sheet: "Back to the sheet",
};

/** In-flight payment progress surface — non-dismissible once started (§1.9). */
export function PaymentProgress({
  status,
  recipientName,
  failureCode,
  failureMessage,
  failedAt,
  billName,
  recipientReceivesLabel,
  amount,
  amountA11yLabel,
  intentId,
  onSuccessHaptic,
  onTryAgain,
  onBackToTab,
  onBackToSheet,
}: PaymentProgressProps) {
  const haptics = useHaptics();
  const view = buildSettlementProgressView({
    status,
    recipientName,
    failureCode,
    failureMessage,
    failedAt,
    billName,
    recipientReceivesLabel,
  });

  // `notificationOccurred('success')` exactly once on the transition into `confirmed`,
  // latched by intent id (§5.2). Never on submission.
  const hapticLatch = useRef<string | null>(null);
  useEffect(() => {
    if (status !== SETTLEMENT_STATUS.CONFIRMED) return;
    const key = intentId ?? "current";
    if (hapticLatch.current === key) return;
    hapticLatch.current = key;
    (onSuccessHaptic ?? haptics.paymentConfirmed)();
  }, [status, intentId, onSuccessHaptic, haptics]);

  const handlerFor = (action: SettlementProgressAction) => {
    if (action === "try_again") return onTryAgain;
    if (action === "back_to_sheet") return onBackToSheet ?? onBackToTab;
    return onBackToTab;
  };

  return (
    <section
      aria-label="Payment progress"
      style={{
        minHeight: "100%",
        background: MYTAB_COLORS.paper,
        padding: "24px 16px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ marginBottom: "44px", textAlign: "center" }}>
        {amount ? (
          <>
            <div
              className="mytab-tabular"
              data-mytab-amount
              aria-label={amountA11yLabel}
              style={{
                fontSize: MYTAB_TYPOGRAPHY.amountLg.size,
                fontWeight: MYTAB_TYPOGRAPHY.amountLg.weight,
                letterSpacing: MYTAB_TYPOGRAPHY.amountLg.tracking,
                lineHeight: 1,
                color: MYTAB_COLORS.ink,
              }}
            >
              {amount}
            </div>
            <div
              style={{
                marginTop: "8px",
                fontSize: "15px",
                color: MYTAB_COLORS.inkMuted,
              }}
            >
              to {recipientName}
            </div>
          </>
        ) : (
          // Without an amount to lead with, the state-driven heading stands in.
          <h2
            style={{
              margin: 0,
              fontSize: MYTAB_TYPOGRAPHY.title.size,
              fontWeight: MYTAB_TYPOGRAPHY.title.weight,
              letterSpacing: MYTAB_TYPOGRAPHY.title.tracking,
              color: MYTAB_COLORS.ink,
            }}
          >
            {view.heading}
          </h2>
        )}
      </div>

      <SettlementStepper
        status={status}
        recipientName={recipientName}
        failureCode={failureCode}
        failureMessage={failureMessage}
        failedAt={failedAt}
        billName={billName}
        recipientReceivesLabel={recipientReceivesLabel}
      />

      {view.footnote ? (
        <p
          style={{
            margin: "24px 0 0",
            textAlign: "center",
            fontSize: MYTAB_TYPOGRAPHY.meta.size,
            lineHeight: 1.5,
            color: MYTAB_COLORS.inkMuted,
          }}
        >
          {view.footnote}
        </p>
      ) : null}

      {view.actions.length > 0 ? (
        <div
          style={{
            marginTop: "auto",
            paddingTop: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          {view.actions.map((action) => {
            const primary = action === "try_again";
            // A single action is the surface's one action and takes the 52px box.
            // Anything trailing a primary is a text action, not a second button.
            const secondaryToAPrimary = !primary && view.actions.length > 1;
            return (
              <button
                key={action}
                type="button"
                onClick={handlerFor(action)}
                style={{
                  minHeight: secondaryToAPrimary ? "44px" : "52px",
                  borderRadius: MYTAB_RADIUS.sm,
                  border: primary || secondaryToAPrimary
                    ? "none"
                    : `1px solid ${MYTAB_COLORS.border}`,
                  background: primary
                    ? MYTAB_COLORS.primary
                    : secondaryToAPrimary
                      ? "transparent"
                      : MYTAB_COLORS.surface,
                  color: primary
                    ? MYTAB_COLORS.surface
                    : secondaryToAPrimary
                      ? MYTAB_COLORS.inkMuted
                      : MYTAB_COLORS.ink,
                  fontFamily: "inherit",
                  fontSize: secondaryToAPrimary ? "15px" : "16px",
                  fontWeight: secondaryToAPrimary ? 500 : 600,
                  boxShadow: primary ? "inset 0 -1px 0 rgba(10, 32, 56, 0.24)" : undefined,
                  cursor: "pointer",
                }}
              >
                {ACTION_LABEL[action]}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
