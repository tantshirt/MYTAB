import type {
  ParsedReceipt,
  ParsedReceiptAdjustment,
  ParsedReceiptLine,
} from "@/lib/domain/receiptParse";
import type { FiatMinor } from "@/lib/domain/money";

/** The exact UI-to-mutation payload; kept pure so the shipping seam is executable. */
export function buildReceiptConfirmationArgs(
  importId: string,
  lines: ParsedReceiptLine[],
  receiptTotalMinor: FiatMinor,
  adjustments: ParsedReceiptAdjustment[],
  currency: ParsedReceipt["currency"],
  resolvedLowConfidenceFields: string[],
) {
  return {
    importId,
    lines: lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unitPriceMinor: BigInt(line.unitPriceMinor),
    })),
    receiptTotalMinor: BigInt(receiptTotalMinor),
    currency,
    confirmationKey: `receipt:${importId}`,
    resolvedLowConfidenceFields,
    adjustments: adjustments.map((adjustment) => ({
      kind: adjustment.kind,
      amountMinor: BigInt(adjustment.amountMinor),
    })),
  };
}
