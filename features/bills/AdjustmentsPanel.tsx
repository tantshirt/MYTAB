"use client";

import { AmountPair } from "@/components/primitives/amount-pair";
import type { AdjustmentKind } from "@/lib/domain/bill";
import { MYTAB_COLORS } from "@/lib/theme/tokens";

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
  onEdit?: (kind: AdjustmentKind) => void;
};

const KIND_OPTIONS: Array<{ kind: AdjustmentKind; label: string }> = [
  { kind: "service", label: "Service charge" },
  { kind: "tax", label: "Tax" },
  { kind: "discount", label: "Discount" },
  { kind: "group_tip", label: "Group tip" },
];

/** Tax, service, discount, and group tip lines (Story 4.3 AC3). */
export function AdjustmentsPanel({ adjustments, editable, onEdit }: AdjustmentsPanelProps) {
  return (
    <section className="mytab-card" style={{ padding: "20px" }} data-testid="adjustments-panel">
      <p className="mytab-type-micro-label" style={{ marginBottom: 12 }}>
        Adjustments
      </p>

      {adjustments.length === 0 ? (
        <p className="mytab-type-meta" style={{ color: MYTAB_COLORS.inkMuted, margin: 0 }}>
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

      {editable ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          {KIND_OPTIONS.map((option) => (
            <button
              key={option.kind}
              type="button"
              className="mytab-button-secondary mytab-button-inline"
              onClick={() => onEdit?.(option.kind)}
              style={{ fontSize: "13px", minHeight: 44, padding: "0 14px" }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
