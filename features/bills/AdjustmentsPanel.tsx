"use client";

import { AmountPair } from "@/components/primitives/amount-pair";
import type { AdjustmentKind } from "@/lib/domain/bill";

export type AdjustmentDraft = {
  kind: AdjustmentKind;
  label: string;
  calculation: "fixed" | "percentage";
  valueMinorOrBps: number;
  amountDisplay: string;
};

type AdjustmentsPanelProps = {
  adjustments: AdjustmentDraft[];
  editable: boolean;
  /**
   * Opens the editor for one charge kind. **Without it the chip row does not
   * render at all** — a visible button that does nothing is worse than an
   * absent one (POLISH-SPEC §1.4).
   */
  onEdit?: (kind: AdjustmentKind) => void;
};

const KIND_OPTIONS: Array<{ kind: AdjustmentKind; label: string }> = [
  { kind: "service", label: "Service charge" },
  { kind: "tax", label: "Tax" },
  { kind: "discount", label: "Discount" },
  { kind: "group_tip", label: "Group tip" },
];

/**
 * Tax, service, discount and group tip lines (Story 4.3 AC3).
 *
 * A block inside the bill card, not a card of its own.
 */
export function AdjustmentsPanel({ adjustments, editable, onEdit }: AdjustmentsPanelProps) {
  const showChips = editable && onEdit != null;

  return (
    <div data-testid="adjustments-panel">
      <h2 className="mytab-type-micro-label" style={{ margin: "0 0 12px" }}>
        Adjustments
      </h2>

      {adjustments.length === 0 ? (
        <p className="mytab-type-meta" style={{ margin: 0 }}>
          No charges added yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {adjustments.map((adjustment) => (
            <AmountPair
              key={adjustment.kind}
              label={adjustment.label}
              amount={adjustment.amountDisplay}
            />
          ))}
        </div>
      )}

      {showChips ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          {KIND_OPTIONS.map((option) => (
            <button
              key={option.kind}
              type="button"
              className="mytab-button-secondary mytab-button-inline"
              onClick={() => onEdit(option.kind)}
              style={{ fontSize: "13px", minHeight: 44, padding: "0 14px" }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
