"use client";

import Link from "next/link";
import { STATE_COPY } from "@/components/primitives/state-copy";
import { settleSearch } from "@/features/settlement/SettleSheetHost";
import { avatarTintForUserId, MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";
import { monogram } from "./monogram";
import type { OweRow } from "@/features/balances/useOweData";

export const OWE_COPY = {
  title: "What you owe",
  /**
   * The empty state is the good news, so it says the good news. "No results"
   * would be a report about a query; this is a report about the person.
   */
  emptyHeadline: "You're square.",
  emptyBody: "Nothing outstanding. When you join a tab, your share shows up here.",
  errorBody: "Couldn't load what you owe.",
  /** One row's sub-line pairs the tab with the person fronting it. */
  onTab: (tabName: string, creditor: string) => `${tabName} · to ${creditor}`,
  /** §superseded — the bill moved under a locked share. Never a blanked figure. */
  stale: "This bill changed. Open it to see the new share.",
} as const;

export type OweSurfaceProps = {
  status: "loading" | "ready" | "error";
  rows: OweRow[];
  retry: () => void;
};

/**
 * One debt.
 *
 * The whole row is the target and it opens the Payment Sheet in place —
 * `?settle=<obligationId>` is the sheet's only key, and `SettleSheetHost`
 * mounts on this route, so paying never leaves the list (§1.0: the sheet is a
 * sheet, not a route).
 *
 * The amount column is reserved, not content-sized: the name truncates and the
 * figure never does.
 */
function OweRowLink({ row }: { row: OweRow }) {
  return (
    <Link
      href={settleSearch(row.obligationId)}
      style={{
        display: "grid",
        gridTemplateColumns: "32px minmax(0, 1fr) auto",
        columnGap: "12px",
        alignItems: "center",
        padding: "14px 16px",
        minHeight: "56px",
        textDecoration: "none",
        color: MYTAB_COLORS.ink,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 32,
          height: 32,
          flex: "none",
          borderRadius: MYTAB_RADIUS.full,
          background: avatarTintForUserId(row.creditorUserId),
          color: MYTAB_COLORS.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "13px",
          fontWeight: 600,
        }}
      >
        {monogram(row.creditorDisplayName)}
      </span>

      <span style={{ minWidth: 0 }}>
        <span
          className="mytab-type-body mytab-row__label mytab-name"
          style={{ display: "block", fontWeight: 500 }}
        >
          {row.creditorDisplayName}
        </span>
        <span
          className="mytab-type-meta mytab-row__label"
          style={{ display: "block", marginTop: "2px", fontSize: "12px" }}
        >
          {row.staleRevision
            ? OWE_COPY.stale
            : OWE_COPY.onTab(row.tabName, row.creditorDisplayName)}
        </span>
      </span>

      {/*
        A stale share holds its last value at 40% opacity. It never becomes a
        dash and it is never blanked — the figure was true when it was locked
        and saying nothing would be worse than saying so.
      */}
      <span
        className="mytab-type-amount-row mytab-tabular mytab-row__amount"
        data-mytab-amount
        aria-label={row.amountA11yLabel}
        style={{
          flex: "none",
          fontWeight: 600,
          color: MYTAB_COLORS.owed,
          opacity: row.staleRevision ? 0.4 : 1,
        }}
      >
        {row.amount}
      </span>
    </Link>
  );
}

/**
 * "What I owe" — the bot button's destination and the You surface's neighbour.
 *
 * It is deliberately not a section of `/you`: You is identity and wallet
 * settings, and money you owe someone is not a setting. The bot's button used
 * to land on `/you`, which answered a question nobody asked.
 */
export function OweSurface({ status, rows, retry }: OweSurfaceProps) {
  return (
    <>
      <header style={{ paddingTop: 8, paddingBottom: 16 }}>
        <h1 className="mytab-type-title" style={{ margin: 0 }}>
          {OWE_COPY.title}
        </h1>
      </header>

      {status === "error" ? (
        <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
          <p className="mytab-type-body" style={{ margin: 0 }}>
            {OWE_COPY.errorBody}
          </p>
          <button
            type="button"
            className="mytab-button-secondary"
            style={{ minHeight: 44 }}
            onClick={retry}
          >
            {STATE_COPY.retry}
          </button>
        </div>
      ) : null}

      {status === "ready" && rows.length === 0 ? (
        <section className="mytab-card" style={{ padding: 24 }}>
          <p className="mytab-type-body" style={{ margin: 0, fontWeight: 600 }}>
            {OWE_COPY.emptyHeadline}
          </p>
          <p
            className="mytab-type-meta"
            style={{ margin: "6px 0 0", color: MYTAB_COLORS.inkMuted }}
          >
            {OWE_COPY.emptyBody}
          </p>
        </section>
      ) : null}

      {status === "ready" && rows.length > 0 ? (
        /* One card with hairline-separated rows — never a card per debt. */
        <section className="mytab-card" style={{ overflow: "hidden", padding: "4px 0" }}>
          {rows.map((row, index) => (
            <div
              key={row.obligationId}
              style={{
                borderTop: index > 0 ? `1px solid ${MYTAB_COLORS.border}` : undefined,
              }}
            >
              <OweRowLink row={row} />
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}
