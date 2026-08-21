import type { GenericQueryCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import {
  computeTabBreakdowns,
  countUnassignedItems,
  loadItemClaimRows,
} from "./allocationSync";
import { isOrganizer, requireTabParticipant, tabRevision } from "./tabAuth";

type QueryCtx = GenericQueryCtx<DataModel>;

export async function buildClaimBoardView(ctx: QueryCtx, tabId: Id<"tabs">) {
  const { tab, user } = await requireTabParticipant(ctx, tabId);

  const items = await ctx.db
    .query("items")
    .withIndex("by_tab_and_sort", (q) => q.eq("tabId", tabId))
    .collect();
  items.sort((a, b) => a.sortOrder - b.sortOrder);

  const participants = await ctx.db
    .query("tabParticipants")
    .withIndex("by_tab_id", (q) => q.eq("tabId", tabId))
    .collect();

  const participantUsers = await Promise.all(
    participants.map(async (participant) => {
      const profile = await ctx.db.get(participant.userId);
      return {
        userId: participant.userId,
        telegramUserId: participant.telegramUserId,
        displayName: profile?.displayName ?? "Guest",
        avatarUrl: profile?.avatarUrl,
      };
    }),
  );

  const adjustments = await ctx.db
    .query("adjustments")
    .withIndex("by_tab_id", (q) => q.eq("tabId", tabId))
    .collect();

  const itemRows = await loadItemClaimRows(ctx, tabId, items);
  const unassignedCount = countUnassignedItems(itemRows);
  const { breakdowns, totals } = computeTabBreakdowns(itemRows, adjustments);
  const viewerBreakdown = breakdowns.find((row) => row.participantId === user._id);
  const viewerHasClaims = itemRows.some((row) =>
    row.claims.some((claim) => claim.participantId === user._id),
  );

  const itemViews = await Promise.all(
    items.map(async (item) => {
      const claims = await ctx.db
        .query("allocations")
        .withIndex("by_item_id", (q) => q.eq("itemId", item._id))
        .collect();
      const claimantIds = claims.map((claim) => claim.userId);
      return {
        _id: item._id,
        name: item.name,
        lineTotalMinor: item.lineTotalMinor,
        allocationMode: item.allocationMode ?? "equal",
        claimantIds,
        claimantCount: claimantIds.length,
        viewerOwns: claimantIds.includes(user._id),
        unassigned: claimantIds.length === 0,
      };
    }),
  );

  return {
    tab: {
      _id: tab._id,
      name: tab.name,
      status: tab.status,
      revision: tabRevision(tab),
      lockedAt: tab.lockedAt ?? null,
      organizerTelegramUserId: tab.organizerTelegramUserId,
    },
    viewerUserId: user._id,
    isOrganizer: isOrganizer(tab, user),
    participants: participantUsers,
    items: itemViews,
    unassignedCount,
    totals,
    viewerSubtotalMinor: viewerBreakdown?.totalMinor ?? 0,
    viewerHasClaims,
    breakdowns,
    isLocked: tab.status === "locked" || tab.status === "settled",
  };
}

export function organizerDisplayName(
  participants: Array<{ telegramUserId: string; displayName: string }>,
  telegramUserId: string,
): string | undefined {
  return participants.find((participant) => participant.telegramUserId === telegramUserId)
    ?.displayName;
}

export type ClaimBoardView = Awaited<ReturnType<typeof buildClaimBoardView>>;
