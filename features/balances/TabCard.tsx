"use client";

import Link from "next/link";
import { formatAmountLabelForA11y } from "@/lib/domain/a11yAmount";
import { MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";

export type TabCardProps = {
  tabId: string;
  name: string;
  /** Raw status from the data layer — "open" / "locked" / "draft". */
  status: string;
  settledCount: number;
  totalCount: number;
  submittedCount?: number;
  href: string;
  /** People on the tab, for the "5 people" half of the sub-line. */
  peopleCount?: number;
  /** Bill total, e.g. "฿1,840.00". Joins the status and the people count. */
  totalLabel?: string;
  /** The viewer's own position on this tab, right-aligned in the amount column. */
  amountLabel?: string;
  amountA11yLabel?: string;
  /** Which state colour the amount carries. Never colour alone — the sub-line says the word. */
  amountTone?: "owed" | "settled" | "neutral";
};

/**
 * Status as a word, not a database value.
 *
 * `TabCard` used to render `status` straight through, so the card read "open"
 * in lower case next to title case everywhere else (POLISH-SPEC §1.2).
 */
export function formatTabStatus(status: string, totalLabel?: string): string {
  const label =
    status === "locked"
      ? "Locked"
      : status === "open" || status === "draft"
        ? "Open"
        : status.charAt(0).toUpperCase() + status.slice(1);
  return totalLabel ? `${label} · ${totalLabel}` : label;
}

const AMOUNT_COLOR = {
  owed: MYTAB_COLORS.owed,
  settled: MYTAB_COLORS.settled,
  neutral: MYTAB_COLORS.ink,
} as const;

/** Open tab card — whole surface is one tap target (Story 7.2 AC3). */
export function TabCard({
  name,
  status,
  settledCount,
  totalCount,
  submittedCount = 0,
  href,
  peopleCount,
  totalLabel,
  amountLabel,
  amountA11yLabel,
  amountTone = "neutral",
}: TabCardProps) {
  const progress = totalCount > 0 ? settledCount / totalCount : 0;

  const metaParts = [
    peopleCount !== undefined
      ? `${peopleCount} ${peopleCount === 1 ? "person" : "people"}`
      : null,
    formatTabStatus(status, totalLabel),
    submittedCount > 0 ? `${submittedCount} submitted (not counted)` : null,
  ].filter(Boolean);

  return (
    <Link
      href={href}
      className="mytab-card"
      aria-label={`${name}, ${settledCount} of ${totalCount} settled`}
      style={{
        display: "block",
        padding: "20px",
        textDecoration: "none",
        color: "inherit",
        minHeight: "44px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          columnGap: "12px",
          alignItems: "start",
        }}
      >
        <span style={{ minWidth: 0 }}>
          {/* `body` semibold, per DESIGN.md — this was `mytab-type-label`, which
              is the 13px scale and made the title quieter than its sub-line. */}
          <span
            className="mytab-row__label"
            style={{
              display: "block",
              fontSize: "16px",
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            {name}
          </span>
          <span
            className="mytab-type-meta"
            style={{ display: "block", marginTop: "4px" }}
          >
            {metaParts.join(" · ")}
          </span>
        </span>

        {amountLabel ? (
          <span
            className="mytab-type-amount-row mytab-tabular mytab-row__amount"
            data-mytab-amount
            aria-label={amountA11yLabel ?? formatAmountLabelForA11y(amountLabel)}
            style={{ color: AMOUNT_COLOR[amountTone], fontWeight: 600 }}
          >
            {amountLabel}
          </span>
        ) : (
          <span />
        )}
      </div>

      <div
        role="progressbar"
        aria-valuenow={settledCount}
        aria-valuemin={0}
        aria-valuemax={totalCount}
        aria-label={`${settledCount} of ${totalCount} obligations confirmed settled`}
        style={{
          marginTop: "16px",
          height: "4px",
          borderRadius: MYTAB_RADIUS.full,
          background: MYTAB_COLORS.border,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.round(progress * 100)}%`,
            height: "100%",
            background: MYTAB_COLORS.settled,
            transition: "none",
          }}
        />
      </div>
      <p className="mytab-type-meta" style={{ margin: "8px 0 0" }}>
        {settledCount} of {totalCount} settled
      </p>
    </Link>
  );
}
