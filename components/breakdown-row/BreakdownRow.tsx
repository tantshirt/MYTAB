"use client";

import type { CSSProperties } from "react";
import { MYTAB_COLORS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type BreakdownRowProps = {
  label: string;
  /**
   * One quiet word after the label — "proportional" is the word that explains
   * the whole allocation model (§1.7). Never a sentence.
   */
  annotation?: string;
  amount: string;
  /**
   * Spoken form, e.g. "291 baht 74". Passed wherever the minor units are in
   * hand, so the reading comes from the number rather than from its rendering
   * (EXPERIENCE, *Accessibility Floor*).
   */
  amountA11yLabel?: string;
  /** `meta` inside an expanded panel; `row` for a card's own total line. */
  size?: "meta" | "row";
  /** Muted label + amount. The disclosed lines under a person's name. */
  muted?: boolean;
  /**
   * State colour on the amount only, and never alone — the label beside it
   * ("Rounding") is what carries the meaning.
   */
  amountColor?: string;
  fontSize?: string;
  weight?: number;
  /** Weight on the amount alone, where the row's own weight is lighter. */
  amountWeight?: number;
  style?: CSSProperties;
};

/**
 * `breakdown-row` (DESIGN.md; POLISH-SPEC §6.2) — a labelled amount inside a
 * breakdown: the per-person disclosure on Bill Review, the shared-charge block
 * beneath it, and the Payment Sheet's disclosure rows.
 *
 * Grid, not flex: `minmax(0, 1fr) auto` reserves the amount column, so the
 * label ellipses and the amount never does (§2.3).
 */
export function BreakdownRow({
  label,
  annotation,
  amount,
  amountA11yLabel,
  size = "row",
  muted = false,
  amountColor,
  fontSize,
  weight,
  amountWeight,
  style,
}: BreakdownRowProps) {
  const scale = size === "meta" ? MYTAB_TYPOGRAPHY.meta : MYTAB_TYPOGRAPHY.amountRow;
  const amountStyle: CSSProperties | undefined = amountColor
    ? { color: amountColor, fontWeight: 600 }
    : amountWeight !== undefined
      ? { fontWeight: amountWeight }
      : undefined;

  return (
    <div
      className="mytab-row"
      style={{
        fontSize: fontSize ?? scale.size,
        fontWeight: weight ?? scale.weight,
        color: muted ? MYTAB_COLORS.inkMuted : MYTAB_COLORS.ink,
        ...style,
      }}
    >
      <span className="mytab-row__label">
        {label}
        {annotation ? (
          <span style={{ fontSize: 12, color: MYTAB_COLORS.inkMuted, marginLeft: 6 }}>
            {annotation}
          </span>
        ) : null}
      </span>
      <span
        className="mytab-row__amount mytab-tabular"
        data-mytab-amount
        aria-label={amountA11yLabel}
        style={amountStyle}
      >
        {amount}
      </span>
    </div>
  );
}
