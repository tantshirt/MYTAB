"use client";

import { parseThbStringToMinor } from "@/lib/domain";
import { MYTAB_COLORS } from "@/lib/theme/tokens";

export type ItemEditorProps = {
  name: string;
  quantity: number;
  unitPriceBaht: number;
  onChange: (patch: Partial<ItemEditorProps>) => void;
  onSave: () => void;
  onCancel: () => void;
};

/** Inline item editor for manual capture (Story 4.2). */
export function ItemEditor({
  name,
  quantity,
  unitPriceBaht,
  onChange,
  onSave,
  onCancel,
}: ItemEditorProps) {
  return (
    <section
      className="mytab-card"
      style={{ padding: "20px" }}
      data-testid="item-editor"
    >
      <label className="mytab-type-micro-label" htmlFor="item-name">
        Item
      </label>
      <input
        id="item-name"
        value={name}
        onChange={(event) => onChange({ name: event.target.value })}
        className="mytab-input"
        style={{ width: "100%", marginTop: 8, marginBottom: 16 }}
        maxLength={120}
      />

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label className="mytab-type-micro-label" htmlFor="item-qty">
            Quantity
          </label>
          <input
            id="item-qty"
            type="number"
            min={1}
            max={999}
            value={quantity}
            onChange={(event) => onChange({ quantity: Number(event.target.value) })}
            className="mytab-input mytab-tabular"
            style={{ width: "100%", marginTop: 8 }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="mytab-type-micro-label" htmlFor="item-price">
            Unit price (฿)
          </label>
          <input
            id="item-price"
            type="number"
            min={0.01}
            step={0.01}
            value={unitPriceBaht}
            onChange={(event) => onChange({ unitPriceBaht: Number(event.target.value) })}
            className="mytab-input mytab-tabular"
            style={{ width: "100%", marginTop: 8 }}
          />
        </div>
      </div>

      <p className="mytab-type-meta" style={{ marginTop: 12, color: MYTAB_COLORS.inkMuted }}>
        Line total is computed from quantity and unit price.
      </p>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button type="button" className="mytab-button-primary" onClick={onSave} style={{ flex: 1 }}>
          Save item
        </button>
        <button type="button" className="mytab-button-secondary" onClick={onCancel} style={{ flex: 1 }}>
          Cancel
        </button>
      </div>
    </section>
  );
}

export function bahtToMinor(baht: number): number {
  return parseThbStringToMinor(baht.toFixed(2));
}

export function minorToBaht(minor: number): number {
  return minor / 100;
}
