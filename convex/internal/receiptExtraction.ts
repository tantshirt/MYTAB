"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  assertReceiptScanAvailable,
  validateReceiptPageExtraction,
  validateAndParseExtraction,
  type ReceiptExtractionResult,
} from "../lib/receiptExtraction";
import { combineReceiptPages, type ExtractedReceipt } from "../../lib/domain/receiptParse";
import {
  assertPreviewEgressAllowed,
  guardedFetch,
  PreviewEgressBlockedError,
  type RuntimeEnv,
} from "../../lib/env/preview-guard";
import { RuntimeGuardError } from "../../lib/solana/runtimeGuard";
import { inspectReceiptImage } from "../../lib/images/receiptImage";
import { ITEM_QUANTITY_MAX } from "../../lib/domain/bill";

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
// Eight admitted pages may each legitimately consume the full provider timeout.
// Keep a small orchestration margin for storage reads, heartbeats, combination,
// and the terminal mutation so the advertised page limit is actually usable.
export const RECEIPT_EXTRACTION_DEADLINE_MS = RECEIPT_GATEWAY_TIMEOUT_MS * 8 + 15_000;
export const RECEIPT_PAGE_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_TOTAL_MAX_BYTES = 32 * 1024 * 1024;
const RECEIPT_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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
    currency: { type: "string", minLength: 3, maxLength: 3 },
    lines: {
      type: "array",
      minItems: 0,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          quantity: { type: "integer", minimum: 1, maximum: ITEM_QUANTITY_MAX },
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
    adjustments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["service", "tax", "discount", "gratuity"] },
          label: { type: ["string", "null"] },
          amountRaw: { type: "string" },
          confidence: { type: ["string", "null"], enum: ["high", "low", null] },
        },
        required: ["kind", "label", "amountRaw", "confidence"],
      },
    },
    totalRaw: { type: "string" },
    totalConfidence: { type: ["string", "null"], enum: ["high", "low", null] },
  },
  required: ["merchant", "currency", "lines", "adjustments", "totalRaw", "totalConfidence"],
} as const;

const EXTRACTION_PROMPT =
  "Extract this page of a restaurant receipt. Return the printed ISO currency code. Copy every amount as a raw decimal string using that currency's printed precision; never recompute it. quantity is a positive integer. Thai and English names are both valid. If a field is hard to read, set its confidence to low.";

export type GatewayEnv = RuntimeEnv & { AI_GATEWAY_API_KEY?: string };

export function imageBytesToDataUrl(bytes: ArrayBuffer, mimeType: string): string {
  const media = mimeType.trim() || "image/jpeg";
  return `data:${media};base64,${Buffer.from(bytes).toString("base64")}`;
}

export function buildReceiptExtractionRequest(
  imageDataUrl: string | readonly string[],
  page?: { index: number; count: number },
): {
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
          {
            type: "input_text",
            text: page
              ? `${EXTRACTION_PROMPT} This is page ${page.index + 1} of ${page.count}. ${
                  page.index + 1 < page.count
                    ? "This is not the final page: return an empty totalRaw and no adjustments, even if repeated subtotal text is visible."
                    : "This is the final page: include the final total and all printed service, tax, discount and gratuity adjustments."
                }`
              : `${EXTRACTION_PROMPT} Include the final total and all printed service, tax, discount and gratuity adjustments.`,
          },
          ...(Array.isArray(imageDataUrl) ? imageDataUrl : [imageDataUrl]).map((image_url) => ({
            type: "input_image",
            image_url,
            detail: "high",
          })),
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
      error.message === RECEIPT_IMAGE_MISSING ||
      error.message === "RECEIPT_IMAGE_TYPE_UNSUPPORTED" ||
      error.message === "RECEIPT_IMAGE_TOO_LARGE" ||
      error.message === "RECEIPT_IMAGE_HEADER_INVALID" ||
      error.message === "RECEIPT_IMAGE_TYPE_MISMATCH" ||
      error.message === "RECEIPT_IMAGE_DIMENSIONS_UNSUPPORTED" ||
      error.message === "RECEIPT_EXTRACTION_TIMEOUT" ||
      error.message === "RECEIPT_EXTRACTION_LEASE_LOST" ||
      error.message === "RECEIPT_UPLOAD_PAGE_MISMATCH"
    ) {
      return error.message;
    }
  }
  return RECEIPT_GATEWAY_FAILED;
}

