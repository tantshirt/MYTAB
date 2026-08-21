"use client";

import { MYTAB_COLORS } from "@/lib/theme/tokens";

export type OfflineBarProps = {
  visible: boolean;
};

/** Single inline offline notice (Story 7.9 AC4). */
export function OfflineBar({ visible }: OfflineBarProps) {
  if (!visible) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: MYTAB_COLORS.warningSoft,
        color: MYTAB_COLORS.warning,
        padding: "10px 16px",
        fontSize: "13px",
        fontWeight: 500,
        textAlign: "center",
        borderBottom: `1px solid ${MYTAB_COLORS.border}`,
      }}
    >
      You&apos;re offline. We&apos;ll catch up.
    </div>
  );
}

export type SkeletonRowProps = {
  height?: number;
};

/** Geometry-matched skeleton — no shimmer (Story 7.9 AC2, AC5). */
export function SkeletonRow({ height = 56 }: SkeletonRowProps) {
  return (
    <div
      aria-hidden
      className="mytab-tabular"
      style={{
        height,
        background: MYTAB_COLORS.sunk,
        borderRadius: "12px",
        marginBottom: "8px",
      }}
    />
  );
}

export type TabsHomeSkeletonProps = {
  rows?: number;
};

export function TabsHomeSkeleton({ rows = 4 }: TabsHomeSkeletonProps) {
  return (
    <div aria-busy="true" aria-label="Loading tabs">
      <SkeletonRow height={48} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", margin: "24px 0" }}>
        <SkeletonRow height={52} />
        <SkeletonRow height={52} />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
