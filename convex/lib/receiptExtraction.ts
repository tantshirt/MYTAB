import {
  parseExtractedReceipt,
  type ExtractedReceipt,
  type ParsedReceipt,
} from "../../lib/domain/receiptParse";
import {
  FIXTURE_SAMPLE_EXTRACTION,
  RECEIPT_FORMAT_FIXTURES,
  RECEIPT_TARGET_SUBSET,
} from "../../lib/domain/receiptFixture";

export type ReceiptExtractionResult = {
  raw: ExtractedReceipt;
  parsed: ParsedReceipt;
  fieldConfidence: Record<string, "high" | "low">;
  modelMetadata: {
    provider: "fixture" | "openai";
    modelId: string;
    extractedAt: number;
  };
};

function assertExtractedReceipt(raw: unknown): ExtractedReceipt {
  if (!raw || typeof raw !== "object") {
    throw new Error("RECEIPT_SCHEMA_REJECTED");
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.lines) || record.lines.length === 0) {
    throw new Error("RECEIPT_SCHEMA_REJECTED");
  }
  if (typeof record.totalRaw !== "string" || record.totalRaw.trim().length === 0) {
    throw new Error("RECEIPT_SCHEMA_REJECTED");
  }
  for (const line of record.lines) {
    if (!line || typeof line !== "object") {
      throw new Error("RECEIPT_SCHEMA_REJECTED");
    }
    const row = line as Record<string, unknown>;
    if (typeof row.name !== "string" || row.name.trim().length === 0) {
      throw new Error("RECEIPT_SCHEMA_REJECTED");
    }
    if (typeof row.quantity !== "number" || !Number.isInteger(row.quantity) || row.quantity <= 0) {
      throw new Error("RECEIPT_SCHEMA_REJECTED");
    }
    if (typeof row.unitPriceRaw !== "string" || row.unitPriceRaw.trim().length === 0) {
      throw new Error("RECEIPT_SCHEMA_REJECTED");
    }
  }
  return raw as ExtractedReceipt;
}

/** Strict extraction validation at the boundary (Story 8.2 AC1). */
export function validateAndParseExtraction(raw: unknown): ReceiptExtractionResult {
  const validated = assertExtractedReceipt(raw);
  const parsed = parseExtractedReceipt(validated);

  const fieldConfidence: Record<string, "high" | "low"> = {
    total: validated.totalConfidence ?? "high",
  };
  validated.lines.forEach((line, index) => {
    fieldConfidence[`line.${index}.name`] = line.nameConfidence ?? "high";
    fieldConfidence[`line.${index}.price`] = line.priceConfidence ?? "high";
  });

  return {
    raw: validated,
    parsed,
    fieldConfidence,
    modelMetadata: {
      provider: "fixture",
      modelId: "fixture-receipt-v1",
      extractedAt: Date.now(),
    },
  };
}

/** Fixture extraction — no external provider call (Story 8.6 AC1). */
export function runFixtureExtraction(): ReceiptExtractionResult {
  return validateAndParseExtraction(FIXTURE_SAMPLE_EXTRACTION);
}

export {
  FIXTURE_SAMPLE_EXTRACTION,
  RECEIPT_FORMAT_FIXTURES,
  RECEIPT_TARGET_SUBSET,
};
