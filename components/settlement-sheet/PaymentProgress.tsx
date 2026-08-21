"use client";

import type { SettlementStatus } from "@/convex/lib/settlementState";
import { SettlementStepper } from "./SettlementStepper";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type PaymentProgressProps = {
  status: SettlementStatus;
  recipientName: string;
  failureMessage?: string | null;
  onTryAgain?: () => void;
  onBackToTab?: () => void;
};

/** In-flight payment progress surface — non-dismissible once started (Story 3.7 AC6). */
export function PaymentProgress({
  status,
  recipientName,
  failureMessage,
  onTryAgain,
  onBackToTab,
}: PaymentProgressProps) {
  const failed = status === "failed";

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
        {failed ? "Payment did not go through" : "Sending payment"}
      </h2>

      <SettlementStepper
        status={status}
        recipientName={recipientName}
        failureMessage={failureMessage}
      />

      {failed ? (
        <div
          style={{
            marginTop: "auto",
            paddingTop: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <button
            type="button"
            onClick={onTryAgain}
            style={{
              minHeight: "52px",
              borderRadius: MYTAB_RADIUS.sm,
              border: "none",
              background: MYTAB_COLORS.primary,
              color: "#fff",
              fontSize: "16px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onBackToTab}
            style={{
              minHeight: "52px",
              borderRadius: MYTAB_RADIUS.sm,
              border: `1px solid ${MYTAB_COLORS.border}`,
              background: MYTAB_COLORS.surface,
              color: MYTAB_COLORS.ink,
              fontSize: "16px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Back to tab
          </button>
        </div>
      ) : null}
    </section>
  );
}
