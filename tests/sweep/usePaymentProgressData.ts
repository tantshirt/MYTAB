"use client";

import type { PaymentProgressData } from "../../features/settlement/usePaymentProgressData";
import { FIXTURE_PAYMENT_PROGRESS } from "@/tests/fixtures/settlement";

export type { PaymentProgressData };

/** Sweep stand-in — see `tests/sweep/README.md`. */
export function usePaymentProgressData(_intentId: string): PaymentProgressData {
  return FIXTURE_PAYMENT_PROGRESS;
}