export async function extractReceiptViaGateway(input: {
  imageBytes: ArrayBuffer | readonly ArrayBuffer[];
  mimeType: string | readonly string[];
  fetchImpl?: typeof fetch;
  env?: GatewayEnv;
}): Promise<ReceiptExtractionResult> {
  const apiKey = assertReceiptScanAvailable(input.env);
  const bytePages = Array.isArray(input.imageBytes) ? input.imageBytes : [input.imageBytes];
  const mimePages = Array.isArray(input.mimeType) ? input.mimeType : [input.mimeType];
  if (bytePages.length === 0 || bytePages.length > 8 || mimePages.length !== bytePages.length) {
    throw new Error(RECEIPT_IMAGE_MISSING);
  }
  const request = buildReceiptExtractionRequest(
    bytePages.map((bytes, index) => imageBytesToDataUrl(bytes, mimePages[index] ?? "image/jpeg")),
  );

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

async function extractReceiptPageViaGateway(input: {
  imageBytes: ArrayBuffer;
  mimeType: string;
  pageIndex: number;
  pageCount: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  env?: GatewayEnv;
}): Promise<ExtractedReceipt> {
  const apiKey = assertReceiptScanAvailable(input.env);
  const request = buildReceiptExtractionRequest(
    imageBytesToDataUrl(input.imageBytes, input.mimeType),
    { index: input.pageIndex, count: input.pageCount },
  );
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
        signal: AbortSignal.timeout(input.timeoutMs ?? RECEIPT_GATEWAY_TIMEOUT_MS),
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
  if (!response.ok) throw new Error(RECEIPT_GATEWAY_FAILED);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("RECEIPT_SCHEMA_REJECTED");
  }
  return validateReceiptPageExtraction(parseGatewayResponseBody(payload));
}

/** Terminal persistence fence shared by success and failure action exits. */
export async function persistReceiptTerminalBeforeCleanup(input: {
  persist: () => Promise<boolean>;
  deleteSource: (storageId: string) => Promise<void>;
  storageIds: readonly string[];
  markCleanupComplete?: () => Promise<unknown>;
}): Promise<boolean> {
  const recorded = await input.persist();
  if (!recorded) return false;
  let cleanupComplete = true;
  for (const storageId of input.storageIds) {
    try {
      await input.deleteSource(storageId);
    } catch {
      cleanupComplete = false;
    }
  }
  if (cleanupComplete && input.markCleanupComplete) {
    try {
      await input.markCleanupComplete();
    } catch {
      // The terminal row still carries cleanupPending + the source ids.
    }
  }
  return true;
}

/**
 * Durable intent is already written (ticket + storageId + extracting).
 * This action is the outside-world hop (AD-8). The client never calls it.
 */
