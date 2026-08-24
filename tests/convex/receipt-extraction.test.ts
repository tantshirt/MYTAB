import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertReceiptScanAvailable,
  isAiGatewayConfigured,
  validateAndParseExtraction,
} from "@/convex/lib/receiptExtraction";
import {
  AI_GATEWAY_RESPONSES_URL,
  RECEIPT_EXTRACTION_DEADLINE_MS,
  RECEIPT_VISION_MODEL,
  buildReceiptExtractionRequest,
  extractReceiptViaGateway,
  parseGatewayResponseBody,
  persistReceiptTerminalBeforeCleanup,
} from "@/convex/internal/receiptExtraction";
import { RECEIPT_FORMAT_FIXTURES } from "@/lib/domain/receiptFixture";
import { PreviewEgressBlockedError } from "@/lib/env/preview-guard";
import { RUNTIME_GUARD_FAILURE } from "@/lib/solana/runtimeGuard";
import { createFakeCtx, type Row } from "../helpers/convexFakeDb";
import * as receipts from "@/convex/receipts";
import { inspectReceiptImage } from "@/lib/images/receiptImage";

const run = (fn: unknown, ctx: unknown, args: unknown = {}) =>
  (fn as { _handler: (c: unknown, a: unknown) => Promise<unknown> })._handler(ctx, args);

const DID = "did:privy:andre";
const identity = { subject: DID, tokenIdentifier: DID };

const SAMPLE_BYTES = new Uint8Array([0xff, 0xd8, 0xff]).buffer;

it("budgets enough whole-job time for all eight admitted provider pages", () => {
  expect(RECEIPT_EXTRACTION_DEADLINE_MS).toBeGreaterThanOrEqual(8 * 30_000);
});

const THAI_EXTRACTION = RECEIPT_FORMAT_FIXTURES.thaiWholeBaht;

function pngHeader(width: number, height: number): ArrayBuffer {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes.buffer;
}

describe("receipt image evidence", () => {
  it("binds declared MIME to magic bytes and bounded decoded dimensions", () => {
    expect(inspectReceiptImage(pngHeader(1200, 2000), "image/png")).toMatchObject({
      mimeType: "image/png",
      width: 1200,
      height: 2000,
    });
    expect(() => inspectReceiptImage(pngHeader(1200, 2000), "image/jpeg"))
      .toThrow("RECEIPT_IMAGE_TYPE_MISMATCH");
    expect(() => inspectReceiptImage(pngHeader(10_001, 10), "image/png"))
      .toThrow("RECEIPT_IMAGE_DIMENSIONS_UNSUPPORTED");
    expect(() => inspectReceiptImage(new Uint8Array([0xff, 0xd8]).buffer, "image/jpeg"))
      .toThrow("RECEIPT_IMAGE_HEADER_INVALID");
  });
});

describe("receipt extraction terminal durability", () => {
  it("commits terminal truth before deleting every source image", async () => {
    const order: string[] = [];
    await expect(persistReceiptTerminalBeforeCleanup({
      persist: async () => { order.push("persist"); return true; },
      deleteSource: async (id) => { order.push(`delete:${id}`); },
      storageIds: ["page-1", "page-2"],
    })).resolves.toBe(true);
    expect(order).toEqual(["persist", "delete:page-1", "delete:page-2"]);
  });

  it("leaves every image recoverable when terminal persistence fails", async () => {
    const deleted: string[] = [];
    await expect(persistReceiptTerminalBeforeCleanup({
      persist: async () => { throw new Error("write unavailable"); },
      deleteSource: async (id) => { deleted.push(id); },
      storageIds: ["page-1", "page-2"],
    })).rejects.toThrow("write unavailable");
    expect(deleted).toEqual([]);
  });
});

