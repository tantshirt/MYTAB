"use client";

import type { BillReviewData } from "../../features/claims/useBillReviewData";
import { FIXTURE_BILL_REVIEW } from "@/tests/fixtures/claims";

export type { BillReviewData };

/** Sweep stand-in — see `tests/sweep/README.md`. */
export function useBillReviewData(_tabId: string | null): BillReviewData {
  return { bill: { ...FIXTURE_BILL_REVIEW }, revision: 0 };
}
