"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  assertReceiptScanAvailable,
  validateAndParseExtraction,
  type ReceiptExtractionResult,
} from "../lib/receiptExtraction";
import {
  assertPreviewEgressAllowed,
  guardedFetch,
  PreviewEgressBlockedError,
  type RuntimeEnv,
} from "../../lib/env/preview-guard";
import { RuntimeGuardError } from "../../lib/solana/runtimeGuard";

export const AI_GATEWAY_RESPONSES_URL = "https://ai-gateway.vercel.sh/v1/responses";

/**
 * First-candidate vision model (D-32). Pin is pending a Thai/English restaurant
 * fixture rerun; if those fail, fall back to `openai/gpt-4o-mini`. Live eval is
 * manual — unit tests never call the gateway.
 */
export const RECEIPT_VISION_MODEL = "google/gemini-2.0-flash";

export const RECEIPT_GATEWAY_FAILED = "RECEIPT_GATEWAY_FAILED";
export const RECEIPT_IMAGE_MISSING = "RECEIPT_IMAGE_MISSING";

const RECEIPT_GATEWAY_TIMEOUT_MS = 30_000;

/**
 * Strict JSON schema for ExtractedReceipt. Optional fields are nullable so
 * `strict: true` stays valid. Amounts stay strings — integer minor units are
 * produced only in lib/domain/receiptParse.ts.
 */
export const EXTRACTED_RECEIPT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    merchant: { type: ["string", "null"] },
    lines: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          quantity: { type: "integer", minimum: 1 },
          unitPriceRaw: { type: "string" },
          lineTotalRaw: { type: ["string", "null"] },
          nameConfidence: { type: ["string", "null"], enum: ["high", "low", null] },
          priceConfidence: { type: ["string", "null"], enum: ["high", "low", null] },
        },
        required: [
          "name",
          "quantity",
          "unitPriceRaw",
          "lineTotalRaw",
          "nameConfidence",
          "priceConfidence",
        ],
      },
    },
    totalRaw: { type: "string" },
    totalConfidence: { type: ["string", "null"], enum: ["high", "low", null] },
  },
  required: ["merchant", "lines", "totalRaw", "totalConfidence"],
} as const;

const EXTRACTION_PROMPT =
  "Extract every line item from this restaurant receipt. Copy printed prices as raw strings (whole baht or two decimals). quantity is a positive integer. Copy totalRaw from the printed total — do not recompute it. Thai and English names are both valid. If a field is hard to read, set its confidence to low.";

export type GatewayEnv = RuntimeEnv & { AI_GATEWAY_API_KEY?: string };

export function imageBytesToDataUrl(bytes: ArrayBuffer, mimeType: string): string {
  const media = mimeType.trim() || "image/jpeg";
  return `data:${media};base64,${Buffer.from(bytes).toString("base64")}`;
}

export function buildReceiptExtractionRequest(imageDataUrl: string): {
  model: typeof RECEIPT_VISION_MODEL;
  input: unknown[];
  text: { format: Record<string, unknown> };
} {
  return {
    model: RECEIPT_VISION_MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: EXTRACTION_PROMPT },
          { type: "input_image", image_url: imageDataUrl, detail: "high" },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "extracted_receipt",
        strict: true,
        schema: EXTRACTED_RECEIPT_JSON_SCHEMA,
      },
    },
  };
}

function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(dropNulls);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry == null) {
        continue;
      }
      out[key] = dropNulls(entry);
    }
    return out;
  }
  return value;
}

function textFromOutputItem(item: unknown): string | undefined {
  if (!item || typeof item !== "object") {
    return undefined;
  }
  const entry = item as Record<string, unknown>;
  if (entry.type !== "message" || !Array.isArray(entry.content)) {
    return undefined;
  }
  for (const part of entry.content) {
    if (!part || typeof part !== "object") {
      continue;
    }
    const content = part as Record<string, unknown>;
    if (
      (content.type === "output_text" || content.type === "text") &&
      typeof content.text === "string"
    ) {
      return content.text;
    }
  }
  return undefined;
}