export const extractReceipt = internalAction({
  args: {
    importId: v.id("receiptImports"),
    storageId: v.optional(v.id("_storage")),
    storageIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args): Promise<{ ok: true } | { ok: false; failureCode: string }> => {
    const claimId = crypto.randomUUID();
    const claim = await ctx.runMutation(internal.receipts.claimExtraction, {
      importId: args.importId,
      claimId,
    });
    if (!claim || "inFlight" in claim || "busy" in claim) {
      return { ok: false, failureCode: "RECEIPT_EXTRACTION_NOT_CLAIMED" };
    }
    const startedAt = Date.now();
    try {
      const requestedIds = args.storageIds ?? (args.storageId ? [args.storageId] : []);
      const ids = requestedIds.length > 0 ? requestedIds : claim.storageIds;
      if (
        ids.length !== claim.storageIds.length ||
        ids.some((id, index) => id !== claim.storageIds[index])
      ) {
        throw new Error("RECEIPT_UPLOAD_PAGE_MISMATCH");
      }
      if (ids.length === 0 || ids.length > 8 || new Set(ids).size !== ids.length) {
        throw new Error(RECEIPT_IMAGE_MISSING);
      }

      // Materialize one page at a time. Promise.all over storage blobs and
      // ArrayBuffers lets eight maximum-sized images coexist twice in memory,
      // defeating the limits before the provider call even starts.
      const pages: ExtractedReceipt[] = [];
      let totalBytes = 0;
      for (let index = 0; index < ids.length; index += 1) {
          const remainingMs = RECEIPT_EXTRACTION_DEADLINE_MS - (Date.now() - startedAt);
          if (remainingMs <= 0) throw new Error("RECEIPT_EXTRACTION_TIMEOUT");
          const pagesRemaining = ids.length - index;
          const pageTimeoutMs = Math.min(
            RECEIPT_GATEWAY_TIMEOUT_MS,
            Math.max(1_000, Math.floor((remainingMs - 1_000) / pagesRemaining)),
          );
          const heartbeat = await ctx.runMutation(internal.receipts.heartbeatExtraction, {
            importId: args.importId,
            claimId,
          });
          if (!heartbeat) throw new Error("RECEIPT_EXTRACTION_LEASE_LOST");
          const id = ids[index]!;
          const blob = await ctx.storage.get(id);
          if (!blob) throw new Error(RECEIPT_IMAGE_MISSING);
          if (!RECEIPT_IMAGE_MIME_TYPES.has(blob.type)) {
            throw new Error("RECEIPT_IMAGE_TYPE_UNSUPPORTED");
          }
          totalBytes += blob.size;
          if (blob.size > RECEIPT_PAGE_MAX_BYTES || totalBytes > RECEIPT_TOTAL_MAX_BYTES) {
            throw new Error("RECEIPT_IMAGE_TOO_LARGE");
          }
          const imageBytes = await blob.arrayBuffer();
          inspectReceiptImage(imageBytes, blob.type);
          const providerAttempt = await ctx.runMutation(
            internal.receipts.beginExtractionProviderAttempt,
            { importId: args.importId, claimId },
          );
          if (!providerAttempt) throw new Error("RECEIPT_EXTRACTION_LEASE_LOST");
          pages.push(await extractReceiptPageViaGateway({
            imageBytes,
            mimeType: blob.type,
            pageIndex: index,
            pageCount: ids.length,
            timeoutMs: pageTimeoutMs,
          }));
      }
      const combined = combineReceiptPages(pages);
      const result = validateAndParseExtraction(combined, {
        provider: "ai_gateway",
        modelId: RECEIPT_VISION_MODEL,
      });

      const recorded = await persistReceiptTerminalBeforeCleanup({
        persist: () => ctx.runMutation(internal.receipts.recordExtraction, {
          importId: args.importId,
          raw: result.raw,
          parsed: result.parsed,
          fieldConfidence: result.fieldConfidence,
          reconciliation: result.parsed.reconciliation,
          modelMetadata: result.modelMetadata,
        }),
        deleteSource: (pageId) => ctx.storage.delete(pageId as never),
        storageIds: ids,
        markCleanupComplete: () => ctx.runMutation(internal.receipts.recordReceiptCleanupComplete, {
          importId: args.importId,
        }),
      });
      if (!recorded) {
        return { ok: false, failureCode: "RECEIPT_EXTRACTION_LEASE_LOST" };
      }
      return { ok: true };
    } catch (error) {
      const failureCode = failureCodeOf(error);
      // Persist first. If persistence throws, the source images deliberately
      // remain owned and recoverable until the extraction lease expires.
      const recorded = await persistReceiptTerminalBeforeCleanup({
        persist: () => ctx.runMutation(internal.receipts.recordExtractionFailure, {
          importId: args.importId,
          failureCode,
        }),
        deleteSource: (pageId) => ctx.storage.delete(pageId as never),
        storageIds: claim.storageIds,
        markCleanupComplete: () => ctx.runMutation(internal.receipts.recordReceiptCleanupComplete, {
          importId: args.importId,
        }),
      });
      void recorded;
      return { ok: false, failureCode };
    }
  },
});
