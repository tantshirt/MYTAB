"use client";

import { formatAmountLabelForA11y } from "@/lib/domain/a11yAmount";
import { MYTAB_COLORS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type AmountPairProps = {
  label: string;
  amount: string;
  muted?: boolean;
  /**
   * Spoken form of the amount, e.g. "291 baht 74".
   *
   * Optional because it is derived from `amount` when omitted — every amount in
   * the product reads as money rather than as digits without a call site having
   * to remember (EXPERIENCE, *Accessibility Floor*). Pass it explicitly wherever
   * the minor units are in hand, so the reading comes from the number and not
   * from its rendering.
   */
  amountA11yLabel?: string;
  /** `meta` scale for the disclosed lines inside an expanded panel (§1.12). */
  size?: "row" | "meta";
  /** State colour on the amount only. The label stays ink. */
  amountColor?: string;
};

/**
 * Labelled amount row with tabular numerals (Story 3.7 AC3, UX-DR19).
 *
 * Grid, not flex: `minmax(0, 1fr) auto` reserves the amount column. The label
 * ellipses; the amount never shrinks and never wraps (POLISH-SPEC §2.3).
 */
export function AmountPair({
  label,
  amount,
  muted = false,
  amountA11yLabel,
  size = "row",
  amountColor,
}: AmountPairProps) {
  const scale = size === "meta" ? MYTAB_TYPOGRAPHY.meta : MYTAB_TYPOGRAPHY.amountRow;

  return (
    <div
      className="mytab-row"
      style={{
        fontSize: scale.size,
        fontWeight: scale.weight,
        color: muted ? MYTAB_COLORS.inkMuted : MYTAB_COLORS.ink,
      }}
    >
      <span className="mytab-row__label">{label}</span>
      <span
        className="mytab-row__amount mytab-tabular"
        data-mytab-amount
        aria-label={amountA11yLabel ?? formatAmountLabelForA11y(amount)}
        style={amountColor ? { color: amountColor, fontWeight: 600 } : undefined}
      >
        {amount}
      </span>
    </div>
  );
}
