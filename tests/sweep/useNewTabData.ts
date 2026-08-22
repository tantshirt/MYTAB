"use client";

import type { BillAuthoringData } from "@/features/bills/types";
import { FIXTURE_BILL_AUTHORING } from "@/tests/fixtures/bills";

/** Sweep stand-in — see `tests/sweep/README.md`. */
export function useNewTabData(groupId: string | null): BillAuthoringData {
  return {
    ...FIXTURE_BILL_AUTHORING,
    tabId: groupId ? `tabs:new:${groupId}` : "tabs:new",
  };
}
