"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DisclosureRow } from "@/components/primitives/disclosure-row";
import { useReducedMotion } from "@/components/primitives/use-reduced-motion";
import {
  QUOTE_COUNTDOWN_TICK_MS,
  formatQuoteCountdownLabel,
  isQuoteCountdownWarning,
  isQuoteExpired,
  quoteCountdownAnnouncement,
  quoteCountdownBucket,
} from "@/lib/settlement/quoteCountdown";
import {
  MYTAB_COLORS,
  MYTAB_RADIUS,
  MYTAB_TYPOGRAPHY,
  avatarTintForUserId,
} from "@/lib/theme/tokens";
import { PaymentTokenSelector, type PaymentTokenOption } from "./PaymentTokenSelector";
import { RoundUpControl } from "./RoundUpControl";

/** The one sanctioned stale-bill string (EXPERIENCE, "Settlement Status, in Human Terms"). */
export const STALE_REVISION_MESSAGE = "This bill changed. Refresh to see your new amount.";
/** `created` / `quoting` — the sheet is resolving and the action is disabled. */
export const QUOTE_RESOLVING_MESSAGE = "Getting your quote";

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

type SheetLineProps = {
  label: string;
  value: string;
  size?: string;
  valueColor?: string;
  valueWeight?: number;
  valueA11yLabel?: string;
  /**
   * The value is a sentence, not a figure — "Covered by My Tab". It drops the
   * tabular/`data-mytab-amount` marking (it is not an amount) and is allowed to
   * wrap, which is what keeps the row inside 320px at 200% platform text.
   */
  valueIsProse?: boolean;
};

/**
 * A labelled figure: label left, value right, tabular, decimal-aligned — `amount-pair`
 * semantics with the two things this surface additionally needs, a value colour (the
 * minimum-receive line is `colors/settled`) and a 13px size inside the disclosure.
 */
function SheetLine({
  label,
  value,
  size = "15px",
  valueColor = MYTAB_COLORS.ink,
  valueWeight = 500,
  valueA11yLabel,
  valueIsProse = false,
}: SheetLineProps) {
  return (
    <div
      className="mytab-row"
      style={{ fontSize: "14px", color: MYTAB_COLORS.inkMuted }}
    >
      <span className="mytab-row__label">{label}</span>
      <span
        className={
          valueIsProse
            ? "mytab-row__amount mytab-row__amount--text"
            : "mytab-row__amount mytab-tabular"
        }
        data-mytab-amount={valueIsProse ? undefined : true}
        aria-label={valueA11yLabel}
        style={{ fontSize: size, fontWeight: valueWeight, color: valueColor }}
      >
        {value}
      </span>
    </div>
  );
}

/** The section heading above the token chips. `micro-label`, the one correct all-caps. */
function MicroLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        margin: "18px 0 10px",
        fontSize: MYTAB_TYPOGRAPHY.microLabel.size,
        fontWeight: MYTAB_TYPOGRAPHY.microLabel.weight,
        letterSpacing: MYTAB_TYPOGRAPHY.microLabel.tracking,
        textTransform: MYTAB_TYPOGRAPHY.microLabel.transform,
        color: MYTAB_COLORS.inkSubtle,
      }}
    >
      {children}
    </div>
  );
}

export type PaymentSheetProps = {
  /** The obligation, e.g. "฿291.74". `amount-lg` — the most important number here. */
  billAmount: string;
  /** The caption beneath it, e.g. "your share of Sukhumvit Dinner". */
  billAmountLabel: string;
  /** Spoken form of the obligation, e.g. "291 baht 74". */
  billAmountA11yLabel?: string;
  recipientName: string;
  /** Stable id behind the recipient's avatar tint. Falls back to the name. */
  recipientId?: string;
  /** What the recipient is paid in, e.g. "USDC". */
  destinationAsset: string;
  tokens: PaymentTokenOption[];
  selectedTokenId: string;
  onSelectToken: (tokenId: string) => void;
  /** The face figure for "You spend", e.g. "≈ 0.0412 SOL". */
  spendLabel: string;
  /** The bare value behind "<name> receives at least", e.g. "8.25 USDC". */
  minimumReceiveAmount: string;
  /** The disclosed ceiling, e.g. "0.0418 SOL". */
  maximumSpend: string;
  /** The disclosed rate, e.g. "฿35.36 per USDC". */
  rateLabel?: string;
  roundUpLabel?: string;
  roundUpAmountLabel?: string;
  roundUpEnabled?: boolean;
  onToggleRoundUp?: (enabled: boolean) => void;
  quoteRemainingMs: number;
  quoteExpired?: boolean;
  /** `created` / `quoting`: contents still resolving, action disabled. */
  quoteResolving?: boolean;
  /** The bill moved under the quote. The amounts hold; the message appears in place. */
  staleRevision?: boolean;
  paymentsPaused?: boolean;
  onPay: () => void;
  onRefreshQuote?: () => void;
  onRefreshBill?: () => void;
};

