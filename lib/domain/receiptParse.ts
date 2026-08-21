import { addFiatMinor, type FiatMinor } from "./money";
import { parseThbStringToMinor, thbMinorFromWholeBaht } from "./parse";
import { formatFiatMinorThb } from "./format";

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
  lines: ExtractedReceiptLine[];
  totalRaw: string;
  totalConfidence?: FieldConfidence;
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
  receiptTotalMinor: FiatMinor;
  differenceMinor: FiatMinor;
  reconciled: boolean;
};

export type ParsedReceipt = {
  merchant?: string;
  lines: ParsedReceiptLine[];
  reconciliation: ReconciliationStatus;
};

const LOW_CONFIDENCE_THRESHOLD: FieldConfidence = "low";

function parseQuantity(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("receiptParse: quantity must be a positive integer");
  }
  return value;
}

/** Parses a raw THB string — whole baht or two-decimal (Story 8.3 AC1). */
export function parseReceiptAmount(raw: string): FiatMinor {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    return thbMinorFromWholeBaht(Number(trimmed));
  }
  return parseThbStringToMinor(trimmed);
}

/** Deterministic re-parse and line-total recalculation (Story 8.3). */
export function parseExtractedReceipt(extracted: ExtractedReceipt): ParsedReceipt {
  const lines: ParsedReceiptLine[] = extracted.lines.map((line) => {
    const quantity = parseQuantity(line.quantity);
    const unitPriceMinor = parseReceiptAmount(line.unitPriceRaw);
    const computedLineTotalMinor = (unitPriceMinor * quantity) as FiatMinor;

    let printedLineTotalMinor: FiatMinor | undefined;
    let lineMismatch = false;
    if (line.lineTotalRaw) {
      printedLineTotalMinor = parseReceiptAmount(line.lineTotalRaw);
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
  const receiptTotalMinor = parseReceiptAmount(extracted.totalRaw);
  const differenceMinor = (receiptTotalMinor - linesTotalMinor) as FiatMinor;

  return {
    merchant: extracted.merchant,
    lines,
    reconciliation: {
      linesTotalMinor,
      receiptTotalMinor,
      differenceMinor,
      reconciled: differenceMinor === 0,
    },
  };
}

/** Exact discrepancy copy for the sticky card (Story 8.4 AC2). */
export function formatDiscrepancyCopy(reconciliation: ReconciliationStatus): string {
  return `Items add up to ${formatFiatMinorThb(reconciliation.linesTotalMinor)} but the total says ${formatFiatMinorThb(reconciliation.receiptTotalMinor)}.`;
}

/** Recomputes reconciliation after an organizer edit (Story 8.4 AC4). */
export function recomputeReconciliation(input: {
  lines: ParsedReceiptLine[];
  receiptTotalMinor: FiatMinor;
}): ReconciliationStatus {
  const linesTotalMinor = input.lines.reduce(
    (sum, line) => addFiatMinor(sum, line.computedLineTotalMinor),
    0 as FiatMinor,
  );
  const differenceMinor = (input.receiptTotalMinor - linesTotalMinor) as FiatMinor;
  return {
    linesTotalMinor,
    receiptTotalMinor: input.receiptTotalMinor,
    differenceMinor,
    reconciled: differenceMinor === 0,
  };
}
