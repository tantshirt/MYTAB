"use client";

import { useState, type CSSProperties } from "react";
import { Avatar } from "@/components/claim-row";
import { AmountPair } from "@/components/primitives/amount-pair";
import { BreakdownRow } from "@/components/breakdown-row";
import { StickyFooter } from "@/components/sticky-claim-footer";
import { useReducedMotion } from "@/components/primitives/use-reduced-motion";
import { AlertTriangleIcon, CheckIcon, ChevronRightIcon } from "@/components/icons";
import { useHaptics } from "@/features/telegram/useHaptics";
import { formatThbMinorForA11y } from "@/lib/domain/a11yAmount";
import { formatFiatMinorThb, thbMinorFromInteger } from "@/lib/domain";
import {
  avatarTintsForGroup,
  MYTAB_COLORS,
  MYTAB_ELEVATION,
  MYTAB_LAYOUT,
  MYTAB_RADIUS,
  MYTAB_TYPOGRAPHY,
} from "@/lib/theme/tokens";

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
  viewerUserId?: string;
  billTotalMinor: number;
  reconciles: boolean;
  organizerDisplayName: string;
  breakdowns: BillReviewBreakdown[];
  /** Rendered into the shared-charge labels: "Service charge 10%", "VAT 7%". */
  servicePercent?: number;
  taxPercent?: number;
  /** The bill moved under this viewer; the breakdown they are reading is superseded. */
  isStale?: boolean;
  onLock?: () => void;
  onSettle?: () => void;
  onBack?: () => void;
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
  minor: number;
  tone: "muted" | "warning";
};

export type BillReviewRates = {
  servicePercent?: number;
  taxPercent?: number;
};

const serviceLabel = (rates: BillReviewRates) =>
  rates.servicePercent === undefined ? "Service charge" : `Service charge ${rates.servicePercent}%`;
const taxLabel = (rates: BillReviewRates) =>
  rates.taxPercent === undefined ? "VAT" : `VAT ${rates.taxPercent}%`;

/**
 * Every non-zero component of a person's share, signed, so the visible lines always
 * add up to the total shown above them. Hiding a −฿0.01 is precisely the silent
 * asymmetry the Money Legibility section exists to prevent (FR-M4, FR-M5).
 */
export function buildBillReviewLines(
  row: BillReviewBreakdown,
  rates: BillReviewRates = {},
): BillReviewLine[] {
  const lines: BillReviewLine[] = [
    {
      key: "items",
      label: "Items",
      amount: fmtPlain(row.itemShareMinor),
      minor: row.itemShareMinor,
      tone: "muted",
    },
  ];

  if (row.serviceMinor !== 0) {
    lines.push({
      key: "service",
      label: serviceLabel(rates),
      amount: fmtPlain(row.serviceMinor),
      minor: row.serviceMinor,
      tone: "muted",
    });
  }
  if (row.taxMinor !== 0) {
    lines.push({
      key: "tax",
      label: taxLabel(rates),
      amount: fmtPlain(row.taxMinor),
      minor: row.taxMinor,
      tone: "muted",
    });
  }
  if (row.tipMinor !== 0) {
    lines.push({
      key: "tip",
      label: "Group tip",
      amount: fmtPlain(row.tipMinor),
      minor: row.tipMinor,
      tone: "muted",
    });
  }
  // A discount reduces the share, so a positive `discountMinor` reads as a minus.
  if (row.discountMinor !== 0) {
    lines.push({
      key: "discount",
      label: "Discount",
      amount: fmtSigned(-row.discountMinor),
      minor: -row.discountMinor,
      tone: "muted",
    });
  }
  if (row.roundingMinor !== 0) {
    lines.push({
      key: "rounding",
      label: "Rounding",
      amount: fmtSigned(row.roundingMinor),
      minor: row.roundingMinor,
      tone: "warning",
    });
  }

  return lines;
}

