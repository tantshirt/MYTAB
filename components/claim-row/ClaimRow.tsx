"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { VisuallyHidden } from "@/components/primitives/visually-hidden";
import { Avatar, type ClaimantIdentity } from "./Avatar";
import { formatCurrencyMinorForA11y } from "@/lib/domain/a11yAmount";
import {
  formatCurrencyMinor,
  isQuantityClaimMode,
  perHeadDisplayMinor,
  quantityClaimedCaption,
  quantityStepperState,
  fiatMinorFromInteger,
} from "@/lib/domain";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

const AVATAR_SIZE = 22;
const AVATAR_OVERLAP = -6;

export type ClaimRowStateTag = "claim" | "yours" | "taken" | "none";

export type ClaimRowProps = {
  itemId: string;
  name: string;
  /** Receipt quantity. Rendered as "2×" ahead of the name, tabular like every numeral. */
  quantity?: number;
  lineTotalMinor: number;
  displayCurrency?: string;
  claimants: ClaimantIdentity[];
  viewerUserId: string;
  viewerOwns: boolean;
  /** Read-only: the claim affordances are removed, not disabled-greyed (EXPERIENCE, Locked). */
  locked: boolean;
  /** The organizer may hand an orphan row to someone else (FR-C4). */
  isOrganizer: boolean;
  reducedMotion?: boolean;
  /**
   * Tints for everyone on the board, from `avatarTintsForGroup`. Allocated once
   * per set upstream so two claimants on the same row can never share a colour.
   */
  tints?: ReadonlyMap<string, string>;
  isLast?: boolean;
  onToggleClaim?: () => void;
  /** Integer stepper for quantity-mode items (D-23, D-29). */
  claimedCount?: number;
  shortfall?: number;
  viewerClaimedQuantity?: number;
  allocationMode?: string;
  onSetClaimQuantity?: (quantity: number) => void;
  /** Tap the avatar stack → the who-has-this sheet (EXPERIENCE, `claim-row`). */
  onOpenClaimants?: () => void;
};

/** "and" rather than a trailing comma — this string is read aloud, not printed. */
function spokenList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function claimRowCaption(
  claimants: ClaimantIdentity[],
  lineTotalMinor: number,
  viewerUserId: string,
  quantityClaim?: { itemQuantity: number; claimedCount: number },
  displayCurrency = "THB",
): { text: string; tone: "muted" | "warning" } {
  if (quantityClaim && quantityClaim.itemQuantity > 1) {
    if (quantityClaim.claimedCount === 0) {
      return { text: "Needs an owner", tone: "warning" };
    }
    return {
      text: quantityClaimedCaption(quantityClaim.claimedCount, quantityClaim.itemQuantity),
      tone: quantityClaim.claimedCount < quantityClaim.itemQuantity ? "warning" : "muted",
    };
  }
  if (claimants.length === 0) {
    return { text: "Needs an owner", tone: "warning" };
  }
  if (claimants.length > 1) {
    const each = formatCurrencyMinor(
      perHeadDisplayMinor(fiatMinorFromInteger(lineTotalMinor), claimants.length),
      displayCurrency,
    );
    return { text: `Split ${claimants.length} ways · ${each} each`, tone: "muted" };
  }
  const only = claimants[0]!;
  // A row the viewer holds alone needs no caption — the fill and the tag already say so.
  return { text: only.userId === viewerUserId ? "" : only.displayName, tone: "muted" };
}

export function claimRowStateTag(
  claimants: ClaimantIdentity[],
  viewerOwns: boolean,
  locked: boolean,
): ClaimRowStateTag {
  if (viewerOwns) return "yours";
  // Locked keeps only "Yours". The others leave space rather than a greyed chip.
  if (locked) return "none";
  return claimants.length === 0 ? "claim" : "taken";
}

/**
 * The accessible name announces the item, its price as money, whether the viewer holds
 * it, and **who else does** — EXPERIENCE requires the other claimants, not just "claimed
 * by you", because the whole point of the surface is that other people are on it too.
 */
