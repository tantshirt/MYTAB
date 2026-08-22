"use client";

import { ListCard } from "@/components/primitives/list-card";
import { LIST_ROW_MIN_HEIGHT } from "@/components/primitives/list-row";
import { MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";
import { YOU_COPY } from "./copy";

function Bar({ width, height }: { width: string; height: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "block",
        width,
        height,
        borderRadius: MYTAB_RADIUS.sm,
        background: MYTAB_COLORS.sunk,
      }}
    />
  );
}

function SkeletonRow() {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: LIST_ROW_MIN_HEIGHT,
        padding: "16px",
      }}
    >
      <Bar width="60%" height="14px" />
    </div>
  );
}

/**
 * First paint with no cached viewer (POLISH-SPEC §3.4).
 * Static `colors/sunk` at the real row height — no spinner, no shimmer.
 */
export function YouSkeleton() {
  return (
    <div aria-busy="true" aria-label={YOU_COPY.loadingLabel}>
      <div
        aria-hidden="true"
        style={{ display: "flex", alignItems: "center", gap: "14px" }}
      >
        <span
          style={{
            width: "60px",
            height: "60px",
            borderRadius: MYTAB_RADIUS.full,
            background: MYTAB_COLORS.sunk,
            flex: "none",
          }}
        />
        <span style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Bar width="140px" height="20px" />
          <Bar width="90px" height="13px" />
        </span>
      </div>

      <div style={{ marginTop: "30px" }}>
        <ListCard label={YOU_COPY.walletSection}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </ListCard>
      </div>

      <div style={{ marginTop: "28px" }}>
        <ListCard label={YOU_COPY.aboutSection}>
          <SkeletonRow />
          <SkeletonRow />
        </ListCard>
      </div>
    </div>
  );
}
