import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireGroupMember } from "./lib/auth";

/** Returns open tabs for a group (Story 2.7 AC3). */
export const listOpenTabsForGroup = query({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    await requireGroupMember(ctx, args.groupId);

    const tabs = await ctx.db
      .query("tabs")
      .withIndex("by_group_id", (q) => q.eq("groupId", args.groupId))
      .collect();

    return tabs
      .filter((tab) => tab.status === "draft" || tab.status === "open")
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((tab) => ({
        _id: tab._id,
        name: tab.name,
        status: tab.status,
        updatedAt: tab.updatedAt,
        createdAt: tab.createdAt,
      }));
  },
});

/** Returns a tab by id for authorized participants. */
export const getTab = query({
  args: {
    tabId: v.id("tabs"),
  },
  handler: async (ctx, args) => {
    const tab = await ctx.db.get(args.tabId);
    if (!tab) {
      return null;
    }

    await requireGroupMember(ctx, tab.groupId);

    const participants = await ctx.db
      .query("tabParticipants")
      .withIndex("by_tab_id", (q) => q.eq("tabId", args.tabId))
      .collect();

    return {
      ...tab,
      participantCount: participants.length,
    };
  },
});

/** Group defaults for the Group surface (Story 2.7 AC1). */
export const getGroupDefaults = query({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    await requireGroupMember(ctx, args.groupId);

    const tabs = await ctx.db
      .query("tabs")
      .withIndex("by_group_id", (q) => q.eq("groupId", args.groupId))
      .collect();

    const sorted = tabs.sort((a, b) => b.createdAt - a.createdAt);
    const latest = sorted[0];
    return {
      defaultCurrency: latest?.defaultCurrency ?? "THB",
      recipientAsset: latest?.recipientAsset ?? "USDC",
    };
  },
});
