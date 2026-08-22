"use client";

import { useState, type FormEvent } from "react";
import { getConvexSiteUrl } from "@/lib/telegram/client";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

type IncidentRow = {
  _id?: string;
  intentId?: string;
  tabId?: string;
  observedSignature?: string;
  failedCheck?: string;
  createdAt?: number;
  status?: string;
  notes?: string;
};

/**
 * Operator list for D-30 unknown intents. Not a Mini App money surface.
 *
 * The secret lives in Convex env (`OPERATOR_RECONCILIATION_SECRET`). This page
 * never stores it. Without it, the Convex HTTP list answers 403.
 */
export default function ReconciliationOperatorPage() {
  const siteUrl = getConvexSiteUrl();
  const [secret, setSecret] = useState("");
  const [incidents, setIncidents] = useState<IncidentRow[] | null>(null);
  const [refused, setRefused] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!siteUrl || busy) {
      return;
    }

    setBusy(true);
    setRefused(false);

    void fetch(`${siteUrl}/reconciliation`, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
    })
      .then(async (response) => {
        if (response.status === 403 || response.status === 401) {
          setIncidents(null);
          setRefused(true);
          return;
        }
        if (!response.ok) {
          setIncidents(null);
          return;
        }
        const body = (await response.json()) as { incidents?: IncidentRow[] };
        setIncidents(Array.isArray(body.incidents) ? body.incidents : []);
      })
      .catch(() => {
        setIncidents(null);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: MYTAB_COLORS.paper,
        padding: "24px 16px",
        color: MYTAB_COLORS.ink,
        fontFamily: MYTAB_TYPOGRAPHY.family,
      }}
    >
      <div style={{ maxWidth: "480px", margin: "0 auto" }}>
        <h1
          style={{
            margin: 0,
            fontSize: MYTAB_TYPOGRAPHY.title.size,
            fontWeight: MYTAB_TYPOGRAPHY.title.weight,
            letterSpacing: MYTAB_TYPOGRAPHY.title.tracking,
          }}
        >
          Reconciliation
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: MYTAB_TYPOGRAPHY.meta.size,
            color: MYTAB_COLORS.inkMuted,
            lineHeight: 1.5,
          }}
        >
          Open incidents for payments that finalized but could not be confirmed.
          Enter the operator secret. A stranger sees nothing.
        </p>

        <form
          onSubmit={onSubmit}
          style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "10px" }}
        >
          <label
            style={{
              fontSize: MYTAB_TYPOGRAPHY.meta.size,
              color: MYTAB_COLORS.inkMuted,
            }}
          >
            Operator secret
            <input
              type="password"
              name="operator-secret"
              autoComplete="off"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              style={{
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                marginTop: "6px",
                minHeight: "44px",
                padding: "0 12px",
                borderRadius: MYTAB_RADIUS.sm,
                border: `1px solid ${MYTAB_COLORS.border}`,
                background: MYTAB_COLORS.surface,
                color: MYTAB_COLORS.ink,
                fontFamily: "inherit",
                fontSize: "16px",
              }}
            />
          </label>
          <button
            type="submit"
            disabled={!siteUrl || busy}
            style={{
              minHeight: "44px",
              borderRadius: MYTAB_RADIUS.sm,
              border: "none",
              background: MYTAB_COLORS.primary,
              color: MYTAB_COLORS.surface,
              fontFamily: "inherit",
              fontSize: "16px",
              fontWeight: 600,
              cursor: !siteUrl || busy ? "not-allowed" : "pointer",
              opacity: !siteUrl || busy ? 0.5 : 1,
            }}
          >
            Show open incidents
          </button>
        </form>

        {refused ? (
          <p
            role="status"
            style={{
              margin: "20px 0 0",
              fontSize: MYTAB_TYPOGRAPHY.meta.size,
              color: MYTAB_COLORS.inkMuted,
            }}
          >
            Not authorized.
          </p>
        ) : null}

        {incidents ? (
          <ul
            style={{
              listStyle: "none",
              margin: "24px 0 0",
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {incidents.length === 0 ? (
              <li
                style={{
                  fontSize: MYTAB_TYPOGRAPHY.meta.size,
                  color: MYTAB_COLORS.inkMuted,
                }}
              >
                No open incidents.
              </li>
            ) : (
              incidents.map((row, index) => (
                <li
                  key={row._id ?? `${row.intentId ?? "incident"}:${index}`}
                  style={{
                    padding: "12px",
                    borderRadius: MYTAB_RADIUS.sm,
                    background: MYTAB_COLORS.surface,
                    border: `1px solid ${MYTAB_COLORS.border}`,
                    fontSize: MYTAB_TYPOGRAPHY.meta.size,
                    lineHeight: 1.5,
                    overflowX: "clip",
                    wordBreak: "break-word",
                  }}
                >
                  <div>Intent {row.intentId ?? "unrecorded"}</div>
                  {row.tabId ? <div>Tab {row.tabId}</div> : null}
                  {row.failedCheck ? <div>Check {row.failedCheck}</div> : null}
                  {row.observedSignature ? <div>Seen {row.observedSignature}</div> : null}
                  {typeof row.createdAt === "number" ? (
                    <div>{new Date(row.createdAt).toISOString()}</div>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
