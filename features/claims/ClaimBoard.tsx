"use client";

import { AmountPair } from "@/components/primitives/amount-pair";
import { formatFiatMinorThb, perHeadDisplayMinor, thbMinorFromInteger } from "@/lib/domain";
import { MYTAB_COLORS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";
import { avatarTintForUserId } from "@/lib/theme/tokens";

export type ClaimBoardParticipant = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
};

export type ClaimBoardItem = {
  id: string;
  name: string;
  lineTotalMinor: number;
  claimantIds: string[];
  viewerOwns: boolean;
  unassigned: boolean;
};

export type ClaimBoardProps = {
  tabName: string;
  revision: number;
  isLocked: boolean;
  isOrganizer: boolean;
  viewerUserId: string;
  participants: ClaimBoardParticipant[];
  items: ClaimBoardItem[];
  unassignedCount: number;
  viewerSubtotalMinor: number;
  viewerHasClaims: boolean;
  staleNotice?: string | null;
  presenceUserIds?: string[];
  onToggleClaim?: (itemId: string) => void;
  onOpenBillReview?: () => void;
};

function AvatarBubble({ participant }: { participant: ClaimBoardParticipant }) {
  const initial = participant.displayName.trim().charAt(0).toUpperCase() || "?";
  if (participant.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={participant.avatarUrl}
        alt=""
        width={24}
        height={24}
        style={{ borderRadius: "999px", objectFit: "cover" }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        width: 24,
        height: 24,
        borderRadius: "999px",
        background: avatarTintForUserId(participant.userId),
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {initial}
    </span>
  );
}

function footerActionLabel(props: ClaimBoardProps): { label: string; disabled: boolean } {
  if (props.isLocked) {
    return { label: "Settle up", disabled: false };
  }
  if (props.isOrganizer && props.unassignedCount > 0) {
    const word = props.unassignedCount === 1 ? "item" : "items";
    return {
      label: `${props.unassignedCount} ${word} need an owner`,
      disabled: true,
    };
  }
  if (props.viewerHasClaims) {
    return { label: "Finish claiming", disabled: false };
  }
  return { label: "Claim yours", disabled: false };
}

/**
 * Claim board stub — live claim rows, presence stack, sticky footer (Stories 5.4–5.7).
 */
export function ClaimBoard(props: ClaimBoardProps) {
  const action = footerActionLabel(props);
  const presence = (props.presenceUserIds ?? []).filter((id) => id !== props.viewerUserId);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", background: MYTAB_COLORS.paper }}>
      <header style={{ padding: "16px 16px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h1
              className="mytab-row__label"
              style={{ margin: 0, fontSize: MYTAB_TYPOGRAPHY.title.size, fontWeight: 600 }}
            >
              {props.tabName}
              {props.isLocked ? " · Locked" : ""}
            </h1>
            <p style={{ margin: "4px 0 0", color: MYTAB_COLORS.inkMuted, fontSize: MYTAB_TYPOGRAPHY.meta.size }}>
              Revision {props.revision}
            </p>
          </div>
          {presence.length > 0 ? (
            <div
              aria-label={`${presence.length} others here`}
              style={{ display: "flex", alignItems: "center", flex: "none", minWidth: 44, minHeight: 44 }}
            >
              {presence.slice(0, 3).map((userId, index) => {
                const participant = props.participants.find((row) => row.userId === userId);
                if (!participant) {
                  return null;
                }
                return (
                  <span key={userId} style={{ marginLeft: index === 0 ? 0 : -8 }}>
                    <AvatarBubble participant={participant} />
                  </span>
                );
              })}
              {presence.length > 3 ? (
                <span style={{ marginLeft: 4, fontSize: 12, color: MYTAB_COLORS.inkMuted }}>
                  +{presence.length - 3}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {props.staleNotice ? (
          <p style={{ margin: "8px 0 0", color: MYTAB_COLORS.inkMuted, fontSize: MYTAB_TYPOGRAPHY.meta.size }}>
            {props.staleNotice}
          </p>
        ) : null}
      </header>

      <ul style={{ listStyle: "none", margin: 0, padding: "0 0 120px" }}>
        {props.items.map((item) => {
          const claimants = props.participants.filter((participant) =>
            item.claimantIds.includes(participant.userId),
          );
          const splitLabel =
            claimants.length > 1
              ? `Split ${claimants.length} ways · ${formatFiatMinorThb(
                  perHeadDisplayMinor(thbMinorFromInteger(item.lineTotalMinor), claimants.length),
                )} each`
              : null;

          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={props.isLocked}
                onClick={() => props.onToggleClaim?.(item.id)}
                aria-label={`${item.name}, ${formatFiatMinorThb(thbMinorFromInteger(item.lineTotalMinor))}${
                  item.viewerOwns ? ", claimed by you" : item.unassigned ? ", unclaimed" : ""
                }`}
                style={{
                  width: "100%",
                  minHeight: 44,
                  textAlign: "left",
                  border: "none",
                  borderBottom: `1px solid ${MYTAB_COLORS.border}`,
                  background: item.viewerOwns ? MYTAB_COLORS.primarySoft : MYTAB_COLORS.surface,
                  borderLeft: item.unassigned
                    ? `3px solid ${MYTAB_COLORS.warning}`
                    : "3px solid transparent",
                  padding: "14px 16px 14px 13px",
                  cursor: props.isLocked ? "default" : "pointer",
                }}
              >
                <div className="mytab-row">
                  <span
                    className="mytab-row__label"
                    style={{ fontSize: MYTAB_TYPOGRAPHY.body.size, lineHeight: 1.45 }}
                  >
                    {item.name}
                  </span>
                  <span
                    className="mytab-row__amount"
                    data-mytab-amount
                    style={{ fontSize: MYTAB_TYPOGRAPHY.amountRow.size }}
                  >
                    {formatFiatMinorThb(thbMinorFromInteger(item.lineTotalMinor))}
                  </span>
                </div>
                {claimants.length > 0 ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                    {claimants.map((participant) => (
                      <AvatarBubble key={participant.userId} participant={participant} />
                    ))}
                    {splitLabel ? (
                      <span style={{ fontSize: MYTAB_TYPOGRAPHY.meta.size, color: MYTAB_COLORS.inkMuted }}>
                        {splitLabel}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <span style={{ display: "block", marginTop: 8, fontSize: MYTAB_TYPOGRAPHY.meta.size, color: MYTAB_COLORS.warning }}>
                    Needs an owner
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <footer
        style={{
          position: "sticky",
          bottom: 0,
          background: MYTAB_COLORS.surface,
          borderTop: `1px solid ${MYTAB_COLORS.border}`,
          padding: "12px 16px calc(12px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <p style={{ margin: "0 0 8px", fontSize: MYTAB_TYPOGRAPHY.meta.size, color: MYTAB_COLORS.inkMuted }}>
          Your share so far
        </p>
        <div style={{ display: "flex", alignItems: "stretch", gap: 12 }}>
          <span
            className="mytab-row__amount"
            data-mytab-amount
            style={{
              flex: "none",
              fontSize: MYTAB_TYPOGRAPHY.amountMd.size,
              fontWeight: 600,
              letterSpacing: MYTAB_TYPOGRAPHY.amountMd.tracking,
              alignSelf: "center",
              textAlign: "left",
            }}
          >
            {formatFiatMinorThb(thbMinorFromInteger(props.viewerSubtotalMinor))}
          </span>
          <button
            type="button"
            disabled={action.disabled}
            onClick={props.onOpenBillReview}
            className="mytab-button-primary"
            style={{ flex: 1, minWidth: 0, minHeight: 48 }}
          >
            <span className="mytab-row__label">{action.label}</span>
          </button>
        </div>
        {props.isLocked ? (
          <button
            type="button"
            onClick={props.onOpenBillReview}
            style={{
              marginTop: 8,
              border: "none",
              background: "transparent",
              color: MYTAB_COLORS.inkMuted,
              fontSize: MYTAB_TYPOGRAPHY.meta.size,
              cursor: "pointer",
              padding: 0,
            }}
          >
            See the full bill
          </button>
        ) : null}
      </footer>
    </div>
  );
}

export const FIXTURE_CLAIM_BOARD: ClaimBoardProps = {
  tabName: "Sukhumvit Dinner",
  revision: 3,
  isLocked: false,
  isOrganizer: true,
  viewerUserId: "user_maya",
  participants: [
    { userId: "user_maya", displayName: "Maya" },
    { userId: "user_bo", displayName: "Bo" },
    { userId: "user_jo", displayName: "Jo" },
  ],
  items: [
    {
      id: "item_pad_thai",
      name: "Pad Thai",
      lineTotalMinor: 36000,
      claimantIds: ["user_maya"],
      viewerOwns: true,
      unassigned: false,
    },
    {
      id: "item_curry",
      name: "Green Curry",
      lineTotalMinor: 24000,
      claimantIds: ["user_maya", "user_bo"],
      viewerOwns: true,
      unassigned: false,
    },
    {
      id: "item_mango",
      name: "Mango Sticky Rice",
      lineTotalMinor: 18000,
      claimantIds: [],
      viewerOwns: false,
      unassigned: true,
    },
  ],
  unassignedCount: 1,
  viewerSubtotalMinor: 48000,
  viewerHasClaims: true,
  presenceUserIds: ["user_bo"],
};