/**
 * The Payment Sheet's contents, in the one order the spec allows (§1.8):
 * amount → recipient → Pay with → disclosed lines → tip → disclosure → countdown → CTA.
 *
 * Designed to sit inside `SheetContainer`, which owns the scrim, the radius, the handle
 * and the gutters. Rendered on its own it is just the content column.
 */
export function PaymentSheet({
  billAmount,
  billAmountLabel,
  billAmountA11yLabel,
  recipientName,
  recipientId,
  destinationAsset,
  tokens,
  selectedTokenId,
  onSelectToken,
  spendLabel,
  minimumReceiveAmount,
  maximumSpend,
  rateLabel,
  roundUpLabel,
  roundUpAmountLabel,
  roundUpEnabled = false,
  onToggleRoundUp,
  quoteRemainingMs,
  quoteExpired = false,
  quoteResolving = false,
  staleRevision = false,
  paymentsPaused = false,
  onPay,
  onRefreshQuote,
  onRefreshBill,
}: PaymentSheetProps) {
  const reduceMotion = useReducedMotion();
  const disclosureId = useId();
  const remainingMs = useLiveQuoteRemaining(quoteRemainingMs);

  // The server flag and the clock are both authorities on expiry; either one expires
  // the quote. Without this there was a window where the countdown had run out but the
  // flag had not flipped, and neither the countdown nor the refresh action was shown.
  const expired =
    !staleRevision && !quoteResolving && (quoteExpired || isQuoteExpired(remainingMs));
  const resolving = !staleRevision && !expired && quoteResolving;
  const warning = !expired && !resolving && !staleRevision && isQuoteCountdownWarning(remainingMs);

  // The amounts hold their last values rather than blanking, so the person keeps
  // their bearings while the bill or the quote is refreshed.
  const dimmed = staleRevision || expired;
  const announcement = useCountdownAnnouncement(
    remainingMs,
    paymentsPaused || staleRevision || resolving,
  );

  const statusLine = staleRevision
    ? STALE_REVISION_MESSAGE
    : resolving
      ? QUOTE_RESOLVING_MESSAGE
      : formatQuoteCountdownLabel(expired ? 0 : remainingMs);
  const statusEmphasised = staleRevision || expired || warning;
  // The ticking countdown and its expiry are already spoken by the bucketed live region
  // below; only the two messages it never covers get a live region of their own.
  const statusIsLive = staleRevision || resolving;

  const actionLabel = staleRevision
    ? "Refresh bill"
    : expired
      ? "Refresh quote"
      : `Pay ${billAmount}`;
  const actionHandler = staleRevision
    ? onRefreshBill
    : expired
      ? onRefreshQuote
      : onPay;
  const actionDisabled = !staleRevision && !expired && (paymentsPaused || resolving);

  const avatarTint = avatarTintForUserId(recipientId ?? recipientName);
  const recipientInitial = recipientName.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <section aria-label="Payment sheet" style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          opacity: dimmed ? 0.4 : 1,
          transition: reduceMotion ? undefined : "opacity 160ms ease",
        }}
      >
        {/* 1 — the obligation. `amount-lg`: the most important number on the screen. */}
        <div
          className="mytab-tabular"
          data-mytab-amount
          aria-label={billAmountA11yLabel}
          style={{
            fontSize: MYTAB_TYPOGRAPHY.amountLg.size,
            fontWeight: MYTAB_TYPOGRAPHY.amountLg.weight,
            letterSpacing: MYTAB_TYPOGRAPHY.amountLg.tracking,
            lineHeight: 1,
            color: MYTAB_COLORS.ink,
          }}
        >
          {billAmount}
        </div>
        <div
          style={{
            marginTop: "6px",
            fontSize: MYTAB_TYPOGRAPHY.meta.size,
            color: MYTAB_COLORS.inkMuted,
          }}
        >
          {billAmountLabel}
        </div>

        {/* 2 — the person. A name and a face where an address could have gone. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginTop: "16px",
            padding: "16px 0",
            borderTop: `1px solid ${MYTAB_COLORS.border}`,
            borderBottom: `1px solid ${MYTAB_COLORS.border}`,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              flex: "none",
              width: "34px",
              height: "34px",
              borderRadius: MYTAB_RADIUS.full,
              background: avatarTint,
              color: MYTAB_COLORS.surface,
              fontSize: MYTAB_TYPOGRAPHY.meta.size,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {recipientInitial}
          </span>
          <span
            style={{
              flexGrow: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "15px",
              fontWeight: 500,
              color: MYTAB_COLORS.ink,
            }}
          >
            To {recipientName}
          </span>
          <span
            style={{
              flex: "none",
              fontSize: MYTAB_TYPOGRAPHY.meta.size,
              color: MYTAB_COLORS.inkMuted,
            }}
          >
            receives {destinationAsset}
          </span>
        </div>

        {/* 3 — Pay with. */}
        <MicroLabel>Pay with</MicroLabel>
        <PaymentTokenSelector
          tokens={tokens}
          selectedId={selectedTokenId}
          onSelect={onSelectToken}
        />

        {/* 4 — the two disclosed lines that belong on the face. */}
        <div
          style={{
            marginTop: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <SheetLine label="You spend" value={spendLabel} />
          <SheetLine
            label={`${recipientName} receives at least`}
            value={minimumReceiveAmount}
            valueColor={MYTAB_COLORS.settled}
            valueWeight={600}
          />
        </div>

        {/* 5 — the tip. */}
        {onToggleRoundUp && roundUpLabel && roundUpAmountLabel ? (
          <div style={{ marginTop: "18px" }}>
            <RoundUpControl
              label={roundUpLabel}
              amountLabel={roundUpAmountLabel}
              enabled={roundUpEnabled}
              onToggle={onToggleRoundUp}
            />
          </div>
        ) : null}

        {/* 6 — everything a swap UI would have put on the face, behind one collapsed row.
            The negative gutter lets the hairlines run to the sheet's edges while the
            row's own label still lines up with the content column. */}
        <div
          style={{
            margin: "18px -20px 0",
            padding: "0 4px",
            borderTop: `1px solid ${MYTAB_COLORS.border}`,
            borderBottom: `1px solid ${MYTAB_COLORS.border}`,
          }}
        >
          <DisclosureRow id={`${disclosureId}-fees`} label="Fees and network">
            <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
              {/* Told they are not paying it, rather than shown a zero (AD-9). */}
              <SheetLine
                label="Network fee"
                value="Covered by My Tab"
                size={MYTAB_TYPOGRAPHY.meta.size}
                valueColor={MYTAB_COLORS.settled}
                valueIsProse
              />
              {rateLabel ? (
                <SheetLine
                  label="Rate"
                  value={rateLabel}
                  size={MYTAB_TYPOGRAPHY.meta.size}
                  valueWeight={400}
                />
              ) : null}
              <SheetLine
                label="Most you can spend"
                value={maximumSpend}
                size={MYTAB_TYPOGRAPHY.meta.size}
                valueWeight={400}
              />
            </div>
          </DisclosureRow>
        </div>
      </div>

      {/* 7 — the countdown. It stays at full opacity: the expiry message is the one
          thing a person must be able to read while the amounts are dimmed. */}
      <p
        aria-hidden={statusIsLive ? undefined : "true"}
        role={statusIsLive ? "status" : undefined}
        aria-live={statusIsLive ? "polite" : undefined}
        style={{
          margin: "18px 0 0",
          textAlign: "center",
          fontSize: MYTAB_TYPOGRAPHY.meta.size,
          fontWeight: statusEmphasised ? 600 : 400,
          color: statusEmphasised ? MYTAB_COLORS.warning : MYTAB_COLORS.inkMuted,
        }}
      >
        {statusLine}
      </p>
      <span role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
        {announcement}
      </span>

      {paymentsPaused ? (
        <p
          style={{
            margin: "12px 0 0",
            textAlign: "center",
            fontSize: MYTAB_TYPOGRAPHY.meta.size,
            color: MYTAB_COLORS.inkMuted,
          }}
        >
          Payments are paused right now. Your tab is safe.
        </p>
      ) : null}

      {/* 8 — the amount on the button is the last thing a person reads. */}
      <button
        type="button"
        onClick={actionHandler}
        disabled={actionDisabled}
        style={{
          marginTop: "12px",
          width: "100%",
          minHeight: "52px",
          borderRadius: MYTAB_RADIUS.sm,
          border: "none",
          background: MYTAB_COLORS.primary,
          color: MYTAB_COLORS.surface,
          fontFamily: "inherit",
          fontSize: "16px",
          fontWeight: 600,
          boxShadow: "inset 0 -1px 0 rgba(10, 32, 56, 0.24)",
          cursor: actionDisabled ? "not-allowed" : "pointer",
          opacity: actionDisabled ? 0.5 : 1,
        }}
      >
        {actionLabel}
      </button>
    </section>
  );
}
