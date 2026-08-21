"use client";

import { MYTAB_COLORS } from "@/lib/theme/tokens";

type BillEmptyStateProps = {
  isOrganizer: boolean;
  organizerDisplayName: string;
  onAddManual?: () => void;
  onScanReceipt?: () => void;
};

/** Organizer vs participant empty states (Stories 4.2 AC5, 4.4 AC3). */
export function BillEmptyState({
  isOrganizer,
  organizerDisplayName,
  onAddManual,
  onScanReceipt,
}: BillEmptyStateProps) {
  if (!isOrganizer) {
    return (
      <section
        className="mytab-card"
        style={{ padding: "24px 20px", textAlign: "center" }}
        data-testid="bill-participant-waiting"
      >
        <p className="mytab-type-body" style={{ margin: 0, color: MYTAB_COLORS.ink }}>
          {organizerDisplayName} is adding the bill. You can stay here — it will appear automatically.
        </p>
      </section>
    );
  }

  return (
    <section
      className="mytab-card"
      style={{ padding: "24px 20px" }}
      data-testid="bill-organizer-empty"
    >
      <p className="mytab-type-body" style={{ margin: "0 0 16px", color: MYTAB_COLORS.ink }}>
        Add what you ordered.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <button
          type="button"
          className="mytab-button-primary"
          onClick={onAddManual}
          style={{ width: "100%" }}
        >
          Type an item
        </button>
        <button
          type="button"
          className="mytab-button-secondary"
          onClick={onScanReceipt}
          style={{ width: "100%" }}
        >
          Scan a receipt
        </button>
      </div>
    </section>
  );
}
