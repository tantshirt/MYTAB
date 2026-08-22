"use client";

import type { CSSProperties, ReactNode } from "react";
import { MYTAB_COLORS, MYTAB_LAYOUT } from "@/lib/theme/tokens";

export type NoticeBarTone = "warning" | "quiet";

export type NoticeBarProps = {
  tone?: NoticeBarTone;
  /**
   * Cancels `AppShell`'s 16px gutter so the bar runs edge to edge, which §4.4
   * requires ("a full-bleed inline bar at the very top of the surface").
   */
  fullBleed?: boolean;
  children: ReactNode;
  style?: CSSProperties;
};

const TONES: Record<NoticeBarTone, { background: string; color: string }> = {
  /** §4.4 offline. */
  warning: { background: MYTAB_COLORS.warningSoft, color: MYTAB_COLORS.warning },
  /** §4.5 outside Telegram — `colors/ink-muted` on `colors/sunk`. */
  quiet: { background: MYTAB_COLORS.sunk, color: MYTAB_COLORS.inkMuted },
};

/**
 * Full-bleed inline bar at the very top of a surface (POLISH-SPEC §4.4, §4.5).
 * Never a modal, never a toast — cached reads stay visible underneath it.
 */
export function NoticeBar({ tone = "warning", fullBleed = false, children, style }: NoticeBarProps) {
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
        ...(fullBleed
          ? {
              marginLeft: `-${MYTAB_LAYOUT.gutter}`,
              marginRight: `-${MYTAB_LAYOUT.gutter}`,
            }
          : null),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
