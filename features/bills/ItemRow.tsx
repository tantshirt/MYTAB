"use client";

import { formatCurrencyMinorForA11y } from "@/lib/domain/a11yAmount";
import { formatCurrencyMinor } from "@/lib/domain/format";
import { fiatMinorFromInteger } from "@/lib/domain/money";
import { MYTAB_COLORS } from "@/lib/theme/tokens";
import type { BillItemView } from "./types";

type ItemRowProps = {
  item: BillItemView;
  editable: boolean;
  displayCurrency?: string;
  /** Hairline above the row. Rows live inside one card, not one card each. */
  divider?: boolean;
  onEdit?: (itemId: string) => void;
  onDuplicate?: (itemId: string) => void;
  onRemove?: (itemId: string) => void;
};

/** Single item row with Thai/Latin truncation rules (Story 4.2 AC4). */
export function ItemRow({
  item,
  editable,
  displayCurrency = "THB",
  divider = false,
  onEdit,
  onDuplicate,
  onRemove,
}: ItemRowProps) {
  const lineTotalMinor = fiatMinorFromInteger(item.lineTotalMinor);

  return (
    <article
      data-testid={`item-row-${item._id}`}
      style={{
        padding: "12px 0",
        borderTop: divider ? `1px solid ${MYTAB_COLORS.border}` : undefined,
      }}
    >
      <div className="mytab-row">
        <div className="mytab-row__label">
          <p
            className="mytab-type-body"
            style={{
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              // Thai ascenders and descenders must not clip (DESIGN.md).
              lineHeight: 1.45,
            }}
          >
            {item.name}
          </p>
          <p className="mytab-type-meta" style={{ margin: "4px 0 0" }}>
            ×{item.quantity}
          </p>
        </div>
        <p
          className="mytab-row__amount mytab-type-amount-row mytab-tabular"
          data-mytab-amount
          aria-label={formatCurrencyMinorForA11y(lineTotalMinor, displayCurrency)}
          style={{ margin: 0 }}
        >
          {formatCurrencyMinor(lineTotalMinor, displayCurrency)}
        </p>
      </div>

      {editable ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 4 }}>
          {/* `.mytab-link-button` carries the 44px minimum target. */}
          <button
            type="button"
            className="mytab-link-button"
            onClick={() => onEdit?.(item._id)}
            aria-label={`Edit ${item.name}`}
          >
            Edit
          </button>
          <button
            type="button"
            className="mytab-link-button"
            onClick={() => onDuplicate?.(item._id)}
            aria-label={`Duplicate ${item.name}`}
          >
            Duplicate
          </button>
          {/* Destructive is `owed`. `warning` means "needs a human", not "this deletes". */}
          <button
            type="button"
            className="mytab-link-button"
            onClick={() => onRemove?.(item._id)}
            aria-label={`Remove ${item.name}`}
            style={{ color: MYTAB_COLORS.owed }}
          >
            Remove
          </button>
        </div>
      ) : null}
    </article>
  );
}
