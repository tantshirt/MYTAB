"use client";

import { MYTAB_COLORS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type AmountPairProps = {
  label: string;
  amount: string;
  muted?: boolean;
  /** Optional spoken form of the amount, e.g. "291 baht 74". */
  amountA11yLabel?: string;
};

/**
 * Labelled amount row with tabular numerals (Story 3.7 AC3, UX-DR19).
 *
 * Grid, not flex: `minmax(0, 1fr) auto` reserves the amount column. The label
 * ellipses; the amount never shrinks and never wraps (POLISH-SPEC §2.3).
 */
export function AmountPair({ label, amount, muted = false, amountA11yLabel }: AmountPairProps) {
  return (
    <div
      className="mytab-row"
      style={{
        fontSize: MYTAB_TYPOGRAPHY.amountRow.size,
        fontWeight: MYTAB_TYPOGRAPHY.amountRow.weight,
        color: muted ? MYTAB_COLORS.inkMuted : MYTAB_COLORS.ink,
      }}
    >
      <span className="mytab-row__label">{label}</span>
      <span
        className="mytab-row__amount mytab-tabular"
        data-mytab-amount
        aria-label={amountA11yLabel}
      >
        {amount}
      </span>
    </div>
  );
}