export function claimRowAriaLabel(args: {
  name: string;
  quantity?: number;
  lineTotalMinor: number;
  claimants: ClaimantIdentity[];
  viewerUserId: string;
  claimedCount?: number;
  displayCurrency?: string;
}): string {
  const qty = args.quantity && args.quantity > 1 ? `${args.quantity} × ` : "";
  const currency = args.displayCurrency ?? "THB";
  const parts = [
    `${qty}${args.name}`,
    formatCurrencyMinorForA11y(fiatMinorFromInteger(args.lineTotalMinor), currency),
  ];

  const viewerHolds = args.claimants.some((one) => one.userId === args.viewerUserId);
  const others = args.claimants.filter((one) => one.userId !== args.viewerUserId);

  if (args.claimants.length === 0) {
    parts.push("needs an owner");
  } else if (viewerHolds && others.length === 0) {
    parts.push("claimed by you");
  } else if (viewerHolds) {
    parts.push(`claimed by you and ${spokenList(others.map((one) => one.displayName))}`);
  } else {
    parts.push(`claimed by ${spokenList(others.map((one) => one.displayName))}`);
  }

  if (args.quantity && args.quantity > 1) {
    const claimed = args.claimedCount ?? args.claimants.length;
    parts.push(quantityClaimedCaption(claimed, args.quantity));
  } else if (args.claimants.length > 1) {
    const each = perHeadDisplayMinor(fiatMinorFromInteger(args.lineTotalMinor), args.claimants.length);
    parts.push(`split ${args.claimants.length} ways, ${formatCurrencyMinorForA11y(each, currency)} each`);
  }

  return `${parts.join(", ")}`;
}

const TAG_STYLE: Record<Exclude<ClaimRowStateTag, "none">, CSSProperties> = {
  claim: {
    color: MYTAB_COLORS.primary,
    background: MYTAB_COLORS.surface,
    border: `1px solid ${MYTAB_COLORS.border}`,
  },
  yours: {
    color: MYTAB_COLORS.primary,
    background: MYTAB_COLORS.primarySoft,
    border: `1px solid ${MYTAB_COLORS.primarySoft}`,
  },
  taken: {
    color: MYTAB_COLORS.inkMuted,
    background: MYTAB_COLORS.surface,
    border: `1px solid ${MYTAB_COLORS.border}`,
  },
};

const TAG_LABEL: Record<Exclude<ClaimRowStateTag, "none">, string> = {
  claim: "Claim",
  yours: "Yours",
  taken: "Taken",
};

/**
 * One dish on the claim board (DESIGN.md `claim-row`; POLISH-SPEC §1.6).
 *
 * The whole row body is the claim target, so the hit area is an inset overlay button
 * rather than a wrapper — the avatar stack has to stay independently tappable and a
 * button cannot contain a button. Long-press is deliberately unbound.
 */
