"use client";

import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type RoundUpControlProps = {
  label: string;
  amountLabel: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
};

/** Optional round-up tip toggle — defaults off (Story 6.9 AC1). */
export function RoundUpControl({ label, amountLabel, enabled, onToggle }: RoundUpControlProps) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "12px 0",
        borderTop: `1px solid ${MYTAB_COLORS.border}`,
        cursor: "pointer",
      }}
    >
      <span>
        <span
          style={{
            display: "block",
            fontSize: MYTAB_TYPOGRAPHY.body.size,
            fontWeight: 500,
            color: MYTAB_COLORS.ink,
          }}
        >
          {label}
        </span>
        {enabled ? (
          <span
            style={{
              display: "block",
              marginTop: "4px",
              fontSize: MYTAB_TYPOGRAPHY.meta.size,
              color: MYTAB_COLORS.inkMuted,
            }}
          >
            {amountLabel}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => onToggle(event.target.checked)}
        style={{
          width: "20px",
          height: "20px",
          accentColor: MYTAB_COLORS.primary,
        }}
      />
    </label>
  );
}

export type StaleRevisionBannerProps = {
  onRefresh: () => void;
};

/** Plain-language stale revision blocker (Story 6.6 AC3). */
export function StaleRevisionBanner({ onRefresh }: StaleRevisionBannerProps) {
  return (
    <div
      style={{
        marginTop: "16px",
        padding: "14px",
        borderRadius: MYTAB_RADIUS.sm,
        background: MYTAB_COLORS.surface,
        border: `1px solid ${MYTAB_COLORS.border}`,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: MYTAB_TYPOGRAPHY.body.size,
          color: MYTAB_COLORS.ink,
        }}
      >
        This bill changed. Refresh to see your new amount.
      </p>
      <button
        type="button"
        onClick={onRefresh}
        style={{
          marginTop: "12px",
          minHeight: "44px",
          width: "100%",
          borderRadius: MYTAB_RADIUS.sm,
          border: "none",
          background: MYTAB_COLORS.primary,
          color: "#fff",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Refresh
      </button>
    </div>
  );
}
