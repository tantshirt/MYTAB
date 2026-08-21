"use client";

import { MYTAB_COLORS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type AmountPairProps = {
  label: string;
  amount: string;
  muted?: boolean;
};

/** Labelled amount row with tabular numerals (Story 3.7 AC3, UX-DR19). */
export function AmountPair({ label, amount, muted = false }: AmountPairProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "12px",
        fontSize: MYTAB_TYPOGRAPHY.amountRow.size,
        fontWeight: MYTAB_TYPOGRAPHY.amountRow.weight,
        color: muted ? MYTAB_COLORS.inkMuted : MYTAB_COLORS.ink,
      }}
    >
      <span>{label}</span>
      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          fontFeatureSettings: '"tnum"',
          textAlign: "right",
        }}
      >
        {amount}
      </span>
    </div>
  );
}