function world(): Record<string, Row[]> {
  return {
    users: [
      {
        _id: "users:andre",
        privyDid: DID,
        telegramUserId: "1",
        displayName: "Andre",
      },
    ],
    telegramContexts: [
      { _id: "telegramContexts:1", privyDid: DID, expiresAt: Date.now() + 60_000 },
    ],
    groups: [{ _id: "groups:g1" }],
    groupMembers: [
      {
        _id: "groupMembers:1",
        groupId: "groups:g1",
        telegramUserId: "1",
        membershipStatus: "active",
      },
    ],
    tabs: [
      {
        _id: "tabs:t1",
        groupId: "groups:g1",
        organizerTelegramUserId: "1",
        status: "draft",
      },
    ],
    receiptImports: [],
    receiptBlobOwners: [],
    receiptUsageBuckets: [],
    receiptExtractionLeases: [],
    items: [],
    adjustments: [],
    allocations: [],
    adjustmentAllocations: [],
    activityEvents: [],
    fxSnapshots: [],
  };
}

describe("AI Gateway receipt adapter (D-32)", () => {
  const previousKey = process.env.AI_GATEWAY_API_KEY;

  afterEach(() => {
    if (previousKey === undefined) {
      delete process.env.AI_GATEWAY_API_KEY;
    } else {
      process.env.AI_GATEWAY_API_KEY = previousKey;
    }
  });

  it("pins the first-candidate model and documents a manual fixture rerun", () => {
    expect(RECEIPT_VISION_MODEL).toBe("google/gemini-2.0-flash");
    const request = buildReceiptExtractionRequest("data:image/jpeg;base64,Zg==");
    expect(request.model).toBe(RECEIPT_VISION_MODEL);
    expect(request.text.format.type).toBe("json_schema");
    expect(request.text.format.strict).toBe(true);
    expect(AI_GATEWAY_RESPONSES_URL).toBe("https://ai-gateway.vercel.sh/v1/responses");
  });

  it("fails closed when the gateway key is missing", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    expect(isAiGatewayConfigured()).toBe(false);
    expect(() => assertReceiptScanAvailable()).toThrow(/LIVE_CREDENTIAL_MISSING/);

    await expect(
      extractReceiptViaGateway({
        imageBytes: SAMPLE_BYTES,
        mimeType: "image/jpeg",
        env: { VERCEL_ENV: "production" },
        fetchImpl: async () => {
          throw new Error("must not fetch");
        },
      }),
    ).rejects.toMatchObject({ code: RUNTIME_GUARD_FAILURE.LIVE_CREDENTIAL_MISSING });
  });

  it("rejects a schema-invalid gateway payload", async () => {
    await expect(
      extractReceiptViaGateway({
        imageBytes: SAMPLE_BYTES,
        mimeType: "image/jpeg",
        env: { AI_GATEWAY_API_KEY: "k", VERCEL_ENV: "production" },
        fetchImpl: async () =>
          new Response(JSON.stringify({ output_text: "{}" }), { status: 200 }),
      }),
    ).rejects.toThrow("RECEIPT_SCHEMA_REJECTED");
  });

  it("parses a successful gateway body through receiptParse integer math", async () => {
    const result = await extractReceiptViaGateway({
      imageBytes: SAMPLE_BYTES,
      mimeType: "image/jpeg",
      env: { AI_GATEWAY_API_KEY: "k", VERCEL_ENV: "production" },
      fetchImpl: async (input, init) => {
        expect(String(input)).toBe(AI_GATEWAY_RESPONSES_URL);
        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer k");
        const body = JSON.parse(String(init?.body)) as { model: string };
        expect(body.model).toBe(RECEIPT_VISION_MODEL);
        return new Response(
          JSON.stringify({ output_text: JSON.stringify(THAI_EXTRACTION) }),
          { status: 200 },
        );
      },
    });

    expect(result.modelMetadata.provider).toBe("ai_gateway");
    expect(result.modelMetadata.modelId).toBe(RECEIPT_VISION_MODEL);
    expect(result.parsed.lines[0]?.unitPriceMinor).toBe(12_000);
    expect(result.parsed.reconciliation.receiptTotalMinor).toBe(12_000);
    expect(result.parsed.reconciliation.reconciled).toBe(true);
  });

  it("blocks preview egress before any network call", async () => {
    await expect(
      extractReceiptViaGateway({
        imageBytes: SAMPLE_BYTES,
        mimeType: "image/jpeg",
        env: {
          AI_GATEWAY_API_KEY: "k",
          VERCEL_ENV: "preview",
          NODE_ENV: "production",
        },
        fetchImpl: async () => {
          throw new Error("must not fetch");
        },
      }),
    ).rejects.toBeInstanceOf(PreviewEgressBlockedError);
  });

  it("reads output_text and drops null optional fields", () => {
    const parsed = parseGatewayResponseBody({
      output_text: JSON.stringify({
        merchant: null,
        currency: "THB",
        lines: [
          {
            name: "Pad Thai",
            quantity: 1,
            unitPriceRaw: "120",
            lineTotalRaw: null,
            nameConfidence: null,
            priceConfidence: "low",
          },
        ],
        adjustments: [],
        totalRaw: "120",
        totalConfidence: null,
      }),
    });
    const result = validateAndParseExtraction(parsed, {
      provider: "ai_gateway",
      modelId: RECEIPT_VISION_MODEL,
    });
    expect(result.raw.merchant).toBeUndefined();
    expect(result.raw.lines[0]?.priceConfidence).toBe("low");
    expect(result.parsed.lines[0]?.unitPriceMinor).toBe(12_000);
  });

  it("does not log receipt bytes", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../convex/internal/receiptExtraction.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/console\.(log|info|debug|dir)\(/);
    expect(source).not.toMatch(/console\.error\([^)]*(base64|imageBytes|dataUrl)/);
  });
});

