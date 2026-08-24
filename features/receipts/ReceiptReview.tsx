"use client";

import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AlertTriangleIcon } from "@/components/icons";
import { EmptyState } from "@/components/primitives/empty-state";
import { VisuallyHidden } from "@/components/primitives/visually-hidden";
import type {
  ParsedReceipt,
  ParsedReceiptAdjustment,
  ParsedReceiptLine,
} from "@/lib/domain/receiptParse";
import { formatDiscrepancyCopy, recomputeReconciliation } from "@/lib/domain/receiptParse";
import { formatCurrencyMinorForA11y } from "@/lib/domain/a11yAmount";
import { formatCurrencyMinor } from "@/lib/domain/format";
import { currencyMinorDigits, parseCurrencyAmount } from "@/lib/domain/currency";
import type { FiatMinor } from "@/lib/domain/money";
import { MYTAB_COLORS, MYTAB_LAYOUT, MYTAB_RADIUS } from "@/lib/theme/tokens";
import { ITEM_QUANTITY_MAX } from "@/lib/domain/bill";

export type DiscrepancyCardProps = {
  reconciliation: ParsedReceipt["reconciliation"];
  currency?: ParsedReceipt["currency"];
};

/**
 * Sticky discrepancy card — auto-dismisses when reconciled, and is never
 * manually dismissible (Story 8.4 AC2–AC3; EXPERIENCE, *Component Patterns*).
 */
export function DiscrepancyCard({ reconciliation, currency = "THB" }: DiscrepancyCardProps) {
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
        {formatDiscrepancyCopy(reconciliation, currency)} Check the highlighted rows.
      </p>
    </div>
  );
}

