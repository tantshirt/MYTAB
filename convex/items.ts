import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { allocationModeForItemQuantity } from "../lib/domain/quantityClaim";
import { fiatMinorFromInteger } from "../lib/domain/money";
import {
  bumpTabRevision,
  nextItemSortOrder,
  validateItemInput,
} from "./lib/tabBillSync";
import { assertTabUnlocked, requireBillOrganizer } from "./lib/tabAuth";

/** Lists items for a tab in display order (Story 4.2). */
export const listItemsForTab = query({
  args: {
    tabId: v.id("tabs"),
  },
  handler: async (ctx, args) => {
    const tab = await ctx.db.get(args.tabId);
    if (!tab) {
      return [];
    }

    const items = await ctx.db
      .query("items")
      .withIndex("by_tab_and_sort", (q) => q.eq("tabId", args.tabId))
      .collect();

    return items.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/** Adds a manual item while the tab is unlocked (Story 4.2 AC1, AC6). */
export const addItem = mutation({
  args: {
    tabId: v.id("tabs"),
    name: v.string(),
    quantity: v.number(),
    unitPriceMinor: v.number(),
    source: v.optional(v.union(v.literal("manual"), v.literal("receipt"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { tab } = await requireBillOrganizer(ctx, args.tabId);
    assertTabUnlocked(tab);

    const validated = validateItemInput({
      name: args.name,
      quantity: args.quantity,
      unitPriceMinor: fiatMinorFromInteger(args.unitPriceMinor),
    });

    const sortOrder = await nextItemSortOrder(ctx, args.tabId);
    const itemId = await ctx.db.insert("items", {
      tabId: args.tabId,
      name: validated.name,
      quantity: validated.quantity,
      unitPriceMinor: validated.unitPriceMinor,
      lineTotalMinor: validated.lineTotalMinor,
      allocationMode: allocationModeForItemQuantity(validated.quantity),
      sortOrder,
      source: args.source ?? "manual",
      createdAt: now,
      updatedAt: now,
    });

    await bumpTabRevision(ctx, args.tabId, tab, now);
    return { itemId };
  },
});

/** Updates an item while the tab is unlocked (Story 4.2 AC2, AC3). */
export const updateItem = mutation({
  args: {
    itemId: v.id("items"),
    name: v.string(),
    quantity: v.number(),
    unitPriceMinor: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("ITEM_NOT_FOUND");
    }

    const { tab } = await requireBillOrganizer(ctx, item.tabId);
    assertTabUnlocked(tab);

    const validated = validateItemInput({
      name: args.name,
      quantity: args.quantity,
      unitPriceMinor: fiatMinorFromInteger(args.unitPriceMinor),
    });

    await ctx.db.patch(args.itemId, {
      name: validated.name,
      quantity: validated.quantity,
      unitPriceMinor: validated.unitPriceMinor,
      lineTotalMinor: validated.lineTotalMinor,
      allocationMode: allocationModeForItemQuantity(validated.quantity),
      updatedAt: now,
    });

    await bumpTabRevision(ctx, item.tabId, tab, now);
    return { itemId: args.itemId };
  },
});

/** Duplicates an item without allocations (Story 4.2 AC2). */
export const duplicateItem = mutation({
  args: {
    itemId: v.id("items"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("ITEM_NOT_FOUND");
    }

    const { tab } = await requireBillOrganizer(ctx, item.tabId);
    assertTabUnlocked(tab);

    const sortOrder = await nextItemSortOrder(ctx, item.tabId);
    const duplicateId = await ctx.db.insert("items", {
      tabId: item.tabId,
      name: item.name,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      lineTotalMinor: item.lineTotalMinor,
      allocationMode: item.allocationMode ?? allocationModeForItemQuantity(item.quantity),
      sortOrder,
      source: item.source,
      createdAt: now,
      updatedAt: now,
    });

    await bumpTabRevision(ctx, item.tabId, tab, now);
    return { itemId: duplicateId };
  },
});

/** Removes an item while the tab is unlocked (Story 4.2 AC2, AC3). */
export const removeItem = mutation({
  args: {
    itemId: v.id("items"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("ITEM_NOT_FOUND");
    }

    const { tab } = await requireBillOrganizer(ctx, item.tabId);
    assertTabUnlocked(tab);

    await ctx.db.delete(args.itemId);
    await bumpTabRevision(ctx, item.tabId, tab, now);
    return { itemId: args.itemId };
  },
});
