import {
  parseExtractedReceipt,
  type ExtractedReceipt,
  type ParsedReceipt,
} from "../../lib/domain/receiptParse";
import { ITEM_QUANTITY_MAX } from "../../lib/domain/bill";
import { FIXTURE_SAMPLE_EXTRACTION } from "../../lib/domain/receiptFixture";
import {
  assertFixturePathAllowed,
  requireLiveCredential,
} from "../../lib/solana/runtimeGuard";

export type ReceiptExtractionProvider = "fixture" | "ai_gateway";

export type ReceiptExtractionResult = {
  raw: ExtractedReceipt;
  parsed: ParsedReceipt;
  fieldConfidence: Record<string, "high" | "low">;
  modelMetadata: {
    provider: ReceiptExtractionProvider;
    modelId: string;
    extractedAt: number;
  };
};

export type ReceiptExtractionMetadata = {
  provider: ReceiptExtractionProvider;
  modelId: string;
};

const CONFIDENCE_VALUES = new Set(["high", "low"]);

function optionalConfidence(value: unknown): "high" | "low" | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value === "string" && CONFIDENCE_VALUES.has(value)) {
    return value as "high" | "low";
  }
  throw new Error("RECEIPT_SCHEMA_REJECTED");
}

function assertExtractedReceiptShape(
  raw: unknown,
  options: { requireTotal: boolean; requireLines: boolean },
): ExtractedReceipt {
  if (!raw || typeof raw !== "object") {
    throw new Error("RECEIPT_SCHEMA_REJECTED");
  }
  const record = raw as Record<string, unknown>;
  if (
    !Array.isArray(record.lines) ||
    (options.requireLines && record.lines.length === 0)
  ) {
    throw new Error("RECEIPT_SCHEMA_REJECTED");
  }
  if (
    typeof record.totalRaw !== "string" ||
    (options.requireTotal && record.totalRaw.trim().length === 0)
  ) {
    throw new Error("RECEIPT_SCHEMA_REJECTED");
  }
  if (record.merchant != null && typeof record.merchant !== "string") {
    throw new Error("RECEIPT_SCHEMA_REJECTED");
  }
  if (typeof record.currency !== "string" || record.currency.length !== 3) {
    throw new Error("RECEIPT_SCHEMA_REJECTED");
  }
  if (!Array.isArray(record.adjustments)) {
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
    if (
      typeof row.quantity !== "number" ||
      !Number.isSafeInteger(row.quantity) ||
      row.quantity <= 0 ||
      row.quantity > ITEM_QUANTITY_MAX
    ) {
      throw new Error("RECEIPT_SCHEMA_REJECTED");
    }
    if (typeof row.unitPriceRaw !== "string" || row.unitPriceRaw.trim().length === 0) {
      throw new Error("RECEIPT_SCHEMA_REJECTED");
    }
    if (row.lineTotalRaw != null && typeof row.lineTotalRaw !== "string") {
      throw new Error("RECEIPT_SCHEMA_REJECTED");
    }
    optionalConfidence(row.nameConfidence);
    optionalConfidence(row.priceConfidence);
  }
  optionalConfidence(record.totalConfidence);
  for (const adjustment of record.adjustments) {
    if (!adjustment || typeof adjustment !== "object") {
      throw new Error("RECEIPT_SCHEMA_REJECTED");
    }
    const row = adjustment as Record<string, unknown>;
    if (!["service", "tax", "discount", "gratuity"].includes(String(row.kind))) {
      throw new Error("RECEIPT_SCHEMA_REJECTED");
    }
    if (typeof row.amountRaw !== "string" || row.amountRaw.trim().length === 0) {
      throw new Error("RECEIPT_SCHEMA_REJECTED");
    }
    optionalConfidence(row.confidence);
  }
  return raw as ExtractedReceipt;
}

/**
 * Provider-page boundary. Non-final pages deliberately allow an empty summary;
 * combineReceiptPages owns the rule that only the final page may contain one.
 */
export function validateReceiptPageExtraction(raw: unknown): ExtractedReceipt {
  return assertExtractedReceiptShape(raw, { requireTotal: false, requireLines: false });
}

/** Strict extraction validation at the boundary (Story 8.2 AC1). Amounts stay raw until receiptParse. */
export function validateAndParseExtraction(
  raw: unknown,
  metadata?: ReceiptExtractionMetadata,
): ReceiptExtractionResult {
  const validated = assertExtractedReceiptShape(raw, {
    requireTotal: true,
    requireLines: true,
  });
  const parsed = parseExtractedReceipt(validated);

  const fieldConfidence: Record<string, "high" | "low"> = {
    total: validated.totalConfidence ?? "high",
  };
  validated.lines.forEach((line, index) => {
    fieldConfidence[`line.${index}.name`] = line.nameConfidence ?? "high";
    fieldConfidence[`line.${index}.price`] = line.priceConfidence ?? "high";
  });
  validated.adjustments?.forEach((adjustment, index) => {
    fieldConfidence[`adjustment.${index}`] = adjustment.confidence ?? "high";
  });

  return {
    raw: validated,
    parsed,
    fieldConfidence,
    modelMetadata: {
      provider: metadata?.provider ?? "fixture",
      modelId: metadata?.modelId ?? "fixture-receipt-v1",
      extractedAt: Date.now(),
    },
  };
}

type GatewayKeyEnv = {
  AI_GATEWAY_API_KEY?: string;
  MYTAB_RECEIPT_SCAN_PAUSED?: string;
};

function gatewayKeyFrom(env?: GatewayKeyEnv): string | undefined {
  return (env ?? process.env).AI_GATEWAY_API_KEY;
}

/** True when Convex holds the gateway key (server capability, not a NEXT_PUBLIC flag). */
export function isAiGatewayConfigured(env?: GatewayKeyEnv): boolean {
  const source = env ?? process.env;
  return Boolean(gatewayKeyFrom(env)?.trim()) &&
    !["1", "true", "yes"].includes(source.MYTAB_RECEIPT_SCAN_PAUSED?.trim().toLowerCase() ?? "");
}

/**
 * Missing key is a hard fail (D-11, D-32). Never permission to run fixture
 * extraction on a deployment.
 */
export function assertReceiptScanAvailable(env?: GatewayKeyEnv): string {
  const source = env ?? process.env;
  if (["1", "true", "yes"].includes(source.MYTAB_RECEIPT_SCAN_PAUSED?.trim().toLowerCase() ?? "")) {
    throw new Error("RECEIPT_SCAN_PAUSED");
  }
  return requireLiveCredential(
    "receipts.aiGateway",
    "AI_GATEWAY_API_KEY",
    gatewayKeyFrom(env),
  );
}

/**
 * Fixture extraction — no external provider call (Story 8.6 AC1).
 *
 * Invents line items, so it is guarded here as well as at every call site.
 * Production upload/finalize never calls this when the gateway key is present,
 * and never calls it on a deployment when the key is missing.
 */
export function runFixtureExtraction(): ReceiptExtractionResult {
  assertFixturePathAllowed("receipts.runFixtureExtraction");
  return validateAndParseExtraction(FIXTURE_SAMPLE_EXTRACTION);
}

// FIXTURE_SAMPLE_EXTRACTION / RECEIPT_FORMAT_FIXTURES / RECEIPT_TARGET_SUBSET are
// deliberately NOT re-exported: no module under convex/ carries a FIXTURE_*
// symbol in its public surface. Import them from lib/domain/receiptFixture.
