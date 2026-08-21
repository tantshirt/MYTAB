"use client";

import { MYTAB_COLORS } from "@/lib/theme/tokens";

/** Geometry-matched skeleton rows for first paint (Story 4.4 AC1). */
export function BillSkeleton() {
  const rows = ["title", "meta", "item-1", "item-2", "total"] as const;

  return (
    <div aria-busy="true" aria-label="Loading tab">
      {rows.map((row) => (
        <div
          key={row}
          style={{
            height: row === "title" ? 28 : row.startsWith("item") ? 56 : 20,
            borderRadius: 8,
            background: MYTAB_COLORS.border,
            marginBottom: row === "title" ? 16 : 12,
            opacity: row.startsWith("item") ? 0.85 : 0.65,
            fontVariantNumeric: "tabular-nums",
          }}
        />
      ))}
    </div>
  );
}