export type BillTotalsLine = {
  key: string;
  label: string;
  /** The one word that explains the whole allocation model. */
  annotation?: string;
  amount: string;
};

/**
 * "Applied to everyone" — the bill-level block, summed from the same per-person
 * numbers shown above it, so the two halves of the surface can never disagree
 * (§1.7, Flow 4). Every shared charge is annotated `proportional`.
 */
export function buildBillTotalsLines(
  breakdowns: BillReviewBreakdown[],
  rates: BillReviewRates = {},
): BillTotalsLine[] {
  const sum = (pick: (row: BillReviewBreakdown) => number) =>
    breakdowns.reduce((total, row) => total + pick(row), 0);

  const lines: BillTotalsLine[] = [
    { key: "subtotal", label: "Subtotal", amount: fmtPlain(sum((row) => row.itemShareMinor)) },
  ];

  const service = sum((row) => row.serviceMinor);
  if (service !== 0) {
    lines.push({
      key: "service",
      label: serviceLabel(rates),
      annotation: "proportional",
      amount: fmtPlain(service),
    });
  }
  const tax = sum((row) => row.taxMinor);
  if (tax !== 0) {
    lines.push({ key: "tax", label: taxLabel(rates), annotation: "proportional", amount: fmtPlain(tax) });
  }
  const tip = sum((row) => row.tipMinor);
  if (tip !== 0) {
    lines.push({ key: "tip", label: "Group tip", annotation: "proportional", amount: fmtPlain(tip) });
  }
  const discount = sum((row) => row.discountMinor);
  if (discount !== 0) {
    lines.push({ key: "discount", label: "Discount", amount: fmtSigned(-discount) });
  }
  const rounding = sum((row) => row.roundingMinor);
  if (rounding !== 0) {
    lines.push({ key: "rounding", label: "Rounding", amount: fmtSigned(rounding) });
  }

  return lines;
}

/** Rounding is disclosed in `colors/warning`, never folded into another line. */
function BreakdownLine({ line }: { line: BillReviewLine }) {
  return (
    <BreakdownRow
      label={line.label}
      amount={line.amount}
      size="meta"
      muted
      amountColor={line.tone === "warning" ? MYTAB_COLORS.warning : undefined}
      amountA11yLabel={formatThbMinorForA11y(thbMinorFromInteger(line.minor))}
    />
  );
}

const MICRO_LABEL: CSSProperties = { margin: "0 0 10px" };

/**
 * Bill Review — read-only for every participant; the organizer is the only one who can
 * act on it (EXPERIENCE, Component Patterns). One card of hairline-separated person
 * rows, never one rounded card each: "Lists are separated by `colors/border` hairlines
 * inside one card" (DESIGN.md).
 */