export type ReceiptReviewProps = {
  parsed: ParsedReceipt;
  /** Rendered right of the merchant in the header strip, when it is known. */
  capturedAtLabel?: string;
  onConfirm: (
    lines: ParsedReceiptLine[],
    receiptTotalMinor: FiatMinor,
    adjustments: ParsedReceiptAdjustment[],
    currency: ParsedReceipt["currency"],
    resolvedLowConfidenceFields: string[],
  ) => void;
  onManualEntry: () => void;
  /** Only wired when receipt scanning is on; otherwise the affordance is absent. */
  onScanReceipt?: () => void;
  /** Visible mutation failure; preserving edits makes the same confirmation retryable. */
  confirmationError?: string | null;
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

/**
 * Baht text ⇄ minor units, without ever touching a float.
 *
 * People type baht. Minor units are storage and never surface in a label
 * (EXPERIENCE, *Voice and Tone*: never explain the mechanism).
 */
function minorToCurrencyInput(minor: number, currency: ParsedReceipt["currency"]): string {
  const negative = minor < 0;
  const absolute = Math.abs(minor);
  const digits = currencyMinorDigits(currency);
  const scale = 10 ** digits;
  const whole = Math.floor(absolute / scale);
  if (digits === 0) return `${negative ? "-" : ""}${whole}`;
  const fraction = String(absolute % scale).padStart(digits, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function currencyInputToMinor(
  raw: string,
  currency: ParsedReceipt["currency"],
): number | null {
  const trimmed = raw.replace(/[,\s]/g, "");
  try {
    return parseCurrencyAmount(trimmed, currency);
  } catch {
    return null;
  }
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

/**
 * Every field on this surface is a control someone has to hit with a thumb to
 * correct a misread price, so each one carries the 44px floor from EXPERIENCE's
 * *Accessibility Floor*. They were 21–25px tall: the type is unchanged, the box
 * around it is not.
 */
const BARE_FIELD: CSSProperties = {
  width: "100%",
  minWidth: 0,
  minHeight: "44px",
  appearance: "none",
  WebkitAppearance: "none",
  background: "transparent",
  border: 0,
  padding: 0,
  outline: "none",
  color: "inherit",
  fontSize: "16px",
  fontWeight: 500,
  lineHeight: 1.4,
};

/**
 * The item name is the one field on this surface that holds Thai — every line
 * of the canonical fixture does — so its line box comes from `.mytab-item-name`
 * rather than from the numeric fields' 1.4.
 */
const NAME_FIELD: CSSProperties = { ...BARE_FIELD, lineHeight: undefined, color: "inherit" };

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
  confirmationError,
  footerSlot,
}: ReceiptReviewProps) {
  const [lines, setLines] = useState(parsed.lines);
  const [receiptTotalMinor, setReceiptTotalMinor] = useState<FiatMinor>(
    parsed.reconciliation.receiptTotalMinor,
  );
  const [adjustments, setAdjustments] = useState(parsed.adjustments);
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});
  const [adjustmentDrafts, setAdjustmentDrafts] = useState<Record<number, string>>({});
  const [totalDraft, setTotalDraft] = useState<string | null>(null);
  const [resolvedLowConfidenceFields, setResolvedLowConfidenceFields] = useState<Set<string>>(
    () => new Set(),
  );

  const markResolved = (field: string) => {
    setResolvedLowConfidenceFields((current) => {
      const next = new Set(current);
      next.add(field);
      return next;
    });
  };

  const reconciliation = recomputeReconciliation({
    lines,
    adjustments,
    receiptTotalMinor,
  });
  const unresolvedLowConfidenceCount =
    lines.reduce((count, line, index) =>
      count +
      (line.nameConfidence === "low" && !resolvedLowConfidenceFields.has(`line.${index}.name`) ? 1 : 0) +
      (line.priceConfidence === "low" && !resolvedLowConfidenceFields.has(`line.${index}.price`) ? 1 : 0), 0) +
    adjustments.reduce((count, adjustment, index) =>
      count + (adjustment.confidence === "low" && !resolvedLowConfidenceFields.has(`adjustment.${index}`) ? 1 : 0), 0) +
    (parsed.totalConfidence === "low" && !resolvedLowConfidenceFields.has("total") ? 1 : 0);
  const flaggedCount = lines.filter((line) => line.flagged).length +
    adjustments.filter((adjustment) => adjustment.flagged).length +
    (parsed.totalConfidence === "low" ? 1 : 0);
  const lowConfidenceResolved = unresolvedLowConfidenceCount === 0;
  const invalidDraft =
    lines.some((line) =>
      line.name.trim().length === 0 ||
      line.unitPriceMinor <= 0 ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > ITEM_QUANTITY_MAX
    ) ||
    Object.values(priceDrafts).some((raw) => {
      const minor = currencyInputToMinor(raw, parsed.currency);
      return minor == null || minor <= 0;
    }) ||
    Object.values(adjustmentDrafts).some((raw) => {
      const minor = currencyInputToMinor(raw, parsed.currency);
      return minor == null || minor <= 0;
    }) ||
    (totalDraft !== null && (() => {
      const minor = currencyInputToMinor(totalDraft, parsed.currency);
      return minor == null || minor <= 0;
    })());
  const scanAvailable = onScanReceipt != null;

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
        disabled={!reconciliation.reconciled || !lowConfidenceResolved || invalidDraft}
        aria-describedby="receipt-helper"
        onClick={() => onConfirm(
          lines,
          receiptTotalMinor,
          adjustments,
          parsed.currency,
          [...resolvedLowConfidenceFields],
        )}
      >
        Confirm receipt
      </button>
      {/* A disabled action states its reason rather than going silent (§4.4). */}
      {!reconciliation.reconciled || !lowConfidenceResolved || invalidDraft ? (
        <p className="mytab-type-meta" style={{ margin: "8px 0 0", textAlign: "center" }}>
          {invalidDraft
            ? "Give every item a name and enter valid positive amounts."
            : !reconciliation.reconciled
            ? "The items and the receipt total have to match first."
            : "Check every highlighted field before confirming."}
        </p>
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

      <DiscrepancyCard reconciliation={reconciliation} currency={parsed.currency} />
      {confirmationError ? (
        <p
          role="alert"
          className="mytab-type-meta"
          style={{ color: MYTAB_COLORS.warning, margin: "0 0 14px" }}
        >
          {confirmationError} Your corrections are still here; try confirming again.
        </p>
      ) : null}

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
            className="mytab-type-micro-label mytab-name"
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
            const priceValue =
              priceDrafts[index] ?? minorToCurrencyInput(line.unitPriceMinor, parsed.currency);
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

                {/*
                  Three columns whose widths are in `em`, not px.
                  A px column cannot hold a figure that grew with the platform
                  text setting: at 200% these were 40px and 104px boxes holding
                  32px type, and the price — an AMOUNT — was clipped. In `em`
                  each column is a multiple of its own field's type, so it grows
                  with the figure and the amount is never cut. `flexWrap` is the
                  release valve past that: when the three columns genuinely
                  cannot share 320px, the price drops to its own line rather
                  than pushing the card off the screen.
                */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    rowGap: 4,
                    columnGap: 12,
                  }}
                >
                  <label
                    style={{
                      flex: "none",
                      display: "flex",
                      alignItems: "center",
                      fontSize: "14px",
                      color: MYTAB_COLORS.inkMuted,
                    }}
                  >
                    <VisuallyHidden>Quantity for {line.name}</VisuallyHidden>
                    <input
                      inputMode="numeric"
                      min={1}
                      max={ITEM_QUANTITY_MAX}
                      aria-label={`Quantity for ${line.name}, maximum ${ITEM_QUANTITY_MAX}`}
                      value={String(line.quantity)}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, "");
                        const parsedQuantity = digits.length === 0 ? 1 : Number(digits);
                        updateLine(index, {
                          quantity: Number.isSafeInteger(parsedQuantity)
                            ? Math.min(ITEM_QUANTITY_MAX, Math.max(1, parsedQuantity))
                            : ITEM_QUANTITY_MAX,
                        });
                      }}
                      className="mytab-tabular"
                      style={{
                        ...BARE_FIELD,
                        fontSize: "14px",
                        // 44px at this type, and 44px-worth at any larger
                        // platform setting. The 40px column it replaced put the
                        // quantity field 12px under the touch floor.
                        width: "3.143em",
                        minWidth: "44px",
                        color: "inherit",
                      }}
                    />
                    <span aria-hidden="true" style={{ fontSize: "14px" }}>
                      &#215;
                    </span>
                  </label>

                  <label
                    style={{
                      // `flex-basis: 0` so the name never inflates the row's
                      // wrap calculation; the 3.5em floor is what makes the
                      // price wrap instead of the name vanishing.
                      flex: "1 1 0%",
                      minWidth: "3.5em",
                      ...flagStyle(line.flagged),
                    }}
                  >
                    <VisuallyHidden>Item name</VisuallyHidden>
                    <input
                      value={line.name}
                      onChange={(event) => {
                        updateLine(index, {
                          name: event.target.value,
                          nameConfidence: "high",
                        });
                        markResolved(`line.${index}.name`);
                      }}
                      className="mytab-item-name"
                      style={NAME_FIELD}
                    />
                  </label>

                  <label
                    style={{
                      flex: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      marginLeft: "auto",
                      fontSize: "15px",
                      width: "6.933em",
                      ...flagStyle(line.flagged),
                    }}
                  >
                    <VisuallyHidden>Unit price in {parsed.currency}</VisuallyHidden>
                    <span aria-hidden="true" style={{ fontSize: "15px", fontWeight: 500 }}>
                      {parsed.currency}
                    </span>
                    <input
                      inputMode="decimal"
                      value={priceValue}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setPriceDrafts((current) => ({ ...current, [index]: raw }));
                        const minor = currencyInputToMinor(raw, parsed.currency);
                        if (minor != null) {
                          updateLine(index, {
                            unitPriceMinor: minor as FiatMinor,
                            priceConfidence: "high",
                          });
                          markResolved(`line.${index}.price`);
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
                      style={{
                        ...BARE_FIELD,
                        width: 0,
                        flex: "1 1 0",
                        textAlign: "right",
                        color: "inherit",
                      }}
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
              aria-label={formatCurrencyMinorForA11y(
                reconciliation.linesTotalMinor,
                parsed.currency,
              )}
              style={{ fontSize: "14px", fontWeight: 500 }}
            >
              {formatCurrencyMinor(reconciliation.linesTotalMinor, parsed.currency)}
            </span>
          </div>

          {adjustments.map((adjustment, index) => {
            const label = adjustment.label ?? {
              service: "Service",
              tax: "Tax",
              discount: "Discount",
              gratuity: "Receipt gratuity",
            }[adjustment.kind];
            return (
              <label className="mytab-row" key={`${adjustment.kind}-${index}`}>
                <span className="mytab-row__label" style={{ fontSize: "14px" }}>
                  {adjustment.flagged ? `Check ${label}` : label}
                </span>
                <span className="mytab-row__amount" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span aria-hidden="true">{adjustment.kind === "discount" ? "−" : "+"}</span>
                  <span aria-hidden="true">{parsed.currency}</span>
                  <input
                    aria-label={`${label} in ${parsed.currency}`}
                    inputMode="decimal"
                    value={adjustmentDrafts[index] ?? minorToCurrencyInput(adjustment.amountMinor, parsed.currency)}
                    onChange={(event) => {
                      const raw = event.target.value;
                      setAdjustmentDrafts((current) => ({ ...current, [index]: raw }));
                      const minor = currencyInputToMinor(raw, parsed.currency);
                      if (minor != null && minor > 0) {
                        markResolved(`adjustment.${index}`);
                        setAdjustments((current) => current.map((row, rowIndex) =>
                          rowIndex === index
                            ? { ...row, amountMinor: minor as FiatMinor, flagged: false, confidence: "high" }
                            : row,
                        ));
                      }
                    }}
                    onBlur={() => setAdjustmentDrafts((current) => {
                      const next = { ...current };
                      delete next[index];
                      return next;
                    })}
                    className="mytab-tabular"
                    style={{ ...BARE_FIELD, width: "7em", textAlign: "right" }}
                  />
                </span>
              </label>
            );
          })}

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
              style={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                fontSize: "15px",
                /*
                 * `.mytab-row__amount` pins `min-width: max-content` so a
                 * rendered figure can never be squeezed. This cell holds an
                 * `<input>`, whose max-content width is the control's default
                 * ~20-character size — 375px, which pushed the card 120px past
                 * a 320px screen. The width below is the figure's real budget
                 * and grows with the type, so the amount is still never cut.
                 */
                minWidth: 0,
                width: "7.733em",
              }}
            >
              <span aria-hidden="true" style={{ fontSize: "15px", fontWeight: 600 }}>
                {parsed.currency}
              </span>
              <input
                inputMode="decimal"
                value={totalDraft ?? minorToCurrencyInput(receiptTotalMinor, parsed.currency)}
                onChange={(event) => {
                  const raw = event.target.value;
                  setTotalDraft(raw);
                  const minor = currencyInputToMinor(raw, parsed.currency);
                  if (minor != null) {
                    setReceiptTotalMinor(minor as FiatMinor);
                    markResolved("total");
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
