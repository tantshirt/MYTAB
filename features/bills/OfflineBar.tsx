"use client";

import { MYTAB_COLORS } from "@/lib/theme/tokens";

type OfflineBarProps = {
  visible: boolean;
};

/** Inline offline notice — cached state stays readable (Story 4.4 AC4). */
export function OfflineBar({ visible }: OfflineBarProps) {
  if (!visible) {
    return null;
  }

  return (
    <div
      role="status"
      data-testid="bill-offline-bar"
      style={{
        background: MYTAB_COLORS.warningSoft,
        color: MYTAB_COLORS.warning,
        padding: "10px 16px",
        fontSize: "14px",
        textAlign: "center",
        borderBottom: `1px solid ${MYTAB_COLORS.border}`,
      }}
    >
      You&apos;re offline. We&apos;ll catch up.
    </div>
  );
}
