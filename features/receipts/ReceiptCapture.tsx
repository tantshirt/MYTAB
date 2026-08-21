"use client";

import { MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";
import { isReceiptScanEnabled } from "@/lib/features/flags";

export type ReceiptCaptureProps = {
  onCapture: () => void;
  onSelectFile: () => void;
  disabled?: boolean;
};

/** Scan receipt affordance — no AI framing (Story 8.1 AC7, 8.6 AC3). */
export function ReceiptCapture({ onCapture, onSelectFile, disabled = false }: ReceiptCaptureProps) {
  if (!isReceiptScanEnabled()) {
    return null;
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <button
        type="button"
        onClick={onCapture}
        disabled={disabled}
        style={{
          minHeight: "52px",
          borderRadius: MYTAB_RADIUS.sm,
          border: `1px solid ${MYTAB_COLORS.border}`,
          background: MYTAB_COLORS.surface,
          color: MYTAB_COLORS.ink,
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        Scan receipt
      </button>
      <button
        type="button"
        onClick={onSelectFile}
        disabled={disabled}
        className="mytab-type-meta"
        style={{
          minHeight: "44px",
          border: "none",
          background: "transparent",
          color: MYTAB_COLORS.primary,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
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
        <p className="mytab-type-body" style={{ color: MYTAB_COLORS.owed, marginBottom: "12px" }}>
          {failureMessage}
        </p>
      ) : null}
      <p className="mytab-type-body" style={{ color: MYTAB_COLORS.inkMuted }}>
        Add what you ordered.
      </p>
      <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
        <button
          type="button"
          onClick={onManualEntry}
          style={{
            minHeight: "52px",
            borderRadius: MYTAB_RADIUS.sm,
            border: "none",
            background: MYTAB_COLORS.primary,
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Add items manually
        </button>
        {onRetryCapture && isReceiptScanEnabled() ? (
          <button
            type="button"
            onClick={onRetryCapture}
            style={{
              minHeight: "44px",
              borderRadius: MYTAB_RADIUS.sm,
              border: `1px solid ${MYTAB_COLORS.border}`,
              background: MYTAB_COLORS.surface,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Scan receipt
          </button>
        ) : null}
      </div>
    </div>
  );
}