export function ClaimRow({
  itemId,
  name,
  quantity,
  lineTotalMinor,
  displayCurrency = "THB",
  claimants,
  viewerUserId,
  viewerOwns,
  locked,
  isOrganizer,
  reducedMotion = false,
  tints,
  isLast = false,
  onToggleClaim,
  claimedCount,
  viewerClaimedQuantity = 0,
  allocationMode,
  onSetClaimQuantity,
  onOpenClaimants,
}: ClaimRowProps) {
  // Arrival is a mount, keyed by user id — but the row's own first paint is not an
  // arrival, or every avatar would fly in on load.
  const settledOnce = useRef(false);
  useEffect(() => {
    settledOnce.current = true;
  });

  const quantityMode = isQuantityClaimMode(allocationMode, quantity ?? 1);
  const resolvedClaimed = claimedCount ?? claimants.length;
  const unassigned = quantityMode ? resolvedClaimed === 0 : claimants.length === 0;
  const caption = claimRowCaption(
    claimants,
    lineTotalMinor,
    viewerUserId,
    quantityMode && quantity
      ? { itemQuantity: quantity, claimedCount: resolvedClaimed }
      : undefined,
    displayCurrency,
  );
  const tag = claimRowStateTag(claimants, viewerOwns, locked);
  const background = viewerOwns ? MYTAB_COLORS.primarySoft : MYTAB_COLORS.surface;
  const othersClaimed = Math.max(0, resolvedClaimed - viewerClaimedQuantity);
  const stepper = quantityMode && quantity
    ? quantityStepperState({
        itemQuantity: quantity,
        viewerQuantity: viewerClaimedQuantity,
        othersClaimed,
      })
    : null;
  const showStepper = Boolean(stepper && !locked);

  const stackLabel = unassigned
    ? "Assign this to someone"
    : `Who has ${name}: ${spokenList(claimants.map((one) => one.displayName))}`;
  const showStackButton = Boolean(onOpenClaimants) && (!unassigned || (isOrganizer && !locked));

  return (
    <li
      style={{
        position: "relative",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        // The 3px amber edge eats into the padding so the text baseline never moves.
        padding: `13px 14px 13px ${unassigned ? 11 : 14}px`,
        borderLeft: unassigned ? `3px solid ${MYTAB_COLORS.warning}` : undefined,
        borderBottom: isLast ? undefined : `1px solid ${MYTAB_COLORS.border}`,
        background,
      }}
    >
      {locked || showStepper ? null : (
        <button
          type="button"
          className="mytab-focus"
          onClick={onToggleClaim}
          aria-pressed={viewerOwns}
          aria-label={claimRowAriaLabel({
            name,
            quantity,
            lineTotalMinor,
            claimants,
            viewerUserId,
            claimedCount: resolvedClaimed,
            displayCurrency,
          })}
          data-claim-target={itemId}
          data-testid={`claim-row-${itemId}`}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            touchAction: "manipulation",
            WebkitTouchCallout: "none",
          }}
        />
      )}

      <div style={{ position: "relative", zIndex: 2, flex: 1, minWidth: 0, pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          {quantity ? (
            <span
              className="mytab-tabular"
              style={{
                flex: "none",
                fontSize: MYTAB_TYPOGRAPHY.label.size,
                fontWeight: 500,
                color: MYTAB_COLORS.inkMuted,
              }}
            >
              {quantity}×
            </span>
          ) : null}
          {/* `mytab-item-name` owns the line box: this string is a scanned dish
              name, so it is as likely to be ต้มยำกุ้ง as it is "Tom Yum Goong",
              and the Thai marks need the room (DESIGN.md, *Typography*). */}
          <span
            className="mytab-row__label mytab-item-name"
            style={{ fontSize: MYTAB_TYPOGRAPHY.body.size, fontWeight: 500 }}
          >
            {name}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 7,
            minHeight: AVATAR_SIZE,
          }}
        >
          {showStackButton ? (
            <button
              type="button"
              className="mytab-focus"
              onClick={onOpenClaimants}
              aria-label={stackLabel}
              data-testid={`claim-row-claimants-${itemId}`}
              style={{
                position: "relative",
                zIndex: 3,
                pointerEvents: "auto",
                display: "flex",
                alignItems: "center",
                gap: 8,
                // 44px tall via padding, without moving the 22px bubbles off the baseline.
                // Biased downward into the row's own 13px bottom padding so the band
                // never eats into the item name above — that tap must always claim.
                // Quantity steppers sit below this row, so don't pull into them.
                margin: showStepper ? "-8px -8px 0" : "-8px -8px -14px -8px",
                padding: showStepper ? 8 : "8px 8px 14px 8px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                touchAction: "manipulation",
                minWidth: 44,
                minHeight: 44,
              }}
            >
              <ClaimantBubbles
                claimants={claimants}
                ringColor={background}
                animate={settledOnce.current}
                reducedMotion={reducedMotion}
                tints={tints}
                unassignedGlyph={unassigned}
              />
              <Caption caption={caption} />
            </button>
          ) : (
            <>
              <ClaimantBubbles
                claimants={claimants}
                ringColor={background}
                animate={settledOnce.current}
                reducedMotion={reducedMotion}
                tints={tints}
                unassignedGlyph={false}
              />
              <Caption caption={caption} leading={claimants.length > 0} />
            </>
          )}
        </div>
        {showStepper && stepper ? (
          <QuantityStepper
            itemId={itemId}
            name={name}
            quantity={quantity ?? 1}
            claimedCount={resolvedClaimed}
            viewerQuantity={viewerClaimedQuantity}
            canIncrement={stepper.canIncrement}
            canDecrement={stepper.canDecrement}
            nextIncrement={stepper.nextIncrement}
            nextDecrement={stepper.nextDecrement}
            onSetClaimQuantity={onSetClaimQuantity}
          />
        ) : null}
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 2,
          pointerEvents: "none",
          flex: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 7,
        }}
      >
        <span
          className="mytab-row__amount mytab-tabular"
          data-mytab-amount
          aria-hidden
          style={{ fontSize: MYTAB_TYPOGRAPHY.amountRow.size, fontWeight: 500 }}
        >
          {formatCurrencyMinor(fiatMinorFromInteger(lineTotalMinor), displayCurrency)}
        </span>
        <span
          aria-hidden
          style={{
            minHeight: 24,
            display: "inline-flex",
            alignItems: "center",
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.01em",
            padding: tag === "none" ? 0 : "4px 10px",
            borderRadius: MYTAB_RADIUS.full,
            ...(tag === "none" ? {} : TAG_STYLE[tag]),
          }}
        >
          {tag === "none" ? "" : TAG_LABEL[tag]}
        </span>
      </div>
    </li>
  );
}

