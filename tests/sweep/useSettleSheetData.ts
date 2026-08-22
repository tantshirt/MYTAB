"use client";

import type { SettleSheetData } from "../../features/settlement/types";
import { FIXTURE_SETTLE_SHEET } from "@/tests/fixtures/settlement";

export type { SettleSheetData };

/** Sweep stand-in — see `tests/sweep/README.md`. */
export function useSettleSheetData(obligationId: string): SettleSheetData {
  return { ...FIXTURE_SETTLE_SHEET, intentId: `intent_${obligationId}` };
}
