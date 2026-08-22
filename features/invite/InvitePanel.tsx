"use client";

import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_SPACING, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";
import { INVITE_COPY } from "./copy";

export type InvitePanelProps = {
  /** Only the organizer is on the tab. */
  alone: boolean;
  seatsRemaining: number | null;
  onInvite: () => void;
};

/**
 * INVITE-FLOW S4 — the panel above the item list while she is alone, then a
 * quiet "+ Add someone" once anyone else is on the roster.
 */
export function InvitePanel({ alone, seatsRemaining, onInvite }: InvitePanelProps) {
  if (!alone) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: MYTAB_SPACING["4"],
        }}
      >
        <button
          type="button"
          onClick={onInvite}
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 44,
            padding: `0 ${MYTAB_SPACING["3"]}`,
            border: 0,
            background: "none",
            color: MYTAB_COLORS.primary,
            fontSize: 15,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {`+ ${INVITE_COPY.addSomeone}`}
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="invite-panel"
      style={{
        background: MYTAB_COLORS.surface,
        border: `1px solid ${MYTAB_COLORS.border}`,
        borderRadius: MYTAB_RADIUS.md,
        padding: MYTAB_SPACING["5"],
        marginBottom: MYTAB_SPACING["5"],
      }}
    >
      <p
        className="mytab-type-body"
        style={{ margin: 0, lineHeight: 1.45 }}
      >
        {INVITE_COPY.panelAlone}
      </p>
      <button
        type="button"
        className="mytab-button-primary"
        style={{ marginTop: MYTAB_SPACING["4"], minHeight: 44, width: "100%" }}
        onClick={onInvite}
      >
        {INVITE_COPY.sendTheLink}
      </button>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: MYTAB_SPACING["3"],
          marginTop: MYTAB_SPACING["2"],
        }}
      >
        {seatsRemaining !== null ? (
          <p
            className="mytab-type-meta"
            style={{
              margin: 0,
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              fontSize: MYTAB_TYPOGRAPHY.meta.size,
              color: MYTAB_COLORS.inkMuted,
            }}
          >
            {INVITE_COPY.seatsLeft(seatsRemaining)}
          </p>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
