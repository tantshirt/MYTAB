"use client";

import { useState } from "react";
import type { ParsedReceipt, ParsedReceiptLine } from "@/lib/domain/receiptParse";
import {
  formatDiscrepancyCopy,
  recomputeReconciliation,
} from "@/lib/domain/receiptParse";
import { formatFiatMinorThb } from "@/lib/domain/format";
import { thbMinorFromInteger } from "@/lib/domain/parse";
import { MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";

export type DiscrepancyCardProps = {
  reconciliation: ParsedReceipt["reconciliation"];
};

/** Sticky discrepancy card — auto-dismisses when reconciled (Story 8.4 AC2–AC3). */
export function DiscrepancyCard({ reconciliation }: DiscrepancyCardProps) {
  if (reconciliation.reconciled) {
    return null;
  }

  return (
    <div
      role="alert"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        padding: "12px 16px",
        marginBottom: "16px",
        borderRadius: MYTAB_RADIUS.sm,
        border: `1px solid ${MYTAB_COLORS.warning}`,
        background: "rgba(154, 98, 9, 0.06)",
        color: MYTAB_COLORS.warning,
        fontSize: "14px",
        fontWeight: 500,
      }}
    >
      ⚠ {formatDiscrepancyCopy(reconciliation)}
    </div>
  );
}

export type ReceiptReviewProps = {
  parsed: ParsedReceipt;
  onConfirm: (lines: ParsedReceiptLine[], receiptTotalMinor: number) => void;
  onManualEntry: () => void;
};

/** Receipt review with editable fields and confidence flags (Story 8.4). */
export function ReceiptReview({ parsed, onConfirm, onManualEntry }: ReceiptReviewProps) {
  const [lines, setLines] = useState(parsed.lines);
  const [receiptTotalMinor, setReceiptTotalMinor] = useState(
    parsed.reconciliation.receiptTotalMinor,
  );

  const reconciliation = recomputeReconciliation({ lines, receiptTotalMinor });

  const updateLine = (index: number, patch: Partial<ParsedReceiptLine>) => {
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) {
          return line;
        }
        const next = { ...line, ...patch };
        next.computedLineTotalMinor = (next.unitPriceMinor * next.quantity) as typeof next.computedLineTotalMinor;
        next.flagged =
          next.nameConfidence === "low" ||
          next.priceConfidence === "low" ||
          (next.printedLineTotalMinor !== undefined &&
            next.printedLineTotalMinor !== next.computedLineTotalMinor);
        return next;
      }),
    );
  };

  if (lines.length === 0) {
    return (
      <div>
        <p className="mytab-type-body" style={{ color: MYTAB_COLORS.inkMuted }}>
          Add what you ordered.
        </p>
        <button
          type="button"
          onClick={onManualEntry}
          style={{
            marginTop: "16px",
            minHeight: "52px",
            padding: "0 20px",
            borderRadius: MYTAB_RADIUS.sm,
            border: "none",
            background: MYTAB_COLORS.primary,
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Add items manually
        </button>
      </div>
    );
  }

  return (
    <div>
      <DiscrepancyCard reconciliation={reconciliation} />

      {parsed.merchant ? (
        <p className="mytab-type-label" style={{ margin: "0 0 16px" }}>
          {parsed.merchant}
        </p>
      ) : null}

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {lines.map((line, index) => (
          <li
            key={index}
            style={{
              padding: "12px 0",
              borderBottom: `1px solid ${MYTAB_COLORS.border}`,
              background: line.flagged ? MYTAB_COLORS.warningSoft : "transparent",
            }}
          >
            {line.flagged ? (
              <p
                className="mytab-type-meta"
                style={{ margin: "0 0 8px", color: MYTAB_COLORS.warning, fontWeight: 600 }}
              >
                ⚠ Check this row
              </p>
            ) : null}
            <label className="mytab-type-meta" style={{ display: "block", marginBottom: "4px" }}>
              Item
              <input
                value={line.name}
                onChange={(e) => updateLine(index, { name: e.target.value })}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "4px",
                  padding: "10px 12px",
                  minHeight: "44px",
                  borderRadius: MYTAB_RADIUS.sm,
                  border: `1px solid ${MYTAB_COLORS.border}`,
                }}
              />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "8px" }}>
              <label className="mytab-type-meta">
                Qty
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) =>
                    updateLine(index, { quantity: Math.max(1, Number(e.target.value)) })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "4px",
                    padding: "10px 12px",
                    minHeight: "44px",
                    borderRadius: MYTAB_RADIUS.sm,
                    border: `1px solid ${MYTAB_COLORS.border}`,
                  }}
                />
              </label>
              <label className="mytab-type-meta">
                Unit price (minor)
                <input
                  type="number"
                  value={line.unitPriceMinor}
                  onChange={(e) =>
                    updateLine(index, {
                      unitPriceMinor: Number(e.target.value) as typeof line.unitPriceMinor,
                    })
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "4px",
                    padding: "10px 12px",
                    minHeight: "44px",
                    borderRadius: MYTAB_RADIUS.sm,
                    border: `1px solid ${MYTAB_COLORS.border}`,
                  }}
                />
              </label>
            </div>
            <p
              className="mytab-type-amount-row mytab-tabular"
              data-mytab-amount
              style={{ margin: "8px 0 0", textAlign: "right" }}
            >
              {formatFiatMinorThb(line.computedLineTotalMinor)}
            </p>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: "24px" }}>
        <label className="mytab-type-micro-label">
          Receipt total (minor)
          <input
            type="number"
            value={receiptTotalMinor}
            onChange={(e) => setReceiptTotalMinor(thbMinorFromInteger(Number(e.target.value)))}
            style={{
              display: "block",
              width: "100%",
              marginTop: "8px",
              padding: "10px 12px",
              minHeight: "44px",
              borderRadius: MYTAB_RADIUS.sm,
              border: `1px solid ${MYTAB_COLORS.border}`,
            }}
          />
        </label>
      </div>

      <button
        type="button"
        disabled={!reconciliation.reconciled}
        onClick={() => onConfirm(lines, receiptTotalMinor)}
        style={{
          marginTop: "24px",
          width: "100%",
          minHeight: "52px",
          borderRadius: MYTAB_RADIUS.sm,
          border: "none",
          background: reconciliation.reconciled ? MYTAB_COLORS.primary : MYTAB_COLORS.sunk,
          color: reconciliation.reconciled ? "#fff" : MYTAB_COLORS.inkMuted,
          fontWeight: 600,
          cursor: reconciliation.reconciled ? "pointer" : "not-allowed",
        }}
      >
        Confirm receipt
      </button>
    </div>
  );
}
