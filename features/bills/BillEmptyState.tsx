"use client";

import { EmptyState } from "@/components/primitives/empty-state";

type BillEmptyStateProps = {
  isOrganizer: boolean;
  organizerDisplayName: string;
  onAddManual?: () => void;
  /** Absent when receipt scanning is off or unwired — never rendered disabled. */
  onScanReceipt?: () => void;
};

/**
 * Organizer vs participant empty states (Stories 4.2 AC5, 4.4 AC3).
 *
 * This is a whole-surface state, not a section, so a card is correct here and
 * only here — POLISH-SPEC §4.2 specifies empty states as `colors/surface` cards
 * at `padding: 24px 20px`, centred, `rounded/md`, 1px `colors/border`. The
 * shared `EmptyState` primitive is that card.
 */
export function BillEmptyState({
  isOrganizer,
  organizerDisplayName,
  onAddManual,
  onScanReceipt,
}: BillEmptyStateProps) {
  if (!isOrganizer) {
    return (
      <div data-testid="bill-participant-waiting">
        <EmptyState
          headline={`${organizerDisplayName} is adding the bill. You can stay here — it will appear automatically.`}
        />
      </div>
    );
  }

  return (
    <div data-testid="bill-organizer-empty">
      <EmptyState
        headline="Add what you ordered."
        action={
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button type="button" className="mytab-button-primary" onClick={onAddManual}>
              Type an item
            </button>
            {onScanReceipt ? (
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