export function BillReview({
  tabName,
  isOrganizer,
  isLocked,
  viewerUserId,
  billTotalMinor,
  reconciles,
  organizerDisplayName,
  breakdowns,
  servicePercent,
  taxPercent,
  isStale = false,
  onLock,
  onSettle,
  onBack,
}: BillReviewProps) {
  const reducedMotion = useReducedMotion();
  const haptics = useHaptics();
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});

  // Five people down one card: the set-aware allocator, not the per-id hash (§2.6).
  const tints = avatarTintsForGroup(breakdowns.map((row) => row.participantId));

  const rates: BillReviewRates = { servicePercent, taxPercent };
  const billTotalLabel = formatFiatMinorThb(thbMinorFromInteger(billTotalMinor));
  // FR-M6: when reconciliation fails the shortfall is named exactly. "Do not reconcile"
  // tells the organizer nothing they can act on.
  const sharesTotalMinor = breakdowns.reduce((sum, row) => sum + row.totalMinor, 0);
  const shortfallMinor = billTotalMinor - sharesTotalMinor;
  const reconciliationMessage = reconciles
    ? `Everyone's shares add up to ${billTotalLabel}`
    : shortfallMinor > 0
      ? `Shares are ${fmtAbs(shortfallMinor)} short of ${billTotalLabel}. Lock is blocked.`
      : shortfallMinor < 0
        ? `Shares are ${fmtAbs(shortfallMinor)} over ${billTotalLabel}. Lock is blocked.`
        : `Shares don't add up to ${billTotalLabel}. Lock is blocked.`;

  const action = isOrganizer
    ? {
        label: "Lock bill",
        disabled: !reconciles || isLocked,
        onClick: () => {
          // On accepting the lock, once. The note beneath the button is the confirmation
          // copy, so the tap is the acceptance (§2.8).
          haptics.billLocked();
          onLock?.();
        },
        // The sentence that makes lock feel deliberate.
        note: "Locking creates each person's final amount. Editing after this needs a reopen.",
      }
    : {
        label: "Settle up",
        disabled: !isLocked,
        onClick: onSettle,
        note: isLocked
          ? `${organizerDisplayName} locked this bill. Your amount is final.`
          : `Waiting on ${organizerDisplayName} to lock.`,
      };

  const peopleLabel = `${breakdowns.length} ${breakdowns.length === 1 ? "person" : "people"}`;

  return (
    <div
      style={{
        // AppShell gutters its children; the card and the pinned bar bleed back out.
        marginLeft: `calc(-1 * ${MYTAB_LAYOUT.gutter})`,
        marginRight: `calc(-1 * ${MYTAB_LAYOUT.gutter})`,
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        background: MYTAB_COLORS.paper,
      }}
    >
      <header style={{ padding: `${MYTAB_LAYOUT.gutter} ${MYTAB_LAYOUT.gutter} 14px` }}>
        <h1
          style={{
            margin: 0,
            fontSize: MYTAB_TYPOGRAPHY.title.size,
            fontWeight: 600,
            letterSpacing: MYTAB_TYPOGRAPHY.title.tracking,
          }}
        >
          Review bill
        </h1>
        {/* Read-only-ness is expressed by the absence of edit affordances, not a caption. */}
        <p
          className="mytab-row__label"
          style={{ margin: "1px 0 0", color: MYTAB_COLORS.inkMuted, fontSize: MYTAB_TYPOGRAPHY.meta.size }}
        >
          {tabName} · {peopleLabel}
        </p>
      </header>

      <div style={{ flex: 1, padding: `0 ${MYTAB_LAYOUT.gutter} 190px` }}>
        {breakdowns.length === 0 ? (
          <section className="mytab-card" style={{ padding: "24px 20px" }}>
            <p className="mytab-type-body" style={{ margin: "0 0 16px", color: MYTAB_COLORS.ink }}>
              Nobody has claimed anything yet.
            </p>
            <button type="button" className="mytab-button-secondary" onClick={onBack}>
              Back to the tab
            </button>
          </section>
        ) : (
          <>
            <p className="mytab-type-micro-label" style={MICRO_LABEL}>
              Who owes what
            </p>
            <ul
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
              {breakdowns.map((row, index) => {
                const open = openRows[row.participantId] ?? false;
                const isViewer = viewerUserId !== undefined && row.participantId === viewerUserId;
                // The viewer finds themselves without reading.
                const background = isViewer ? MYTAB_COLORS.primarySoft : MYTAB_COLORS.surface;

                return (
                  <li
                    key={row.participantId}
                    style={{
                      background,
                      borderBottom:
                        index === breakdowns.length - 1
                          ? undefined
                          : `1px solid ${MYTAB_COLORS.border}`,
                    }}
                  >
                    <button
                      type="button"
                      className="mytab-focus"
                      aria-expanded={open}
                      onClick={() =>
                        setOpenRows((current) => ({ ...current, [row.participantId]: !open }))
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        width: "100%",
                        minHeight: 44,
                        padding: "14px 16px",
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <Avatar
                        participant={{ userId: row.participantId, displayName: row.displayName }}
                        size={32}
                        tint={tints.get(row.participantId)}
                      />
                      <span
                        className="mytab-row__label mytab-name"
                        style={{ flex: 1, fontSize: MYTAB_TYPOGRAPHY.body.size, fontWeight: 500 }}
                      >
                        {isViewer ? `${row.displayName} · you` : row.displayName}
                      </span>
                      <span
                        className="mytab-row__amount mytab-tabular"
                        data-mytab-amount
                        aria-label={formatThbMinorForA11y(thbMinorFromInteger(row.totalMinor))}
                        style={{ fontSize: MYTAB_TYPOGRAPHY.amountRow.size, fontWeight: 600 }}
                      >
                        {formatFiatMinorThb(thbMinorFromInteger(row.totalMinor))}
                      </span>
                      <span
                        aria-hidden
                        style={{
                          flex: "none",
                          display: "inline-flex",
                          color: MYTAB_COLORS.inkMuted,
                          transform: open ? "rotate(90deg)" : "rotate(0deg)",
                          transition: reducedMotion ? "none" : "transform 140ms ease",
                        }}
                      >
                        <ChevronRightIcon size={16} />
                      </span>
                    </button>

                    {open ? (
                      <div
                        style={{
                          padding: "4px 16px 16px 60px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        {buildBillReviewLines(row, rates).map((line) => (
                          <BreakdownLine key={line.key} line={line} />
                        ))}
                        <AmountPair
                          label="Their share"
                          size="meta"
                          amount={formatFiatMinorThb(thbMinorFromInteger(row.totalMinor))}
                          amountA11yLabel={formatThbMinorForA11y(thbMinorFromInteger(row.totalMinor))}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <p className="mytab-type-micro-label" style={{ margin: "26px 0 10px" }}>
              Applied to everyone
            </p>
            <section
              className="mytab-card"
              style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 13 }}
            >
              {buildBillTotalsLines(breakdowns, rates).map((line) => (
                <BreakdownRow
                  key={line.key}
                  label={line.label}
                  annotation={line.annotation}
                  amount={line.amount}
                  fontSize="14px"
                  weight={400}
                  amountWeight={500}
                />
              ))}
              <BreakdownRow
                label="Total"
                amount={billTotalLabel}
                amountA11yLabel={formatThbMinorForA11y(thbMinorFromInteger(billTotalMinor))}
                weight={600}
                style={{
                  borderTop: `1px solid ${MYTAB_COLORS.border}`,
                  paddingTop: 13,
                }}
              />
            </section>

            {/* Semantic colour never travels alone: the check carries the same meaning. */}
            <p
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                margin: "18px 0 0",
                padding: "0 4px",
                fontSize: "14px",
                fontWeight: 500,
                lineHeight: 1.45,
                color: reconciles ? MYTAB_COLORS.settled : MYTAB_COLORS.owed,
              }}
            >
              <span aria-hidden style={{ flex: "none", display: "inline-flex" }}>
                {reconciles ? <CheckIcon size={18} strokeWidth={2.4} /> : <AlertTriangleIcon size={18} />}
              </span>
              <span>{reconciliationMessage}</span>
            </p>
          </>
        )}
      </div>

      <StickyFooter
        notice={isStale ? "That changed a moment ago." : undefined}
        noticeGap={10}
        paddingTop={14}
      >
        <button
          type="button"
          className="mytab-button-primary"
          disabled={action.disabled}
          onClick={action.onClick}
          style={{ minHeight: 52 }}
        >
          <span className="mytab-row__label">{action.label}</span>
        </button>
        <p
          style={{
            margin: "10px 0 0",
            textAlign: "center",
            lineHeight: 1.45,
            fontSize: MYTAB_TYPOGRAPHY.meta.size,
            color: MYTAB_COLORS.inkMuted,
          }}
        >
          {action.note}
        </p>
      </StickyFooter>
    </div>
  );
}
