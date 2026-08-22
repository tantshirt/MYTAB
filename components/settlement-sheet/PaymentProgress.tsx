"use client";

import type { SettlementStatus } from "@/convex/lib/settlementState";
import { SettlementStepper } from "./SettlementStepper";
import {
  buildSettlementProgressView,
  type SettlementProgressAction,
  type SettlementStepKey,
} from "@/lib/settlement/stepperCopy";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type PaymentProgressProps = {
  status: SettlementStatus;
  recipientName: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  failedAt?: SettlementStepKey;
  billName?: string | null;
  recipientReceivesLabel?: string | null;
  onTryAgain?: () => void;
  onBackToTab?: () => void;
  onBackToSheet?: () => void;
};

const ACTION_LABEL: Record<SettlementProgressAction, string> = {
  try_again: "Try again",
  back_to_tab: "Back to tab",
  back_to_sheet: "Back to the sheet",
};

/** In-flight payment progress surface — non-dismissible once started (Story 3.7 AC6). */
export function PaymentProgress({
  status,
  recipientName,
  failureCode,
  failureMessage,
  failedAt,
  billName,
  recipientReceivesLabel,
  onTryAgain,
  onBackToTab,
  onBackToSheet,
}: PaymentProgressProps) {
  const view = buildSettlementProgressView({
    status,
    recipientName,
    failureCode,
    failureMessage,
    failedAt,
    billName,
    recipientReceivesLabel,
  });

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
      <h2
        style={{
          margin: "0 0 24px",
          fontSize: MYTAB_TYPOGRAPHY.title.size,
          fontWeight: MYTAB_TYPOGRAPHY.title.weight,
          color: MYTAB_COLORS.ink,
        }}
      >
        {view.heading}
      </h2>

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
          {view.actions.map((action, index) => {
            const primary = action === "try_again";
            return (
              <button
                key={action}
                type="button"
                onClick={handlerFor(action)}
                style={{
                  minHeight: index === 0 ? "52px" : "44px",
                  borderRadius: MYTAB_RADIUS.sm,
                  border: primary ? "none" : `1px solid ${MYTAB_COLORS.border}`,
                  background: primary ? MYTAB_COLORS.primary : MYTAB_COLORS.surface,
                  color: primary ? "#fff" : MYTAB_COLORS.ink,
                  fontSize: "16px",
                  fontWeight: 600,
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
