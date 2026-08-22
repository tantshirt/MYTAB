"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, ClaimRow, type ClaimantIdentity } from "@/components/claim-row";
import { useReducedMotion } from "@/components/primitives/use-reduced-motion";
import { BillEmptyState } from "@/features/bills/BillEmptyState";
import { WhoHasThisSheet } from "./WhoHasThisSheet";
import { useHaptics } from "@/features/telegram/useHaptics";
import { formatThbMinorForA11y } from "@/lib/domain/a11yAmount";
import { formatFiatMinorThb, thbMinorFromInteger } from "@/lib/domain";
import { LockIcon } from "@/components/icons";
import {
  avatarTintsForGroup,
  MYTAB_COLORS,
  MYTAB_ELEVATION,
  MYTAB_LAYOUT,
  MYTAB_RADIUS,
  MYTAB_TYPOGRAPHY,
} from "@/lib/theme/tokens";

export type ClaimBoardParticipant = ClaimantIdentity;

export type ClaimBoardItem = {
  id: string;
  name: string;
  /** Receipt quantity, when the receipt carried one. */
  quantity?: number;
  lineTotalMinor: number;
  claimantIds: string[];
  viewerOwns: boolean;
  unassigned: boolean;
};

export type ClaimBoardProps = {
  tabName: string;
  /**
   * The draft revision. Internal machinery — it drives staleness checks and is never
   * rendered. "Revision 3" on a dinner bill is a debugging affordance (§1.6).
   */
  revision: number;
  isLocked: boolean;
  isOrganizer: boolean;
  viewerUserId: string;
  organizerDisplayName: string;
  participants: ClaimBoardParticipant[];
  items: ClaimBoardItem[];
  unassignedCount: number;
  viewerSubtotalMinor: number;
  viewerHasClaims: boolean;
  /** A mutation was rejected against an older revision; the board has corrected itself. */
  isStale?: boolean;
  /** Overrides the default stale copy. */
  staleNotice?: string | null;
  /** The organizer deleted a draft item this viewer had claimed (§4.3). */
  removedClaimedItem?: boolean;
  presenceUserIds?: string[];
  onToggleClaim?: (itemId: string) => void;
  /** Organizer override — hand an item to someone else (FR-C4). */
  onAssignItem?: (itemId: string, userId: string) => void;
  onOpenBillReview?: () => void;
  /** Locked only. Opens the Payment Sheet for the viewer's own share. */
  onSettleUp?: () => void;
  onAddManual?: () => void;
  onScanReceipt?: () => void;
};

const PRESENCE_MAX = 3;
/** The sticky footer is two lines tall; the last row must clear it (artboard). */
const SCROLL_CLEARANCE_PX = 200;

const baht = (minor: number) => formatFiatMinorThb(thbMinorFromInteger(minor));

/** "1 item needs an owner" / "3 items need an owner" — the verb agrees too (§1.6). */
export function unassignedPhrase(count: number): string {
  return count === 1 ? "1 item needs an owner" : `${count} items need an owner`;
}

export type ClaimFooterAction = {
  label: string;
  disabled: boolean;
  intent: "settle" | "review" | "claim" | "blocked";
};

/**
 * State-driven, and the label is not decoration — each one goes somewhere different
 * (EXPERIENCE, `sticky-claim-footer`). Participants are never blocked by someone
 * else's unclaimed item.
 */
export function claimFooterAction(props: {
  isLocked: boolean;
  isOrganizer: boolean;
  unassignedCount: number;
  viewerHasClaims: boolean;
  hasItems: boolean;
}): ClaimFooterAction {
  if (props.isLocked) {
    return { label: "Settle up", disabled: false, intent: "settle" };
  }
  if (!props.hasItems) {
    return { label: "Claim yours", disabled: true, intent: "claim" };
  }
  if (props.isOrganizer && props.unassignedCount > 0) {
    return { label: unassignedPhrase(props.unassignedCount), disabled: true, intent: "blocked" };
  }
  if (props.viewerHasClaims) {
    return { label: "Finish claiming", disabled: false, intent: "review" };
  }
  return { label: "Claim yours", disabled: false, intent: "claim" };
}

