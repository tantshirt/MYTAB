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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ParsedReceiptLine } from "@/lib/domain/receiptParse";
import type { FiatMinor } from "@/lib/domain/money";

type ReceiptPageProps = {
  params: Promise<{ publicToken: string }>;
};

function ReceiptSurface({ publicToken }: { publicToken: string }) {
  const router = useRouter();
  const session = useResolvedTab(publicToken);
  const tabId = session.status === "ready" ? session.tabId : null;
  const scanEnabled = useReceiptScanEnabled();

  const [sessionImportId, setSessionImportId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);

  const { importId, parsed, capturedAtLabel, status } = useReceiptData(
    tabId,
    sessionImportId,
  );

  const confirmReceipt = useLiveMutation(api.receipts.confirmReceipt);
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null);

  const handleConfirm = useCallback(
    (lines: ParsedReceiptLine[], receiptTotalMinor: FiatMinor) => {
      const land = () => router.push(`/tabs/${publicToken}`);

      if (!confirmReceipt || !importId) {
        land();
        return;
      }

      void confirmReceipt({
        importId: importId as Id<"receiptImports">,
        lines: lines.map((line) => ({
          name: line.name,
          quantity: line.quantity,
          unitPriceMinor: BigInt(line.unitPriceMinor),
        })),
        receiptTotalMinor: BigInt(receiptTotalMinor),
      })
        .then(land)
        .catch(() => {
          /* The discrepancy card is already the surface's own rejection path. */
        });
    },
    [confirmReceipt, importId, router, publicToken],
  );

  const handleManualEntry = useCallback(() => {
    router.push("/tabs/new");
  }, [router]);

  const startCapture = useCallback(() => {
    setCaptureFailed(false);
    setCaptureOpen(true);
  }, []);

  const extracting = status === "extracting" || status === "uploaded";
  const failed = captureFailed || status === "failed";
  const showCapture =
    scanEnabled &&
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
          failureMessage="Could not read photo"
          onManualEntry={handleManualEntry}
          onRetryCapture={scanEnabled ? startCapture : undefined}
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
          onFailure={() => {
            setCaptureFailed(true);
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
          onScanReceipt={scanEnabled ? startCapture : undefined}
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
