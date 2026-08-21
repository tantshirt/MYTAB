"use client";

import { formatFiatMinorThb } from "@/lib/domain/format";
import { fiatMinorFromInteger } from "@/lib/domain/money";
import { MYTAB_COLORS } from "@/lib/theme/tokens";
import type { BillItemView } from "./fixtures";

type ItemRowProps = {
  item: BillItemView;
  editable: boolean;
  onEdit?: (itemId: string) => void;
  onDuplicate?: (itemId: string) => void;
  onRemove?: (itemId: string) => void;
};

/** Single item row with Thai/Latin truncation rules (Story 4.2 AC4). */
export function ItemRow({ item, editable, onEdit, onDuplicate, onRemove }: ItemRowProps) {
  return (
    <article
      data-testid={`item-row-${item._id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "8px 12px",
        alignItems: "baseline",
        padding: "12px 0",
        borderBottom: `1px solid ${MYTAB_COLORS.border}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p
          className="mytab-type-body"
          style={{
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.45,
          }}
        >
          {item.name}
        </p>
        <p className="mytab-type-meta" style={{ margin: "4px 0 0", color: MYTAB_COLORS.inkMuted }}>
          ×{item.quantity}
        </p>
      </div>
      <p
        className="mytab-type-body mytab-tabular"
        data-mytab-amount
        style={{ margin: 0, whiteSpace: "nowrap" }}
      >
        {formatFiatMinorThb(fiatMinorFromInteger(item.lineTotalMinor))}
      </p>

      {editable ? (
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12 }}>
          <button type="button" className="mytab-link-button" onClick={() => onEdit?.(item._id)}>
            Edit
          </button>
          <button
            type="button"
            className="mytab-link-button"
            onClick={() => onDuplicate?.(item._id)}
          >
            Duplicate
          </button>
          <button
            type="button"
            className="mytab-link-button"
            onClick={() => onRemove?.(item._id)}
            style={{ color: MYTAB_COLORS.warning }}
          >
            Remove
          </button>
        </div>
      ) : null}
    </article>
  );
}
