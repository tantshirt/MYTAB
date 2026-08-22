"use client";

import type { CSSProperties } from "react";
import { MYTAB_COLORS } from "@/lib/theme/tokens";

export type GlyphProps = {
  size?: number;
  color?: string;
  style?: CSSProperties;
};

/** Right chevron — the trailing affordance on every navigating or disclosing row. */
export function ChevronGlyph({ size = 18, color = MYTAB_COLORS.inkMuted, style }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** Two offset rounded rects — the copy affordance (POLISH-SPEC §3.2). */
export function CopyGlyph({ size = 20, color = MYTAB_COLORS.inkMuted, style }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 012-2h10" />
    </svg>
  );
}
