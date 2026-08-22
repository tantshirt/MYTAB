"use client";

import type { CSSProperties, ReactNode } from "react";
import { MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";

/**
 * Skeleton primitives (POLISH-SPEC §2.2, §4.1).
 *
 * The rules, all of them enforced here rather than at each call site:
 *   - Fill is `colors/sunk`, `rounded/sm`, **static**. No shimmer, no pulse —
 *     EXPERIENCE bans skeleton shimmer outright.
 *   - A skeleton amount lives inside the *reserved* amount column at its real
 *     tabular width (`5.5ch` for `amount-row`, `7ch` for `amount-md`/`lg`), so
 *     the real figure lands exactly where the placeholder was and nothing
 *     shifts on arrival.
 *   - Every container carries `aria-busy` and an `aria-label`; every child is
 *     `aria-hidden`.
 */

const FILL: CSSProperties = {
  background: MYTAB_COLORS.sunk,
  borderRadius: MYTAB_RADIUS.sm,
};

export type SkeletonBarProps = {
  width?: string | number;
  height?: string | number;
  radius?: string;
  style?: CSSProperties;
};

/** A plain block of `colors/sunk`. Never animated. */
export function SkeletonBar({
  width = "100%",
  height = "14px",
  radius,
  style,
}: SkeletonBarProps) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "block",
        flex: "none",
        width,
        height,
        ...FILL,
        borderRadius: radius ?? MYTAB_RADIUS.sm,
        ...style,
      }}
    />
  );
}

/** A circular placeholder — avatars, monograms, status dots. */
export function SkeletonCircle({ size = 32 }: { size?: number }) {
  return <SkeletonBar width={size} height={size} radius={MYTAB_RADIUS.full} />;
}

export type SkeletonAmountProps = {
  /** Which amount scale this column holds. Decides the reserved width. */
  scale?: "row" | "md" | "lg";
};

/**
 * The reserved amount column, at its real tabular width.
 *
 * `ch` resolves against the tabular figure advance because `.mytab-tabular`
 * sets `font-variant-numeric: tabular-nums` on the element itself — so `5.5ch`
 * here is the same physical width as `฿291.74` will be.
 */
export function SkeletonAmount({ scale = "row" }: SkeletonAmountProps) {
  return (
    <span
      aria-hidden="true"
      className="mytab-tabular mytab-row__amount"
      style={{
        display: "block",
        width: scale === "row" ? "5.5ch" : "7ch",
        height: "1em",
        ...FILL,
      }}
    />
  );
}

export type SkeletonLineProps = {
  /** Real row height, matched to the pixel. */
  height?: number;
  /** Leading circle diameter, or 0 for none. */
  avatar?: number;
  /** Width of the name bar. */
  labelWidth?: string;
  /** Reserve the amount column at its real tabular width. */
  amount?: "row" | "md" | "lg" | false;
  hairline?: boolean;
};

/**
 * One skeleton row: same padding, same hairline, same avatar diameter and the
 * same reserved amount column as the row it stands in for.
 */
export function SkeletonLine({
  height = 56,
  avatar = 0,
  labelWidth = "60%",
  amount = "row",
  hairline = false,
}: SkeletonLineProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "grid",
        gridTemplateColumns: `${avatar ? `${avatar}px ` : ""}minmax(0, 1fr) auto`,
        alignItems: "center",
        columnGap: "12px",
        minHeight: height,
        borderBottom: hairline ? `1px solid ${MYTAB_COLORS.border}` : undefined,
      }}
    >
      {avatar ? <SkeletonCircle size={avatar} /> : null}
      <SkeletonBar width={labelWidth} height="14px" />
      {amount ? <SkeletonAmount scale={amount} /> : <span />}
    </div>
  );
}

export type SkeletonCardProps = {
  /** Real card height, matched to the pixel. */
  height: number;
  children?: ReactNode;
};

/** A card-shaped placeholder at the real card geometry. */
export function SkeletonCard({ height, children }: SkeletonCardProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        minHeight: height,
        boxSizing: "border-box",
        padding: "20px",
        background: MYTAB_COLORS.surface,
        border: `1px solid ${MYTAB_COLORS.border}`,
        borderRadius: MYTAB_RADIUS.md,
      }}
    >
      {children}
    </div>
  );
}

/** The container every skeleton sits in. */
export function SkeletonRegion({
  label,
  children,
  style,
}: {
  label: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div aria-busy="true" aria-label={label} style={style}>
      {children}
    </div>
  );
}
