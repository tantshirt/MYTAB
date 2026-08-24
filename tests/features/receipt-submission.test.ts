import { describe, expect, it } from "vitest";
import { buildReceiptConfirmationArgs } from "@/features/receipts/receiptSubmission";
import {
  receiptConfirmationFailureMessage,
  receiptFailureMessage,
} from "@/features/receipts/receiptErrors";
import { fiatMinorFromInteger } from "@/lib/domain/money";

describe("receipt page submission seam", () => {
  it("forwards currency, adjustments, exact integers, replay key, and resolved fields", () => {
    const args = buildReceiptConfirmationArgs(
      "receiptImports:one",
      [{
        name: "Tea",
        quantity: 2,
        unitPriceMinor: fiatMinorFromInteger(125),
        computedLineTotalMinor: fiatMinorFromInteger(250),
        nameConfidence: "low",
        priceConfidence: "high",
        lineMismatch: false,
        flagged: true,
      }],
      fiatMinorFromInteger(275),
      [{ kind: "tax", amountMinor: fiatMinorFromInteger(25), confidence: "high", flagged: false }],
      "USD",
      ["line.0.name"],
    );

    expect(args).toEqual({
      importId: "receiptImports:one",
      lines: [{ name: "Tea", quantity: 2, unitPriceMinor: 125n }],
      receiptTotalMinor: 275n,
      currency: "USD",
      confirmationKey: "receipt:receiptImports:one",
      resolvedLowConfidenceFields: ["line.0.name"],
      adjustments: [{ kind: "tax", amountMinor: 25n }],
    });
  });

  it("maps upload, extraction, and confirmation codes to corrective actions", () => {
    expect(receiptFailureMessage(new Error("RECEIPT_PAGE_LIMIT_EXCEEDED"))).toMatch(/8 photos/i);
    expect(receiptFailureMessage(new Error("RECEIPT_IMAGE_TYPE_UNSUPPORTED"))).toMatch(/JPEG/i);
    expect(receiptFailureMessage(new Error("RECEIPT_IMAGE_TOO_LARGE"))).toMatch(/8 MB/i);
    expect(receiptFailureMessage("RECEIPT_SCHEMA_REJECTED")).toMatch(/clearer photos/i);
    expect(receiptFailureMessage("RECEIPT_GATEWAY_FAILED")).toMatch(/manually/i);
    expect(receiptConfirmationFailureMessage(new Error("RECONCILIATION_BLOCKED"))).toMatch(/don't match/i);
  });
});
