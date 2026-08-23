"use client";

import Link from "next/link";
import { PresenceStack } from "@/components/presence-stack/PresenceStack";
import { formatAmountLabelForA11y } from "@/lib/domain/a11yAmount";
import { claimProgress, stillChoosingCount } from "@/lib/domain/liveTab";
import type { LiveTabParticipant } from "@/lib/domain/liveTab";
import { avatarTintsForGroup, MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";
import { formatRelativeTime } from "./ActivityFeed";

export const LIVE_TAB_COPY = {
  live: "Live",
  yourShare: "Your share",
  leftToClaim: "Left to claim",
  claim: "Claim your items",
  review: "Review your items",
  /** A draft with no bill yet — there is nothing to claim, so say what is true. */
  noItemsYet: "No items on the bill yet",
  waitingForPeople: "Waiting for people",
  everyoneChosen: "Everyone has chosen",
  stillChoosing: (count: number) => `${count} still choosing`,
  started: (relative: string) => `started ${relative.toLowerCase()}`,
  claimedOf: (claimed: number, total: number) => `${claimed} of ${total} claimed`,
} as const;

/**
 * What the room is doing, as one short line beside the faces.
 *
 * Exported for the unit tests: the branch between "waiting for people" and
 * "everyone has chosen" is the difference between an empty room and a finished
 * one, and both render zero people still choosing.
 */
export function presenceCaption(participants: readonly LiveTabParticipant[]): string {
  if (participants.length <= 1) {
    return LIVE_TAB_COPY.waitingForPeople;
  }

  const choosing = stillChoosingCount(participants);
  return choosing === 0
    ? LIVE_TAB_COPY.everyoneChosen
    : LIVE_TAB_COPY.stillChoosing(choosing);
}

/**
 * Why the viewer's share just moved.
 *
 * `because` is the activity summary for an event on **this tab** — never a
 * guess. Where no event can be attributed the line still renders the figure,
 * because the change itself is real and the viewer watched it happen; only the
 * attribution is withheld.
 */
export type ShareDelta = {
  /** Already formatted, e.g. "฿51.74". Never signed — `direction` carries that. */
  amountLabel: string;
  direction: "down" | "up";
  because?: string;
};

export type LiveTabCardProps = {
  tabId: string;
  name: string;
  href: string;
  startedAt: number;
  participants: LiveTabParticipant[];
  /** The viewer's running share of this tab, already formatted. */
  shareLabel: string;
  shareA11yLabel?: string;
  itemCount: number;
  claimedItemCount: number;
  unclaimedItems: Array<{ itemId: string; name: string; amountLabel: string }>;
  unclaimedCount: number;
  /** How many items the viewer has taken — picks the primary action's verb. */
  viewerClaimedCount: number;
  delta?: ShareDelta;
  reducedMotion?: boolean;
  /** False on the surface's own first paint, so faces do not all fly in at once. */
  arriving?: boolean;
};

const DELTA_COLOR = {
  down: MYTAB_COLORS.settled,
  up: MYTAB_COLORS.ink,
} as const;

function DeltaArrow({ direction }: { direction: "down" | "up" }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flex: "none" }}
    >
      <path
        d={direction === "down" ? "M12 5v13m0 0l-5-5m5 5l5-5" : "M12 19V6m0 0l-5 5m5-5l5 5"}
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The tab that is happening right now, rendered as the thing that owns the
 * screen rather than as one card in a stack of equal cards.
 *
 * Three facts, in this order, because that is the order a person wants them:
 * who is in the room, what the viewer's share currently is, and what is still
 * unclaimed. The figure is the only 42px thing on the surface while a tab is
 * live.
 *
 * Motion: none of its own. Faces arrive through the sanctioned avatar-arrival
 * animation (POLISH-SPEC §5.1) and the progress bar advances with the
 * sanctioned bar transition (§5.2). The share figure changes on the frame the
 * data changes — "the numbers never wait for the motion" — and the delta line
 * beside it is a plain text swap.
 */
