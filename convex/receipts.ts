import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import {
  assertReceiptScanAvailable,
  isAiGatewayConfigured,
} from "./lib/receiptExtraction";
import { appendActivityEvent, ACTIVITY_EVENT_TYPE } from "./lib/activitySync";
import { getCurrentUser } from "./lib/auth";
import {
  assertTabUnlocked,
  requireBillOrganizer,
  requireTabParticipant,
} from "./lib/tabAuth";
import {
  bumpTabRevision,
  nextItemSortOrder,
  validateItemInput,
} from "./lib/tabBillSync";
import { fiatMinorFromInteger } from "../lib/domain/money";
import { allocationModeForItemQuantity } from "../lib/domain/quantityClaim";
import { ITEM_QUANTITY_MAX, ITEM_QUANTITY_MIN } from "../lib/domain/bill";
import { assertSupportedCurrency, currencyMinorDigits } from "../lib/domain/currency";
import { recomputeTabTotals } from "./lib/tabBillSync";
import { isPersonalOrigin } from "./lib/tabOrigin";
import { resolveFxSnapshotIdForCurrency } from "./lib/fxSnapshotSync";
import { sha256Hex } from "../lib/crypto/convexCrypto";

const TICKET_TTL_MS = 10 * 60 * 1000;
const ACTIVE_RECEIPT_STATUSES = new Set(["ticketed", "uploaded", "extracting", "needs_review"]);
const MAX_ACTIVE_IMPORTS_PER_USER = 3;
const MAX_ACTIVE_IMPORTS_PER_GROUP = 10;
const MAX_UPLOADS_PER_USER_DAY = 10;
const MAX_UPLOADS_PER_GROUP_DAY = 30;
const MAX_UPLOADS_GLOBAL_DAY = 10_000;
const MAX_EXTRACTIONS_PER_USER_DAY = 10;
const MAX_EXTRACTIONS_PER_GROUP_DAY = 30;
const MAX_EXTRACTIONS_GLOBAL_DAY = 1_000;
const MAX_EXTRACTIONS_PER_GROUP = 2;
const MAX_EXTRACTIONS_GLOBAL = 50;
const MAX_PROVIDER_CALLS_PER_USER_HOUR = 30;
const MAX_PROVIDER_CALLS_PER_GROUP_HOUR = 100;
const MAX_PROVIDER_CALLS_GLOBAL_HOUR = 10_000;
export const RECEIPT_EXTRACTION_LEASE_MS = 120_000;

type ReceiptOperation = "receipt_upload" | "receipt_extraction" | "receipt_provider";
type ReceiptDimension =
  | "user_day" | "group_day" | "global_day"
  | "user_hour" | "group_hour" | "global_hour";

function utcDayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

async function reserveReceiptAttempt(
  ctx: MutationCtx,
  args: {
    operation: ReceiptOperation;
    userId: Id<"users">;
    groupId: Id<"groups">;
    limits: readonly [number, number, number];
    period?: "day" | "hour";
    attempts?: number;
    now: number;
  },
): Promise<string> {
  const period = args.period ?? "day";
  const suffix = period === "day" ? "day" : "hour";
  const windowKey = period === "day"
    ? utcDayKey(args.now)
    : new Date(args.now).toISOString().slice(0, 13);
  const attempts = args.attempts ?? 1;
  const dimensions: readonly [ReceiptDimension, string, number][] = [
    [`user_${suffix}` as ReceiptDimension, args.userId, args.limits[0]],
    [`group_${suffix}` as ReceiptDimension, args.groupId, args.limits[1]],
    [`global_${suffix}` as ReceiptDimension, "global", args.limits[2]],
  ];
  const rows = await Promise.all(dimensions.map(([dimension, scopeKey]) =>
    ctx.db.query("receiptUsageBuckets")
      .withIndex("by_operation_dimension_scope_window", (q) =>
        q.eq("operation", args.operation)
          .eq("dimension", dimension)
          .eq("scopeKey", scopeKey)
          .eq("windowKey", windowKey),
      )
      .unique()));
  if (rows.some((row, index) => (row?.attempts ?? 0) + attempts > dimensions[index]![2])) {
    throw new Error("RECEIPT_RATE_LIMITED");
  }
  for (let index = 0; index < dimensions.length; index += 1) {
    const [dimension, scopeKey] = dimensions[index]!;
    const row = rows[index];
    if (row) {
      await ctx.db.patch(row._id, { attempts: row.attempts + attempts, updatedAt: args.now });
    } else {
      await ctx.db.insert("receiptUsageBuckets", {
        operation: args.operation,
        dimension,
        scopeKey,
        windowKey,
        attempts,
        updatedAt: args.now,
      });
    }
  }
  return windowKey;
}

