"use client";

import { use, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { ReceiptReview, FIXTURE_PARSED_RECEIPT } from "@/features/receipts";
import type { ParsedReceipt } from "@/lib/domain/receiptParse";

type ReceiptPageProps = {
  params: Promise<{ publicToken: string }>;
};

/**
 * Single prop-resolution point for Receipt Review.
 *
 * TODO(live-data): replace the fixture with
 * `useQuery(api.receipts.getImport, { publicToken })`, and route `onConfirm`
 * at `api.receipts.confirmReceipt`.
 */
function useReceiptData(publicToken: string): ParsedReceipt {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- publicToken is the seam key.
  return useMemo(() => FIXTURE_PARSED_RECEIPT, [publicToken]);
}

function ReceiptSurface({ publicToken }: { publicToken: string }) {
  const router = useRouter();
  const parsed = useReceiptData(publicToken);

  const handleConfirm = useCallback(() => {
    // Confirmed items become claimable, so the person lands on the Claim Board.
    router.push(`/tabs/${publicToken}`);
  }, [router, publicToken]);

  const handleManualEntry = useCallback(() => {
    router.push("/tabs/new");
  }, [router]);

  return (
    <AppShell>
      <ReceiptReview
        parsed={parsed}
        onConfirm={handleConfirm}
        onManualEntry={handleManualEntry}
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