function QuantityStepper({
  itemId,
  name,
  quantity,
  claimedCount,
  viewerQuantity,
  canIncrement,
  canDecrement,
  nextIncrement,
  nextDecrement,
  onSetClaimQuantity,
}: {
  itemId: string;
  name: string;
  quantity: number;
  claimedCount: number;
  viewerQuantity: number;
  canIncrement: boolean;
  canDecrement: boolean;
  nextIncrement: number | null;
  nextDecrement: number | null;
  onSetClaimQuantity?: (quantity: number) => void;
}) {
  return (
    <div
      role="group"
      aria-label={quantityClaimedCaption(claimedCount, quantity)}
      data-claim-target={itemId}
      data-testid={`claim-row-stepper-${itemId}`}
      style={{
        position: "relative",
        zIndex: 3,
        display: "flex",
        alignItems: "center",
        marginTop: 8,
        pointerEvents: "auto",
      }}
    >
      <button
        type="button"
        className="mytab-focus"
        disabled={!canDecrement || !onSetClaimQuantity}
        onClick={() => {
          if (nextDecrement === null) return;
          onSetClaimQuantity?.(nextDecrement);
        }}
        aria-label={`Remove one of ${name}`}
        data-testid={`claim-row-decrement-${itemId}`}
        style={stepperButtonStyle}
      >
        −
      </button>
      <span
        className="mytab-tabular"
        aria-hidden
        data-testid={`claim-row-viewer-qty-${itemId}`}
        style={{
          minWidth: 28,
          textAlign: "center",
          fontSize: MYTAB_TYPOGRAPHY.label.size,
          fontWeight: 600,
        }}
      >
        {viewerQuantity}
      </span>
      <VisuallyHidden>{quantityClaimedCaption(claimedCount, quantity)}</VisuallyHidden>
      <button
        type="button"
        className="mytab-focus"
        disabled={!canIncrement || !onSetClaimQuantity}
        onClick={() => {
          if (nextIncrement === null) return;
          onSetClaimQuantity?.(nextIncrement);
        }}
        aria-label={`Claim one more of ${name}`}
        data-testid={`claim-row-increment-${itemId}`}
        style={stepperButtonStyle}
      >
        +
      </button>
    </div>
  );
}

const stepperButtonStyle: CSSProperties = {
  flex: "none",
  width: 44,
  height: 44,
  minWidth: 44,
  minHeight: 44,
  padding: 0,
  border: `1px solid ${MYTAB_COLORS.border}`,
  borderRadius: MYTAB_RADIUS.sm,
  background: MYTAB_COLORS.surface,
  color: MYTAB_COLORS.ink,
  fontSize: 22,
  fontWeight: 500,
  lineHeight: 1,
  cursor: "pointer",
  touchAction: "manipulation",
};

function Caption({
  caption,
  leading = true,
}: {
  caption: { text: string; tone: "muted" | "warning" };
  leading?: boolean;
}) {
  if (!caption.text) {
    return null;
  }
  return (
    <span
      style={{
        marginLeft: leading ? 12 : 0,
        fontSize: MYTAB_TYPOGRAPHY.meta.size,
        color: caption.tone === "warning" ? MYTAB_COLORS.warning : MYTAB_COLORS.inkMuted,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {caption.text}
    </span>
  );
}

function ClaimantBubbles({
  claimants,
  ringColor,
  animate,
  reducedMotion,
  tints,
  unassignedGlyph,
}: {
  claimants: ClaimantIdentity[];
  ringColor: string;
  animate: boolean;
  reducedMotion: boolean;
  tints?: ReadonlyMap<string, string>;
  unassignedGlyph: boolean;
}) {
  if (claimants.length === 0) {
    if (!unassignedGlyph) {
      return null;
    }
    // A dashed ring where a person would be: the organizer's override target.
    return (
      <span
        aria-hidden
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          flex: "none",
          borderRadius: "999px",
          border: `1.5px dashed ${MYTAB_COLORS.warning}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: MYTAB_COLORS.warning,
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        +
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", flex: "none" }}>
      {claimants.map((participant, index) => (
        <span
          key={participant.userId}
          style={{ marginLeft: index === 0 ? 0 : AVATAR_OVERLAP, display: "inline-flex" }}
        >
          <Avatar
            participant={participant}
            size={AVATAR_SIZE}
            ringColor={ringColor}
            arriving={animate}
            reducedMotion={reducedMotion}
            tint={tints?.get(participant.userId)}
          />
        </span>
      ))}
    </span>
  );
}
