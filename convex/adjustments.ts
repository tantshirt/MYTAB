import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { CANONICAL_ADJUSTMENT_ORDER, DEFAULT_PERCENTAGE_BASE } from "../lib/domain/bill";
import { assertPercentageBps } from "../lib/domain/bounds";
import { fiatMinorFromInteger } from "../lib/domain/money";
import { bumpTabRevision, recomputeTabTotals } from "./lib/tabBillSync";
import { assertTabUnlocked, requireBillOrganizer } from "./lib/tabAuth";

const adjustmentKindValidator = v.union(
  v.literal("service"),
  v.literal("tax"),
  v.literal("discount"),
  v.literal("group_tip"),
);

const percentageBaseValidator = v.optional(
  v.union(
    v.literal("item_subtotal"),
    v.literal("after_service_charge"),
    v.literal("after_tax"),
    v.literal("pre_discount_total"),
    v.literal("after_discount"),
  ),
);

function positionForKind(kind: (typeof CANONICAL_ADJUSTMENT_ORDER)[number]): number {
  return CANONICAL_ADJUSTMENT_ORDER.indexOf(kind);
}

/** Lists adjustments for a tab (Story 4.3). */
export const listAdjustmentsForTab = query({
  args: {
    tabId: v.id("tabs"),
  },
  handler: async (ctx, args) => {
    const adjustments = await ctx.db
      .query("adjustments")
      .withIndex("by_tab_id", (q) => q.eq("tabId", args.tabId))
      .collect();
    return adjustments.sort((a, b) => a.position - b.position);
  },
});

/** Upserts one adjustment kind with fixed or percentage value (Story 4.3 AC1). */
export const upsertAdjustment = mutation({
  args: {
    tabId: v.id("tabs"),
    kind: adjustmentKindValidator,
    calculation: v.union(v.literal("fixed"), v.literal("percentage")),
    valueMinorOrBps: v.number(),
    percentageBase: percentageBaseValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { tab } = await requireBillOrganizer(ctx, args.tabId);
    assertTabUnlocked(tab);

    if (args.calculation === "percentage") {
      assertPercentageBps(args.valueMinorOrBps);
    } else {
      fiatMinorFromInteger(args.valueMinorOrBps);
    }

    const existing = await ctx.db
      .query("adjustments")
      .withIndex("by_tab_id", (q) => q.eq("tabId", args.tabId))
      .collect();

    const match = existing.find((row) => row.kind === args.kind);
    const percentageBase = args.percentageBase ?? DEFAULT_PERCENTAGE_BASE[args.kind];
    const position = positionForKind(args.kind);

    if (match) {
      await ctx.db.patch(match._id, {
        calculation: args.calculation,
        valueMinorOrBps: args.valueMinorOrBps,
        percentageBase,
        position,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("adjustments", {
        tabId: args.tabId,
        kind: args.kind,
        calculation: args.calculation,
        valueMinorOrBps: args.valueMinorOrBps,
        percentageBase,
        position,
        createdAt: now,
        updatedAt: now,
      });
    }

    await recomputeTabTotals(ctx, args.tabId);
    await bumpTabRevision(ctx, args.tabId, tab, now);

    return { tabId: args.tabId, kind: args.kind };
  },
});

/** Removes an adjustment while unlocked (Story 4.3). */
export const removeAdjustment = mutation({
  args: {
    tabId: v.id("tabs"),
    kind: adjustmentKindValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { tab } = await requireBillOrganizer(ctx, args.tabId);
    assertTabUnlocked(tab);

    const existing = await ctx.db
      .query("adjustments")
      .withIndex("by_tab_id", (q) => q.eq("tabId", args.tabId))
      .collect();

    const match = existing.find((row) => row.kind === args.kind);
    if (match) {
      await ctx.db.delete(match._id);
    }

    await bumpTabRevision(ctx, args.tabId, tab, now);
    return { tabId: args.tabId, kind: args.kind };
  },
});
