import { addFiatMinor, type FiatMinor } from "./money";
import { formatCurrencyMinor } from "./format";
import { assertSupportedCurrency, parseCurrencyAmount, type SupportedFiatCurrency } from "./currency";
import { ITEM_QUANTITY_MAX } from "./bill";
import { DomainError, DomainErrorCode } from "./errors";

/** Per-field confidence from extraction (Story 8.2 AC2). */
export type FieldConfidence = "high" | "low";

export type ExtractedReceiptLine = {
  name: string;
  quantity: number;
  unitPriceRaw: string;
  lineTotalRaw?: string;
  nameConfidence?: FieldConfidence;
  priceConfidence?: FieldConfidence;
};

export type ExtractedReceipt = {
  merchant?: string;
  currency?: string;
  lines: ExtractedReceiptLine[];
  adjustments?: ExtractedReceiptAdjustment[];
  totalRaw: string;
  totalConfidence?: FieldConfidence;
};

export type ExtractedReceiptAdjustment = {
  kind: "service" | "tax" | "discount" | "gratuity";
  label?: string;
  amountRaw: string;
  confidence?: FieldConfidence;
};

export type ParsedReceiptAdjustment = {
  kind: ExtractedReceiptAdjustment["kind"];
  label?: string;
  amountMinor: FiatMinor;
  confidence: FieldConfidence;
  flagged: boolean;
};

export type ParsedReceiptLine = {
  name: string;
  quantity: number;
  unitPriceMinor: FiatMinor;
  computedLineTotalMinor: FiatMinor;
  printedLineTotalMinor?: FiatMinor;
  lineMismatch: boolean;
  nameConfidence: FieldConfidence;
  priceConfidence: FieldConfidence;
  flagged: boolean;
};

export type ReconciliationStatus = {
  linesTotalMinor: FiatMinor;
  adjustmentsTotalMinor?: FiatMinor;
  receiptTotalMinor: FiatMinor;
  differenceMinor: FiatMinor;
  reconciled: boolean;
};

export type ParsedReceipt = {
  merchant?: string;
  currency: SupportedFiatCurrency;
  lines: ParsedReceiptLine[];
  adjustments: ParsedReceiptAdjustment[];
  totalConfidence: FieldConfidence;
  reconciliation: ReconciliationStatus;
};

const LOW_CONFIDENCE_THRESHOLD: FieldConfidence = "low";

function parseQuantity(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > ITEM_QUANTITY_MAX) {
    throw new Error(`receiptParse: quantity must be between 1 and ${ITEM_QUANTITY_MAX}`);
  }
  return value;
}

/** Parses a raw THB string — whole baht or two-decimal (Story 8.3 AC1). */
export function parseReceiptAmount(raw: string, currency = "THB"): FiatMinor {
  const trimmed = raw.trim();
  return parseCurrencyAmount(trimmed, currency);
}

/** Deterministic re-parse and line-total recalculation (Story 8.3). */
export function parseExtractedReceipt(extracted: ExtractedReceipt): ParsedReceipt {
  const currency = assertSupportedCurrency(extracted.currency ?? "THB");
  const lines: ParsedReceiptLine[] = extracted.lines.map((line) => {
    const quantity = parseQuantity(line.quantity);
    const unitPriceMinor = parseReceiptAmount(line.unitPriceRaw, currency);
    const exactLineTotalMinor = BigInt(unitPriceMinor) * BigInt(quantity);
    if (exactLineTotalMinor > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new DomainError(
        DomainErrorCode.FIAT_OVERFLOW,
        "receipt line total exceeds safe integer range",
      );
    }
    const computedLineTotalMinor = Number(exactLineTotalMinor) as FiatMinor;

    let printedLineTotalMinor: FiatMinor | undefined;
    let lineMismatch = false;
    if (line.lineTotalRaw) {
      printedLineTotalMinor = parseReceiptAmount(line.lineTotalRaw, currency);
      lineMismatch = printedLineTotalMinor !== computedLineTotalMinor;
    }

    const nameConfidence = line.nameConfidence ?? "high";
    const priceConfidence = line.priceConfidence ?? "high";
    const flagged =
      nameConfidence === LOW_CONFIDENCE_THRESHOLD ||
      priceConfidence === LOW_CONFIDENCE_THRESHOLD ||
      lineMismatch;

    return {
      name: line.name,
      quantity,
      unitPriceMinor,
      computedLineTotalMinor,
      printedLineTotalMinor,
      lineMismatch,
      nameConfidence,
      priceConfidence,
      flagged,
    };
  });

  const linesTotalMinor = lines.reduce(
    (sum, line) => addFiatMinor(sum, line.computedLineTotalMinor),
    0 as FiatMinor,
  );
  const adjustments = (extracted.adjustments ?? []).map<ParsedReceiptAdjustment>((adjustment) => {
    const parsedAmountMinor = parseReceiptAmount(adjustment.amountRaw, currency);
    const amountMinor = Math.abs(parsedAmountMinor) as FiatMinor;
    if (amountMinor === 0) {
      throw new Error("RECEIPT_ADJUSTMENT_INVALID");
    }
    return {
      kind: adjustment.kind,
      label: adjustment.label,
      amountMinor,
      confidence: adjustment.confidence ?? "high",
      flagged: adjustment.confidence === "low",
    };
  });
  const adjustmentsTotalMinor = adjustments.reduce((sum, adjustment) => {
    const signed = adjustment.kind === "discount"
      ? (-adjustment.amountMinor as FiatMinor)
      : adjustment.amountMinor;
    return addFiatMinor(sum, signed);
  }, 0 as FiatMinor);
  const computedTotalMinor = addFiatMinor(linesTotalMinor, adjustmentsTotalMinor);
  const receiptTotalMinor = parseReceiptAmount(extracted.totalRaw, currency);
  const differenceMinor = (receiptTotalMinor - computedTotalMinor) as FiatMinor;

  return {
    merchant: extracted.merchant,
    currency,
    lines,
    adjustments,
    totalConfidence: extracted.totalConfidence ?? "high",
    reconciliation: {
      linesTotalMinor,
      adjustmentsTotalMinor,
      receiptTotalMinor,
      differenceMinor,
      reconciled: differenceMinor === 0,
    },
  };
}

