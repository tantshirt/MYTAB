"use client";

import { useState } from "react";
import { AmountPair } from "@/components/primitives/amount-pair";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type DisclosureRowProps = {
  networkFeeLabel?: string;
};

/** Collapsed fee disclosure — always starts collapsed (Story 3.7 AC2, UX-DR15). */
export function DisclosureRow({
  networkFeeLabel = "Network fee · Covered by My Tab",
  defaultExpanded = false,
}: DisclosureRowProps & { defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div
      style={{
        borderTop: `1px solid ${MYTAB_COLORS.border}`,
        paddingTop: "12px",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          border: "none",
          background: "transparent",
          padding: 0,
          cursor: "pointer",
          color: MYTAB_COLORS.inkMuted,
          fontSize: MYTAB_TYPOGRAPHY.label.size,
          fontWeight: 500,
        }}
      >
        <span>Fees and details</span>
        <span aria-hidden>{expanded ? "−" : "+"}</span>
      </button>
      {expanded ? (
        <p
          style={{
            margin: "10px 0 0",
            fontSize: MYTAB_TYPOGRAPHY.meta.size,
            color: MYTAB_COLORS.inkMuted,
          }}
        >
          {networkFeeLabel}
        </p>
      ) : null}
    </div>
  );
}

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export type PaymentSheetProps = {
  billAmountLabel: string;
  billAmount: string;
  recipientName: string;
  destinationAsset: string;
  paymentToken: string;
  maximumSpend: string;
  minimumReceive: string;
  roundUpTip?: string | null;
  quoteRemainingMs: number;
  quoteExpired: boolean;
  paymentsPaused?: boolean;
  disclosureDefaultExpanded?: boolean;
  onPay: () => void;
  onRefreshQuote?: () => void;
};

/** Payment review sheet with fixed content order (Story 3.7 AC1). */
export function PaymentSheet({
  billAmountLabel,
  billAmount,
  recipientName,
  destinationAsset,
  paymentToken,
  maximumSpend,
  minimumReceive,
  roundUpTip,
  quoteRemainingMs,
  quoteExpired,
  paymentsPaused = false,
  disclosureDefaultExpanded = false,
  onPay,
  onRefreshQuote,
}: PaymentSheetProps) {
  const dimmed = quoteExpired;
  const opacity = dimmed ? 0.4 : 1;

  return (
    <section
      aria-label="Payment sheet"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        background: MYTAB_COLORS.paper,
      }}
    >
      <div style={{ flex: 1, padding: "16px", opacity }}>
        <AmountPair label={billAmountLabel} amount={billAmount} />
        <div style={{ marginTop: "16px" }}>
          <AmountPair label="To" amount={recipientName} />
          <AmountPair label="Receives" amount={destinationAsset} muted />
        </div>
        <div style={{ marginTop: "16px" }}>
          <AmountPair label="Paying with" amount={paymentToken} />
          <AmountPair label="Maximum you spend" amount={maximumSpend} />
          <AmountPair label="Minimum they receive" amount={minimumReceive} />
          {roundUpTip ? <AmountPair label="Round-up tip" amount={roundUpTip} muted /> : null}
        </div>
        <div style={{ marginTop: "20px" }}>
          <DisclosureRow defaultExpanded={disclosureDefaultExpanded} />
        </div>
        {!quoteExpired && quoteRemainingMs > 0 ? (
          <p
            style={{
              marginTop: "16px",
              fontSize: MYTAB_TYPOGRAPHY.meta.size,
              color:
                quoteRemainingMs <= 10_000 ? MYTAB_COLORS.warning : MYTAB_COLORS.inkMuted,
            }}
          >
            Quote refreshes in {formatCountdown(quoteRemainingMs)}
          </p>
        ) : null}
        {paymentsPaused ? (
          <p style={{ marginTop: "16px", color: MYTAB_COLORS.inkMuted }}>
            Payments are paused right now. Your tab is safe.
          </p>
        ) : null}
      </div>
      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: MYTAB_COLORS.surface,
          borderTop: `1px solid ${MYTAB_COLORS.border}`,
          padding: "14px 16px 22px",
        }}
      >
        <button
          type="button"
          onClick={quoteExpired ? onRefreshQuote : onPay}
          disabled={paymentsPaused}
          style={{
            width: "100%",
            minHeight: "52px",
            borderRadius: MYTAB_RADIUS.sm,
            border: "none",
            background: MYTAB_COLORS.primary,
            color: "#fff",
            fontSize: "16px",
            fontWeight: 600,
            boxShadow: "inset 0 -1px 0 rgba(10, 32, 56, 0.24)",
            cursor: paymentsPaused ? "not-allowed" : "pointer",
            opacity: paymentsPaused ? 0.5 : 1,
          }}
        >
          {quoteExpired ? "Refresh quote" : "Pay"}
        </button>
      </div>
    </section>
  );
}
