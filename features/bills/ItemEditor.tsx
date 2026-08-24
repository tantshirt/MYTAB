"use client";

import { useState } from "react";
import {
  assertSupportedCurrency,
  currencyMinorDigits,
  currencyDefinition,
  parseCurrencyAmount,
  parseThbStringToMinor,
} from "@/lib/domain";
import { MYTAB_COLORS } from "@/lib/theme/tokens";

export type ItemEditorProps = {
  name: string;
  quantity: number;
  unitPriceInput: string;
  displayCurrency?: string;
  onChange: (patch: Partial<Pick<ItemEditorProps, "name" | "quantity" | "unitPriceInput">>) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function clampItemQuantity(raw: string, fallback = 1): number {
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed)
    ? Math.min(999, Math.max(1, Math.floor(parsed)))
    : fallback;
}

/**
 * Inline item editor for manual capture (Story 4.2), with the validation
 * POLISH-SPEC §1.4 requires: Save is unavailable until the item has a name and
 * a price, and the reason is stated under the field that is missing one.
 *
 * No card of its own — the fields sit on `colors/paper` exactly as they do on
 * New Tab, because this is the same authoring act.
 */
export function ItemEditor({
  name,
  quantity,
  unitPriceInput,
  displayCurrency = "THB",
  onChange,
  onSave,
  onCancel,
}: ItemEditorProps) {
  const currency = assertSupportedCurrency(displayCurrency);
  const minorDigits = currencyMinorDigits(currency);
  const step = minorDigits === 0 ? 1 : 1 / 10 ** minorDigits;
  const [touched, setTouched] = useState({ name: false, price: false });

  const nameMissing = name.trim().length === 0;
  const priceMissing = unitPriceInput.trim().length === 0;
  let pricePrecisionInvalid = false;
  if (!priceMissing) {
    try {
      if (parseCurrencyAmount(unitPriceInput, currency) <= 0) pricePrecisionInvalid = true;
    } catch {
      pricePrecisionInvalid = true;
    }
  }
  const quantityInvalid =
    !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999;
  const valid = !nameMissing && !priceMissing && !pricePrecisionInvalid && !quantityInvalid;

  const showNameError = nameMissing && touched.name;
  const showPriceError = (priceMissing || pricePrecisionInvalid) && touched.price;

  const handleSubmit = () => {
    setTouched({ name: true, price: true });
    if (valid) {
      onSave();
    }
  };

  return (
    <form
      data-testid="item-editor"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
      noValidate
    >
      <section style={{ marginBottom: 24 }}>
        <h2 id="item-name-label" className="mytab-type-micro-label" style={{ margin: "0 0 9px" }}>
          Item
        </h2>
        <input
          id="item-name"
          aria-labelledby="item-name-label"
          aria-invalid={showNameError || undefined}
          aria-describedby={showNameError ? "item-name-error" : undefined}
          value={name}
          onChange={(event) => onChange({ name: event.target.value })}
          onBlur={() => setTouched((current) => ({ ...current, name: true }))}
          className="mytab-input"
          style={showNameError ? { borderColor: MYTAB_COLORS.owed } : undefined}
          maxLength={120}
        />
        {showNameError ? (
          <p
            id="item-name-error"
            className="mytab-type-meta"
            style={{ margin: "8px 0 0", color: MYTAB_COLORS.owed }}
          >
            Give it a name.
          </p>
        ) : null}
      </section>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label
            className="mytab-type-label"
            htmlFor="item-qty"
            style={{ display: "block", marginBottom: 8 }}
          >
            Quantity
          </label>
          <input
            id="item-qty"
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            value={quantity}
            onChange={(event) => onChange({ quantity: clampItemQuantity(event.target.value) })}
            className="mytab-input mytab-input--compact mytab-tabular"
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label
            className="mytab-type-label"
            htmlFor="item-price"
            style={{ display: "block", marginBottom: 8 }}
          >
            Unit price ({currencyDefinition(currency).symbol.trim() || currency})
          </label>
          <input
            id="item-price"
            type="number"
            inputMode="decimal"
            min={step}
            step={step}
            value={unitPriceInput}
            aria-invalid={showPriceError || undefined}
            aria-describedby={showPriceError ? "item-price-error" : undefined}
            onChange={(event) => onChange({ unitPriceInput: event.target.value })}
            onBlur={() => setTouched((current) => ({ ...current, price: true }))}
            className="mytab-input mytab-input--compact mytab-tabular"
            style={showPriceError ? { borderColor: MYTAB_COLORS.owed } : undefined}
          />
        </div>
      </div>

      {showPriceError ? (
        <p
          id="item-price-error"
          className="mytab-type-meta"
          style={{ margin: "0 0 12px", color: MYTAB_COLORS.owed }}
        >
          {pricePrecisionInvalid
            ? `${currency} uses ${minorDigits} decimal place${minorDigits === 1 ? "" : "s"}.`
            : "Add a price."}
        </p>
      ) : null}

      <p className="mytab-type-meta" style={{ margin: "0 0 20px" }}>
        Line total is computed from quantity and unit price.
      </p>

      <div style={{ display: "flex", gap: 12 }}>
        <button type="submit" className="mytab-button-primary" disabled={!valid} style={{ flex: 1 }}>
          Save item
        </button>
        <button
          type="button"
          className="mytab-button-secondary"
          onClick={onCancel}
          style={{ flex: 1 }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function bahtToMinor(baht: number): number {
  if (!Number.isFinite(baht) || baht <= 0) {
    return 0;
  }
  return parseThbStringToMinor(baht.toFixed(2));
}

export function minorToBaht(minor: number): number {
  return minor / 100;
}

/** Generic manual-entry conversion. Invalid/excess precision is refused. */
export function currencyUnitToMinor(amount: string, currency: string): number {
  if (!amount.trim()) return 0;
  try {
    const minor = parseCurrencyAmount(amount, currency);
    return minor > 0 ? minor : 0;
  } catch {
    return 0;
  }
}

export function minorToCurrencyUnit(minor: number, currency: string): string {
  const digits = currencyMinorDigits(currency);
  if (digits === 0) return String(minor);
  const scale = 10 ** digits;
  return `${Math.floor(minor / scale)}.${String(minor % scale).padStart(digits, "0")}`;
}

export function safeLineTotalMinor(unitPriceMinor: number, quantity: number): number | null {
  if (!Number.isSafeInteger(unitPriceMinor) || unitPriceMinor <= 0 ||
      !Number.isSafeInteger(quantity) || quantity <= 0) return null;
  const total = BigInt(unitPriceMinor) * BigInt(quantity);
  return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
}
