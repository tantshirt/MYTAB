"use client";

import type { ReceiptData } from "../../features/receipts/useReceiptData";
import { FIXTURE_PARSED_RECEIPT } from "@/tests/fixtures/receipts";

export { EMPTY_RECEIPT } from "../../features/receipts/useReceiptData";
export type { ReceiptData };

/** Sweep stand-in — see `tests/sweep/README.md`. */
export function useReceiptData(
  _tabId: string | null,
  _sessionImportId: string | null,
): ReceiptData {
  return {
    importId: "receiptImports:sweep",
    parsed: FIXTURE_PARSED_RECEIPT,
    status: "needs_review",
    capturedAtLabel: "Tonight",
  };
}
