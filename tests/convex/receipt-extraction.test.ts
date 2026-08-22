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
  RECEIPT_VISION_MODEL,
  buildReceiptExtractionRequest,
  extractReceiptViaGateway,
  parseGatewayResponseBody,
} from "@/convex/internal/receiptExtraction";
import { RECEIPT_FORMAT_FIXTURES } from "@/lib/domain/receiptFixture";
import { PreviewEgressBlockedError } from "@/lib/env/preview-guard";
import { RUNTIME_GUARD_FAILURE } from "@/lib/solana/runtimeGuard";
import { createFakeCtx, type Row } from "../helpers/convexFakeDb";
import * as receipts from "@/convex/receipts";

const run = (fn: unknown, ctx: unknown, args: unknown = {}) =>
  (fn as { _handler: (c: unknown, a: unknown) => Promise<unknown> })._handler(ctx, args);

const DID = "did:privy:andre";
const identity = { subject: DID, tokenIdentifier: DID };

const SAMPLE_BYTES = new Uint8Array([0xff, 0xd8, 0xff]).buffer;

const THAI_EXTRACTION = RECEIPT_FORMAT_FIXTURES.thaiWholeBaht;

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
        uploadedBy: "users:andre",
        status: "ticketed",
        uploadTicketHash: "ticket-1",
        ticketExpiresAt: Date.now() + 60_000,
        warnings: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    const { ctx, scheduled } = createFakeCtx(store, identity);

    await run(receipts.finalizeUpload, ctx, {
      importId: "receiptImports:r1",
      uploadTicketHash: "ticket-1",
      storageId: "storage:img1",
    });

    const row = store.receiptImports![0]!;
    expect(row.status).toBe("extracting");
    expect(row.storageId).toBe("storage:img1");
    expect(row.extraction).toBeUndefined();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.args).toMatchObject({
      importId: "receiptImports:r1",
      storageId: "storage:img1",
    });
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
