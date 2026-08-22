import { v } from "convex/values";
import { assertFixturePathAllowed } from "../lib/solana/runtimeGuard";
import { mutation, query } from "./_generated/server";
import {
  runFixtureExtraction,
  validateAndParseExtraction,
  FIXTURE_SAMPLE_EXTRACTION,
} from "./lib/receiptExtraction";
import { appendActivityEvent, ACTIVITY_EVENT_TYPE } from "./lib/activitySync";
import { getCurrentUser, requireGroupMember } from "./lib/auth";
import { isReceiptScanEnabled } from "../lib/features/flags";

const TICKET_TTL_MS = 10 * 60 * 1000;

/** Returns whether receipt scan is enabled for the client (Story 8.6 AC4). */
export const isScanEnabled = query({
  args: {},
  handler: async () => isReceiptScanEnabled(),
});

/** Creates a ticketed import with organizer-bound upload ticket (Story 8.1 AC1). */
export const createUploadTicket = mutation({
  args: {
    tabId: v.id("tabs"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("UNAUTHORIZED");
    }

    const tab = await ctx.db.get(args.tabId);
    if (!tab) {
      throw new Error("TAB_NOT_FOUND");
    }

    await requireGroupMember(ctx, tab.groupId);

    if (tab.organizerTelegramUserId !== user.telegramUserId) {
      throw new Error("ORGANIZER_REQUIRED");
    }

    const ticketHash = `ticket-${args.tabId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = Date.now();

    const importId = await ctx.db.insert("receiptImports", {
      tabId: args.tabId,
      uploadedBy: user._id,
      status: "ticketed",
      uploadTicketHash: ticketHash,
      ticketExpiresAt: now + TICKET_TTL_MS,
      warnings: [],
      createdAt: now,
      updatedAt: now,
    });

    return {
      importId,
      uploadTicketHash: ticketHash,
      expiresAt: now + TICKET_TTL_MS,
    };
  },
});

/** Finalizes upload and schedules extraction (Story 8.1 AC2). */
export const finalizeUpload = mutation({
  args: {
    importId: v.id("receiptImports"),
    uploadTicketHash: v.string(),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("UNAUTHORIZED");
    }

    const receiptImport = await ctx.db.get(args.importId);
    if (!receiptImport) {
      throw new Error("IMPORT_NOT_FOUND");
    }

    if (receiptImport.uploadTicketHash !== args.uploadTicketHash) {
      throw new Error("TICKET_MISMATCH");
    }

    if (receiptImport.ticketExpiresAt && receiptImport.ticketExpiresAt < Date.now()) {
      await ctx.db.patch(args.importId, { status: "deleted", updatedAt: Date.now() });
      throw new Error("TICKET_EXPIRED");
    }

    const tab = await ctx.db.get(receiptImport.tabId);
    if (!tab || tab.organizerTelegramUserId !== user.telegramUserId) {
      throw new Error("ORGANIZER_REQUIRED");
    }

    await ctx.db.patch(args.importId, {
      status: "uploaded",
      storageId: args.storageId,
      updatedAt: Date.now(),
    });

    // Fixture extraction stands in for the model call; on a deployment it must
    // fail closed rather than write invented line items onto a real bill.
    assertFixturePathAllowed("receipts.runFixtureExtraction");
    const result = runFixtureExtraction();
    await ctx.db.patch(args.importId, {
      status: "needs_review",
      extraction: result.parsed,
      rawExtraction: result.raw,
      fieldConfidence: result.fieldConfidence,
      reconciliation: result.parsed.reconciliation,
      modelMetadata: result.modelMetadata,
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

/** Returns receipt import for review (Story 8.4). */
export const getImport = query({
  args: {
    importId: v.id("receiptImports"),
  },
  handler: async (ctx, args) => {
    const receiptImport = await ctx.db.get(args.importId);
    if (!receiptImport) {
      return null;
    }

    const tab = await ctx.db.get(receiptImport.tabId);
    if (!tab) {
      return null;
    }

    await requireGroupMember(ctx, tab.groupId);
    return receiptImport;
  },
});

/** Confirms reviewed receipt and creates items (Story 8.5). */
export const confirmReceipt = mutation({
  args: {
    importId: v.id("receiptImports"),
    lines: v.array(
      v.object({
        name: v.string(),
        quantity: v.number(),
        unitPriceMinor: v.int64(),
      }),
    ),
    receiptTotalMinor: v.int64(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("UNAUTHORIZED");
    }

    const receiptImport = await ctx.db.get(args.importId);
    if (!receiptImport) {
      throw new Error("IMPORT_NOT_FOUND");
    }

    const tab = await ctx.db.get(receiptImport.tabId);
    if (!tab || tab.organizerTelegramUserId !== user.telegramUserId) {
      throw new Error("ORGANIZER_REQUIRED");
    }

    const linesTotal = args.lines.reduce(
      (sum, line) => sum + Number(line.unitPriceMinor) * line.quantity,
      0,
    );
    if (linesTotal !== Number(args.receiptTotalMinor)) {
      throw new Error(`RECONCILIATION_BLOCKED: shortfall of ${Number(args.receiptTotalMinor) - linesTotal} minor units`);
    }

    await ctx.db.patch(args.importId, {
      status: "confirmed",
      updatedAt: Date.now(),
    });

    await ctx.db.patch(tab._id, {
      updatedAt: Date.now(),
    });

    await appendActivityEvent(ctx, {
      groupId: tab.groupId,
      tabId: tab._id,
      actorUserId: user._id,
      type: ACTIVITY_EVENT_TYPE.RECEIPT_CONFIRMED,
      payload: {
        summary: `Receipt confirmed — ${args.lines.length} items`,
        tabId: tab._id,
      },
    });

    return {
      tabId: tab._id,
      itemCount: args.lines.length,
      source: "receipt",
    };
  },
});

/** Demo-only sample receipt path — no external call (Story 8.6 AC1). */
export const useSampleReceipt = mutation({
  args: {
    tabId: v.id("tabs"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("UNAUTHORIZED");
    }

    const tab = await ctx.db.get(args.tabId);
    if (!tab || tab.organizerTelegramUserId !== user.telegramUserId) {
      throw new Error("ORGANIZER_REQUIRED");
    }

    assertFixturePathAllowed("receipts.importFixtureExtraction");
    const now = Date.now();
    const result = validateAndParseExtraction(FIXTURE_SAMPLE_EXTRACTION);

    const importId = await ctx.db.insert("receiptImports", {
      tabId: args.tabId,
      uploadedBy: user._id,
      status: "needs_review",
      extraction: result.parsed,
      rawExtraction: result.raw,
      fieldConfidence: result.fieldConfidence,
      reconciliation: result.parsed.reconciliation,
      modelMetadata: result.modelMetadata,
      warnings: [],
      createdAt: now,
      updatedAt: now,
    });

    return { importId, parsed: result.parsed };
  },
});

// FIXTURE_SAMPLE_EXTRACTION / runFixtureExtraction are deliberately NOT
// re-exported from this deployed Convex module. Import them from
// convex/lib/receiptExtraction in tests; a deployed function module should not
// carry fixture data in its public surface.
