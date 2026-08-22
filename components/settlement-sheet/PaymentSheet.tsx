"use client";

import { useEffect, useRef, useState } from "react";
import { AmountPair } from "@/components/primitives/amount-pair";
import {
  QUOTE_COUNTDOWN_TICK_MS,
  formatQuoteCountdownLabel,
  isQuoteCountdownWarning,
  isQuoteExpired,
  quoteCountdownAnnouncement,
  quoteCountdownBucket,
} from "@/lib/settlement/quoteCountdown";
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

const SR_ONLY = {
  position: "absolute",
  width: "1px",
  height: "1px",
  margin: "-1px",
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

/**
 * Ticks the quote countdown down once a second from the last value the server gave us.
 * The interval clears on unmount and on expiry.
 */
function useLiveQuoteRemaining(quoteRemainingMs: number): number {
  const [remainingMs, setRemainingMs] = useState(quoteRemainingMs);

  useEffect(() => {
    setRemainingMs(quoteRemainingMs);
    if (quoteRemainingMs <= 0) return;

    const deadline = Date.now() + quoteRemainingMs;
    const interval = setInterval(() => {
      const next = Math.max(0, deadline - Date.now());
      setRemainingMs(next);
      if (next <= 0) clearInterval(interval);
    }, QUOTE_COUNTDOWN_TICK_MS);

    return () => clearInterval(interval);
  }, [quoteRemainingMs]);

  return remainingMs;
}

/** Speaks only at thresholds — a live region that ticks every second is unusable. */
function useCountdownAnnouncement(remainingMs: number, silent: boolean): string {
  const [announcement, setAnnouncement] = useState("");
  const lastBucket = useRef<string | null>(null);

  useEffect(() => {
    if (silent) return;
    const bucket = quoteCountdownBucket(remainingMs);
    if (bucket === lastBucket.current) return;
    lastBucket.current = bucket;
    const next = quoteCountdownAnnouncement(remainingMs);
    if (next) setAnnouncement(next);
  }, [remainingMs, silent]);

  return announcement;
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
  const remainingMs = useLiveQuoteRemaining(quoteRemainingMs);
  // The server flag and the clock are both authorities on expiry; either one expires
  // the quote. Without this there was a window where the countdown had run out but the
  // flag had not flipped, and neither the countdown nor the refresh action was shown.
  const expired = quoteExpired || isQuoteExpired(remainingMs);
  const announcement = useCountdownAnnouncement(remainingMs, paymentsPaused);
  // The amounts hold their last values rather than blanking, so the person keeps
  // their bearings while the quote is refreshed.
  const opacity = expired ? 0.4 : 1;
  const warning = !expired && isQuoteCountdownWarning(remainingMs);
  const countdownLabel = formatQuoteCountdownLabel(expired ? 0 : remainingMs);

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
      <div style={{ flex: 1, padding: "16px" }}>
        <div style={{ opacity, transition: "opacity 160ms ease" }}>
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
        </div>
        {/* The countdown stays at full opacity — the expiry message is the one thing
            a person must be able to read while the amounts are dimmed. */}
        <p
          aria-hidden="true"
          style={{
            marginTop: "16px",
            marginBottom: 0,
            fontSize: MYTAB_TYPOGRAPHY.meta.size,
            fontWeight: warning || expired ? 600 : 400,
            color: warning || expired ? MYTAB_COLORS.warning : MYTAB_COLORS.inkMuted,
          }}
        >
          {countdownLabel}
        </p>
        <span role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
          {announcement}
        </span>
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
          onClick={expired ? onRefreshQuote : onPay}
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
          {expired ? "Refresh quote" : "Pay"}
        </button>
      </div>
    </section>
  );
}