/**
 * The claim board — the surface the demo is judged on.
 *
 * Claiming is additive, never exclusive: two people tapping the same dish become
 * "Split 2 ways", neither is rejected and neither sees an error (EXPERIENCE,
 * *Concurrency and Revision*). Someone else's claim arrives as a 200ms avatar landing
 * in the stack while the caption and the footer tick on the same frame — the numbers
 * never wait for the motion.
 */
export function ClaimBoard(props: ClaimBoardProps) {
  const reducedMotion = useReducedMotion();
  const haptics = useHaptics();
  const listRef = useRef<HTMLUListElement | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  // The board's own first paint is not an arrival — otherwise every avatar already on
  // the tab would fly in on open, which is decoration, not information (§5.1).
  const paintedOnce = useRef(false);
  useEffect(() => {
    paintedOnce.current = true;
  });

  const byId = useMemo(() => {
    const index = new Map<string, ClaimBoardParticipant>();
    for (const participant of props.participants) {
      index.set(participant.userId, participant);
    }
    return index;
  }, [props.participants]);

  /*
   * One allocation for the whole surface — the presence stack, every claim row and
   * the who-has-this sheet all read the same map, so a person is one colour on the
   * board and no two people on it share one. A per-id hash cannot promise that: five
   * people into five tints come out all-distinct 3.8% of the time.
   */
  const tints = useMemo(
    () => avatarTintsForGroup(props.participants.map((one) => one.userId)),
    [props.participants],
  );

  const claimantsFor = useCallback(
    (item: ClaimBoardItem): ClaimBoardParticipant[] =>
      item.claimantIds
        .map((userId) => byId.get(userId))
        .filter((one): one is ClaimBoardParticipant => Boolean(one)),
    [byId],
  );

  const presence = (props.presenceUserIds ?? [])
    .filter((userId) => userId !== props.viewerUserId)
    .map((userId) => byId.get(userId))
    .filter((one): one is ClaimBoardParticipant => Boolean(one));

  const itemsTotalMinor = props.items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const assignedMinor = props.items.reduce(
    (sum, item) => (item.claimantIds.length > 0 ? sum + item.lineTotalMinor : sum),
    0,
  );

  const action = claimFooterAction({
    isLocked: props.isLocked,
    isOrganizer: props.isOrganizer,
    unassignedCount: props.unassignedCount,
    viewerHasClaims: props.viewerHasClaims,
    hasItems: props.items.length > 0,
  });

  const handleToggleClaim = useCallback(
    (itemId: string) => {
      // Optimistic, on the tap. A buzz on the server acknowledgement reads as a bug (§2.8).
      haptics.claimToggled();
      props.onToggleClaim?.(itemId);
    },
    [haptics, props],
  );

  /** "Claim yours" points the viewer at the first dish they have not taken. */
  const handleClaimYours = useCallback(() => {
    const target = props.items.find((item) => !item.viewerOwns);
    if (!target) {
      return;
    }
    const node = listRef.current?.querySelector<HTMLElement>(`[data-claim-target="${target.id}"]`);
    if (!node) {
      return;
    }
    node.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
    node.focus({ preventScroll: true });
  }, [props.items, reducedMotion]);

  const handleAction = useCallback(() => {
    if (action.disabled) {
      return;
    }
    if (action.intent === "settle") {
      props.onSettleUp?.();
      return;
    }
    if (action.intent === "review") {
      props.onOpenBillReview?.();
      return;
    }
    handleClaimYours();
  }, [action, props, handleClaimYours]);

  const openItem = props.items.find((item) => item.id === openItemId) ?? null;

  const staleLine = props.staleNotice
    ? props.staleNotice
    : props.isStale
      ? "That changed a moment ago."
      : null;
  const removedLine = props.removedClaimedItem
    ? `${props.organizerDisplayName} removed an item you claimed.`
    : null;

  const peopleLabel = `${props.participants.length} ${props.participants.length === 1 ? "person" : "people"}`;

  return (
    <div
      style={{
        // AppShell already gutters its children; the board bleeds back out so the card,
        // the amber edge and the footer bar all reach the column edge as drawn.
        marginLeft: `calc(-1 * ${MYTAB_LAYOUT.gutter})`,
        marginRight: `calc(-1 * ${MYTAB_LAYOUT.gutter})`,
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        background: MYTAB_COLORS.paper,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: `${MYTAB_LAYOUT.gutter} ${MYTAB_LAYOUT.gutter} 12px`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            className="mytab-row__label"
            style={{
              margin: 0,
              fontSize: MYTAB_TYPOGRAPHY.title.size,
              fontWeight: 600,
              letterSpacing: MYTAB_TYPOGRAPHY.title.tracking,
            }}
          >
            {props.tabName}
          </h1>
          <p
            className="mytab-row__label"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              margin: "1px 0 0",
              color: MYTAB_COLORS.inkMuted,
              fontSize: MYTAB_TYPOGRAPHY.meta.size,
            }}
          >
            {props.isLocked ? (
              <>
                <LockIcon size={14} style={{ flex: "none" }} />
                <span data-testid="claim-board-locked">Locked</span>
                <span aria-hidden>·</span>
                <span>{peopleLabel}</span>
              </>
            ) : (
              <span>{peopleLabel} · tap what you had</span>
            )}
          </p>
        </div>

        {presence.length > 0 ? (
          <div
            aria-label={`${presence.length} ${presence.length === 1 ? "other person" : "others"} here now`}
            role="img"
            style={{ display: "flex", alignItems: "center", gap: 6, flex: "none", minHeight: 44 }}
          >
            <span style={{ display: "flex" }}>
              {presence.slice(0, PRESENCE_MAX).map((participant, index) => (
                <span
                  key={participant.userId}
                  style={{ marginLeft: index === 0 ? 0 : -8, display: "inline-flex" }}
                >
                  <Avatar
                    participant={participant}
                    size={24}
                    ringColor={MYTAB_COLORS.paper}
                    arriving={paintedOnce.current}
                    reducedMotion={reducedMotion}
                    tint={tints.get(participant.userId)}
                  />
                </span>
              ))}
            </span>
            {presence.length > PRESENCE_MAX ? (
              <span
                className="mytab-tabular"
                style={{ fontSize: 12, fontWeight: 600, color: MYTAB_COLORS.inkMuted }}
              >
                +{presence.length - PRESENCE_MAX}
              </span>
            ) : null}
            {/* Live, not idle: the dot is the only thing on the header that means "now". */}
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: "999px",
                background: MYTAB_COLORS.settled,
                flex: "none",
              }}
            />
          </div>
        ) : null}
      </header>

      <div
        style={{
          flex: 1,
          padding: `0 ${MYTAB_LAYOUT.gutter} ${SCROLL_CLEARANCE_PX}px`,
        }}
      >
        {props.items.length === 0 ? (
          <BillEmptyState
            isOrganizer={props.isOrganizer}
            organizerDisplayName={props.organizerDisplayName}
            onAddManual={props.onAddManual}
            onScanReceipt={props.onScanReceipt}
          />
        ) : (
          <>
            <ul
              ref={listRef}
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                background: MYTAB_COLORS.surface,
                border: `1px solid ${MYTAB_COLORS.border}`,
                borderRadius: MYTAB_RADIUS.md,
                boxShadow: MYTAB_ELEVATION.cardShadow,
                overflow: "hidden",
              }}
            >
              {props.items.map((item, index) => (
                <ClaimRow
                  key={item.id}
                  itemId={item.id}
                  name={item.name}
                  quantity={item.quantity}
                  lineTotalMinor={item.lineTotalMinor}
                  claimants={claimantsFor(item)}
                  viewerUserId={props.viewerUserId}
                  viewerOwns={item.viewerOwns}
                  locked={props.isLocked}
                  isOrganizer={props.isOrganizer}
                  reducedMotion={reducedMotion}
                  tints={tints}
                  isLast={index === props.items.length - 1}
                  onToggleClaim={() => handleToggleClaim(item.id)}
                  onOpenClaimants={() => setOpenItemId(item.id)}
                />
              ))}
            </ul>

            {/* The single most important teaching sentence in the product. */}
            <p
              style={{
                margin: "12px 0 0",
                padding: "0 4px",
                fontSize: MYTAB_TYPOGRAPHY.meta.size,
                color: MYTAB_COLORS.inkMuted,
                lineHeight: 1.5,
              }}
            >
              {props.isLocked
                ? `${props.organizerDisplayName} locked this bill. Amounts are final.`
                : "Tap a dish to claim it. Two people on the same dish split it — nobody gets bumped."}
            </p>
          </>
        )}
      </div>

      <footer
        style={{
          position: "sticky",
          bottom: 0,
          background: MYTAB_COLORS.surface,
          borderTop: `1px solid ${MYTAB_COLORS.border}`,
          padding: `12px ${MYTAB_LAYOUT.gutter} calc(22px + var(--app-pad-bottom, 0px))`,
        }}
      >
        {removedLine || staleLine ? (
          <p
            role="status"
            style={{
              margin: "0 0 8px",
              fontSize: MYTAB_TYPOGRAPHY.meta.size,
              color: MYTAB_COLORS.inkMuted,
            }}
          >
            {removedLine ?? staleLine}
          </p>
        ) : null}

        {props.items.length > 0 ? (
          <p
            style={{
              margin: "0 0 10px",
              fontSize: MYTAB_TYPOGRAPHY.meta.size,
              color: MYTAB_COLORS.inkMuted,
            }}
            data-testid="claim-board-reconciliation"
          >
            <span className="mytab-tabular">
              {baht(assignedMinor)} of {baht(itemsTotalMinor)} assigned
            </span>
            <span
              style={{
                fontWeight: 600,
                color: props.unassignedCount === 0 ? MYTAB_COLORS.settled : MYTAB_COLORS.warning,
              }}
            >
              {" · "}
              {props.unassignedCount === 0 ? "all assigned" : unassignedPhrase(props.unassignedCount)}
            </span>
          </p>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flex: "none", minWidth: 0 }}>
            <p
              style={{
                margin: "0 0 1px",
                fontSize: MYTAB_TYPOGRAPHY.meta.size,
                color: MYTAB_COLORS.inkMuted,
              }}
            >
              Your share
            </p>
            {/* `flex: none` on the amount, `flex: 1` on the label — names truncate, money
                does not (§2.3). The old footer had this exactly backwards. */}
            <p
              className="mytab-tabular"
              data-mytab-amount
              aria-label={`Your share, ${formatThbMinorForA11y(thbMinorFromInteger(props.viewerSubtotalMinor))}`}
              style={{
                margin: 0,
                whiteSpace: "nowrap",
                fontSize: MYTAB_TYPOGRAPHY.amountMd.size,
                fontWeight: 600,
                letterSpacing: MYTAB_TYPOGRAPHY.amountMd.tracking,
              }}
            >
              {baht(props.viewerSubtotalMinor)}
            </p>
            {props.isLocked ? (
              <button
                type="button"
                className="mytab-link-button"
                onClick={props.onOpenBillReview}
                style={{ marginTop: 2 }}
              >
                See the full bill
              </button>
            ) : null}
          </div>

          <button
            type="button"
            className="mytab-button-primary"
            disabled={action.disabled}
            onClick={handleAction}
            style={{ flex: 1, minWidth: 0, minHeight: 48 }}
            data-testid="claim-board-action"
          >
            <span className="mytab-row__label">{action.label}</span>
          </button>
        </div>
      </footer>

      {openItem ? (
        <WhoHasThisSheet
          itemName={openItem.name}
          lineTotalMinor={openItem.lineTotalMinor}
          claimants={claimantsFor(openItem)}
          assignable={props.participants.filter(
            (one) => !openItem.claimantIds.includes(one.userId),
          )}
          viewerUserId={props.viewerUserId}
          isOrganizer={props.isOrganizer}
          locked={props.isLocked}
          tints={tints}
          onAssign={
            props.onAssignItem
              ? (userId) => {
                  props.onAssignItem?.(openItem.id, userId);
                  setOpenItemId(null);
                }
              : undefined
          }
          onClose={() => setOpenItemId(null)}
        />
      ) : null}
    </div>
  );
}