async function deleteRegisteredPages(
  ctx: MutationCtx,
  importId: Id<"receiptImports">,
  storageIds: readonly Id<"_storage">[],
): Promise<void> {
  for (const storageId of storageIds) {
    await ctx.storage.delete(storageId);
    const owner = await ctx.db
      .query("receiptBlobOwners")
      .withIndex("by_storage_id", (q) => q.eq("storageId", storageId))
      .unique();
    if (owner?.importId === importId) await ctx.db.delete(owner._id);
  }
}

async function releaseExtractionLease(
  ctx: MutationCtx,
  lease: Doc<"receiptExtractionLeases">,
  uploadedBy: Id<"users">,
  now: number,
): Promise<void> {
  if (lease.status !== "active") return;
  const release = Math.max(
    0,
    (lease.reservedProviderAttempts ?? 0) - (lease.usedProviderAttempts ?? 0),
  );
  if (release > 0 && lease.providerWindowKey) {
    for (const [dimension, scopeKey] of [
      ["user_hour", uploadedBy] as const,
      ["group_hour", lease.groupId] as const,
      ["global_hour", "global"] as const,
    ]) {
      const bucket = await ctx.db
        .query("receiptUsageBuckets")
        .withIndex("by_operation_dimension_scope_window", (q) =>
          q.eq("operation", "receipt_provider")
            .eq("dimension", dimension)
            .eq("scopeKey", scopeKey)
            .eq("windowKey", lease.providerWindowKey!),
        )
        .unique();
      if (bucket) {
        await ctx.db.patch(bucket._id, {
          attempts: Math.max(0, bucket.attempts - release),
          updatedAt: now,
        });
      }
    }
  }
  await ctx.db.patch(lease._id, {
    status: "released",
    claimId: undefined,
    updatedAt: now,
  });
}

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

    const { user, tab } = await requireBillOrganizer(ctx, args.tabId);
    assertTabUnlocked(tab);

    const now = Date.now();
    const userImports = await ctx.db
      .query("receiptImports")
      .withIndex("by_uploaded_by", (q) => q.eq("uploadedBy", user._id))
      .collect();
    const groupImports = await ctx.db
      .query("receiptImports")
      .withIndex("by_group_id", (q) => q.eq("groupId", tab.groupId))
      .collect();
    const importsToClean = [...new Map(
      [...userImports, ...groupImports].map((receiptImport) => [receiptImport._id, receiptImport]),
    ).values()];
    for (const receiptImport of importsToClean) {
      if (
        receiptImport.status === "ticketed" &&
        receiptImport.ticketExpiresAt !== undefined &&
        receiptImport.ticketExpiresAt < now
      ) {
        await deleteRegisteredPages(ctx, receiptImport._id, receiptImport.storageIds ?? []);
        await ctx.db.patch(receiptImport._id, { status: "deleted", updatedAt: now });
      }
    }
    const activeUserCount = userImports.filter((row) =>
      ACTIVE_RECEIPT_STATUSES.has(row.status) &&
      !(row.status === "ticketed" && row.ticketExpiresAt !== undefined && row.ticketExpiresAt < now)
    ).length;
    const activeGroupCount = groupImports.filter((row) =>
      ACTIVE_RECEIPT_STATUSES.has(row.status) &&
      !(row.status === "ticketed" && row.ticketExpiresAt !== undefined && row.ticketExpiresAt < now)
    ).length;
    if (activeUserCount >= MAX_ACTIVE_IMPORTS_PER_USER || activeGroupCount >= MAX_ACTIVE_IMPORTS_PER_GROUP) {
      throw new Error("RECEIPT_ACTIVE_LIMIT_REACHED");
    }
    await reserveReceiptAttempt(ctx, {
      operation: "receipt_upload",
      userId: user._id,
      groupId: tab.groupId,
      limits: [MAX_UPLOADS_PER_USER_DAY, MAX_UPLOADS_PER_GROUP_DAY, MAX_UPLOADS_GLOBAL_DAY],
      now,
    });
    const ticketHash = `ticket-${args.tabId}-${now}-${Math.random().toString(36).slice(2)}`;

    const importId = await ctx.db.insert("receiptImports", {
      tabId: args.tabId,
      groupId: tab.groupId,
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

    if (receiptImport.status !== "ticketed") {
      throw new Error("RECEIPT_UPLOAD_NOT_OPEN");
    }

    if (receiptImport.ticketExpiresAt && receiptImport.ticketExpiresAt < Date.now()) {
      await deleteRegisteredPages(ctx, args.importId, receiptImport.storageIds ?? []);
      await ctx.db.patch(args.importId, { status: "deleted", updatedAt: Date.now() });
      throw new Error("TICKET_EXPIRED");
    }

    const tab = await ctx.db.get(receiptImport.tabId);
    if (!tab || tab.organizerTelegramUserId !== user.telegramUserId) {
      throw new Error("ORGANIZER_REQUIRED");
    }
    assertTabUnlocked(tab);

    return await ctx.storage.generateUploadUrl();
  },
});

