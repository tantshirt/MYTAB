"use client";

import { use, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { BillReview, FIXTURE_BILL_REVIEW, type BillReviewProps } from "@/features/claims";
import { SettleSheetHost, settleSearch } from "@/features/settlement/SettleSheetHost";

type BillPageProps = {
  params: Promise<{ publicToken: string }>;
};

/**
 * Single prop-resolution point for Bill Review.
 *
 * TODO(live-data): replace the fixture with
 * `useQuery(api.allocations.getBillReview, { publicToken })`, and route
 * `onLock` at `api.allocations.lockBill`.
 */
function useBillReviewData(publicToken: string): BillReviewProps {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- publicToken is the seam key.
  return useMemo(() => ({ ...FIXTURE_BILL_REVIEW }), [publicToken]);
}

function BillReviewSurface({ publicToken }: { publicToken: string }) {
  const router = useRouter();
  const bill = useBillReviewData(publicToken);

  const handleLock = useCallback(() => {
    router.push(`/tabs/${publicToken}`);
  }, [router, publicToken]);

  const handleSettle = useCallback(() => {
    // The Payment Sheet is a sheet over the Claim Board, keyed on `?settle=`.
    router.push(`/tabs/${publicToken}${settleSearch(publicToken)}`);
  }, [router, publicToken]);

  return (
    <AppShell>
      <BillReview {...bill} onLock={handleLock} onSettle={handleSettle} />
      <SettleSheetHost />
    </AppShell>
  );
}

/** Bill Review — `/tabs/[publicToken]/bill` (POLISH-SPEC §1.7). */
export default function BillPage({ params }: BillPageProps) {
  const { publicToken } = use(params);

  return (
    <AuthGate>
      <BillReviewSurface publicToken={publicToken} />
    </AuthGate>
  );
}
