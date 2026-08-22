"use client";

import { use, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { ReceiptReview } from "@/features/receipts";
import { useReceiptData } from "@/features/receipts/useReceiptData";
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

  /*
   * The second argument is the import this session created, which supersedes
   * the cold read from the tab. This route has no capture step of its own —
   * `finalizeUpload` runs in `features/receipts/ReceiptCapture` — so it always
   * reads the tab's newest live import.
   */
  const { importId, parsed, capturedAtLabel } = useReceiptData(tabId, null);

  const confirmReceipt = useLiveMutation(api.receipts.confirmReceipt);

  /*
   * §1.5 requires the Confirm action pinned, and it cannot pin from inside
   * `ReceiptReview`: `AppShell`'s content column sets `overflow-x: hidden`,
   * which makes it a scroll container, so any `position: sticky` descendant is
   * inert. `AppShell`'s `footer` slot is the element that actually pins, so the
   * route owns that element and the surface portals its action bar into it.
   */
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null);

  /**
   * `api.receipts.confirmReceipt` re-checks reconciliation server-side and
   * rejects a shortfall, so the client never has the last word on the total.
   */
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
        // Confirmed items become claimable, so the person lands on the Claim Board.
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

  return (
    <AppShell footer={<div ref={setFooterSlot} />}>
      <ReceiptReview
        parsed={parsed}
        capturedAtLabel={capturedAtLabel}
        onConfirm={handleConfirm}
        onManualEntry={handleManualEntry}
        footerSlot={footerSlot}
      />
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
