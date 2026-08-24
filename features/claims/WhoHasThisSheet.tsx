"use client";

import { useMemo, useState } from "react";
import { Avatar, type ClaimantIdentity } from "@/components/claim-row";
import { SheetContainer } from "@/components/settlement-sheet/SheetContainer";
import { formatCurrencyMinorForA11y } from "@/lib/domain/a11yAmount";
import {
  formatCurrencyMinor,
  isQuantityClaimMode,
  perHeadDisplayMinor,
  quantityClaimedCaption,
  fiatMinorFromInteger,
} from "@/lib/domain";
import { MYTAB_COLORS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type WhoHasThisSheetProps = {
  itemName: string;
  lineTotalMinor: number;
  displayCurrency?: string;
  quantity?: number;
  claimedCount?: number;
  monetaryShortfallMinor?: number;
  allocationMode?: string;
  claimants: ClaimantIdentity[];
  claimantQuantities?: Array<{ userId: string; quantity: number }>;
  /** Everyone on the tab who is not already on this item. */
  assignable: ClaimantIdentity[];
  viewerUserId: string;
  isOrganizer: boolean;
  locked: boolean;
  /** The board's tint allocation, so a face is the same colour here as on the row. */
  tints?: ReadonlyMap<string, string>;
  organizerUserId?: string;
  onAssign?: (userId: string) => void;
  onAssignRemaining?: (userIds: string[]) => void;
  onShareEveryone?: () => void;
  onOrganizerCoversRemainder?: () => void;
  onRemoveClaimant?: (userId: string) => void;
  onReassignClaimant?: (sourceUserId: string, targetUserId: string) => void;
  onClose: () => void;
};

/** Exact proportional floor without overflowing the IEEE-754 product. */
export function proportionalMinorFloor(
  lineTotalMinor: number,
  claimedUnits: number,
  allocationUnits: number,
): number {
  if (
    !Number.isSafeInteger(lineTotalMinor) ||
    !Number.isSafeInteger(claimedUnits) ||
    !Number.isSafeInteger(allocationUnits) ||
    lineTotalMinor < 0 ||
    claimedUnits < 0 ||
    allocationUnits <= 0
  ) {
    throw new Error("INVALID_PROPORTIONAL_AMOUNT");
  }
  return Number(
    (BigInt(lineTotalMinor) * BigInt(claimedUnits)) / BigInt(allocationUnits),
  );
}

/**
 * Who has this dish — opened by tapping a row's avatar stack (EXPERIENCE, `claim-row`).
 *
 * It is also the organizer's override surface: the one place a bill owner can hand an
 * orphan dish to someone else without claiming it themselves (FR-C4, Flow 4 step 2).
 * It is informational for everyone else, and stays reachable after lock, because
 * "who had what" is the question a settled bill gets asked most.
 */
export function WhoHasThisSheet({
  itemName,
  lineTotalMinor,
  displayCurrency = "THB",
  quantity,
  claimedCount,
  monetaryShortfallMinor,
  allocationMode,
  claimants,
  claimantQuantities,
  assignable,
  viewerUserId,
  isOrganizer,
  locked,
  tints,
  organizerUserId,
  onAssign,
  onAssignRemaining,
  onShareEveryone,
  onOrganizerCoversRemainder,
  onRemoveClaimant,
  onReassignClaimant,
  onClose,
}: WhoHasThisSheetProps) {
  const perHead =
    claimants.length > 0
      ? perHeadDisplayMinor(fiatMinorFromInteger(lineTotalMinor), claimants.length)
      : fiatMinorFromInteger(lineTotalMinor);
  const quantityByUser = new Map(
    (claimantQuantities ?? []).map((claim) => [claim.userId, claim.quantity]),
  );
  const totalClaimedUnits = claimants.reduce(
    (sum, claimant) => sum + (quantityByUser.get(claimant.userId) ?? 1),
    0,
  );
  // Quantity claims price each claimed unit against the receipt's full n,
  // not against only the units already claimed. Otherwise 1-of-3 briefly
  // displays the whole line under one person's name and hides the remainder.
  const allocationUnits = isQuantityClaimMode(allocationMode, quantity ?? 1)
    ? Math.max(1, quantity ?? 1)
    : Math.max(1, totalClaimedUnits);
  let cumulativeUnits = 0;
  const amountByUser = new Map<string, number>();
  for (const claimant of claimants) {
    const previous = cumulativeUnits;
    cumulativeUnits += quantityByUser.get(claimant.userId) ?? 1;
    const through = proportionalMinorFloor(lineTotalMinor, cumulativeUnits, allocationUnits);
    const before = proportionalMinorFloor(lineTotalMinor, previous, allocationUnits);
    amountByUser.set(claimant.userId, through - before);
  }
  const money = (minor: number) => formatCurrencyMinor(fiatMinorFromInteger(minor), displayCurrency);
  const canOverride = isOrganizer && !locked;
  const [selected, setSelected] = useState<string[]>([]);
  const [reassignTargets, setReassignTargets] = useState<Record<string, string>>({});
  const fallbackPortionShortfall = isQuantityClaimMode(allocationMode, quantity ?? 1)
    ? Math.max(0, (quantity ?? 1) - (claimedCount ?? 0))
    : claimants.length === 0 ? 1 : 0;
  const shortfallMinor = monetaryShortfallMinor ?? (
    fallbackPortionShortfall > 0
      ? proportionalMinorFloor(lineTotalMinor, fallbackPortionShortfall, quantity ?? 1)
      : 0
  );
  const participantById = useMemo(
    () => new Map([...claimants, ...assignable].map((person) => [person.userId, person])),
    [claimants, assignable],
  );
  const everyParticipant = [...participantById.values()];

  return (
    <SheetContainer label={`Who has ${itemName}`} onDismiss={onClose}>
      <div className="mytab-row" style={{ alignItems: "baseline", marginTop: 8 }}>
        <span
          className="mytab-row__label mytab-name"
          style={{ fontSize: MYTAB_TYPOGRAPHY.title.size, fontWeight: 600, letterSpacing: MYTAB_TYPOGRAPHY.title.tracking }}
        >
          {itemName}
        </span>
        <span
          className="mytab-row__amount mytab-tabular"
          data-mytab-amount
          aria-label={formatCurrencyMinorForA11y(fiatMinorFromInteger(lineTotalMinor), displayCurrency)}
          style={{ fontSize: MYTAB_TYPOGRAPHY.amountRow.size, fontWeight: 600 }}
        >
          {money(lineTotalMinor)}
        </span>
      </div>
      <p
        style={{
          margin: "4px 0 18px",
          fontSize: MYTAB_TYPOGRAPHY.meta.size,
          color: claimants.length === 0 ? MYTAB_COLORS.warning : MYTAB_COLORS.inkMuted,
        }}
      >
        {isQuantityClaimMode(allocationMode, quantity ?? 1) && quantity && quantity > 1
          ? claimants.length === 0
            ? "Needs an owner"
            : quantityClaimedCaption(claimedCount ?? claimants.length, quantity)
          : claimants.length === 0
            ? "Needs an owner"
            : claimants.length === 1
              ? "One person has this"
              : `Split ${claimants.length} ways · ${money(perHead)} each`}
      </p>

      {claimants.length > 0 ? (
        <>
          <p className="mytab-type-micro-label" style={{ margin: "0 0 10px" }}>
            Who has this
          </p>
          <ul style={{ listStyle: "none", margin: "0 0 20px", padding: 0 }}>
            {claimants.map((person) => {
              const claimantAmount = amountByUser.get(person.userId) ?? perHead;
              return (
              <li
                key={person.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                  minHeight: 52,
                  padding: "8px 0",
                  borderBottom: `1px solid ${MYTAB_COLORS.border}`,
                }}
              >
                <Avatar participant={person} size={32} tint={tints?.get(person.userId)} />
                <span className="mytab-row__label" style={{ flex: 1, fontSize: MYTAB_TYPOGRAPHY.body.size, fontWeight: 500 }}>
                  {person.userId === viewerUserId ? "You" : person.displayName}
                </span>
                <span
                  className="mytab-row__amount mytab-tabular"
                  data-mytab-amount
                  aria-label={formatCurrencyMinorForA11y(fiatMinorFromInteger(claimantAmount), displayCurrency)}
                  style={{ fontSize: MYTAB_TYPOGRAPHY.amountRow.size, fontWeight: 500, color: MYTAB_COLORS.inkMuted }}
                >
                  {money(claimantAmount)}
                </span>
                {canOverride && onRemoveClaimant ? (
                  <button
                    type="button"
                    className="mytab-link-button"
                    onClick={() => onRemoveClaimant(person.userId)}
                    aria-label={`Remove ${person.displayName} from ${itemName}`}
                  >
                    Remove
                  </button>
                ) : null}
                {canOverride && onReassignClaimant && everyParticipant.length > 1 ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 6, flexBasis: "100%", minWidth: 0 }}>
                    <select
                      aria-label={`Reassign ${person.displayName}`}
                      value={reassignTargets[person.userId] ?? ""}
                      onChange={(event) => setReassignTargets((current) => ({
                        ...current,
                        [person.userId]: event.target.value,
                      }))}
                      style={{ flex: 1, minWidth: 0, minHeight: 40 }}
                    >
                      <option value="">Reassign to…</option>
                      {everyParticipant.filter((candidate) => candidate.userId !== person.userId).map((candidate) => (
                        <option key={candidate.userId} value={candidate.userId}>{candidate.displayName}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="mytab-link-button"
                      disabled={!reassignTargets[person.userId]}
                      onClick={() => onReassignClaimant(person.userId, reassignTargets[person.userId]!)}
                    >
                      Reassign
                    </button>
                  </span>
                ) : null}
              </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p style={{ margin: "0 0 20px", fontSize: MYTAB_TYPOGRAPHY.body.size, color: MYTAB_COLORS.ink }}>
          Nobody has claimed this yet.
        </p>
      )}

      {canOverride && everyParticipant.length > 0 ? (
        <>
          <p className="mytab-type-micro-label" style={{ margin: "0 0 10px" }}>
            Resolve before lock
          </p>
          <p className="mytab-type-meta" style={{ margin: "0 0 10px" }}>
            {shortfallMinor > 0
              ? monetaryShortfallMinor !== undefined
                ? `${money(shortfallMinor)} remains. Existing claims stay unchanged.`
                : `${fallbackPortionShortfall} ${fallbackPortionShortfall === 1 ? "portion remains" : "portions remain"}. Existing claims stay unchanged.`
              : "This item is fully assigned. Removing someone will make the remainder visible again."}
          </p>
          <ul style={{ listStyle: "none", margin: "0 0 20px", padding: 0 }}>
            {everyParticipant.map((person) => (
              <li key={person.userId} style={{ borderBottom: `1px solid ${MYTAB_COLORS.border}` }}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={selected.includes(person.userId)}
                  className="mytab-focus"
                  onClick={() => setSelected((current) =>
                    current.includes(person.userId)
                      ? current.filter((id) => id !== person.userId)
                      : [...current, person.userId]
                  )}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    minHeight: 48,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <Avatar participant={person} size={32} tint={tints?.get(person.userId)} />
                  <span
                    className="mytab-row__label"
                    style={{ flex: 1, fontSize: MYTAB_TYPOGRAPHY.body.size, fontWeight: 500, color: MYTAB_COLORS.ink }}
                  >
                    {person.userId === viewerUserId ? "You" : person.displayName}
                  </span>
                  <span style={{ flex: "none", fontSize: MYTAB_TYPOGRAPHY.label.size, fontWeight: 600, color: MYTAB_COLORS.primary }}>
                    {selected.includes(person.userId) ? "Selected" : "Select"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
            <button
              type="button"
              className="mytab-button-primary"
              disabled={selected.length === 0 || shortfallMinor === 0}
              onClick={() => {
                if (onAssignRemaining) onAssignRemaining(selected);
                else if (selected[0]) onAssign?.(selected[0]);
              }}
            >
              Assign remaining to selected
            </button>
            {organizerUserId && shortfallMinor > 0 && onOrganizerCoversRemainder ? (
              <button type="button" className="mytab-button-secondary" onClick={onOrganizerCoversRemainder}>
                Organizer covers remainder
              </button>
            ) : null}
            {onShareEveryone ? (
              <button type="button" className="mytab-button-secondary" onClick={onShareEveryone}>
                Share with everyone
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      <button type="button" className="mytab-button-secondary" onClick={onClose}>
        Done
      </button>
    </SheetContainer>
  );
}
