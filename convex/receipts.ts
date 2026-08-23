import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  assertReceiptScanAvailable,
  isAiGatewayConfigured,
} from "./lib/receiptExtraction";
import { appendActivityEvent, ACTIVITY_EVENT_TYPE } from "./lib/activitySync";
import { getCurrentUser, requireGroupMember } from "./lib/auth";
import { assertTabUnlocked } from "./lib/tabAuth";
import {
  bumpTabRevision,
  nextItemSortOrder,
  validateItemInput,
} from "./lib/tabBillSync";
import { fiatMinorFromInteger } from "../lib/domain/money";
import { allocationModeForItemQuantity } from "../lib/domain/quantityClaim";

const TICKET_TTL_MS = 10 * 60 * 1000;

/**
 * Whether receipt scan can actually run here.
 *
 * Server capability: Convex holds `AI_GATEWAY_API_KEY` (D-32). Not
 * `NEXT_PUBLIC_FEATURE_RECEIPT_SCAN` (that variable is Vercel-only and is
 * never present in this runtime). Not `fixturePathAllowed` — a missing key
 * is a hard fail, never permission to invent a receipt (D-11).
 */
export const isScanEnabled = query({
  args: {},
  handler: async () => isAiGatewayConfigured(),
});

/** Creates a ticketed import with organizer-bound upload ticket (Story 8.1 AC1). */
export const createUploadTicket = mutation({
  args: {
    tabId: v.id("tabs"),
  },
  handler: async (ctx, args) => {
    // Fail at the first step rather than after somebody has photographed a
    // receipt. Missing key = hard fail; the fixture path is not a fallback.
    assertReceiptScanAvailable();

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

/** One-shot Convex storage URL, bound to a live organizer ticket. */
export const generateUploadUrl = mutation({
  args: {
    importId: v.id("receiptImports"),
    uploadTicketHash: v.string(),
  },
  handler: async (ctx, args) => {
    assertReceiptScanAvailable();

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

    return await ctx.storage.generateUploadUrl();
  },
});

/** Finalizes upload and schedules extraction (Story 8.1 AC2, AD-8). */
export const finalizeUpload = mutation({
  args: {
    importId: v.id("receiptImports"),
    uploadTicketHash: v.string(),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    assertReceiptScanAvailable();

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

    if (!args.storageId) {
      throw new Error("RECEIPT_IMAGE_MISSING");
    }

    await ctx.db.patch(args.importId, {
      status: "extracting",
      storageId: args.storageId,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.internal.receiptExtraction.extractReceipt, {
      importId: args.importId,
      storageId: args.storageId,
    });

    return { ok: true };
  },
});

/** Records a validated extraction. Client sees needs_review. */
export const recordExtraction = internalMutation({
  args: {
    importId: v.id("receiptImports"),
    raw: v.any(),
    parsed: v.any(),
    fieldConfidence: v.any(),
    reconciliation: v.any(),
    modelMetadata: v.any(),
  },
  handler: async (ctx, args) => {
    const receiptImport = await ctx.db.get(args.importId);
    if (!receiptImport || receiptImport.status === "deleted") {
      return;
    }
    await ctx.db.patch(args.importId, {
      status: "needs_review",
      extraction: args.parsed,
      rawExtraction: args.raw,
      fieldConfidence: args.fieldConfidence,
      reconciliation: args.reconciliation,
      modelMetadata: args.modelMetadata,
      failureCode: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const recordExtractionFailure = internalMutation({
  args: {
    importId: v.id("receiptImports"),
    failureCode: v.string(),
  },
  handler: async (ctx, args) => {
    const receiptImport = await ctx.db.get(args.importId);
    if (!receiptImport || receiptImport.status === "deleted") {
      return;
    }
    await ctx.db.patch(args.importId, {
      status: "failed",
      failureCode: args.failureCode,
      updatedAt: Date.now(),
    });
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

/**
 * The newest live import for a tab (Story 8.4).
 *
 * Receipt Review is routed by tab, not by import, so a cold load of that URL
 * has no `importId` to read. This resolves one from the tab through
 * `by_tab_id`. Discarded imports — deleted, rejected — are never resurrected.
 * Same authorization as `getImport`: a member of the tab's group.
 */
export const latestImportForTab = query({
  args: {
    tabId: v.id("tabs"),
  },
  handler: async (ctx, args) => {
    const tab = await ctx.db.get(args.tabId);
    if (!tab) {
      return null;
    }

    await requireGroupMember(ctx, tab.groupId);

    const imports = await ctx.db
      .query("receiptImports")
      .withIndex("by_tab_id", (q) => q.eq("tabId", args.tabId))
      .order("desc")
      .collect();

    return (
      imports.find(
        (receiptImport) =>
          receiptImport.status !== "deleted" && receiptImport.status !== "rejected",
      ) ?? null
    );
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

    // The items are the whole point of confirming. This previously patched the
    // import to "confirmed" and returned `itemCount`, creating nothing — the
    // organizer was told N items had been added to a bill that stayed empty.
    assertTabUnlocked(tab);

    const now = Date.now();
    let sortOrder = await nextItemSortOrder(ctx, tab._id);
    for (const line of args.lines) {
      const validated = validateItemInput({
        name: line.name,
        quantity: line.quantity,
        unitPriceMinor: fiatMinorFromInteger(Number(line.unitPriceMinor)),
      });
      await ctx.db.insert("items", {
        tabId: tab._id,
        name: validated.name,
        quantity: validated.quantity,
        unitPriceMinor: validated.unitPriceMinor,
        lineTotalMinor: validated.lineTotalMinor,
        allocationMode: allocationModeForItemQuantity(validated.quantity),
        sortOrder,
        source: "receipt",
        createdAt: now,
        updatedAt: now,
      });
      sortOrder += 1;
    }

    await ctx.db.patch(args.importId, {
      status: "confirmed",
      updatedAt: now,
    });

    await bumpTabRevision(ctx, tab._id, tab, now);

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

// The demo `useSampleReceipt` mutation is gone: it seeded a hardcoded receipt
// into a real tab. No FIXTURE_* symbol is exported from this module, or from any
// other module under convex/ — see tests/convex/fixture-guard.test.ts.
