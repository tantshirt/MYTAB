"use client";

import { MYTAB_COLORS } from "@/lib/theme/tokens";
import { isReceiptScanEnabled } from "@/lib/features/flags";

export type ReceiptCaptureProps = {
  onCapture: () => void;
  onSelectFile: () => void;
  disabled?: boolean;
};

/**
 * Scan receipt affordance — no AI framing, no sparkle, no wand, no robot
 * (Story 8.1 AC7, 8.6 AC3; DESIGN.md *Don't*).
 */
export function ReceiptCapture({ onCapture, onSelectFile, disabled = false }: ReceiptCaptureProps) {
  if (!isReceiptScanEnabled()) {
    return null;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <button
        type="button"
        className="mytab-button-secondary"
        onClick={onCapture}
        disabled={disabled}
      >
        Scan receipt
      </button>
      <button
        type="button"
        className="mytab-link-button"
        onClick={onSelectFile}
        disabled={disabled}
      >
        Choose from photos
      </button>
    </div>
  );
}

export type ManualEntryFallbackProps = {
  onManualEntry: () => void;
  onRetryCapture?: () => void;
  failureMessage?: string;
};

/** Failure routes to manual entry (Story 8.6 AC2). */
export function ManualEntryFallback({
  onManualEntry,
  onRetryCapture,
  failureMessage,
}: ManualEntryFallbackProps) {
  return (
    <div>
      {failureMessage ? (
        <p className="mytab-type-body" style={{ margin: "0 0 12px", color: MYTAB_COLORS.owed }}>
          {failureMessage}
        </p>
      ) : null}
      <p className="mytab-type-body" style={{ margin: 0, fontWeight: 500 }}>
        Add what you ordered.
      </p>
      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <button type="button" className="mytab-button-primary" onClick={onManualEntry}>
          Add items manually
        </button>
        {onRetryCapture && isReceiptScanEnabled() ? (
          <button type="button" className="mytab-button-secondary" onClick={onRetryCapture}>
            Scan receipt
          </button>
        ) : null}
      </div>
    </div>
  );
}
