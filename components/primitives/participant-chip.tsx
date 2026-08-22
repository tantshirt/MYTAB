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
  /**
   * This person cannot be picked. They are still rendered — a friend who
   * silently vanishes from the row reads as a bug in the product or in the
   * friendship. `reason` is mandatory alongside it: there is no state in this
   * product without designed copy, and a disabled control that does not say why
   * is exactly that state.
   */
  disabled?: boolean;
  reason?: string;
  /**
   * DESIGN.md gives this component two sizes and only two: 28px inside a stack,
   * 40px when it is the thing being picked. `stack` also drops the name and the
   * reason — a stack is a count of faces, not a list of labels.
   */
  size?: "selector" | "stack";
};

/** The two sizes DESIGN.md defines, and no third one. */
const AVATAR_SIZE = { selector: 40, stack: 28 } as const;

/** Wide enough for a two-line reason at 12px; a plain chip stays at the artboard's 56. */
const COLUMN_WIDTH = { plain: 56, withReason: 92 } as const;

/**
 * Verified group member chip (Story 3.1 AC1, UX-DR9; POLISH-SPEC §1.11).
 *
 * Selection is a 2px `colors/primary` ring and never a fill, so the white
 * initial stays legible against its tint in every state.
 */
export function ParticipantChip({
  userId,
  displayName,
  selected = false,
  onSelect,
  tint,
  disabled = false,
  reason,
  size = "selector",
}: ParticipantChipProps) {
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  const resolvedTint = tint ?? avatarTintForUserId(userId);
  const inStack = size === "stack";
  const showReason = Boolean(reason) && !inStack;
  const avatarPx = AVATAR_SIZE[size];

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      aria-label={inStack ? displayName : undefined}
      aria-pressed={disabled ? undefined : selected}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "7px",
        flexShrink: 0,
        width: inStack
          ? `${avatarPx}px`
          : `${showReason ? COLUMN_WIDTH.withReason : COLUMN_WIDTH.plain}px`,
        /* A 40px avatar still needs a 44px target around it. */
        minHeight: inStack ? `${avatarPx}px` : "44px",
        border: "none",
        background: "transparent",
        padding: 0,
        textAlign: "center",
        cursor: disabled ? "not-allowed" : onSelect ? "pointer" : "default",
      }}
    >
      <span
        aria-hidden
        style={{
          width: `${avatarPx}px`,
          height: `${avatarPx}px`,
          flex: "none",
          borderRadius: MYTAB_RADIUS.full,
          background: resolvedTint,
          color: MYTAB_COLORS.surface,
          fontSize: inStack ? "12px" : "16px",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          /*
           * Selection is a ring, never a fill (DESIGN.md `participant-chip`).
           * No transition is declared and none should be — chip selection is an
           * instant state swap (§5.7), so the old `0 0 0 0 transparent`
           * placeholder, written so a transition COULD run against a transition
           * that never existed, is gone.
           */
          boxShadow: selected ? `0 0 0 2px ${MYTAB_COLORS.primary}` : undefined,
          opacity: disabled ? 0.45 : 1,
        }}
      >
        {initial}
      </span>

      {inStack ? null : (
        <span
          style={{
            minWidth: 0,
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: MYTAB_TYPOGRAPHY.label.size,
            fontWeight: selected && !disabled ? 600 : 400,
            color: selected && !disabled ? MYTAB_COLORS.ink : MYTAB_COLORS.inkMuted,
          }}
        >
          {displayName}
        </span>
      )}

      {showReason ? (
        <span
          style={{
            maxWidth: "100%",
            fontSize: "12px",
            lineHeight: 1.25,
            color: MYTAB_COLORS.inkMuted,
          }}
        >
          {reason}
        </span>
      ) : null}
    </button>
  );
}
