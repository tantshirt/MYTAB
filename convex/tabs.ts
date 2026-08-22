import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { CANONICAL_ADJUSTMENT_ORDER } from "../lib/domain/bill";
import { computeBillBreakdown } from "../lib/domain/bill";
import { fiatMinorFromInteger } from "../lib/domain/money";
import { formatFiatMinorThb } from "../lib/domain/format";
import { getCurrentUser, requireGroupMember } from "./lib/auth";
import { resolveFxSnapshotIdForTab, usdcAtomicFromSnapshot } from "./lib/fxSnapshotSync";
import {
  assertDistinctPayerRecipient,
  assertRecipientWalletReady,
  listTabAdjustments,
  listTabItems,
  recomputeTabTotals,
  toBillAdjustmentInputs,
} from "./lib/tabBillSync";
import { assertTabUnlocked, requireBillOrganizer } from "./lib/tabAuth";
import { getDefaultReceivingWalletForUser } from "./lib/walletSync";

const adjustmentKindValidator = v.union(
  v.literal("service"),
  v.literal("tax"),
  v.literal("discount"),
  v.literal("group_tip"),
);

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

/** Live authoring payload — items, adjustments, totals (Epic 4). */
export const getTabAuthoring = query({
  args: {
    tabId: v.id("tabs"),
  },
  handler: async (ctx, args) => {
    const tab = await ctx.db.get(args.tabId);
    if (!tab) {
      return null;
    }

    await requireGroupMember(ctx, tab.groupId);
    const viewer = await getCurrentUser(ctx);

    const items = await ctx.db
      .query("items")
      .withIndex("by_tab_and_sort", (q) => q.eq("tabId", args.tabId))
      .collect();

    const adjustments = await ctx.db
      .query("adjustments")
      .withIndex("by_tab_id", (q) => q.eq("tabId", args.tabId))
      .collect();

    const sortedItems = items.sort((a, b) => a.sortOrder - b.sortOrder);
    const sortedAdjustments = adjustments.sort((a, b) => a.position - b.position);

    let breakdown = null as ReturnType<typeof computeBillBreakdown> | null;
    if (sortedItems.length > 0) {
      try {
        breakdown = computeBillBreakdown(
          sortedItems.map((item) => ({
            lineTotalMinor: fiatMinorFromInteger(item.lineTotalMinor),
          })),
          toBillAdjustmentInputs(sortedAdjustments),
        );
      } catch {
        breakdown = null;
      }
    }

    const organizerMember = await ctx.db
      .query("groupMembers")
      .withIndex("by_group_and_telegram_user_id", (q) =>
        q.eq("groupId", tab.groupId).eq("telegramUserId", tab.organizerTelegramUserId),
      )
      .unique();

    const fxSnapshot = tab.fxSnapshotId ? await ctx.db.get(tab.fxSnapshotId) : null;

    return {
      tab,
      items: sortedItems,
      adjustments: sortedAdjustments,
      breakdown,
      organizerDisplayName: organizerMember?.displayName ?? "Organizer",
      viewerUserId: viewer?._id ?? null,
      isOrganizer: viewer?.telegramUserId === tab.organizerTelegramUserId,
      fxSnapshot,
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

/** Members eligible as payer or recipient on a new tab (Story 4.1 AC3). */
export const listTabMemberOptions = query({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    await requireGroupMember(ctx, args.groupId);

    const members = await ctx.db
      .query("groupMembers")
      .withIndex("by_group_id", (q) => q.eq("groupId", args.groupId))
      .collect();

    const active = members.filter((member) => member.membershipStatus === "active");
    const results = [];

    for (const member of active) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_telegram_user_id", (q) => q.eq("telegramUserId", member.telegramUserId))
        .unique();
      if (!user) {
        continue;
      }
      const wallet = await getDefaultReceivingWalletForUser(ctx, user._id);
      results.push({
        userId: user._id,
        displayName: member.displayName,
        telegramUserId: member.telegramUserId,
        walletReady: wallet !== null,
      });
    }

    return results;
  },
});

/** Creates or updates tab setup — title, merchant, currency, payer, recipient, FX (Story 4.1). */
export const saveTabSetup = mutation({
  args: {
    tabId: v.id("tabs"),
    title: v.string(),
    merchantName: v.optional(v.string()),
    displayCurrency: v.string(),
    recipientAsset: v.string(),
    payerUserId: v.id("users"),
    recipientUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { tab } = await requireBillOrganizer(ctx, args.tabId);
    assertTabUnlocked(tab);

    assertDistinctPayerRecipient(args.payerUserId, args.recipientUserId);
    await assertRecipientWalletReady(ctx, args.recipientUserId);

    const title = args.title.trim();
    if (title.length < 1 || title.length > 120) {
      throw new Error("INVALID_TITLE");
    }

    // A tab keeps the snapshot it was created with; it is never swapped for a
    // newer rate mid-authoring, and locking freezes it permanently.
    let fxSnapshotId = tab.fxSnapshotId;
    if (!fxSnapshotId && args.displayCurrency === "THB") {
      fxSnapshotId = await resolveFxSnapshotIdForTab(ctx, now);
    }

    await ctx.db.patch(args.tabId, {
      name: title,
      merchantName: args.merchantName?.trim() || undefined,
      defaultCurrency: args.displayCurrency,
      recipientAsset: args.recipientAsset,
      payerUserId: args.payerUserId,
      recipientUserId: args.recipientUserId,
      fxSnapshotId,
      adjustmentOrderPolicy: [...CANONICAL_ADJUSTMENT_ORDER],
      revision: (tab.revision ?? 0) + 1,
      updatedAt: now,
    });

    const breakdown = await recomputeTabTotals(ctx, args.tabId);
    const fxSnapshot = fxSnapshotId ? await ctx.db.get(fxSnapshotId) : null;

    return {
      tabId: args.tabId,
      fxSnapshotId,
      revision: (tab.revision ?? 0) + 1,
      breakdown: breakdown
        ? {
            totalMinor: breakdown.totalMinor,
            totalDisplay: formatFiatMinorThb(breakdown.totalMinor),
            usdcAtomic:
              fxSnapshot && args.displayCurrency === "THB"
                ? usdcAtomicFromSnapshot(fxSnapshot, breakdown.totalMinor).toString()
                : null,
          }
        : null,
    };
  },
});

/** Marks setup complete and moves to item entry (Story 4.1 AC5). */
export const beginItemEntry = mutation({
  args: {
    tabId: v.id("tabs"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { tab } = await requireBillOrganizer(ctx, args.tabId);
    assertTabUnlocked(tab);

    if (!tab.payerUserId || !tab.recipientUserId || !tab.fxSnapshotId) {
      throw new Error("TAB_SETUP_INCOMPLETE");
    }

    await ctx.db.patch(args.tabId, {
      status: tab.status === "draft" ? "open" : tab.status,
      updatedAt: now,
    });

    return { tabId: args.tabId, status: "open" as const };
  },
});
