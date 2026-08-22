"use client";

import type { ClaimBoardData } from "../../features/claims/useClaimBoardData";
import { FIXTURE_CLAIM_BOARD } from "@/tests/fixtures/claims";

export { EMPTY_CLAIM_BOARD } from "../../features/claims/useClaimBoardData";
export type { ClaimBoardData };

/** Sweep stand-in — see `tests/sweep/README.md`. */
export function useClaimBoardData(
  _tabId: string | null,
  tabName: string | null,
): ClaimBoardData {
  return {
    status: "ready",
    board: { ...FIXTURE_CLAIM_BOARD, tabName: tabName ?? FIXTURE_CLAIM_BOARD.tabName },
  };
}
