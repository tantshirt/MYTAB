"use client";

import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AlertTriangleIcon } from "@/components/icons";
import { EmptyState } from "@/components/primitives/empty-state";
import type { ParsedReceipt, ParsedReceiptLine } from "@/lib/domain/receiptParse";
import { formatDiscrepancyCopy, recomputeReconciliation } from "@/lib/domain/receiptParse";
import { formatThbMinorForA11y } from "@/lib/domain/a11yAmount";
import { formatFiatMinorThb } from "@/lib/domain/format";
import type { FiatMinor } from "@/lib/domain/money";
import { isDemoModeEnabled, isReceiptScanEnabled } from "@/lib/features/flags";
import { MYTAB_COLORS, MYTAB_LAYOUT, MYTAB_RADIUS } from "@/lib/theme/tokens";

export type DiscrepancyCardProps = {
  reconciliation: ParsedReceipt["reconciliation"];
};

/**
 * Sticky discrepancy card — auto-dismisses when reconciled, and is never
 * manually dismissible (Story 8.4 AC2–AC3; EXPERIENCE, *Component Patterns*).
 */
export function DiscrepancyCard({ reconciliation }: DiscrepancyCardProps) {
  if (reconciliation.reconciled) {
    return null;
  }

  return (
    <div
      role="alert"
      data-testid="receipt-discrepancy"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        display: "flex",
        gap: 12,
        padding: 20,
        marginBottom: 16,
        borderRadius: MYTAB_RADIUS.md,
        border: `1px solid ${MYTAB_COLORS.warning}`,
        // `colors/warning-soft`, not a hand-mixed rgba (lib/theme/tokens.ts is
        // the only source of colour in this product).
        background: MYTAB_COLORS.warningSoft,
      }}
    >
      <AlertTriangleIcon
        size={20}
        style={{ color: MYTAB_COLORS.warning, flexShrink: 0, marginTop: 1 }}
      />
      <p
        className="mytab-tabular"
        style={{
          margin: 0,
          fontSize: "14px",
          fontWeight: 500,
          lineHeight: 1.45,
          color: MYTAB_COLORS.warning,
        }}
      >
        {formatDiscrepancyCopy(reconciliation)} Check the highlighted rows.
      </p>
    </div>
  );
}

export type ReceiptReviewProps = {
  parsed: ParsedReceipt;
  /** Rendered right of the merchant in the header strip, when it is known. */
  capturedAtLabel?: string;
  onConfirm: (lines: ParsedReceiptLine[], receiptTotalMinor: FiatMinor) => void;
  onManualEntry: () => void;
  /** Only wired when receipt scanning is on; otherwise the affordance is absent. */
  onScanReceipt?: () => void;
  /**
   * Demo affordance. Rendered only when `isDemoModeEnabled()` — EXPERIENCE
   * calls it "deliberately hidden from judges" (POLISH-SPEC §1.5, §8 item 3).
   */
  onUseSampleReceipt?: () => void;
  /**
   * Where the Confirm action is pinned. §1.5 requires it pinned, and it cannot
   * pin from inside this component: `AppShell`'s content column sets
   * `overflow-x: hidden`, which makes it a scroll container and renders any
   * sticky descendant inert. The route therefore passes `AppShell`'s own
   * `footer` element and the bar is portalled into it. Omitted (component
   * tests, any non-`AppShell` mount) it renders inline, exactly as before.
   */
  footerSlot?: HTMLElement | null;
};

const SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/**
 * Baht text ⇄ minor units, without ever touching a float.
 *
 * People type baht. Minor units are storage and never surface in a label
 * (EXPERIENCE, *Voice and Tone*: never explain the mechanism).
 */
