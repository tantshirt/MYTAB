"use client";

import { use, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { ReceiptReview, FIXTURE_PARSED_RECEIPT } from "@/features/receipts";
import type { ParsedReceipt } from "@/lib/domain/receiptParse";

type ReceiptPageProps = {
  params: Promise<{ publicToken: string }>;
};

type ReceiptData = {
  parsed: ParsedReceipt;
  /** Right of the merchant in the header strip. Absent when the import has no date. */
  capturedAtLabel?: string;
};

/**
 * Single prop-resolution point for Receipt Review.
 *
 * TODO(live-data): replace the fixture with
 * `useQuery(api.receipts.getImport, { publicToken })`, and route `onConfirm`
 * at `api.receipts.confirmReceipt` and `onUseSampleReceipt` at
 * `api.receipts.useSampleReceipt`.
 */
function useReceiptData(publicToken: string): ReceiptData {
  return useMemo(
    () => ({ parsed: FIXTURE_PARSED_RECEIPT, capturedAtLabel: "Tonight" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- publicToken is the seam key.
    [publicToken],
  );
}

function ReceiptSurface({ publicToken }: { publicToken: string }) {
  const router = useRouter();
  const { parsed, capturedAtLabel } = useReceiptData(publicToken);

  /*
   * §1.5 requires the Confirm action pinned, and it cannot pin from inside
   * `ReceiptReview`: `AppShell`'s content column sets `overflow-x: hidden`,
   * which makes it a scroll container, so any `position: sticky` descendant is
   * inert. `AppShell`'s `footer` slot is the element that actually pins, so the
   * route owns that element and the surface portals its action bar into it.
   */
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null);

  const handleConfirm = useCallback(() => {
    // Confirmed items become claimable, so the person lands on the Claim Board.
    router.push(`/tabs/${publicToken}`);
  }, [router, publicToken]);

  const handleManualEntry = useCallback(() => {
    router.push("/tabs/new");
  }, [router]);

  /*
   * Demo affordance only — `ReceiptReview` renders the link behind
   * `isDemoModeEnabled()`, so off-demo this handler is unreachable. Remounting
   * the surface reseeds it from the sample extraction and discards any edits,
   * which is exactly what the affordance promises.
   *
   * TODO(live-data): `api.receipts.useSampleReceipt` seeds the import server-side
   * and the reactive read replaces this remount.
   */
  const [sampleNonce, setSampleNonce] = useState(0);
  const handleUseSampleReceipt = useCallback(() => {
    setSampleNonce((value) => value + 1);
  }, []);

  return (
    <AppShell footer={<div ref={setFooterSlot} />}>
      <ReceiptReview
        key={sampleNonce}
        parsed={parsed}
        capturedAtLabel={capturedAtLabel}
        onConfirm={handleConfirm}
        onManualEntry={handleManualEntry}
        onUseSampleReceipt={handleUseSampleReceipt}
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
