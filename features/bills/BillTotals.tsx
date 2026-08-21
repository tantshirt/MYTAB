"use client";

import { AmountPair } from "@/components/primitives/amount-pair";
import type { BillLineBreakdown } from "@/lib/domain/bill";
import { formatFiatMinorThb } from "@/lib/domain/format";

type BillTotalsProps = {
  lines: BillLineBreakdown[];
};

/** Running total with labelled amount-pair rows (Story 4.3 AC3). */
export function BillTotals({ lines }: BillTotalsProps) {
  return (
    <section className="mytab-card" style={{ padding: "20px" }} data-testid="bill-totals">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {lines.map((line) => (
          <AmountPair
            key={line.label}
            label={line.label}
            amount={formatFiatMinorThb(line.amountMinor)}
            muted={line.kind === "subtotal"}
          />
        ))}
      </div>
    </section>
  );
}
