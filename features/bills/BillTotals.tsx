"use client";

import { formatThbMinorForA11y } from "@/lib/domain/a11yAmount";
import type { BillLineBreakdown } from "@/lib/domain/bill";
import { formatFiatMinorThb } from "@/lib/domain/format";
import { MYTAB_COLORS } from "@/lib/theme/tokens";

type BillTotalsProps = {
  lines: BillLineBreakdown[];
};

/**
 * Running total (Story 4.3 AC3), typeset per the artboard: the contributing
 * lines at 14px `colors/ink-muted`, then a `colors/border` rule, then the total
 * at 15px/600 in `colors/ink`.
 *
 * No card of its own — it is the last block inside the one bill card.
 */
export function BillTotals({ lines }: BillTotalsProps) {
  return (
    <div
      data-testid="bill-totals"
      style={{ display: "flex", flexDirection: "column", gap: 11 }}
    >
      {lines.map((line) => {
        const isTotal = line.kind === "total";
        return (
          <div
            key={line.label}
            className="mytab-row"
            style={
              isTotal
                ? { borderTop: `1px solid ${MYTAB_COLORS.border}`, paddingTop: 11 }
                : undefined
            }
          >
            <span
              className="mytab-row__label"
              style={{
                fontSize: isTotal ? "15px" : "14px",
                fontWeight: isTotal ? 600 : 400,
                color: isTotal ? MYTAB_COLORS.ink : MYTAB_COLORS.inkMuted,
              }}
            >
              {line.label}
            </span>
            <span
              className="mytab-row__amount mytab-tabular"
              data-mytab-amount
              aria-label={formatThbMinorForA11y(line.amountMinor)}
              style={{
                fontSize: isTotal ? "15px" : "14px",
                fontWeight: isTotal ? 600 : 500,
                color: MYTAB_COLORS.ink,
              }}
            >
              {formatFiatMinorThb(line.amountMinor)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
