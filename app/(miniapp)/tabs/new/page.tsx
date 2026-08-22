"use client";

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { BillAuthoringSurface } from "@/features/bills/BillAuthoringSurface";
import { useNewTabData } from "@/features/bills/useNewTabData";
import { telegramUserIdFrom } from "@/features/convex/useConvexData";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { ManualEntryFallback, ReceiptCapture, ReceiptReview } from "@/features/receipts";
import { useReceiptData } from "@/features/receipts/useReceiptData";
import { useReceiptScanEnabled } from "@/features/receipts/useReceiptScanEnabled";
import { useLiveMutation } from "@/features/convex/useConvexData";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ParsedReceiptLine } from "@/lib/domain/receiptParse";
import type { FiatMinor } from "@/lib/domain/money";

type ScanPhase = "idle" | "capture" | "failed";

function NewTabSurface() {
  const searchParams = useSearchParams();
  const groupId = searchParams.get("group");
  const data = useNewTabData(groupId);
  const { initDataUnsafe } = useTelegramRuntime();
  const viewerTelegramUserId = telegramUserIdFrom(initDataUnsafe);
  const scanEnabled = useReceiptScanEnabled();
  const confirmReceipt = useLiveMutation(api.receipts.confirmReceipt);

  const [scanPhase, setScanPhase] = useState<ScanPhase>("idle");
  const [sessionImportId, setSessionImportId] = useState<string | null>(null);
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null);

  const receipt = useReceiptData(null, sessionImportId);

  const viewerUserId = data.members.find(
    (member) => member.telegramUserId === viewerTelegramUserId,
  )?.userId;

  const handleScanReceipt = useCallback(() => {
    setScanPhase("capture");
  }, []);

  const handleManualEntry = useCallback(() => {
    setScanPhase("idle");
    setSessionImportId(null);
  }, []);

  const handleConfirm = useCallback(
    (lines: ParsedReceiptLine[], receiptTotalMinor: FiatMinor) => {
      if (!confirmReceipt || !receipt.importId) {
        setScanPhase("idle");
        return;
      }
      void confirmReceipt({
        importId: receipt.importId as Id<"receiptImports">,
        lines: lines.map((line) => ({
          name: line.name,
          quantity: line.quantity,
          unitPriceMinor: BigInt(line.unitPriceMinor),
        })),
        receiptTotalMinor: BigInt(receiptTotalMinor),
      })
        .then(() => {
          setScanPhase("idle");
          setSessionImportId(null);
        })
        .catch(() => {
          /* The discrepancy card is already the surface's own rejection path. */
        });
    },
    [confirmReceipt, receipt.importId],
  );

  if (scanPhase === "failed") {
    return (
      <AppShell>
        <ManualEntryFallback
          failureMessage="Could not read photo"
          onManualEntry={handleManualEntry}
          onRetryCapture={scanEnabled ? () => setScanPhase("capture") : undefined}
        />
      </AppShell>
    );
  }

  if (receipt.status === "extracting" || receipt.status === "uploaded") {
    return (
      <AppShell>
        <p className="mytab-type-body" style={{ marginTop: 24 }}>
          Checking the receipt.
        </p>
      </AppShell>
    );
  }

  if (receipt.status === "needs_review" && receipt.parsed.lines.length > 0) {
    return (
      <AppShell footer={<div ref={setFooterSlot} />}>
        <ReceiptReview
          parsed={receipt.parsed}
          capturedAtLabel={receipt.capturedAtLabel}
          onConfirm={handleConfirm}
          onManualEntry={handleManualEntry}
          onScanReceipt={scanEnabled ? handleScanReceipt : undefined}
          footerSlot={footerSlot}
        />
      </AppShell>
    );
  }

  if (scanPhase === "capture") {
    return (
      <AppShell>
        <ReceiptCapture
          tabId={data.tabId}
          enabled
          onUploaded={(importId) => setSessionImportId(importId)}
          onFailure={() => setScanPhase("failed")}
        />
      </AppShell>
    );
  }

  return (
    <BillAuthoringSurface
      tabId={data.tabId}
      tabTitle={data.title}
      viewerUserId={viewerUserId}
      data={data}
      onScanReceipt={scanEnabled ? handleScanReceipt : undefined}
    />
  );
}

/** New Tab — the bill authoring surface (POLISH-SPEC §1.4). Accepts `?group=<id>`. */
export default function NewTabPage() {
  return (
    <AuthGate>
      <Suspense fallback={null}>
        <NewTabSurface />
      </Suspense>
    </AuthGate>
  );
}
