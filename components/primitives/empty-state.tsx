"use client";

import type { ReactNode } from "react";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type EmptyStateProps = {
  /** The one sentence. `body` 15px/500 `colors/ink`. */
  headline: string;
  /** Optional second line, `meta` `colors/ink-muted`. */
  detail?: string;
  /** Optional single action beneath. 48px. */
  action?: ReactNode;
};

/**
 * §4.2 — `colors/surface` card, `padding: 24px 20px`, centred, `rounded/md`,
 * 1px `colors/border`. No illustration, no icon, no emoji.
 */
export function EmptyState({ headline, detail, action }: EmptyStateProps) {
  return (
    <div
      style={{
        background: MYTAB_COLORS.surface,
        border: `1px solid ${MYTAB_COLORS.border}`,
        borderRadius: MYTAB_RADIUS.md,
        padding: "24px 20px",
        textAlign: "center",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: MYTAB_TYPOGRAPHY.body.size,
          fontWeight: 500,
          letterSpacing: MYTAB_TYPOGRAPHY.body.tracking,
          color: MYTAB_COLORS.ink,
        }}
      >
        {headline}
      </p>
      {detail ? (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: MYTAB_TYPOGRAPHY.meta.size,
            lineHeight: 1.45,
            color: MYTAB_COLORS.inkMuted,
          }}
        >
          {detail}
        </p>
      ) : null}
      {action ? <div style={{ marginTop: "16px" }}>{action}</div> : null}
    </div>
  );
}