function minorToBahtInput(minor: number): string {
  const negative = minor < 0;
  const absolute = Math.abs(minor);
  const whole = Math.floor(absolute / 100);
  const satang = String(absolute % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${satang}`;
}

function bahtInputToMinor(raw: string): number | null {
  const trimmed = raw.replace(/[฿,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) {
    return null;
  }
  const [whole = "0", fraction = ""] = trimmed.split(".");
  return Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
}

/** The one place a flagged field's outline is described. */
function flagStyle(flagged: boolean): CSSProperties {
  return {
    // Negative margin equal to the padding, so the text does not shift when the
    // flag clears (POLISH-SPEC §1.5).
    padding: "5px 8px",
    margin: "-5px -8px",
    borderRadius: 7,
    border: `1px solid ${flagged ? MYTAB_COLORS.warning : "transparent"}`,
    background: flagged ? MYTAB_COLORS.warningSoft : "transparent",
    color: flagged ? MYTAB_COLORS.warning : MYTAB_COLORS.ink,
  };
}

const BARE_FIELD: CSSProperties = {
  width: "100%",
  minWidth: 0,
  appearance: "none",
  WebkitAppearance: "none",
  background: "transparent",
  border: 0,
  outline: "none",
  color: "inherit",
  fontSize: "16px",
  fontWeight: 500,
  lineHeight: 1.4,
};

function helperCopy(reconciled: boolean, flaggedCount: number): string {
  if (reconciled) {
    return "Everything reconciles. Confirm to turn these into claimable items.";
  }
  if (flaggedCount === 0) {
    return "The numbers don't add up yet. Correct an item price or the receipt total.";
  }
  if (flaggedCount === 1) {
    return "1 row was hard to read. Tap it to correct it.";
  }
  return `${flaggedCount} rows were hard to read. Tap any of them to correct it.`;
}

/** Receipt review with editable fields and confidence flags (Story 8.4, §1.5). */
export function ReceiptReview({
  parsed,
  capturedAtLabel,
  onConfirm,
  onManualEntry,
  onScanReceipt,
  onUseSampleReceipt,
  footerSlot,
}: ReceiptReviewProps) {
  const [lines, setLines] = useState(parsed.lines);
  const [receiptTotalMinor, setReceiptTotalMinor] = useState<FiatMinor>(
    parsed.reconciliation.receiptTotalMinor,
  );
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});
  const [totalDraft, setTotalDraft] = useState<string | null>(null);

  const reconciliation = recomputeReconciliation({ lines, receiptTotalMinor });
  const flaggedCount = lines.filter((line) => line.flagged).length;
  const scanAvailable = isReceiptScanEnabled() && onScanReceipt != null;

  const updateLine = (index: number, patch: Partial<ParsedReceiptLine>) => {
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) {
          return line;
        }
        const next = { ...line, ...patch };
        next.computedLineTotalMinor = (next.unitPriceMinor *
          next.quantity) as typeof next.computedLineTotalMinor;
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
      <div data-testid="receipt-empty">
        <EmptyState
          headline="Add what you ordered."
          action={
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button type="button" className="mytab-button-primary" onClick={onManualEntry}>
                Add items manually
              </button>
              {scanAvailable ? (
                <button type="button" className="mytab-button-secondary" onClick={onScanReceipt}>
                  Scan receipt
                </button>
              ) : null}
            </div>
          }
        />
      </div>
    );
  }

  const actionBar = (
    <>
      <button
        type="button"
        className="mytab-button-primary"
        disabled={!reconciliation.reconciled}
        aria-describedby="receipt-helper"
        onClick={() => onConfirm(lines, receiptTotalMinor)}
      >
        Confirm receipt
      </button>
      {/* A disabled action states its reason rather than going silent (§4.4). */}
      {!reconciliation.reconciled ? (
        <p className="mytab-type-meta" style={{ margin: "8px 0 0", textAlign: "center" }}>
          The items and the receipt total have to match first.
        </p>
      ) : null}
      {isDemoModeEnabled() && onUseSampleReceipt ? (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button type="button" className="mytab-link-button" onClick={onUseSampleReceipt}>
            Use sample receipt
          </button>
        </div>
      ) : null}
    </>
  );

  return (
    <div>
      <header style={{ paddingTop: 8, paddingBottom: 14 }}>
        <h1 className="mytab-type-title" style={{ margin: 0 }}>
          Check the receipt
        </h1>
        <p className="mytab-type-meta" style={{ margin: "1px 0 0" }}>
          Fix anything we got wrong.
        </p>
      </header>

      <DiscrepancyCard reconciliation={reconciliation} />

      <section className="mytab-card" style={{ overflow: "hidden" }}>
        {/* Header strip — merchant left, when it was taken right. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "13px 16px",
            background: MYTAB_COLORS.paper,
            borderBottom: `1px solid ${MYTAB_COLORS.border}`,
          }}
        >
          <span
            className="mytab-type-micro-label"
            style={{
              flexGrow: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {parsed.merchant ?? "Receipt"}
          </span>
          {capturedAtLabel ? (
            <span
              className="mytab-type-meta"
              style={{ flex: "none", whiteSpace: "nowrap" }}
            >
              {capturedAtLabel}
            </span>
          ) : null}
        </div>

        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {lines.map((line, index) => {
            const priceValue = priceDrafts[index] ?? minorToBahtInput(line.unitPriceMinor);
            return (
              <li
                key={index}
                style={{
                  padding: "12px 16px",
                  borderBottom: `1px solid ${MYTAB_COLORS.border}`,
                }}
              >
                {/*
                  Semantic colour never travels alone (EXPERIENCE, Accessibility
                  Floor), so a flagged row carries a glyph and a word as well as
                  the amber. The outline itself sits on the *fields*, not the row.
                */}
                {line.flagged ? (
                  <p
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      margin: "0 0 10px",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: MYTAB_COLORS.warning,
                    }}
                  >
                    <AlertTriangleIcon size={14} style={{ flexShrink: 0 }} />
                    Check this row
                  </p>
                ) : null}

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <label
                    style={{
                      flex: "none",
                      display: "flex",
                      alignItems: "center",
                      width: 40,
                      color: MYTAB_COLORS.inkMuted,
                    }}
                  >
                    <span style={SR_ONLY}>Quantity for {line.name}</span>
                    <input
                      inputMode="numeric"
                      value={String(line.quantity)}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, "");
                        updateLine(index, { quantity: Math.max(1, Number(digits) || 1) });
                      }}
                      className="mytab-tabular"
                      style={{ ...BARE_FIELD, fontSize: "14px", color: "inherit" }}
                    />
                    <span aria-hidden="true" style={{ fontSize: "14px" }}>
                      &#215;
                    </span>
                  </label>

                  <label style={{ flexGrow: 1, minWidth: 0, ...flagStyle(line.flagged) }}>
                    <span style={SR_ONLY}>Item name</span>
                    <input
                      value={line.name}
                      onChange={(event) => updateLine(index, { name: event.target.value })}
                      style={{ ...BARE_FIELD, color: "inherit" }}
                    />
                  </label>

                  <label
                    style={{
                      flex: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      width: 104,
                      ...flagStyle(line.flagged),
                    }}
                  >
                    <span style={SR_ONLY}>Unit price in baht</span>
                    <span aria-hidden="true" style={{ fontSize: "15px", fontWeight: 500 }}>
                      ฿
                    </span>
                    <input
                      inputMode="decimal"
                      value={priceValue}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setPriceDrafts((current) => ({ ...current, [index]: raw }));
                        const minor = bahtInputToMinor(raw);
                        if (minor != null) {
                          updateLine(index, { unitPriceMinor: minor as FiatMinor });
                        }
                      }}
                      onBlur={() =>
                        setPriceDrafts((current) => {
                          const next = { ...current };
                          delete next[index];
                          return next;
                        })
                      }
                      className="mytab-tabular"
                      style={{ ...BARE_FIELD, textAlign: "right", color: "inherit" }}
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Totals block, inside the same card. */}
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 11 }}>
          <div className="mytab-row">
            <span
              className="mytab-row__label"
              style={{ fontSize: "14px", color: MYTAB_COLORS.inkMuted }}
            >
              Items
            </span>
            <span
              className="mytab-row__amount mytab-tabular"
              data-mytab-amount
              aria-label={formatThbMinorForA11y(reconciliation.linesTotalMinor)}
              style={{ fontSize: "14px", fontWeight: 500 }}
            >
              {formatFiatMinorThb(reconciliation.linesTotalMinor)}
            </span>
          </div>

          <label
            className="mytab-row"
            style={{ borderTop: `1px solid ${MYTAB_COLORS.border}`, paddingTop: 11 }}
          >
            <span
              className="mytab-row__label"
              style={{ fontSize: "15px", fontWeight: 600, alignSelf: "center" }}
            >
              Receipt total
            </span>
            <span
              className="mytab-row__amount"
              style={{ display: "flex", alignItems: "center", gap: 1, width: 116 }}
            >
              <span aria-hidden="true" style={{ fontSize: "15px", fontWeight: 600 }}>
                ฿
              </span>
              <input
                inputMode="decimal"
                value={totalDraft ?? minorToBahtInput(receiptTotalMinor)}
                onChange={(event) => {
                  const raw = event.target.value;
                  setTotalDraft(raw);
                  const minor = bahtInputToMinor(raw);
                  if (minor != null) {
                    setReceiptTotalMinor(minor as FiatMinor);
                  }
                }}
                onBlur={() => setTotalDraft(null)}
                className="mytab-tabular"
                style={{
                  ...BARE_FIELD,
                  textAlign: "right",
                  fontSize: "15px",
                  fontWeight: 600,
                  color: MYTAB_COLORS.ink,
                }}
              />
            </span>
          </label>
        </div>
      </section>

      <p
        id="receipt-helper"
        className="mytab-type-meta"
        style={{ margin: "14px 0 0", padding: "0 4px", lineHeight: 1.5 }}
      >
        {helperCopy(reconciliation.reconciled, flaggedCount)}
      </p>

      {/*
        The action bar itself. When the route hands over `AppShell`'s footer it
        is portalled there and pins; otherwise it stays in the flow, drawing its
        own full-bleed surface strip.
      */}
      {footerSlot ? (
        createPortal(actionBar, footerSlot)
      ) : (
        <div
          style={{
            marginTop: 24,
            marginLeft: `-${MYTAB_LAYOUT.gutter}`,
            marginRight: `-${MYTAB_LAYOUT.gutter}`,
            padding: `14px ${MYTAB_LAYOUT.gutter} calc(22px + var(--app-pad-bottom, 0px))`,
            background: MYTAB_COLORS.surface,
            borderTop: `1px solid ${MYTAB_COLORS.border}`,
          }}
        >
          {actionBar}
        </div>
      )}
    </div>
  );
}