/** Exact discrepancy copy for the sticky card (Story 8.4 AC2). */
export function formatDiscrepancyCopy(
  reconciliation: ReconciliationStatus,
  currency = "THB",
): string {
  const computed = addFiatMinor(
    reconciliation.linesTotalMinor,
    reconciliation.adjustmentsTotalMinor ?? (0 as FiatMinor),
  );
  return `Items add up to ${formatCurrencyMinor(computed, currency)} but the total says ${formatCurrencyMinor(reconciliation.receiptTotalMinor, currency)}.`;
}

/** Recomputes reconciliation after an organizer edit (Story 8.4 AC4). */
export function recomputeReconciliation(input: {
  lines: ParsedReceiptLine[];
  adjustments?: ParsedReceiptAdjustment[];
  receiptTotalMinor: FiatMinor;
}): ReconciliationStatus {
  const linesTotalMinor = input.lines.reduce(
    (sum, line) => addFiatMinor(sum, line.computedLineTotalMinor),
    0 as FiatMinor,
  );
  const adjustmentsTotalMinor = (input.adjustments ?? []).reduce((sum, adjustment) => {
    const signed = adjustment.kind === "discount"
      ? (-adjustment.amountMinor as FiatMinor)
      : adjustment.amountMinor;
    return addFiatMinor(sum, signed);
  }, 0 as FiatMinor);
  const differenceMinor = (
    input.receiptTotalMinor - addFiatMinor(linesTotalMinor, adjustmentsTotalMinor)
  ) as FiatMinor;
  return {
    linesTotalMinor,
    adjustmentsTotalMinor,
    receiptTotalMinor: input.receiptTotalMinor,
    differenceMinor,
    reconciled: differenceMinor === 0,
  };
}

/**
 * Merges page extraction in page order. Every page must agree on currency;
 * only the final page may carry the receipt total and bill adjustments.
 */
export function combineReceiptPages(pages: readonly ExtractedReceipt[]): ExtractedReceipt {
  if (pages.length === 0) {
    throw new Error("RECEIPT_PAGES_REQUIRED");
  }
  const currency = assertSupportedCurrency(pages[0]!.currency ?? "THB");
  for (const page of pages) {
    if (assertSupportedCurrency(page.currency ?? currency) !== currency) {
      throw new Error("RECEIPT_CURRENCY_MISMATCH");
    }
  }
  for (const page of pages.slice(0, -1)) {
    if ((page.adjustments?.length ?? 0) > 0 || page.totalRaw.trim().length > 0) {
      throw new Error("RECEIPT_NON_FINAL_SUMMARY");
    }
  }
  const finalPage = pages[pages.length - 1]!;
  return {
    merchant: pages.find((page) => page.merchant?.trim())?.merchant,
    currency,
    lines: pages.flatMap((page) => page.lines),
    adjustments: finalPage.adjustments ?? [],
    totalRaw: finalPage.totalRaw,
    totalConfidence: finalPage.totalConfidence,
  };
}
