"use client";

import type { CSSProperties, ReactNode } from "react";
import { MYTAB_COLORS } from "@/lib/theme/tokens";

export type NoticeBarTone = "warning" | "quiet";

export type NoticeBarProps = {
  tone?: NoticeBarTone;
  children: ReactNode;
  style?: CSSProperties;
};

const TONES: Record<NoticeBarTone, { background: string; color: string }> = {
  warning: { background: MYTAB_COLORS.warningSoft, color: MYTAB_COLORS.warning },
  quiet: { background: MYTAB_COLORS.sunk, color: MYTAB_COLORS.inkMuted },
};

/**
 * Full-bleed inline bar at the very top of a surface (POLISH-SPEC §4.4, §4.5).
 * Never a modal, never a toast — cached reads stay visible underneath it.
 */
export function NoticeBar({ tone = "warning", children, style }: NoticeBarProps) {
  const palette = TONES[tone];

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: palette.background,
        color: palette.color,
        padding: "10px 16px",
        fontSize: "14px",
        fontWeight: 500,
        textAlign: "center",
        borderBottom: `1px solid ${MYTAB_COLORS.border}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