/*
 * The canonical demo fixture: Sukhumvit Dinner, five people, items totalling ฿1,540.00
 * with the Mango Sticky Rice still an orphan — the exact mid-state the artboard draws
 * and the state Flow 4 opens on. Maya is the viewer and the organizer, so her lock is
 * blocked until she assigns that last dish.
 *
 * Per-person item shares here match `BillReview.dc.html` once Ploy takes the mango:
 * Maya ฿460.00, Tim ฿360.00, Ploy ฿270.00, Noi ฿210.00, Andre ฿240.00.
 */
export const FIXTURE_CLAIM_BOARD: ClaimBoardProps = {
  tabName: "Sukhumvit Dinner",
  revision: 3,
  isLocked: false,
  isOrganizer: true,
  viewerUserId: "user_maya",
  organizerDisplayName: "Maya",
  participants: [
    { userId: "user_maya", displayName: "Maya" },
    { userId: "user_noi", displayName: "Noi" },
    { userId: "user_ploy", displayName: "Ploy" },
    { userId: "user_tim", displayName: "Tim" },
    { userId: "user_andre", displayName: "Andre" },
  ],
  items: [
    {
      id: "item_som_tam",
      name: "Som Tam",
      quantity: 1,
      lineTotalMinor: 12000,
      claimantIds: ["user_noi", "user_ploy"],
      viewerOwns: false,
      unassigned: false,
    },
    {
      id: "item_pad_thai",
      name: "Pad Thai",
      quantity: 2,
      lineTotalMinor: 24000,
      claimantIds: ["user_maya", "user_noi"],
      viewerOwns: true,
      unassigned: false,
    },
    {
      id: "item_green_curry",
      name: "Green Curry",
      quantity: 1,
      lineTotalMinor: 18000,
      claimantIds: ["user_andre"],
      viewerOwns: false,
      unassigned: false,
    },
    {
      id: "item_tom_yum",
      name: "Tom Yum Goong",
      quantity: 1,
      lineTotalMinor: 28000,
      claimantIds: ["user_maya"],
      viewerOwns: true,
      unassigned: false,
    },
    {
      id: "item_massaman",
      name: "Massaman Beef",
      quantity: 1,
      lineTotalMinor: 28400,
      claimantIds: ["user_tim"],
      viewerOwns: false,
      unassigned: false,
    },
    {
      id: "item_mango",
      name: "Mango Sticky Rice",
      quantity: 1,
      lineTotalMinor: 18000,
      claimantIds: [],
      viewerOwns: false,
      unassigned: true,
    },
    {
      id: "item_coconut_rice",
      name: "Coconut rice",
      quantity: 4,
      lineTotalMinor: 12000,
      claimantIds: ["user_andre", "user_maya", "user_noi", "user_tim"],
      viewerOwns: true,
      unassigned: false,
    },
    {
      id: "item_singha",
      name: "Singha",
      quantity: 4,
      lineTotalMinor: 12000,
      claimantIds: ["user_andre", "user_maya", "user_ploy", "user_tim"],
      viewerOwns: true,
      unassigned: false,
    },
  ],
  unassignedCount: 1,
  viewerSubtotalMinor: 46000,
  viewerHasClaims: true,
  presenceUserIds: ["user_noi", "user_ploy", "user_andre"],
};