describe("Thai/English fixture shape still parses (live eval is manual)", () => {
  it("RECEIPT_FORMAT_FIXTURES pass validateAndParseExtraction", () => {
    for (const fixture of Object.values(RECEIPT_FORMAT_FIXTURES)) {
      const result = validateAndParseExtraction(fixture, {
        provider: "ai_gateway",
        modelId: RECEIPT_VISION_MODEL,
      });
      expect(result.parsed.lines.length).toBeGreaterThan(0);
      expect(result.parsed.reconciliation.receiptTotalMinor).toBeGreaterThan(0);
      expect(result.modelMetadata.provider).toBe("ai_gateway");
    }
  });
});

describe("receipts.isScanEnabled", () => {
  const previousKey = process.env.AI_GATEWAY_API_KEY;

  afterEach(() => {
    if (previousKey === undefined) {
      delete process.env.AI_GATEWAY_API_KEY;
    } else {
      process.env.AI_GATEWAY_API_KEY = previousKey;
    }
  });

  it("is true only when AI_GATEWAY_API_KEY is set", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    await expect(run(receipts.isScanEnabled, {}, {})).resolves.toBe(true);

    delete process.env.AI_GATEWAY_API_KEY;
    await expect(run(receipts.isScanEnabled, {}, {})).resolves.toBe(false);
  });
});

