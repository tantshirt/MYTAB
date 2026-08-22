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

const fmtAbs = (minor: number) => formatFiatMinorThb(thbMinorFromInteger(Math.abs(minor)));

/** Unsigned unless the value is negative, in which case the minus is shown. */
const fmtPlain = (minor: number) => (minor < 0 ? `−${fmtAbs(minor)}` : fmtAbs(minor));

/** Always carries its sign — rounding and discount lines must read as adjustments. */
const fmtSigned = (minor: number) => `${minor < 0 ? "−" : "+"}${fmtAbs(minor)}`;

export type BillReviewLine = {
  key: string;
  label: string;
  amount: string;
  tone: "muted" | "warning";
};

/**
 * Every non-zero component of a person's share, signed, so the visible lines always
 * add up to the total shown above them. Hiding a −฿0.01 is precisely the silent
 * asymmetry the Money Legibility section exists to prevent (FR-M4, FR-M5).
 */
export function buildBillReviewLines(row: BillReviewBreakdown): BillReviewLine[] {
  const lines: BillReviewLine[] = [
    { key: "items", label: "Items", amount: fmtPlain(row.itemShareMinor), tone: "muted" },
  ];

  if (row.serviceMinor !== 0) {
    lines.push({ key: "service", label: "Service", amount: fmtPlain(row.serviceMinor), tone: "muted" });
  }
  if (row.taxMinor !== 0) {
    lines.push({ key: "tax", label: "Tax", amount: fmtPlain(row.taxMinor), tone: "muted" });
  }
  if (row.tipMinor !== 0) {
    lines.push({ key: "tip", label: "Tip", amount: fmtPlain(row.tipMinor), tone: "muted" });
  }
  // A discount reduces the share, so a positive `discountMinor` reads as a minus.
  if (row.discountMinor !== 0) {
    lines.push({
      key: "discount",
      label: "Discount",
      amount: fmtSigned(-row.discountMinor),
      tone: "muted",
    });
  }
  if (row.roundingMinor !== 0) {
    lines.push({
      key: "rounding",
      label: "Rounding",
      amount: fmtSigned(row.roundingMinor),
      tone: "warning",
    });
  }

  return lines;
}

/** Rounding is disclosed in `colors/warning`, never folded into another line. */
function BreakdownLine({ line }: { line: BillReviewLine }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        fontSize: MYTAB_TYPOGRAPHY.amountRow.size,
        fontWeight: MYTAB_TYPOGRAPHY.amountRow.weight,
        color: line.tone === "warning" ? MYTAB_COLORS.warning : MYTAB_COLORS.inkMuted,
      }}
    >
      <span>{line.label}</span>
      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          fontFeatureSettings: '"tnum"',
          textAlign: "right",
        }}
      >
        {line.amount}
      </span>
    </div>
  );
}

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

  const billTotalLabel = formatFiatMinorThb(thbMinorFromInteger(billTotalMinor));
  // FR-M6: when reconciliation fails the shortfall is named exactly. "Do not reconcile"
  // tells the organizer nothing they can act on.
  const sharesTotalMinor = breakdowns.reduce((sum, row) => sum + row.totalMinor, 0);
  const shortfallMinor = billTotalMinor - sharesTotalMinor;
  const reconciliationMessage = reconciles
    ? `Everyone's shares add up to ${billTotalLabel} ✓`
    : shortfallMinor > 0
      ? `Shares are ${fmtAbs(shortfallMinor)} short of ${billTotalLabel}. Lock is blocked.`
      : shortfallMinor < 0
        ? `Shares are ${fmtAbs(shortfallMinor)} over ${billTotalLabel}. Lock is blocked.`
        : `Shares don't add up to ${billTotalLabel}. Lock is blocked.`;

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
                  {buildBillReviewLines(row).map((line) => (
                    <BreakdownLine key={line.key} line={line} />
                  ))}
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
        {reconciliationMessage}
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

/*
 * The canonical demo fixture from DESIGN.md: Sukhumvit Dinner, five people,
 * ฿1,840.00 total, Andre owing ฿291.74 (240.00 + 24.00 + 18.48 + 9.25 + 0.01).
 *
 * Service is 10% of items; tax is 7% of (items + service); the group tip is a
 * flat ฿9.25 a head. Largest-remainder allocation hands Andre the spare satang
 * and takes it from Tim — which is exactly the asymmetry EXPERIENCE.md requires
 * be disclosed rather than hidden, so this fixture also exercises the negative
 * rounding line.
 *
 * The five totals sum to 184000 exactly. The previous fixture declared
 * `reconciles: true` while its two rows summed to 194100 — ฿101 over the bill.
 */
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
      itemShareMinor: 38400,
      serviceMinor: 3840,
      taxMinor: 2957,
      tipMinor: 925,
      discountMinor: 0,
      roundingMinor: 0,
      totalMinor: 46122,
    },
    {
      participantId: "user_noi",
      displayName: "Noi",
      itemShareMinor: 31200,
      serviceMinor: 3120,
      taxMinor: 2402,
      tipMinor: 925,
      discountMinor: 0,
      roundingMinor: 0,
      totalMinor: 37647,
    },
    {
      participantId: "user_ploy",
      displayName: "Ploy",
      itemShareMinor: 30000,
      serviceMinor: 3000,
      taxMinor: 2310,
      tipMinor: 925,
      discountMinor: 0,
      roundingMinor: 0,
      totalMinor: 36235,
    },
    {
      participantId: "user_tim",
      displayName: "Tim",
      itemShareMinor: 28800,
      serviceMinor: 2880,
      taxMinor: 2218,
      tipMinor: 925,
      discountMinor: 0,
      roundingMinor: -1,
      totalMinor: 34822,
    },
    {
      participantId: "user_andre",
      displayName: "Andre",
      itemShareMinor: 24000,
      serviceMinor: 2400,
      taxMinor: 1848,
      tipMinor: 925,
      discountMinor: 0,
      roundingMinor: 1,
      totalMinor: 29174,
    },
  ],
};
