"use client";

import type { CSSProperties } from "react";
import { MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";

/**
 * Fill is `colors/sunk` and **static** — skeleton shimmer is banned
 * (EXPERIENCE, *Interaction Primitives*).
 */
const BAR: CSSProperties = {
  display: "block",
  background: MYTAB_COLORS.sunk,
  borderRadius: MYTAB_RADIUS.sm,
};

const ITEM_ROWS = [0, 1, 2, 3];
const TOTAL_ROWS = [0, 1];

/**
 * First-paint skeleton at the real geometry (Story 4.4 AC1, POLISH-SPEC §4.1).
 *
 * The amount placeholders live inside the reserved `mytab-row__amount` column
 * at `5.5ch`, which is a *tabular* 5.5 characters because the root sets
 * `font-variant-numeric: tabular-nums`. That is what stops the row shifting
 * when the real figure lands.
 */
export function BillSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading tab" data-testid="bill-skeleton">
      <span aria-hidden="true" style={{ ...BAR, height: 28, width: "58%", marginBottom: 16 }} />

      <section className="mytab-card" aria-hidden="true" style={{ overflow: "hidden" }}>
        {ITEM_ROWS.map((row) => (
          <div
            key={row}
            className="mytab-row"
            style={{
              padding: "16px 20px",
              alignItems: "center",
              borderTop: row === 0 ? undefined : `1px solid ${MYTAB_COLORS.border}`,
            }}
          >
            <span className="mytab-row__label">
              <span style={{ ...BAR, height: 15, width: row % 2 === 0 ? "62%" : "48%" }} />
              <span style={{ ...BAR, height: 11, width: "3ch", marginTop: 6 }} />
            </span>
            <span className="mytab-row__amount mytab-tabular">
              <span style={{ ...BAR, height: 15, width: "5.5ch" }} />
            </span>
          </div>
        ))}

        <div
          style={{
            borderTop: `1px solid ${MYTAB_COLORS.border}`,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 11,
          }}
        >
          {TOTAL_ROWS.map((row) => (
            <div key={row} className="mytab-row" style={{ alignItems: "center" }}>
              <span className="mytab-row__label">
                <span style={{ ...BAR, height: 14, width: "40%" }} />
              </span>
              <span className="mytab-row__amount mytab-tabular">
                <span style={{ ...BAR, height: 14, width: "5.5ch" }} />
              </span>
            </div>
          ))}
          <div
            className="mytab-row"
            style={{
              alignItems: "center",
              borderTop: `1px solid ${MYTAB_COLORS.border}`,
              paddingTop: 11,
            }}
          >
            <span className="mytab-row__label">
              <span style={{ ...BAR, height: 15, width: "28%" }} />
            </span>
            <span className="mytab-row__amount mytab-tabular">
              <span style={{ ...BAR, height: 15, width: "5.5ch" }} />
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
