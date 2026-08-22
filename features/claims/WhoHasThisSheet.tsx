"use client";

import { Avatar, type ClaimantIdentity } from "@/components/claim-row";
import { SheetContainer } from "@/components/settlement-sheet/SheetContainer";
import { formatThbMinorForA11y } from "@/lib/domain/a11yAmount";
import { formatFiatMinorThb, perHeadDisplayMinor, thbMinorFromInteger } from "@/lib/domain";
import { MYTAB_COLORS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type WhoHasThisSheetProps = {
  itemName: string;
  lineTotalMinor: number;
  claimants: ClaimantIdentity[];
  /** Everyone on the tab who is not already on this item. */
  assignable: ClaimantIdentity[];
  viewerUserId: string;
  isOrganizer: boolean;
  locked: boolean;
  /** The board's tint allocation, so a face is the same colour here as on the row. */
  tints?: ReadonlyMap<string, string>;
  onAssign?: (userId: string) => void;
  onClose: () => void;
};

const baht = (minor: number) => formatFiatMinorThb(thbMinorFromInteger(minor));

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
  claimants,
  assignable,
  viewerUserId,
  isOrganizer,
  locked,
  tints,
  onAssign,
  onClose,
}: WhoHasThisSheetProps) {
  const perHead =
    claimants.length > 0
      ? perHeadDisplayMinor(thbMinorFromInteger(lineTotalMinor), claimants.length)
      : thbMinorFromInteger(lineTotalMinor);
  const canOverride = isOrganizer && !locked && assignable.length > 0 && Boolean(onAssign);

  return (
    <SheetContainer label={`Who has ${itemName}`} onDismiss={onClose}>
      <div className="mytab-row" style={{ alignItems: "baseline", marginTop: 8 }}>
        <span
          className="mytab-row__label"
          style={{ fontSize: MYTAB_TYPOGRAPHY.title.size, fontWeight: 600, letterSpacing: MYTAB_TYPOGRAPHY.title.tracking }}
        >
          {itemName}
        </span>
        <span
          className="mytab-row__amount mytab-tabular"
          data-mytab-amount
          aria-label={formatThbMinorForA11y(thbMinorFromInteger(lineTotalMinor))}
          style={{ fontSize: MYTAB_TYPOGRAPHY.amountRow.size, fontWeight: 600 }}
        >
          {baht(lineTotalMinor)}
        </span>
      </div>
      <p
        style={{
          margin: "4px 0 18px",
          fontSize: MYTAB_TYPOGRAPHY.meta.size,
          color: claimants.length === 0 ? MYTAB_COLORS.warning : MYTAB_COLORS.inkMuted,
        }}
      >
        {claimants.length === 0
          ? "Needs an owner"
          : claimants.length === 1
            ? "One person has this"
            : `Split ${claimants.length} ways · ${baht(perHead)} each`}
      </p>

      {claimants.length > 0 ? (
        <>
          <p className="mytab-type-micro-label" style={{ margin: "0 0 10px" }}>
            Who has this
          </p>
          <ul style={{ listStyle: "none", margin: "0 0 20px", padding: 0 }}>
            {claimants.map((person) => (
              <li
                key={person.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  minHeight: 44,
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
                  aria-label={formatThbMinorForA11y(perHead)}
                  style={{ fontSize: MYTAB_TYPOGRAPHY.amountRow.size, fontWeight: 500, color: MYTAB_COLORS.inkMuted }}
                >
                  {baht(perHead)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p style={{ margin: "0 0 20px", fontSize: MYTAB_TYPOGRAPHY.body.size, color: MYTAB_COLORS.ink }}>
          Nobody has claimed this yet.
        </p>
      )}

      {canOverride ? (
        <>
          <p className="mytab-type-micro-label" style={{ margin: "0 0 10px" }}>
            Assign to
          </p>
          <ul style={{ listStyle: "none", margin: "0 0 20px", padding: 0 }}>
            {assignable.map((person) => (
              <li key={person.userId} style={{ borderBottom: `1px solid ${MYTAB_COLORS.border}` }}>
                <button
                  type="button"
                  className="mytab-focus"
                  onClick={() => onAssign?.(person.userId)}
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
                    Assign
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <button type="button" className="mytab-button-secondary" onClick={onClose}>
        Done
      </button>
    </SheetContainer>
  );
}
