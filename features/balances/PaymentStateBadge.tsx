"use client";

import Link from "next/link";
import { MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";
import type { PaymentDisplayState } from "@/lib/domain/paymentState";
import { getPaymentStatePresentation } from "@/lib/domain/paymentState";

export type PaymentStateBadgeProps = {
  state: PaymentDisplayState;
  failureMessage?: string;
};

/** Six visually distinct payment states (Story 7.4 AC1). */
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
  tabId: string;
  billId?: string;
};

/** Balance row linking back to source bill (Story 7.2 AC4, 7.5 AC3). */
export function BalanceLinkRow({ label, amount, tabId, billId }: BalanceLinkRowProps) {
  const href = billId ? `/tabs/${tabId}?bill=${billId}` : `/tabs/${tabId}`;

  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "12px 0",
        minHeight: "44px",
        textDecoration: "none",
        color: MYTAB_COLORS.ink,
        borderBottom: `1px solid ${MYTAB_COLORS.border}`,
      }}
    >
      <span className="mytab-type-body mytab-row__label" style={{ flex: 1 }}>
        {label}
      </span>
      <span
        className="mytab-type-amount-row mytab-tabular mytab-row__amount"
        data-mytab-amount
      >
        {amount}
      </span>
    </Link>
  );
}
