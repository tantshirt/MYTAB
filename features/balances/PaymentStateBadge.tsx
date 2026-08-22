"use client";

import Link from "next/link";
import { formatAmountLabelForA11y } from "@/lib/domain/a11yAmount";
import { MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";
import type { PaymentDisplayState } from "@/lib/domain/paymentState";
import { getPaymentStatePresentation } from "@/lib/domain/paymentState";

export type PaymentStateBadgeProps = {
  state: PaymentDisplayState;
  failureMessage?: string;
};

/** Visually distinct payment states (Story 7.4 AC1, D-30). */
export function PaymentStateBadge({ state, failureMessage }: PaymentStateBadgeProps) {
  const presentation = getPaymentStatePresentation(state);

  return (
    <span
      aria-label={presentation.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 10px",
        borderRadius: MYTAB_RADIUS.full,
        fontSize: "12px",
        fontWeight: 600,
        color: presentation.color,
        background: presentation.background,
        minHeight: "28px",
      }}
    >
      <span aria-hidden>{presentation.glyph}</span>
      <span>{presentation.label}</span>
      {state === "failed" && failureMessage ? (
        <span className="mytab-type-meta" style={{ fontWeight: 400, color: presentation.color }}>
          — {failureMessage}
        </span>
      ) : null}
    </span>
  );
}

export type BalanceLinkRowProps = {
  label: string;
  amount: string;
  /** Spoken form — "291 baht 74". Derived from `amount` when omitted. */
  amountA11yLabel?: string;
  tabId: string;
  billId?: string;
};

/** Balance row linking back to source bill (Story 7.2 AC4, 7.5 AC3). */
export function BalanceLinkRow({
  label,
  amount,
  amountA11yLabel,
  tabId,
  billId,
}: BalanceLinkRowProps) {
  const href = billId ? `/tabs/${tabId}?bill=${billId}` : `/tabs/${tabId}`;

  return (
    <Link
      href={href}
      className="mytab-row"
      style={{
        alignItems: "center",
        padding: "16px",
        minHeight: "56px",
        textDecoration: "none",
        color: MYTAB_COLORS.ink,
      }}
    >
      <span className="mytab-type-body mytab-row__label mytab-name">{label}</span>
      <span
        className="mytab-type-amount-row mytab-tabular mytab-row__amount"
        data-mytab-amount
        aria-label={amountA11yLabel ?? formatAmountLabelForA11y(amount)}
      >
        {amount}
      </span>
    </Link>
  );
}
