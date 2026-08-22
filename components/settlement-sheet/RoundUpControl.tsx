"use client";

import { MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";

export type RoundUpControlProps = {
  label: string;
  amountLabel: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
};

/** The round-up glyph: a small arrow lifting to a point. Terracotta, because it is a tip. */
function RoundUpGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={MYTAB_COLORS.tip}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none" }}
    >
      <path d="M12 20V8M12 8l-4 4M12 8l4 4" />
      <circle cx="12" cy="4" r="1.6" />
    </svg>
  );
}

/**
 * Optional round-up tip (§1.8).
 *
 * The whole row is the switch, so the target clears the 44px floor — a 20px native
 * checkbox did not. The amount is always visible: a person cannot weigh an offer they
 * cannot see. Round-up is a tip, so it carries `colors/tip`, never `colors/primary`.
 */
export function RoundUpControl({ label, amountLabel, enabled, onToggle }: RoundUpControlProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onToggle(!enabled)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        width: "100%",
        minHeight: "44px",
        padding: "12px 14px",
        borderRadius: MYTAB_RADIUS.sm,
        border: `1px solid ${enabled ? MYTAB_COLORS.tip : MYTAB_COLORS.border}`,
        background: enabled ? MYTAB_COLORS.tipSoft : MYTAB_COLORS.surface,
        fontFamily: "inherit",
        color: MYTAB_COLORS.ink,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <RoundUpGlyph />
      <span style={{ flexGrow: 1, minWidth: 0, fontSize: "14px", fontWeight: 500 }}>{label}</span>
      <span
        className="mytab-tabular"
        data-mytab-amount
        style={{
          flex: "none",
          whiteSpace: "nowrap",
          fontSize: "14px",
          fontWeight: 500,
          color: enabled ? MYTAB_COLORS.tip : MYTAB_COLORS.inkMuted,
        }}
      >
        {amountLabel}
      </span>
    </button>
  );
}
