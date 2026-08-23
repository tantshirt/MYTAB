"use client";

import { api } from "@/convex/_generated/api";
import { useLiveQuery } from "@/features/convex/useConvexData";

/**
 * Server capability: Convex holds `AI_GATEWAY_API_KEY`.
 * Never `NEXT_PUBLIC_FEATURE_RECEIPT_SCAN` — that variable is not a capability.
 */
export function useReceiptScanEnabled(): boolean {
  const result = useLiveQuery(api.receipts.isScanEnabled, {});
  return result.data === true;
}
