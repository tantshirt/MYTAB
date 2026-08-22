"use client";

import { avatarTintForUserId } from "@/lib/theme/tokens";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type ParticipantChipProps = {
  userId: string;
  displayName: string;
  selected?: boolean;
  onSelect?: () => void;
  /**
   * From `avatarTintsForGroup`. A chip row is always a set of people, so the
   * caller allocates the tints; the per-id hash is the fallback for a lone chip.
   */
  tint?: string;
};

/** Verified group member selector chip (Story 3.1 AC1, UX-DR9). */
export function ParticipantChip({
  userId,
  displayName,
  selected = false,
  onSelect,
  tint,
}: ParticipantChipProps) {
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  const resolvedTint = tint ?? avatarTintForUserId(userId);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "7px",
        flexShrink: 0,
        width: "56px",
        border: "none",
        background: "transparent",
        padding: 0,
        cursor: onSelect ? "pointer" : "default",
      }}
    >
      <span
        style={{
          width: "52px",
          height: "52px",
          borderRadius: MYTAB_RADIUS.full,
          background: resolvedTint,
          color: "#fff",
          fontSize: "18px",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: selected ? `0 0 0 2px ${MYTAB_COLORS.primary}` : "0 0 0 0 transparent",
        }}
      >
        {initial}
      </span>
      <span
        style={{
          minWidth: 0,
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textAlign: "center",
          fontSize: MYTAB_TYPOGRAPHY.label.size,
          fontWeight: selected ? 600 : 400,
          color: selected ? MYTAB_COLORS.ink : MYTAB_COLORS.inkMuted,
        }}
      >
        {displayName}
      </span>
    </button>
  );
}