/** Records ownership of each uploaded blob before the next page is attempted. */
export const registerUploadPage = mutation({
  args: {
    importId: v.id("receiptImports"),
    uploadTicketHash: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("UNAUTHORIZED");
    const receiptImport = await ctx.db.get(args.importId);
    if (!receiptImport) throw new Error("IMPORT_NOT_FOUND");
    if (receiptImport.uploadTicketHash !== args.uploadTicketHash) {
      throw new Error("TICKET_MISMATCH");
    }
    if (receiptImport.status !== "ticketed") {
      throw new Error("RECEIPT_UPLOAD_NOT_OPEN");
    }
    const tab = await ctx.db.get(receiptImport.tabId);
    if (!tab || tab.organizerTelegramUserId !== user.telegramUserId) {
      throw new Error("ORGANIZER_REQUIRED");
    }
    assertTabUnlocked(tab);
    if (receiptImport.ticketExpiresAt && receiptImport.ticketExpiresAt < Date.now()) {
      const cleanupIds = [...new Set(receiptImport.storageIds ?? [])];
      await deleteRegisteredPages(ctx, args.importId, cleanupIds);
      await ctx.storage.delete(args.storageId);
      await ctx.db.patch(args.importId, { status: "deleted", updatedAt: Date.now() });
      throw new Error("TICKET_EXPIRED");
    }
    const storageIds = receiptImport.storageIds ?? [];
    const existingOwner = await ctx.db
      .query("receiptBlobOwners")
      .withIndex("by_storage_id", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (existingOwner?.importId === args.importId && storageIds.includes(args.storageId)) {
      return { pageCount: storageIds.length, duplicate: true as const };
    }
    if (existingOwner) {
      throw new Error("RECEIPT_BLOB_ALREADY_OWNED");
    }
    if (storageIds.length >= 8) {
      await ctx.storage.delete(args.storageId);
      throw new Error("RECEIPT_PAGE_LIMIT_EXCEEDED");
    }
    const next = [...storageIds, args.storageId];
    await ctx.db.insert("receiptBlobOwners", {
      storageId: args.storageId,
      importId: args.importId,
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.importId, {
      storageId: next[0],
      storageIds: next,
      pageCount: next.length,
      updatedAt: Date.now(),
    });
    return { pageCount: next.length, duplicate: false as const };
  },
});

/** Deletes a just-uploaded blob that failed before ownership registration. */
export const discardUploadCandidate = mutation({
  args: {
    importId: v.id("receiptImports"),
    uploadTicketHash: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("UNAUTHORIZED");
    const receiptImport = await ctx.db.get(args.importId);
    if (!receiptImport || receiptImport.uploadTicketHash !== args.uploadTicketHash) {
      throw new Error("TICKET_MISMATCH");
    }
    const tab = await ctx.db.get(receiptImport.tabId);
    if (!tab || tab.organizerTelegramUserId !== user.telegramUserId) {
      throw new Error("ORGANIZER_REQUIRED");
    }
    const owner = await ctx.db
      .query("receiptBlobOwners")
      .withIndex("by_storage_id", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (!owner) await ctx.storage.delete(args.storageId);
    return { deleted: owner === null };
  },
});

/** Authorized cleanup for a partial multi-page upload. */
export const discardUpload = mutation({
  args: {
    importId: v.id("receiptImports"),
    uploadTicketHash: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("UNAUTHORIZED");
    const receiptImport = await ctx.db.get(args.importId);
    if (!receiptImport) return { deleted: false as const };
    if (receiptImport.uploadTicketHash !== args.uploadTicketHash) {
      throw new Error("TICKET_MISMATCH");
    }
    const tab = await ctx.db.get(receiptImport.tabId);
    if (!tab || tab.organizerTelegramUserId !== user.telegramUserId) {
      throw new Error("ORGANIZER_REQUIRED");
    }
    if (receiptImport.status !== "ticketed" && receiptImport.status !== "failed") {
      throw new Error("RECEIPT_UPLOAD_NOT_DISCARDABLE");
    }
    await deleteRegisteredPages(ctx, args.importId, receiptImport.storageIds ?? []);
    await ctx.db.patch(args.importId, { status: "deleted", updatedAt: Date.now() });
    return { deleted: true as const };
  },
});

/** Finalizes upload and schedules extraction (Story 8.1 AC2, AD-8). */
export const finalizeUpload = mutation({
  args: {
    importId: v.id("receiptImports"),
    uploadTicketHash: v.string(),
    storageId: v.optional(v.id("_storage")),
    storageIds: v.optional(v.array(v.id("_storage"))),
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

    if (
      receiptImport.status === "ticketed" &&
      receiptImport.ticketExpiresAt &&
      receiptImport.ticketExpiresAt < Date.now()
    ) {
      await deleteRegisteredPages(ctx, args.importId, receiptImport.storageIds ?? []);
      await ctx.db.patch(args.importId, { status: "deleted", updatedAt: Date.now() });
      throw new Error("TICKET_EXPIRED");
    }

    const tab = await ctx.db.get(receiptImport.tabId);
    if (!tab || tab.organizerTelegramUserId !== user.telegramUserId) {
      throw new Error("ORGANIZER_REQUIRED");
    }

    const submittedStorageIds = args.storageIds ?? (args.storageId ? [args.storageId] : []);
    const storageIds = receiptImport.storageIds ?? [];
    if (receiptImport.status !== "ticketed") {
      const replayPages = submittedStorageIds.length > 0
        ? submittedStorageIds
        : storageIds;
      const samePages =
        replayPages.length === (receiptImport.storageIds?.length ?? 0) &&
        replayPages.every((id, index) => id === receiptImport.storageIds?.[index]);
      if (
        samePages &&
        receiptImport.status !== "deleted" &&
        receiptImport.status !== "rejected"
      ) {
        return { ok: true, duplicate: true as const, status: receiptImport.status };
      }
      throw new Error("RECEIPT_UPLOAD_ALREADY_FINALIZED");
    }
    assertTabUnlocked(tab);
    if (
      submittedStorageIds.length !== storageIds.length ||
      submittedStorageIds.some((id, index) => id !== storageIds[index])
    ) {
      throw new Error("RECEIPT_UPLOAD_PAGE_MISMATCH");
    }
    if (storageIds.length === 0) {
      throw new Error("RECEIPT_IMAGE_MISSING");
    }
    if (storageIds.length > 8) {
      throw new Error("RECEIPT_PAGE_LIMIT_EXCEEDED");
    }
    if (new Set(storageIds).size !== storageIds.length) {
      throw new Error("RECEIPT_DUPLICATE_PAGE");
    }

    const now = Date.now();
    const activeLeases = await ctx.db
      .query("receiptExtractionLeases")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    for (const lease of activeLeases) {
      if (lease.expiresAt <= now) {
        const owner = await ctx.db.get(lease.importId);
        if (owner) await releaseExtractionLease(ctx, lease, owner.uploadedBy, now);
      }
    }
    const liveLeases = activeLeases.filter((lease) => lease.expiresAt > now);
    if (
      liveLeases.length >= MAX_EXTRACTIONS_GLOBAL ||
      liveLeases.filter((lease) => lease.groupId === tab.groupId).length >= MAX_EXTRACTIONS_PER_GROUP
    ) {
      throw new Error("RECEIPT_EXTRACTION_BUSY");
    }
    await reserveReceiptAttempt(ctx, {
      operation: "receipt_extraction",
      userId: receiptImport.uploadedBy,
      groupId: tab.groupId,
      limits: [
        MAX_EXTRACTIONS_PER_USER_DAY,
        MAX_EXTRACTIONS_PER_GROUP_DAY,
        MAX_EXTRACTIONS_GLOBAL_DAY,
      ],
      now,
    });
    const providerWindowKey = await reserveReceiptAttempt(ctx, {
      operation: "receipt_provider",
      userId: receiptImport.uploadedBy,
      groupId: tab.groupId,
      limits: [
        MAX_PROVIDER_CALLS_PER_USER_HOUR,
        MAX_PROVIDER_CALLS_PER_GROUP_HOUR,
        MAX_PROVIDER_CALLS_GLOBAL_HOUR,
      ],
      period: "hour",
      attempts: storageIds.length,
      now,
    });
    await ctx.db.insert("receiptExtractionLeases", {
      importId: args.importId,
      groupId: tab.groupId,
      status: "active",
      providerWindowKey,
      reservedProviderAttempts: storageIds.length,
      usedProviderAttempts: 0,
      expiresAt: now + RECEIPT_EXTRACTION_LEASE_MS,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.importId, {
      status: "uploaded",
      storageId: storageIds[0],
      storageIds,
      pageCount: storageIds.length,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.internal.receiptExtraction.extractReceipt, {
      importId: args.importId,
      storageIds,
    });

    return { ok: true, duplicate: false as const };
  },
});

/** Claims or recovers a durable extraction worker lease. */
export const claimExtraction = internalMutation({
  args: { importId: v.id("receiptImports"), claimId: v.string() },
  handler: async (ctx, args) => {
    const receiptImport = await ctx.db.get(args.importId);
    if (!receiptImport || (receiptImport.status !== "uploaded" && receiptImport.status !== "extracting")) {
      return null;
    }
    const lease = await ctx.db
      .query("receiptExtractionLeases")
      .withIndex("by_import_id", (q) => q.eq("importId", args.importId))
      .unique();
    if (!lease) return null;
    const now = Date.now();
    if (lease.status === "active" && lease.claimId && lease.expiresAt > now) {
      await ctx.scheduler.runAfter(
        lease.expiresAt - now + 1,
        internal.internal.receiptExtraction.extractReceipt,
        { importId: args.importId },
      );
      return { inFlight: true as const };
    }
    const recovering = lease.status === "released" || lease.expiresAt <= now;
    if (lease.status === "active" && lease.expiresAt <= now) {
      await releaseExtractionLease(ctx, lease, receiptImport.uploadedBy, now);
    }
    const groupLeases = await ctx.db
      .query("receiptExtractionLeases")
      .withIndex("by_group_and_status", (q) =>
        q.eq("groupId", lease.groupId).eq("status", "active"),
      )
      .collect();
    const globalLeases = await ctx.db
      .query("receiptExtractionLeases")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const liveGroup = groupLeases.filter((row) => row._id !== lease._id && row.expiresAt > now);
    const liveGlobal = globalLeases.filter((row) => row._id !== lease._id && row.expiresAt > now);
    if (liveGroup.length >= MAX_EXTRACTIONS_PER_GROUP || liveGlobal.length >= MAX_EXTRACTIONS_GLOBAL) {
      await ctx.scheduler.runAfter(
        RECEIPT_EXTRACTION_LEASE_MS,
        internal.internal.receiptExtraction.extractReceipt,
        { importId: args.importId },
      );
      return { busy: true as const };
    }
    let recoveryProviderWindowKey: string | undefined;
    if (recovering) {
      recoveryProviderWindowKey = await reserveReceiptAttempt(ctx, {
        operation: "receipt_provider",
        userId: receiptImport.uploadedBy,
        groupId: lease.groupId,
        limits: [
          MAX_PROVIDER_CALLS_PER_USER_HOUR,
          MAX_PROVIDER_CALLS_PER_GROUP_HOUR,
          MAX_PROVIDER_CALLS_GLOBAL_HOUR,
        ],
        period: "hour",
        attempts: receiptImport.storageIds?.length ?? 0,
        now,
      });
    }
    await ctx.db.patch(lease._id, {
      status: "active",
      claimId: args.claimId,
      ...(recovering
        ? {
            providerWindowKey: recoveryProviderWindowKey,
            reservedProviderAttempts: receiptImport.storageIds?.length ?? 0,
            usedProviderAttempts: 0,
          }
        : {}),
      heartbeatAt: now,
      expiresAt: now + RECEIPT_EXTRACTION_LEASE_MS,
      updatedAt: now,
    });
    await ctx.db.patch(args.importId, { status: "extracting", updatedAt: now });
    await ctx.scheduler.runAfter(
      RECEIPT_EXTRACTION_LEASE_MS + 1,
      internal.internal.receiptExtraction.extractReceipt,
      { importId: args.importId },
    );
    return { storageIds: receiptImport.storageIds ?? [] };
  },
});

export const heartbeatExtraction = internalMutation({
  args: { importId: v.id("receiptImports"), claimId: v.string() },
  handler: async (ctx, args) => {
    const lease = await ctx.db
      .query("receiptExtractionLeases")
      .withIndex("by_import_id", (q) => q.eq("importId", args.importId))
      .unique();
    if (!lease || lease.status !== "active" || lease.claimId !== args.claimId) return false;
    const now = Date.now();
    await ctx.db.patch(lease._id, {
      heartbeatAt: now,
      expiresAt: now + RECEIPT_EXTRACTION_LEASE_MS,
      updatedAt: now,
    });
    return true;
  },
});

/** Charges one provider attempt immediately before the external call. */
export const beginExtractionProviderAttempt = internalMutation({
  args: { importId: v.id("receiptImports"), claimId: v.string() },
  handler: async (ctx, args) => {
    const lease = await ctx.db
      .query("receiptExtractionLeases")
      .withIndex("by_import_id", (q) => q.eq("importId", args.importId))
      .unique();
    if (!lease || lease.status !== "active" || lease.claimId !== args.claimId) return false;
    const used = lease.usedProviderAttempts ?? 0;
    if (used >= (lease.reservedProviderAttempts ?? 0)) return false;
    const now = Date.now();
    await ctx.db.patch(lease._id, {
      usedProviderAttempts: used + 1,
      heartbeatAt: now,
      expiresAt: now + RECEIPT_EXTRACTION_LEASE_MS,
      updatedAt: now,
    });
    return true;
  },
});

/** Reclaims abandoned tickets and wakes receipt workers whose lease died. */
export const sweepReceiptResources = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let deletedTickets = 0;
    let recoveredExtractions = 0;
    let cleanedTerminalImports = 0;
    const ticketed = await ctx.db
      .query("receiptImports")
      .withIndex("by_status", (q) => q.eq("status", "ticketed"))
      .collect();
    for (const receiptImport of ticketed) {
      if (receiptImport.ticketExpiresAt !== undefined && receiptImport.ticketExpiresAt < now) {
        await deleteRegisteredPages(ctx, receiptImport._id, receiptImport.storageIds ?? []);
        await ctx.db.patch(receiptImport._id, { status: "deleted", updatedAt: now });
        deletedTickets += 1;
      }
    }
    for (const status of ["needs_review", "failed"] as const) {
      const terminal = await ctx.db
        .query("receiptImports")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      for (const receiptImport of terminal) {
        if (!receiptImport.cleanupPending) continue;
        try {
          await deleteRegisteredPages(ctx, receiptImport._id, receiptImport.storageIds ?? []);
          await ctx.db.patch(receiptImport._id, {
            cleanupPending: false,
            storageId: undefined,
            storageIds: [],
            updatedAt: now,
          });
          cleanedTerminalImports += 1;
        } catch {
          // The persisted flag and ids are the durable retry queue for the next sweep.
        }
      }
    }
    const leases = await ctx.db
      .query("receiptExtractionLeases")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    for (const lease of leases) {
      if (lease.expiresAt > now) continue;
      const receiptImport = await ctx.db.get(lease.importId);
      if (receiptImport) {
        await releaseExtractionLease(ctx, lease, receiptImport.uploadedBy, now);
      }
      if (receiptImport?.status === "uploaded" || receiptImport?.status === "extracting") {
        await ctx.scheduler.runAfter(0, internal.internal.receiptExtraction.extractReceipt, {
          importId: lease.importId,
        });
        recoveredExtractions += 1;
      }
    }
    return { deletedTickets, recoveredExtractions, cleanedTerminalImports };
  },
});

async function finishExtractionResources(
  ctx: MutationCtx,
  receiptImport: Doc<"receiptImports">,
): Promise<void> {
  const owners = await ctx.db
    .query("receiptBlobOwners")
    .withIndex("by_import_id", (q) => q.eq("importId", receiptImport._id))
    .collect();
  for (const owner of owners) await ctx.db.delete(owner._id);
  const lease = await ctx.db
    .query("receiptExtractionLeases")
    .withIndex("by_import_id", (q) => q.eq("importId", receiptImport._id))
    .unique();
  if (lease?.status === "active") {
    await releaseExtractionLease(ctx, lease, receiptImport.uploadedBy, Date.now());
  }
}

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
    if (!receiptImport || receiptImport.status !== "extracting") {
      return false;
    }
    await finishExtractionResources(ctx, receiptImport);
    await ctx.db.patch(args.importId, {
      status: "needs_review",
      cleanupPending: true,
      extraction: args.parsed,
      rawExtraction: args.raw,
      fieldConfidence: args.fieldConfidence,
      reconciliation: args.reconciliation,
      modelMetadata: args.modelMetadata,
      failureCode: undefined,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const recordExtractionFailure = internalMutation({
  args: {
    importId: v.id("receiptImports"),
    failureCode: v.string(),
  },
  handler: async (ctx, args) => {
    const receiptImport = await ctx.db.get(args.importId);
    if (!receiptImport || receiptImport.status !== "extracting") {
      return false;
    }
    await finishExtractionResources(ctx, receiptImport);
    await ctx.db.patch(args.importId, {
      status: "failed",
      cleanupPending: true,
      failureCode: args.failureCode,
      updatedAt: Date.now(),
    });
    return true;
  },
});

/** Clears the durable cleanup marker only after every source blob was deleted. */
export const recordReceiptCleanupComplete = internalMutation({
  args: { importId: v.id("receiptImports") },
  handler: async (ctx, args) => {
    const receiptImport = await ctx.db.get(args.importId);
    if (!receiptImport || (receiptImport.status !== "needs_review" && receiptImport.status !== "failed")) {
      return false;
    }
    await ctx.db.patch(args.importId, {
      cleanupPending: false,
      storageId: undefined,
      storageIds: [],
      updatedAt: Date.now(),
    });
    return true;
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

    await requireTabParticipant(ctx, tab._id);
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

    await requireTabParticipant(ctx, tab._id);

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
    currency: v.optional(v.string()),
    confirmationKey: v.optional(v.string()),
    resolvedLowConfidenceFields: v.optional(v.array(v.string())),
    adjustments: v.optional(
      v.array(
        v.object({
          kind: v.union(
            v.literal("service"),
            v.literal("tax"),
            v.literal("discount"),
            v.literal("gratuity"),
          ),
          amountMinor: v.int64(),
        }),
      ),
    ),
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

    const extractedCurrency =
      typeof receiptImport.extraction?.currency === "string"
        ? receiptImport.extraction.currency
        : typeof receiptImport.rawExtraction?.currency === "string"
          ? receiptImport.rawExtraction.currency
          : undefined;
    const submittedCurrency = assertSupportedCurrency(
      args.currency ?? extractedCurrency ?? "THB",
    );
    if (extractedCurrency && submittedCurrency !== assertSupportedCurrency(extractedCurrency)) {
      throw new Error("RECEIPT_CURRENCY_RELABEL_REFUSED");
    }

    const tab = await ctx.db.get(receiptImport.tabId);
    if (!tab || tab.organizerTelegramUserId !== user.telegramUserId) {
      throw new Error("ORGANIZER_REQUIRED");
    }

    const confirmationKey = args.confirmationKey?.trim() || `receipt:${args.importId}`;
    const confirmationPayloadHash = sha256Hex(JSON.stringify({
      importId: String(args.importId),
      lines: args.lines.map((line) => ({
        name: line.name,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor.toString(),
      })),
      receiptTotalMinor: args.receiptTotalMinor.toString(),
      currency: submittedCurrency,
      resolvedLowConfidenceFields: args.resolvedLowConfidenceFields ?? [],
      adjustments: (args.adjustments ?? []).map((adjustment) => ({
        kind: adjustment.kind,
        amountMinor: adjustment.amountMinor.toString(),
      })),
    }));
    if (receiptImport.status === "confirmed") {
      if (
        receiptImport.confirmationKey !== confirmationKey ||
        receiptImport.confirmationPayloadHash !== confirmationPayloadHash
      ) {
        throw new Error("RECEIPT_ALREADY_CONFIRMED");
      }
      return {
        tabId: receiptImport.tabId,
        itemCount: receiptImport.confirmedItemIds?.length ?? args.lines.length,
        itemIds: receiptImport.confirmedItemIds ?? [],
        source: "receipt" as const,
        duplicate: true,
      };
    }
    if (receiptImport.status !== "needs_review") {
      throw new Error("RECEIPT_NOT_READY_FOR_CONFIRMATION");
    }
    if (args.lines.length === 0) {
      throw new Error("RECEIPT_ITEMS_REQUIRED");
    }
    const resolvedFields = new Set(args.resolvedLowConfidenceFields ?? []);
    const unresolvedLowConfidence = Object.entries(
      (receiptImport.fieldConfidence ?? {}) as Record<string, unknown>,
    )
      .filter(([, confidence]) => confidence === "low")
      .map(([field]) => field)
      .filter((field) => !resolvedFields.has(field));
    if (unresolvedLowConfidence.length > 0) {
      throw new Error("RECEIPT_LOW_CONFIDENCE_UNRESOLVED");
    }

    const currency = submittedCurrency;
    if (tab.defaultCurrency && tab.defaultCurrency !== currency) {
      const existingItems = await ctx.db
        .query("items")
        .withIndex("by_tab_id", (q) => q.eq("tabId", tab._id))
        .collect();
      const existingAdjustments = await ctx.db
        .query("adjustments")
        .withIndex("by_tab_id", (q) => q.eq("tabId", tab._id))
        .collect();
      const mayAdoptDetectedCurrency =
        isPersonalOrigin(tab) &&
        tab.status === "draft" &&
        (tab.revision ?? 0) === 0 &&
        existingItems.length === 0 &&
        existingAdjustments.length === 0;
      if (!mayAdoptDetectedCurrency) {
        throw new Error("RECEIPT_CURRENCY_MISMATCH");
      }
      let fxSnapshotId;
      try {
        fxSnapshotId = await resolveFxSnapshotIdForCurrency(ctx, currency, Date.now());
      } catch {
        throw new Error("RECEIPT_CURRENCY_FX_UNAVAILABLE");
      }
      await ctx.db.patch(tab._id, {
        defaultCurrency: currency,
        defaultCurrencyMinorDigits: currencyMinorDigits(currency),
        fxSnapshotId,
        updatedAt: Date.now(),
      });
    }

    const linesTotal = args.lines.reduce((sum, line) => {
      if (
        !Number.isSafeInteger(line.quantity) ||
        line.quantity < ITEM_QUANTITY_MIN ||
        line.quantity > ITEM_QUANTITY_MAX
      ) {
        throw new Error("RECEIPT_LINE_INVALID");
      }
      return sum + line.unitPriceMinor * BigInt(line.quantity);
    }, 0n);
    const adjustmentsTotal = (args.adjustments ?? []).reduce(
      (sum, adjustment) =>
        sum + (adjustment.kind === "discount" ? -adjustment.amountMinor : adjustment.amountMinor),
      0n,
    );
    if (linesTotal + adjustmentsTotal !== args.receiptTotalMinor) {
      throw new Error(`RECONCILIATION_BLOCKED: shortfall of ${args.receiptTotalMinor - linesTotal - adjustmentsTotal} minor units`);
    }

    // The items are the whole point of confirming. This previously patched the
    // import to "confirmed" and returned `itemCount`, creating nothing — the
    // organizer was told N items had been added to a bill that stayed empty.
    assertTabUnlocked(tab);

    const now = Date.now();
    let sortOrder = await nextItemSortOrder(ctx, tab._id);
    const itemIds = [];
    for (const line of args.lines) {
      const unitPriceMinor = Number(line.unitPriceMinor);
      if (!Number.isSafeInteger(unitPriceMinor)) {
        throw new Error("RECEIPT_AMOUNT_OUT_OF_RANGE");
      }
      const validated = validateItemInput({
        name: line.name,
        quantity: line.quantity,
        unitPriceMinor: fiatMinorFromInteger(unitPriceMinor),
      });
      const itemId = await ctx.db.insert("items", {
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
      itemIds.push(itemId);
      sortOrder += 1;
    }

    const existingAdjustments = await ctx.db
      .query("adjustments")
      .withIndex("by_tab_id", (q) => q.eq("tabId", tab._id))
      .collect();
    if ((args.adjustments?.length ?? 0) > 0 && existingAdjustments.length > 0) {
      throw new Error("RECEIPT_ADJUSTMENT_CONFLICT");
    }
    const adjustmentPosition = { service: 0, tax: 1, discount: 2, gratuity: 3 } as const;
    for (const adjustment of args.adjustments ?? []) {
      const amountMinor = Number(adjustment.amountMinor);
      if (!Number.isSafeInteger(amountMinor)) {
        throw new Error("RECEIPT_AMOUNT_OUT_OF_RANGE");
      }
      fiatMinorFromInteger(amountMinor);
      if (amountMinor <= 0) {
        throw new Error("RECEIPT_ADJUSTMENT_INVALID");
      }
      await ctx.db.insert("adjustments", {
        tabId: tab._id,
        kind: adjustment.kind === "gratuity" ? "group_tip" : adjustment.kind,
        calculation: "fixed",
        valueMinorOrBps: amountMinor,
        position: adjustmentPosition[adjustment.kind],
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.importId, {
      status: "confirmed",
      confirmationKey,
      confirmationPayloadHash,
      confirmedItemIds: itemIds,
      updatedAt: now,
    });

    await recomputeTabTotals(ctx, tab._id);
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
      itemIds,
      source: "receipt",
      duplicate: false,
    };
  },
});

// The demo `useSampleReceipt` mutation is gone: it seeded a hardcoded receipt
// into a real tab. No FIXTURE_* symbol is exported from this module, or from any
// other module under convex/ — see tests/convex/fixture-guard.test.ts.
