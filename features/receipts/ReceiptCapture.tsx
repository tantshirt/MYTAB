"use client";

import { useRef, useState } from "react";
import { MYTAB_COLORS } from "@/lib/theme/tokens";
import { useReceiptUpload } from "./useReceiptUpload";
import { receiptFailureMessage } from "./receiptErrors";

export type ReceiptCaptureProps = {
  /** When set, capture uploads through Convex storage and finalizes the ticket. */
  tabId?: string;
  onCapture?: () => void;
  onSelectFile?: () => void;
  onUploaded?: (importId: string) => void;
  onFailure?: (message: string) => void;
  /** Absent/false hides the affordance — never shown disabled as a dead control. */
  enabled?: boolean;
  disabled?: boolean;
};

/**
 * Scan receipt affordance — no AI framing, no sparkle, no wand, no robot
 * (Story 8.1 AC7, 8.6 AC3; DESIGN.md *Don't*).
 */
export function ReceiptCapture({
  tabId,
  onCapture,
  onSelectFile,
  onUploaded,
  onFailure,
  enabled = true,
  disabled = false,
}: ReceiptCaptureProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const { upload } = useReceiptUpload();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!enabled) {
    return null;
  }

  const handleFiles = async (files: readonly File[]) => {
    if (files.length === 0) {
      return;
    }
    if (files.length > 8) {
      const message = receiptFailureMessage(new Error("RECEIPT_PAGE_LIMIT_EXCEEDED"));
      setLocalError(message);
      onFailure?.(message);
      return;
    }
    if (!tabId || !upload) return;
    setLocalError(null);
    setBusy(true);
    try {
      const importId = await upload(tabId, files);
      onUploaded?.(importId);
    } catch (error) {
      const message = receiptFailureMessage(error);
      setLocalError(message);
      onFailure?.(message);
    } finally {
      setBusy(false);
    }
  };

  const locked = disabled || busy;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {localError ? (
        <p role="alert" className="mytab-type-meta" style={{ margin: 0, color: MYTAB_COLORS.owed }}>
          {localError}
        </p>
      ) : null}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void handleFiles(file ? [file] : []);
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void handleFiles(files);
        }}
      />
      <button
        type="button"
        className="mytab-button-secondary"
        onClick={() => {
          if (onCapture) {
            onCapture();
            return;
          }
          cameraRef.current?.click();
        }}
        disabled={locked}
      >
        Scan receipt
      </button>
      <button
        type="button"
        className="mytab-link-button"
        onClick={() => {
          if (onSelectFile) {
            onSelectFile();
            return;
          }
          libraryRef.current?.click();
        }}
        disabled={locked}
      >
        Choose up to 8 photos
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
        {onRetryCapture ? (
          <button type="button" className="mytab-button-secondary" onClick={onRetryCapture}>
            Scan receipt
          </button>
        ) : null}
      </div>
    </div>
  );
}
