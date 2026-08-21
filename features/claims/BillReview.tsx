"use client";

import { useState } from "react";
import { AmountPair } from "@/components/primitives/amount-pair";
import { formatFiatMinorThb, thbMinorFromInteger } from "@/lib/domain";
import { MYTAB_COLORS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";
import type { ClaimBoardParticipant } from "./ClaimBoard";

export type BillReviewBreakdown = {
  participantId: string;
  displayName: string;
  itemShareMinor: number;
  taxMinor: number;
  serviceMinor: number;
  tipMinor: number;
  discountMinor: number;
  roundingMinor: number;
  totalMinor: number;
};

export type BillReviewProps = {
  tabName: string;
  isOrganizer: boolean;
  isLocked: boolean;
  billTotalMinor: number;
  reconciles: boolean;
  organizerDisplayName: string;
  breakdowns: BillReviewBreakdown[];
  onLock?: () => void;
  onSettle?: () => void;
};

/**
 * Read-only bill review for every participant (Story 5.8).
 */
export function BillReview({
  tabName,
  isOrganizer,
  isLocked,
  billTotalMinor,
  reconciles,
  organizerDisplayName,
  breakdowns,
  onLock,
  onSettle,
}: BillReviewProps) {
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});

  const action = isOrganizer
    ? { label: "Lock bill", disabled: !reconciles || isLocked, onClick: onLock }
    : {
        label: "Settle up",
        disabled: !isLocked,
        reason: isLocked ? undefined : `Waiting on ${organizerDisplayName} to lock`,
        onClick: onSettle,
      };

  return (
    <div style={{ padding: 16, background: MYTAB_COLORS.paper, minHeight: "100%" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: MYTAB_TYPOGRAPHY.title.size, fontWeight: 600 }}>
        {tabName}
      </h1>
      <p style={{ margin: "0 0 16px", color: MYTAB_COLORS.inkMuted, fontSize: MYTAB_TYPOGRAPHY.meta.size }}>
        Bill review — read only
      </p>

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {breakdowns.map((row) => {
          const open = openRows[row.participantId] ?? false;
          return (
            <li
              key={row.participantId}
              style={{
                background: MYTAB_COLORS.surface,
                border: `1px solid ${MYTAB_COLORS.border}`,
                borderRadius: 12,
                marginBottom: 12,
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setOpenRows((current) => ({
                    ...current,
                    [row.participantId]: !open,
                  }))
                }
                style={{
                  width: "100%",
                  minHeight: 44,
                  padding: "14px 16px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <AmountPair
                  label={row.displayName}
                  amount={formatFiatMinorThb(thbMinorFromInteger(row.totalMinor))}
                />
              </button>
              {open ? (
                <div style={{ padding: "0 16px 14px 24px", display: "grid", gap: 8 }}>
                  <AmountPair
                    label="Items"
                    amount={formatFiatMinorThb(thbMinorFromInteger(row.itemShareMinor))}
                    muted
                  />
                  {row.serviceMinor > 0 ? (
                    <AmountPair
                      label="Service"
                      amount={formatFiatMinorThb(thbMinorFromInteger(row.serviceMinor))}
                      muted
                    />
                  ) : null}
                  {row.taxMinor > 0 ? (
                    <AmountPair
                      label="Tax"
                      amount={formatFiatMinorThb(thbMinorFromInteger(row.taxMinor))}
                      muted
                    />
                  ) : null}
                  {row.tipMinor > 0 ? (
                    <AmountPair
                      label="Tip"
                      amount={formatFiatMinorThb(thbMinorFromInteger(row.tipMinor))}
                      muted
                    />
                  ) : null}
                  {row.discountMinor > 0 ? (
                    <AmountPair
                      label="Discount"
                      amount={`−${formatFiatMinorThb(thbMinorFromInteger(row.discountMinor))}`}
                      muted
                    />
                  ) : null}
                  {row.roundingMinor > 0 ? (
                    <AmountPair
                      label="Rounding"
                      amount={`+${formatFiatMinorThb(thbMinorFromInteger(row.roundingMinor))}`}
                      muted
                    />
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p
        style={{
          margin: "16px 0",
          color: reconciles ? MYTAB_COLORS.settled : MYTAB_COLORS.owed,
          fontSize: MYTAB_TYPOGRAPHY.body.size,
        }}
      >
        {reconciles
          ? `Everyone's shares add up to ${formatFiatMinorThb(thbMinorFromInteger(billTotalMinor))} ✓`
          : "Shares do not reconcile — lock is blocked"}
      </p>

      <button
        type="button"
        disabled={action.disabled}
        onClick={action.onClick}
        style={{
          width: "100%",
          minHeight: 44,
          border: "none",
          borderRadius: 10,
          background: action.disabled ? MYTAB_COLORS.border : MYTAB_COLORS.primary,
          color: action.disabled ? MYTAB_COLORS.inkMuted : "#fff",
          fontWeight: 600,
          cursor: action.disabled ? "default" : "pointer",
        }}
      >
        {action.label}
      </button>
      {"reason" in action && action.reason ? (
        <p style={{ margin: "8px 0 0", fontSize: MYTAB_TYPOGRAPHY.meta.size, color: MYTAB_COLORS.inkMuted }}>
          {action.reason}
        </p>
      ) : null}
    </div>
  );
}

export const FIXTURE_BILL_REVIEW: BillReviewProps = {
  tabName: "Sukhumvit Dinner",
  isOrganizer: false,
  isLocked: false,
  billTotalMinor: 184000,
  reconciles: true,
  organizerDisplayName: "Maya",
  breakdowns: [
    {
      participantId: "user_maya",
      displayName: "Maya",
      itemShareMinor: 90000,
      taxMinor: 6300,
      serviceMinor: 4500,
      tipMinor: 0,
      discountMinor: 0,
      roundingMinor: 0,
      totalMinor: 100800,
    },
    {
      participantId: "user_bo",
      displayName: "Bo",
      itemShareMinor: 83200,
      taxMinor: 5800,
      serviceMinor: 4200,
      tipMinor: 0,
      discountMinor: 0,
      roundingMinor: 100,
      totalMinor: 93300,
    },
  ],
};