describe("receipts upload mutations fail closed without the gateway key", () => {
  const previousKey = process.env.AI_GATEWAY_API_KEY;

  afterEach(() => {
    if (previousKey === undefined) {
      delete process.env.AI_GATEWAY_API_KEY;
    } else {
      process.env.AI_GATEWAY_API_KEY = previousKey;
    }
  });

  it("createUploadTicket throws LIVE_CREDENTIAL_MISSING when the key is absent", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    const { ctx } = createFakeCtx(world(), identity);
    await expect(
      run(receipts.createUploadTicket, ctx, { tabId: "tabs:t1" }),
    ).rejects.toMatchObject({ code: RUNTIME_GUARD_FAILURE.LIVE_CREDENTIAL_MISSING });
  });

  it("finalizeUpload never runs fixture extraction when the key is present", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    const store = world();
    store.receiptImports = [
      {
        _id: "receiptImports:r1",
        tabId: "tabs:t1",
        groupId: "groups:g1",
        uploadedBy: "users:andre",
        storageId: "storage:img1",
        storageIds: ["storage:img1"],
        pageCount: 1,
        status: "ticketed",
        uploadTicketHash: "ticket-1",
        ticketExpiresAt: Date.now() + 60_000,
        warnings: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    store.receiptBlobOwners = [{
      _id: "receiptBlobOwners:o1",
      importId: "receiptImports:r1",
      storageId: "storage:img1",
      createdAt: Date.now(),
    }];
    const { ctx, scheduled } = createFakeCtx(store, identity);

    await run(receipts.finalizeUpload, ctx, {
      importId: "receiptImports:r1",
      uploadTicketHash: "ticket-1",
      storageId: "storage:img1",
    });

    const row = store.receiptImports![0]!;
    expect(row.status).toBe("uploaded");
    expect(row.storageId).toBe("storage:img1");
    expect(row.extraction).toBeUndefined();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.args).toMatchObject({
      importId: "receiptImports:r1",
      storageIds: ["storage:img1"],
    });

    await expect(run(receipts.finalizeUpload, ctx, {
      importId: "receiptImports:r1",
      uploadTicketHash: "ticket-1",
      storageId: "storage:img1",
    })).resolves.toMatchObject({ duplicate: true });
    expect(scheduled).toHaveLength(1);

    store.receiptImports![0]!.status = "confirmed";
    await run(receipts.recordExtraction, ctx, {
      importId: "receiptImports:r1",
      raw: THAI_EXTRACTION,
      parsed: validateAndParseExtraction(THAI_EXTRACTION).parsed,
      fieldConfidence: {},
      reconciliation: {},
      modelMetadata: {},
    });
    expect(store.receiptImports![0]!.status).toBe("confirmed");
  });

  it("refuses terminal extraction writes from a stale worker claim", async () => {
    const store = world();
    store.receiptImports = [{
      _id: "receiptImports:r1",
      tabId: "tabs:t1",
      groupId: "groups:g1",
      uploadedBy: "users:andre",
      storageIds: ["storage:img1"],
      status: "extracting",
      uploadTicketHash: "ticket-1",
      warnings: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
    store.receiptExtractionLeases = [{
      _id: "receiptExtractionLeases:l1",
      importId: "receiptImports:r1",
      groupId: "groups:g1",
      status: "active",
      claimId: "worker-2",
      expiresAt: Date.now() + 60_000,
      heartbeatAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
    const { ctx } = createFakeCtx(store, identity);
    const recorded = await run(receipts.recordExtractionFailure, ctx, {
      importId: "receiptImports:r1",
      claimId: "worker-1",
      failureCode: "RECEIPT_GATEWAY_FAILED",
    });
    expect(recorded).toBe(false);
    expect(store.receiptImports![0]!.status).toBe("extracting");
  });

  it("releases unused provider capacity on crash and durably reclaims the worker", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    const store = world();
    store.receiptImports = [{
      _id: "receiptImports:r1",
      tabId: "tabs:t1",
      groupId: "groups:g1",
      uploadedBy: "users:andre",
      storageId: "storage:img1",
      storageIds: ["storage:img1"],
      pageCount: 1,
      status: "ticketed",
      uploadTicketHash: "ticket-1",
      ticketExpiresAt: Date.now() + 60_000,
      warnings: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
    store.receiptBlobOwners = [{
      _id: "receiptBlobOwners:o1",
      importId: "receiptImports:r1",
      storageId: "storage:img1",
      createdAt: Date.now(),
    }];
    const { ctx, scheduled } = createFakeCtx(store, identity);
    await run(receipts.finalizeUpload, ctx, {
      importId: "receiptImports:r1",
      uploadTicketHash: "ticket-1",
      storageIds: ["storage:img1"],
    });
    const lease = store.receiptExtractionLeases![0]!;
    lease.expiresAt = Date.now() - 1;
    await run(receipts.sweepReceiptResources, Object.assign({}, ctx as object, {
      storage: { delete: async () => undefined },
    }));
    expect(store.receiptExtractionLeases![0]!.status).toBe("released");
    expect(store.receiptUsageBuckets!
      .filter((row) => row.operation === "receipt_provider")
      .every((row) => row.attempts === 0)).toBe(true);
    expect(scheduled).toHaveLength(2);

    await expect(run(receipts.claimExtraction, ctx, {
      importId: "receiptImports:r1",
      claimId: "worker-2",
    })).resolves.toMatchObject({ storageIds: ["storage:img1"] });
    expect(store.receiptImports![0]!.status).toBe("extracting");
    await expect(run(receipts.beginExtractionProviderAttempt, ctx, {
      importId: "receiptImports:r1",
      claimId: "worker-2",
    })).resolves.toBe(true);
    await run(receipts.recordExtractionFailure, ctx, {
      importId: "receiptImports:r1",
      claimId: "worker-2",
      failureCode: "RECEIPT_GATEWAY_FAILED",
    });
    expect(store.receiptExtractionLeases![0]!.status).toBe("released");
    expect(store.receiptBlobOwners).toHaveLength(0);
    expect(store.receiptImports![0]).toMatchObject({
      status: "failed",
      cleanupPending: true,
      storageIds: ["storage:img1"],
    });
    await run(receipts.sweepReceiptResources, Object.assign({}, ctx as object, {
      storage: { delete: async () => undefined },
    }));
    expect(store.receiptImports![0]).toMatchObject({ cleanupPending: false, storageIds: [] });
    expect(store.receiptUsageBuckets!
      .filter((row) => row.operation === "receipt_provider")
      .every((row) => row.attempts === 1)).toBe(true);
  });

  it("finalizeUpload throws when the image is missing", async () => {
    process.env.AI_GATEWAY_API_KEY = "k";
    const store = world();
    store.receiptImports = [
      {
        _id: "receiptImports:r1",
        tabId: "tabs:t1",
        uploadedBy: "users:andre",
        status: "ticketed",
        uploadTicketHash: "ticket-1",
        ticketExpiresAt: Date.now() + 60_000,
        warnings: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    const { ctx } = createFakeCtx(store, identity);
    await expect(
      run(receipts.finalizeUpload, ctx, {
        importId: "receiptImports:r1",
        uploadTicketHash: "ticket-1",
      }),
    ).rejects.toThrow("RECEIPT_IMAGE_MISSING");
  });
});

describe("receipt confirmation transaction and replay", () => {
  it("binds currency to extraction and requires explicit low-confidence review", async () => {
    const store = world();
    Object.assign(store.tabs![0]!, { defaultCurrency: "THB", revision: 0 });
    store.receiptImports!.push({
      _id: "receiptImports:r1",
      tabId: "tabs:t1",
      uploadedBy: "users:andre",
      status: "needs_review",
      extraction: { currency: "THB" },
      fieldConfidence: { "line.0.price": "low" },
      warnings: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const { ctx } = createFakeCtx(store, identity);
    const base = {
      importId: "receiptImports:r1",
      lines: [{ name: "Tea", quantity: 1, unitPriceMinor: 100n }],
      receiptTotalMinor: 100n,
      currency: "THB",
      confirmationKey: "review-r1",
    };
    await expect(run(receipts.confirmReceipt, ctx, {
      ...base,
      currency: "USD",
    })).rejects.toThrow("RECEIPT_CURRENCY_RELABEL_REFUSED");
    await expect(run(receipts.confirmReceipt, ctx, base)).rejects.toThrow(
      "RECEIPT_LOW_CONFIDENCE_UNRESOLVED",
    );
    await expect(run(receipts.confirmReceipt, ctx, {
      ...base,
      resolvedLowConfidenceFields: ["line.0.price"],
    })).resolves.toMatchObject({ duplicate: false });
  });

  it("refuses a zero-item confirmation", async () => {
    const store = world();
    Object.assign(store.tabs![0]!, { defaultCurrency: "THB", revision: 0 });
    store.receiptImports!.push({
      _id: "receiptImports:r1",
      tabId: "tabs:t1",
      uploadedBy: "users:andre",
      status: "needs_review",
      extraction: { currency: "THB" },
      fieldConfidence: {},
      warnings: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const { ctx } = createFakeCtx(store, identity);
    await expect(run(receipts.confirmReceipt, ctx, {
      importId: "receiptImports:r1",
      lines: [],
      adjustments: [{ kind: "tax", amountMinor: 100n }],
      receiptTotalMinor: 100n,
      currency: "THB",
    })).rejects.toThrow("RECEIPT_ITEMS_REQUIRED");
  });

  it("atomically creates exact rows from needs_review and replays without duplicates", async () => {
    const store = world();
    store.tabs![0]!.defaultCurrency = "THB";
    store.tabs![0]!.revision = 0;
    store.receiptImports!.push({
      _id: "receiptImports:r1",
      tabId: "tabs:t1",
      uploadedBy: "users:andre",
      status: "needs_review",
      warnings: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const { ctx } = createFakeCtx(store, identity);
    const args = {
      importId: "receiptImports:r1",
      lines: [{ name: "Pad Thai", quantity: 2, unitPriceMinor: 6_000n }],
      adjustments: [{ kind: "tax", amountMinor: 840n }],
      receiptTotalMinor: 12_840n,
      currency: "THB",
      confirmationKey: "confirm-r1",
    };
    await expect(run(receipts.confirmReceipt, ctx, args)).resolves.toMatchObject({
      itemCount: 1,
      duplicate: false,
    });
    expect(store.items).toHaveLength(1);
    expect(store.adjustments).toHaveLength(1);
    expect(store.receiptImports![0]).toMatchObject({
      status: "confirmed",
      confirmationKey: "confirm-r1",
    });

    await expect(run(receipts.confirmReceipt, ctx, args)).resolves.toMatchObject({
      itemCount: 1,
      duplicate: true,
    });
    await expect(run(receipts.confirmReceipt, ctx, {
      ...args,
      lines: [{ name: "Changed after commit", quantity: 2, unitPriceMinor: 6_000n }],
    })).rejects.toThrow("RECEIPT_ALREADY_CONFIRMED");
    expect(store.items).toHaveLength(1);
    expect(store.adjustments).toHaveLength(1);
    expect(store.activityEvents).toHaveLength(1);
  });

  it("adopts detected USD only for an otherwise untouched personal draft", async () => {
    const store = world();
    Object.assign(store.tabs![0]!, {
      origin: "personal",
      defaultCurrency: "THB",
      defaultCurrencyMinorDigits: 2,
      revision: 0,
    });
    store.receiptImports!.push({
      _id: "receiptImports:r1",
      tabId: "tabs:t1",
      uploadedBy: "users:andre",
      status: "needs_review",
      warnings: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const { ctx } = createFakeCtx(store, identity);
    await run(receipts.confirmReceipt, ctx, {
      importId: "receiptImports:r1",
      lines: [{ name: "Coffee", quantity: 1, unitPriceMinor: 525n }],
      receiptTotalMinor: 525n,
      currency: "USD",
      confirmationKey: "usd-r1",
    });
    expect(store.tabs![0]).toMatchObject({
      defaultCurrency: "USD",
      defaultCurrencyMinorDigits: 2,
    });
    expect(store.tabs![0]!.fxSnapshotId).toBeTruthy();
  });
});
