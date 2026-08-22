"use client";

import { Children, type ReactNode } from "react";
import { MYTAB_COLORS, MYTAB_ELEVATION, MYTAB_RADIUS } from "@/lib/theme/tokens";

export type ListCardProps = {
  /** Micro-label above the card — "WALLET", "ABOUT". Sits outside the card, on paper. */
  label?: string;
  children: ReactNode;
};

/**
 * One card, many rows, hairlines between them (DESIGN.md: "Lists are separated by
 * `colors/border` hairlines inside one card" — never one rounded card per section).
 */
export function ListCard({ label, children }: ListCardProps) {
  const rows = Children.toArray(children).filter(Boolean);

  return (
    <section aria-label={label}>
      {label ? (
        <p className="mytab-type-micro-label" style={{ margin: "0 0 10px" }}>
          {label}
        </p>
      ) : null}
      <div
        style={{
          background: MYTAB_COLORS.surface,
          border: `1px solid ${MYTAB_COLORS.border}`,
          borderRadius: MYTAB_RADIUS.md,
          boxShadow: MYTAB_ELEVATION.cardShadow,
          overflow: "hidden",
        }}
      >
        {rows.map((row, index) => (
          <div
            key={index}
            style={{
              borderBottom:
                index < rows.length - 1 ? `1px solid ${MYTAB_COLORS.border}` : undefined,
            }}
          >
            {row}
          </div>
        ))}
      </div>
    </section>
  );
}
