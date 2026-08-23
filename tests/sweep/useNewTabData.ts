"use client";

import type { BillAuthoringData } from "@/features/bills/types";
import { FIXTURE_BILL_AUTHORING, FIXTURE_EMPTY_BILL } from "@/tests/fixtures/bills";

/** Sweep stand-in — see `tests/sweep/README.md`. */
export function useNewTabData(groupId: string | null): BillAuthoringData {
  if (!groupId) {
    return {
      ...FIXTURE_EMPTY_BILL,
      tabId: "tabs:new",
      origin: "personal",
      seats: 5,
    };
  }
  return {
    ...FIXTURE_BILL_AUTHORING,
    tabId: `tabs:new:${groupId}`,
    origin: "chat",
  };
}
