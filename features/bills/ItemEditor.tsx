"use client";

import { useState } from "react";
import { parseThbStringToMinor } from "@/lib/domain";
import { MYTAB_COLORS } from "@/lib/theme/tokens";

export type ItemEditorProps = {
  name: string;
  quantity: number;
  unitPriceBaht: number;
  onChange: (patch: Partial<Pick<ItemEditorProps, "name" | "quantity" | "unitPriceBaht">>) => void;
  onSave: () => void;
  onCancel: () => void;
};

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
  unitPriceBaht,
  onChange,
  onSave,
  onCancel,
}: ItemEditorProps) {
  const [touched, setTouched] = useState({ name: false, price: false });

  const nameMissing = name.trim().length === 0;
  const priceMissing = !(unitPriceBaht > 0);
  const valid = !nameMissing && !priceMissing;

  const showNameError = nameMissing && touched.name;
  const showPriceError = priceMissing && touched.price;

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
            onChange={(event) =>
              onChange({ quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })
            }
            className="mytab-input mytab-input--compact mytab-tabular"
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label
            className="mytab-type-label"
            htmlFor="item-price"
            style={{ display: "block", marginBottom: 8 }}
          >
            Unit price (฿)
          </label>
          <input
            id="item-price"
            type="number"
            inputMode="decimal"
            min={0.01}
            step={0.01}
            value={unitPriceBaht}
            aria-invalid={showPriceError || undefined}
            aria-describedby={showPriceError ? "item-price-error" : undefined}
            onChange={(event) => onChange({ unitPriceBaht: Number(event.target.value) })}
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
          Add a price.
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