export function LiveTabCard({
  name,
  href,
  startedAt,
  participants,
  shareLabel,
  shareA11yLabel,
  itemCount,
  claimedItemCount,
  unclaimedItems,
  unclaimedCount,
  viewerClaimedCount,
  delta,
  reducedMotion = false,
  arriving = false,
}: LiveTabCardProps) {
  const progress = claimProgress({ itemCount, claimedItemCount });
  const tints = avatarTintsForGroup(participants.map((one) => one.userId));
  const overflow = unclaimedCount - unclaimedItems.length;

  return (
    <section
      className="mytab-card"
      style={{
        padding: "18px",
        borderColor: MYTAB_COLORS.borderStrong,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: MYTAB_COLORS.primarySoft,
            borderRadius: MYTAB_RADIUS.full,
            padding: "5px 10px 5px 8px",
          }}
        >
          {/*
            Static, deliberately. POLISH-SPEC §5 sanctions exactly three
            animations and bans idle loops; a breathing dot would be a fourth,
            and the arriving faces plus the moving figure already carry "this
            is happening now".
          */}
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: MYTAB_RADIUS.full,
              background: MYTAB_COLORS.primary,
              flex: "none",
            }}
          />
          <span
            className="mytab-type-micro-label"
            style={{ color: MYTAB_COLORS.primaryDeep }}
          >
            {LIVE_TAB_COPY.live}
          </span>
        </span>
        <span
          className="mytab-type-meta mytab-row__label"
          style={{ fontSize: "12px", minWidth: 0 }}
        >
          {LIVE_TAB_COPY.started(formatRelativeTime(startedAt))}
        </span>
      </div>

      {/* The title is a link, so it carries the 44px floor like any other target. */}
      <Link
        href={href}
        className="mytab-focus"
        style={{
          display: "flex",
          alignItems: "center",
          minHeight: "44px",
          marginTop: "8px",
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <h2 className="mytab-type-title mytab-name mytab-row__label" style={{ margin: 0 }}>
          {name}
        </h2>
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "12px" }}>
        <PresenceStack
          people={participants.map((participant) => ({
            userId: participant.userId,
            displayName: participant.displayName,
          }))}
          max={5}
          size={32}
          overlap={-9}
          ringColor={MYTAB_COLORS.surface}
          overflowColor={MYTAB_COLORS.inkMuted}
          tints={tints}
          arriving={arriving}
          reducedMotion={reducedMotion}
          label={`${participants.length} on this tab`}
        />
        <span className="mytab-type-meta mytab-row__label" style={{ minWidth: 0 }}>
          {presenceCaption(participants)}
        </span>
      </div>

      <div
        aria-hidden="true"
        style={{ height: 1, background: MYTAB_COLORS.border, margin: "16px 0 14px" }}
      />

      <p className="mytab-type-micro-label" style={{ margin: 0 }}>
        {LIVE_TAB_COPY.yourShare}
      </p>
      <p
        className="mytab-type-amount-hero mytab-tabular"
        data-mytab-amount
        aria-label={shareA11yLabel ?? formatAmountLabelForA11y(shareLabel)}
        style={{
          margin: "2px 0 0",
          color: MYTAB_COLORS.ink,
          whiteSpace: "nowrap",
          fontSize: "clamp(32px, 10.8vw, 42px)",
          lineHeight: 1.08,
        }}
      >
        {shareLabel}
      </p>

      {delta ? (
        <p
          className="mytab-type-label"
          style={{
            margin: "7px 0 0",
            color: DELTA_COLOR[delta.direction],
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <DeltaArrow direction={delta.direction} />
          <span className="mytab-tabular" style={{ flex: "none" }} data-mytab-amount>
            {delta.amountLabel}
          </span>
          {delta.because ? (
            <span className="mytab-name mytab-row__label" style={{ minWidth: 0 }}>
              · {delta.because}
            </span>
          ) : null}
        </p>
      ) : null}

      {progress === null ? (
        <p className="mytab-type-meta" style={{ margin: "16px 0 0", fontSize: "12px" }}>
          {LIVE_TAB_COPY.noItemsYet}
        </p>
      ) : (
        <div
          style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "10px" }}
        >
          <span
            role="progressbar"
            aria-valuenow={claimedItemCount}
            aria-valuemin={0}
            aria-valuemax={itemCount}
            aria-label={LIVE_TAB_COPY.claimedOf(claimedItemCount, itemCount)}
            style={{
              flex: 1,
              minWidth: 0,
              height: 4,
              borderRadius: MYTAB_RADIUS.full,
              background: MYTAB_COLORS.sunk,
              display: "block",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "block",
                height: 4,
                width: "100%",
                borderRadius: MYTAB_RADIUS.full,
                background: MYTAB_COLORS.primary,
                transformOrigin: "left",
                transform: `scaleX(${progress})`,
                transition: reducedMotion
                  ? "none"
                  : "transform 400ms cubic-bezier(0.65, 0, 0.35, 1) 140ms",
              }}
            />
          </span>
          <span
            className="mytab-type-meta mytab-tabular"
            style={{ fontSize: "12px", flex: "none" }}
          >
            {LIVE_TAB_COPY.claimedOf(claimedItemCount, itemCount)}
          </span>
        </div>
      )}

      {unclaimedItems.length > 0 ? (
        <>
          <p className="mytab-type-micro-label" style={{ margin: "16px 0 8px" }}>
            {LIVE_TAB_COPY.leftToClaim}
          </p>
          {/*
            Wraps, never scrolls and never clips. Three name-plus-amount chips
            do not fit one line at the 390px design width, let alone at 320px
            with the largest platform text setting — and an amount that has
            been scrolled out of sight is an amount the viewer cannot check.
          */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {unclaimedItems.map((item) => (
              <span
                key={item.itemId}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  minHeight: "36px",
                  padding: "0 12px",
                  borderRadius: MYTAB_RADIUS.full,
                  border: `1px solid ${MYTAB_COLORS.border}`,
                  background: MYTAB_COLORS.paper,
                  flex: "none",
                }}
              >
                <span className="mytab-type-label mytab-name">{item.name}</span>
                <span
                  className="mytab-type-label mytab-tabular"
                  data-mytab-amount
                  style={{ fontWeight: 600, color: MYTAB_COLORS.inkMuted }}
                >
                  {item.amountLabel}
                </span>
              </span>
            ))}
            {overflow > 0 ? (
              <span
                className="mytab-type-label mytab-tabular"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: "36px",
                  padding: "0 12px",
                  borderRadius: MYTAB_RADIUS.full,
                  border: `1px solid ${MYTAB_COLORS.border}`,
                  background: MYTAB_COLORS.surface,
                  color: MYTAB_COLORS.inkMuted,
                  fontWeight: 600,
                  flex: "none",
                }}
              >
                +{overflow}
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      <Link
        href={href}
        className="mytab-button-primary"
        style={{ marginTop: "18px" }}
      >
        {viewerClaimedCount > 0 ? LIVE_TAB_COPY.review : LIVE_TAB_COPY.claim}
      </Link>
    </section>
  );
}
