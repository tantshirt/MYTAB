"use client";

import { use, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { ManualEntryFallback, ReceiptCapture, ReceiptReview } from "@/features/receipts";
import { useReceiptData } from "@/features/receipts/useReceiptData";
import { useReceiptScanEnabled } from "@/features/receipts/useReceiptScanEnabled";
import { useResolvedTab } from "@/features/tabs/useTabData";
import { useLiveMutation } from "@/features/convex/useConvexData";
import { useLiveQuery } from "@/features/convex/useConvexData";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  ParsedReceipt,
  ParsedReceiptAdjustment,
  ParsedReceiptLine,
} from "@/lib/domain/receiptParse";
import type { FiatMinor } from "@/lib/domain/money";
import { buildReceiptConfirmationArgs } from "@/features/receipts/receiptSubmission";
import {
  receiptConfirmationFailureMessage,
  receiptFailureMessage,
} from "@/features/receipts/receiptErrors";

type ReceiptPageProps = {
  params: Promise<{ publicToken: string }>;
};

function ReceiptSurface({ publicToken }: { publicToken: string }) {
  const router = useRouter();
  const session = useResolvedTab(publicToken);
  const tabId = session.status === "ready" ? session.tabId : null;
  const scanEnabled = useReceiptScanEnabled();
  const tab = useLiveQuery(
    api.tabs.getTab,
    tabId ? { tabId: tabId as Id<"tabs"> } : "skip",
  );
  const tabAcceptsReceipt = tab.data?.status === "draft" || tab.data?.status === "open";

  const [sessionImportId, setSessionImportId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureFailure, setCaptureFailure] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);

  const { importId, parsed, capturedAtLabel, status, failureCode } = useReceiptData(
    tabId,
    sessionImportId,
  );

  const confirmReceipt = useLiveMutation(api.receipts.confirmReceipt);
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null);

  const handleConfirm = useCallback(
    (
      lines: ParsedReceiptLine[],
      receiptTotalMinor: FiatMinor,
      adjustments: ParsedReceiptAdjustment[],
      currency: ParsedReceipt["currency"],
      resolvedLowConfidenceFields: string[],
    ) => {
      const land = () => router.push(`/tabs/${publicToken}`);

      if (!confirmReceipt || !importId) {
        setConfirmationError("Receipt confirmation is unavailable.");
        return;
      }

      setConfirmationError(null);

      void confirmReceipt(buildReceiptConfirmationArgs(
        importId,
        lines,
        receiptTotalMinor,
        adjustments,
        currency,
        resolvedLowConfidenceFields,
      ) as Parameters<NonNullable<typeof confirmReceipt>>[0])
        .then(land)
        .catch((error: unknown) => {
          setConfirmationError(receiptConfirmationFailureMessage(error));
        });
    },
    [confirmReceipt, importId, router, publicToken],
  );

  const handleManualEntry = useCallback(() => {
    router.push(`/tabs/${publicToken}`);
  }, [router, publicToken]);

  const startCapture = useCallback(() => {
    setCaptureFailure(null);
    setCaptureOpen(true);
  }, []);

  const extracting = status === "extracting" || status === "uploaded";
  const failed = captureFailure != null || status === "failed";
  const showCapture =
    scanEnabled &&
    tabAcceptsReceipt &&
    tabId != null &&
    (captureOpen || (!parsed.lines.length && !extracting && !failed && status !== "needs_review"));

  return (
    <AppShell footer={parsed.lines.length > 0 && !extracting ? <div ref={setFooterSlot} /> : undefined}>
      {extracting ? (
        <p className="mytab-type-body" style={{ marginTop: 24 }}>
          Checking the receipt.
        </p>
      ) : null}

      {failed && !extracting ? (
        <ManualEntryFallback
          failureMessage={captureFailure ?? receiptFailureMessage(failureCode)}
          onManualEntry={handleManualEntry}
          onRetryCapture={scanEnabled && tabAcceptsReceipt ? startCapture : undefined}
        />
      ) : null}

      {showCapture && !extracting && !failed ? (
        <ReceiptCapture
          tabId={tabId}
          enabled
          onUploaded={(nextImportId) => {
            setSessionImportId(nextImportId);
            setCaptureOpen(false);
          }}
          onFailure={(message) => {
            setCaptureFailure(message);
            setCaptureOpen(false);
          }}
        />
      ) : null}

      {!extracting && !failed && !showCapture ? (
        <ReceiptReview
          parsed={parsed}
          capturedAtLabel={capturedAtLabel}
          onConfirm={handleConfirm}
          onManualEntry={handleManualEntry}
          onScanReceipt={scanEnabled && tabAcceptsReceipt ? startCapture : undefined}
          confirmationError={confirmationError}
          footerSlot={footerSlot}
        />
      ) : null}
    </AppShell>
  );
}

/** Receipt Review — `/tabs/[publicToken]/receipt` (POLISH-SPEC §1.5). */
export default function ReceiptPage({ params }: ReceiptPageProps) {
  const { publicToken } = use(params);

  return (
    <AuthGate>
      <ReceiptSurface publicToken={publicToken} />
    </AuthGate>
  );
}
