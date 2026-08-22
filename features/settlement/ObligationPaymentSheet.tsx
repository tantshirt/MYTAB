"use client";

import { PaymentSheet, type PaymentSheetProps } from "@/components/settlement-sheet/PaymentSheet";

export type ObligationPaymentSheetProps = PaymentSheetProps;

/**
 * The obligation payment sheet.
 *
 * There is nothing left to compose here: the token selector, the round-up row and the
 * stale-bill message all live *inside* `PaymentSheet`, because the reading order —
 * amount → recipient → Pay with → disclosed lines → tip → disclosure → countdown → CTA
 * (§1.8) — is the specification, and an order assembled by two components is an order
 * that can drift. This stays as the feature-layer name the surfaces import.
 */
export function ObligationPaymentSheet(props: ObligationPaymentSheetProps) {
  return <PaymentSheet {...props} />;
}
