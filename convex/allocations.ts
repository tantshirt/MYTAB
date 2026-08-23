import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  organizerAssignItemCore,
  setItemAllocationModeCore,
  setOwnClaimQuantityCore,
  toggleOwnClaimCore,
} from "./lib/claimSync";
import { buildClaimBoardView, organizerDisplayName } from "./lib/claimBoardQuery";
import { lockBillCore, reopenBillCore } from "./lib/lockSync";
import { requireBillOrganizer, requireTabParticipant, tabRevision } from "./lib/tabAuth";
import { RevisionSyncError } from "./lib/revisionSync";

const allocationModeValidator = v.union(
  v.literal("full"),
  v.literal("equal"),
  v.literal("quantity"),
  v.literal("percentage"),
  v.literal("fixed"),
);

/** Toggles the viewer's own claim on an item (Story 5.4). */
export const toggleOwnClaim = mutation({
  args: {
    tabId: v.id("tabs"),
    itemId: v.id("items"),
    clientRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const { tab, user } = await requireTabParticipant(ctx, args.tabId);
    const now = Date.now();
    try {
      const result = await toggleOwnClaimCore(ctx, {
        tabId: args.tabId,
        itemId: args.itemId,
        userId: user._id,
        clientRevision: args.clientRevision,
        now,
      });
      return { ...result, stale: false as const };
    } catch (error) {
      if (error instanceof RevisionSyncError) {
        return { stale: true as const, revision: tabRevision(tab) };
      }
      throw error;
    }
  },
});

/** Sets the viewer's integer claimed count on a quantity-mode item (D-23, D-29). */
export const setOwnClaimQuantity = mutation({
  args: {
    tabId: v.id("tabs"),
    itemId: v.id("items"),
    clientRevision: v.number(),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const { tab, user } = await requireTabParticipant(ctx, args.tabId);
    const now = Date.now();
    try {
      const result = await setOwnClaimQuantityCore(ctx, {
        tabId: args.tabId,
        itemId: args.itemId,
        userId: user._id,
        clientRevision: args.clientRevision,
        quantity: args.quantity,
        now,
      });
      return { ...result, stale: false as const };
    } catch (error) {
      if (error instanceof RevisionSyncError) {
        return { stale: true as const, revision: tabRevision(tab) };
      }
      throw error;
    }
  },
});

/** Organizer assigns an unclaimed item to a participant (Story 5.7). */
export const organizerAssignItem = mutation({
  args: {
    tabId: v.id("tabs"),
    itemId: v.id("items"),
    targetUserId: v.id("users"),
    clientRevision: v.number(),
  },
  handler: async (ctx, args) => {
    await requireBillOrganizer(ctx, args.tabId);
    const now = Date.now();
    return organizerAssignItemCore(ctx, {
      tabId: args.tabId,
      itemId: args.itemId,
      targetUserId: args.targetUserId,
      clientRevision: args.clientRevision,
      now,
    });
  },
});

/** Sets quantity, percentage, or fixed allocation mode inputs (Story 5.11). */
export const setItemAllocationMode = mutation({
  args: {
    tabId: v.id("tabs"),
    itemId: v.id("items"),
    clientRevision: v.number(),
    mode: allocationModeValidator,
    quantity: v.optional(v.number()),
    percentageBps: v.optional(v.number()),
    fixedMinor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireTabParticipant(ctx, args.tabId);
    const now = Date.now();
    return setItemAllocationModeCore(ctx, {
      tabId: args.tabId,
      itemId: args.itemId,
      userId: user._id,
      clientRevision: args.clientRevision,
      mode: args.mode,
      quantity: args.quantity,
      percentageBps: args.percentageBps,
      fixedMinor: args.fixedMinor,
      now,
    });
  },
});

/** Locks the bill — invariant, snapshot, obligations in one transaction (Story 5.9). */
export const lockBill = mutation({
  args: {
    tabId: v.id("tabs"),
    clientRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireBillOrganizer(ctx, args.tabId);
    const now = Date.now();
    return lockBillCore(ctx, {
        tabId: args.tabId,
        organizerUserId: user._id,
        clientRevision: args.clientRevision,
        now,
    });
  },
});

/** Reopens a locked bill when safe (Story 5.10). */
export const reopenBill = mutation({
  args: {
    tabId: v.id("tabs"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireBillOrganizer(ctx, args.tabId);
    const now = Date.now();
    return reopenBillCore(ctx, {
      tabId: args.tabId,
      organizerUserId: user._id,
      now,
    });
  },
});

/** Claim board payload for live subscriptions (Stories 5.4–5.8). */
export const getClaimBoard = query({
  args: {
    tabId: v.id("tabs"),
  },
  handler: async (ctx, args) => buildClaimBoardView(ctx, args.tabId),
});

/** Read-only bill review for all participants (Story 5.8). */
export const getBillReview = query({
  args: {
    tabId: v.id("tabs"),
  },
  handler: async (ctx, args) => {
    const board = await buildClaimBoardView(ctx, args.tabId);
    const reconciles =
      board.totals.billTotalMinor ===
      board.breakdowns.reduce((sum, row) => sum + row.totalMinor, 0);

    return {
      ...board,
      viewerIsOrganizer: board.isOrganizer,
      reconciles,
      organizerDisplayName:
        organizerDisplayName(board.participants, board.tab.organizerTelegramUserId) ??
        "Organizer",
    };
  },
});
