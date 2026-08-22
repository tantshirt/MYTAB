"use client";

import type { CSSProperties, ReactNode } from "react";
import { MYTAB_COLORS, MYTAB_LAYOUT, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type StickyFooterProps = {
  children: ReactNode;
  /**
   * A line above the action — a stale-revision notice, a removed-item notice.
   * Rendered `role="status"`, one line, never a dialog and never dismissible
   * (EXPERIENCE, *Concurrency and Revision*).
   */
  notice?: ReactNode;
  /** Space between the notice and whatever follows it. */
  noticeGap?: number;
  /** The bar's own top padding. Task surfaces sit a shade lower than the board. */
  paddingTop?: number | string;
  /** Screen gutter. Only override where the surface's gutter is not the app's. */
  gutter?: string;
  style?: CSSProperties;
};

/**
 * `sticky-claim-footer` (DESIGN.md; POLISH-SPEC §6.2) — the pinned bar that
 * every task surface ends in.
 *
 * `position: sticky`, never `fixed`. On Android, Telegram resizes the viewport
 * when the keyboard opens; a fixed bar detaches and floats over the keyboard,
 * a sticky one rides the resize (POLISH-SPEC §2.5).
 *
 * The bottom padding reads `--app-pad-bottom`, the single published safe-area
 * variable, rather than calling `env()` here — the shell resolves Telegram's
 * inset and the device's inset together and publishes the larger (§2.7).
 */
export function StickyFooter({
  children,
  notice,
  noticeGap = 8,
  paddingTop = 12,
  gutter = MYTAB_LAYOUT.gutter,
  style,
}: StickyFooterProps) {
  const top = typeof paddingTop === "number" ? `${paddingTop}px` : paddingTop;

  return (
    <footer
      style={{
        position: "sticky",
        bottom: 0,
        background: MYTAB_COLORS.surface,
        borderTop: `1px solid ${MYTAB_COLORS.border}`,
        padding: `${top} ${gutter} calc(22px + var(--app-pad-bottom, 0px))`,
        ...style,
      }}
    >
      {notice ? (
        <p
          role="status"
          style={{
            margin: `0 0 ${noticeGap}px`,
            fontSize: MYTAB_TYPOGRAPHY.meta.size,
            color: MYTAB_COLORS.inkMuted,
          }}
        >
          {notice}
        </p>
      ) : null}
      {children}
    </footer>
  );
}
