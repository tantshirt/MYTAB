"use client";

import Link from "next/link";
import { useState } from "react";
import { STATE_COPY } from "@/components/primitives/state-copy";
import { settleSearch } from "@/features/settlement/SettleSheetHost";
import { avatarTintForUserId, MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";
import { monogram } from "./monogram";
import type { OweRow } from "@/features/balances/useOweData";
import type { OwedRow } from "@/features/balances/useOweData";
import { useLiveMutation } from "@/features/convex/useConvexData";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export const OWE_COPY = {
  title: "You owe",
  owedTitle: "Owed to you",
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

export const WAIVER_CONFIRMATION = "Waive this debt permanently? This cannot be undone.";

export function confirmIrreversibleWaiver(confirm: (message: string) => boolean) {
  return confirm(WAIVER_CONFIRMATION);
}

export type OweSurfaceProps = {
  status: "loading" | "ready" | "error";
  rows: OweRow[];
  owedRows?: OwedRow[];
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
  const proposeCash = useLiveMutation(api.activity.proposeCashSettlement);
  const acknowledgeCash = useLiveMutation(api.activity.acknowledgeCashSettlement);
  const [outsideState, setOutsideState] = useState<"idle" | "working" | "done" | "error">("idle");
  return (
    <div
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
      <Link
        href={settleSearch(row.obligationId)}
        aria-label={`Pay ${row.creditorDisplayName} ${row.amount}`}
        style={{ display: "contents", color: "inherit", textDecoration: "none" }}
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
      {proposeCash && !row.pendingCashProposalId ? (
        <button
          type="button"
          className="mytab-link-button"
          style={{ gridColumn: "2 / -1", justifySelf: "start", minHeight: 44 }}
          disabled={outsideState === "working"}
          onClick={() => {
            setOutsideState("working");
            void proposeCash({ obligationId: row.obligationId as Id<"obligations"> })
              .then(() => setOutsideState("done"))
              .catch(() => setOutsideState("error"));
          }}
        >
          {outsideState === "working" ? "Sending…" : "I paid outside My Tab"}
        </button>
      ) : row.pendingCashProposalId && row.canAcknowledgeCash && acknowledgeCash ? (
        <button
          type="button"
          className="mytab-link-button"
          style={{ gridColumn: "2 / -1", justifySelf: "start", minHeight: 44 }}
          disabled={outsideState === "working"}
          onClick={() => {
            setOutsideState("working");
            void acknowledgeCash({
              proposalId: row.pendingCashProposalId as Id<"obligationLedgerEvents">,
            })
              .then(() => setOutsideState("done"))
              .catch(() => setOutsideState("error"));
          }}
        >
          Confirm outside payment
        </button>
      ) : row.pendingCashProposalId ? (
        <span className="mytab-type-meta" style={{ gridColumn: "2 / -1" }}>
          Waiting for acknowledgement
        </span>
      ) : null}
      {outsideState === "done" ? (
        <span role="status" className="mytab-type-meta" style={{ gridColumn: "2 / -1" }}>
          Sent for acknowledgement.
        </span>
      ) : outsideState === "error" ? (
        <span role="alert" className="mytab-type-meta" style={{ gridColumn: "2 / -1", color: MYTAB_COLORS.warning }}>
          Couldn&apos;t send that. Check the debt and try again.
        </span>
      ) : null}
    </div>
  );
}

/**
 * "What I owe" — the bot button's destination and the You surface's neighbour.
 *
 * It is deliberately not a section of `/you`: You is identity and wallet
 * settings, and money you owe someone is not a setting. The bot's button used
 * to land on `/you`, which answered a question nobody asked.
 */
export function OweSurface({ status, rows, owedRows = [], retry }: OweSurfaceProps) {
  const remind = useLiveMutation(api.obligations.requestPaymentReminder);
  const waive = useLiveMutation(api.activity.waiveObligation);
  const proposeCash = useLiveMutation(api.activity.proposeCashSettlement);
  const acknowledgeCash = useLiveMutation(api.activity.acknowledgeCashSettlement);
  const [actionMessages, setActionMessages] = useState<Record<string, string>>({});
  const runOwedAction = (
    obligationId: string,
    action: Promise<unknown>,
    success: string,
  ) => {
    setActionMessages((current) => ({ ...current, [obligationId]: "Working…" }));
    void action
      .then(() => setActionMessages((current) => ({ ...current, [obligationId]: success })))
      .catch(() => setActionMessages((current) => ({
        ...current,
        [obligationId]: "That action is unavailable right now. Refresh the debt and try again.",
      })));
  };
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
            {owedRows.length > 0 ? "You don't owe anything." : OWE_COPY.emptyHeadline}
          </p>
          <p
            className="mytab-type-meta"
            style={{ margin: "6px 0 0", color: MYTAB_COLORS.inkMuted }}
          >
            {owedRows.length > 0
              ? "Money owed to you is listed below."
              : OWE_COPY.emptyBody}
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

      {status === "ready" ? (
        <section style={{ marginTop: 28 }}>
          <h2 className="mytab-type-section" style={{ margin: "0 0 10px" }}>
            {OWE_COPY.owedTitle}
          </h2>
          {owedRows.length === 0 ? (
            <p className="mytab-type-meta" style={{ margin: 0 }}>
              Nobody owes you right now.
            </p>
          ) : (
            <div className="mytab-card" style={{ overflow: "hidden" }}>
              {owedRows.map((row, index) => (
                <div
                  key={row.obligationId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: 12,
                    alignItems: "center",
                    padding: 16,
                    borderTop: index ? `1px solid ${MYTAB_COLORS.border}` : undefined,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="mytab-type-body mytab-name">{row.debtorDisplayName}</div>
                    <div className="mytab-type-meta">{row.tabName}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      className="mytab-tabular"
                      data-mytab-amount
                      aria-label={row.amountA11yLabel}
                    >
                      {row.amount}
                    </div>
                    {remind ? (
                      <button
                        type="button"
                        className="mytab-link-button"
                        style={{ minHeight: 44 }}
                        disabled={row.reminderStatus === "unknown" || row.reminderStatus === "sent"}
                        onClick={() => {
                          runOwedAction(
                            row.obligationId,
                            remind({ obligationId: row.obligationId as Id<"obligations"> }),
                            "Private reminder queued.",
                          );
                        }}
                      >
                        {row.reminderStatus === "unknown"
                          ? "Delivery not confirmed"
                          : row.reminderStatus === "sent"
                            ? "Reminder sent"
                            : "Remind privately"}
                      </button>
                    ) : null}
                    {row.pendingCashProposalId && row.canAcknowledgeCash && acknowledgeCash ? (
                      <button
                        type="button"
                        className="mytab-link-button"
                        style={{ minHeight: 44 }}
                        onClick={() => {
                          runOwedAction(
                            row.obligationId,
                            acknowledgeCash({
                              proposalId: row.pendingCashProposalId as Id<"obligationLedgerEvents">,
                            }),
                            "Outside payment acknowledged.",
                          );
                        }}
                      >
                        Confirm outside payment
                      </button>
                    ) : null}
                    {!row.pendingCashProposalId && proposeCash ? (
                      <button
                        type="button"
                        className="mytab-link-button"
                        style={{ minHeight: 44 }}
                        onClick={() => {
                          runOwedAction(
                            row.obligationId,
                            proposeCash({ obligationId: row.obligationId as Id<"obligations"> }),
                            "Outside payment sent for acknowledgement.",
                          );
                        }}
                      >
                        Propose outside payment
                      </button>
                    ) : row.pendingCashProposalId && !row.canAcknowledgeCash ? (
                      <span className="mytab-type-meta">Waiting for acknowledgement</span>
                    ) : null}
                    {waive ? (
                      <button
                        type="button"
                        className="mytab-link-button"
                        style={{ minHeight: 44 }}
                        onClick={() => {
                          if (
                            typeof window === "undefined" ||
                            !confirmIrreversibleWaiver(window.confirm.bind(window))
                          ) {
                            return;
                          }
                          runOwedAction(
                            row.obligationId,
                            waive({ obligationId: row.obligationId as Id<"obligations"> }),
                            "Debt waived.",
                          );
                        }}
                      >
                      Waive this debt
                      </button>
                    ) : null}
                    {actionMessages[row.obligationId] ? (
                      <p role="status" className="mytab-type-meta" style={{ margin: "4px 0 0", maxWidth: 220 }}>
                        {actionMessages[row.obligationId]}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