/** Reads the Responses API JSON payload. Never logs the body or the image. */
export function parseGatewayResponseBody(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    throw new Error("RECEIPT_SCHEMA_REJECTED");
  }
  const record = payload as Record<string, unknown>;

  let text: string | undefined;
  if (typeof record.output_text === "string" && record.output_text.trim().length > 0) {
    text = record.output_text;
  } else if (Array.isArray(record.output)) {
    for (const item of record.output) {
      text = textFromOutputItem(item);
      if (text) {
        break;
      }
    }
  }

  if (!text) {
    throw new Error("RECEIPT_SCHEMA_REJECTED");
  }

  try {
    return dropNulls(JSON.parse(text));
  } catch {
    throw new Error("RECEIPT_SCHEMA_REJECTED");
  }
}

function failureCodeOf(error: unknown): string {
  if (error instanceof RuntimeGuardError) {
    return error.code;
  }
  if (error instanceof PreviewEgressBlockedError) {
    return "PREVIEW_EGRESS_BLOCKED";
  }
  if (error instanceof Error) {
    if (
      error.message === "RECEIPT_SCHEMA_REJECTED" ||
      error.message === RECEIPT_GATEWAY_FAILED ||
      error.message === RECEIPT_IMAGE_MISSING
    ) {
      return error.message;
    }
  }
  return RECEIPT_GATEWAY_FAILED;
}

export async function extractReceiptViaGateway(input: {
  imageBytes: ArrayBuffer;
  mimeType: string;
  fetchImpl?: typeof fetch;
  env?: GatewayEnv;
}): Promise<ReceiptExtractionResult> {
  const apiKey = assertReceiptScanAvailable(input.env);
  const imageDataUrl = imageBytesToDataUrl(input.imageBytes, input.mimeType);
  const request = buildReceiptExtractionRequest(imageDataUrl);

  assertPreviewEgressAllowed(AI_GATEWAY_RESPONSES_URL, input.env);

  let response: Response;
  try {
    response = await guardedFetch(
      AI_GATEWAY_RESPONSES_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(RECEIPT_GATEWAY_TIMEOUT_MS),
      },
      input.env,
      input.fetchImpl ?? fetch,
    );
  } catch (error) {
    if (error instanceof PreviewEgressBlockedError || error instanceof RuntimeGuardError) {
      throw error;
    }
    throw new Error(RECEIPT_GATEWAY_FAILED);
  }

  if (!response.ok) {
    throw new Error(RECEIPT_GATEWAY_FAILED);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("RECEIPT_SCHEMA_REJECTED");
  }

  return validateAndParseExtraction(parseGatewayResponseBody(payload), {
    provider: "ai_gateway",
    modelId: RECEIPT_VISION_MODEL,
  });
}

/**
 * Durable intent is already written (ticket + storageId + extracting).
 * This action is the outside-world hop (AD-8). The client never calls it.
 */
export const extractReceipt = internalAction({
  args: {
    importId: v.id("receiptImports"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args): Promise<{ ok: true } | { ok: false; failureCode: string }> => {
    try {
      const blob = await ctx.storage.get(args.storageId);
      if (!blob) {
        await ctx.runMutation(internal.receipts.recordExtractionFailure, {
          importId: args.importId,
          failureCode: RECEIPT_IMAGE_MISSING,
        });
        return { ok: false, failureCode: RECEIPT_IMAGE_MISSING };
      }

      const result = await extractReceiptViaGateway({
        imageBytes: await blob.arrayBuffer(),
        mimeType: blob.type || "image/jpeg",
      });

      await ctx.runMutation(internal.receipts.recordExtraction, {
        importId: args.importId,
        raw: result.raw,
        parsed: result.parsed,
        fieldConfidence: result.fieldConfidence,
        reconciliation: result.parsed.reconciliation,
        modelMetadata: result.modelMetadata,
      });
      return { ok: true };
    } catch (error) {
      const failureCode = failureCodeOf(error);
      await ctx.runMutation(internal.receipts.recordExtractionFailure, {
        importId: args.importId,
        failureCode,
      });
      return { ok: false, failureCode };
    }
  },
});
