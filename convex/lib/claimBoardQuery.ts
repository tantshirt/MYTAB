import type { GenericQueryCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import {
  claimedQuantitySum,
  claimUnitCount,
  quantityShortfall,
  resolveItemAllocationMode,
} from "../../lib/domain/quantityClaim";
import {
  computeTabBreakdowns,
  countUnassignedItems,
  itemMonetaryShortfallMinor,
  loadItemClaimRows,
} from "./allocationSync";
import { isOrganizer, requireTabParticipant, tabRevision } from "./tabAuth";
import { seatsRemaining, tabOrigin } from "./tabOrigin";

type QueryCtx = GenericQueryCtx<DataModel>;

export type ClaimItemProjection = {
  _id: string;
  name: string;
  lineTotalMinor: number;
  quantity: number;
  allocationMode: ReturnType<typeof resolveItemAllocationMode>;
  claimantIds: string[];
  claimantQuantities: Array<{ userId: string; quantity: number }>;
  claimantCount: number;
  claimedCount: number;
  shortfall: number;
  monetaryShortfallMinor: number;
  viewerOwns: boolean;
  viewerClaimedQuantity: number;
  unassigned: boolean;
};

/** Projects one item for the claim board — quantity, claimed counts, shortfall (D-29). */
export function projectClaimItemView(args: {
  itemId: string;
  name: string;
  lineTotalMinor: number;
  quantity: number;
  allocationMode?: string;
  claims: ReadonlyArray<{ userId: string; quantity?: number }>;
  viewerUserId: string;
}): ClaimItemProjection {
  const allocationMode = resolveItemAllocationMode(args.allocationMode, args.quantity);
  const claimantIds = args.claims.map((claim) => claim.userId);
  const claimedCount =
    allocationMode === "quantity" ? claimedQuantitySum(args.claims) : claimantIds.length;
  const shortfall =
    allocationMode === "quantity"
      ? quantityShortfall(args.quantity, claimedCount)
      : claimantIds.length === 0
        ? 1
        : 0;
  const own = args.claims.find((claim) => claim.userId === args.viewerUserId);
  return {
    _id: args.itemId,
    name: args.name,
    lineTotalMinor: args.lineTotalMinor,
    quantity: args.quantity,
    allocationMode,
    claimantIds,
    claimantQuantities: args.claims.map((claim) => ({
      userId: claim.userId,
      quantity: claimUnitCount(claim),
    })),
    claimantCount: claimantIds.length,
    claimedCount,
    shortfall,
    monetaryShortfallMinor:
      allocationMode === "quantity"
        ? Number(
            (BigInt(args.lineTotalMinor) * BigInt(shortfall) + BigInt(args.quantity) - 1n) /
              BigInt(args.quantity),
          )
        : shortfall > 0
          ? args.lineTotalMinor
          : 0,
    viewerOwns: Boolean(own),
    viewerClaimedQuantity: own ? claimUnitCount(own) : 0,
    unassigned: shortfall > 0,
  };
}

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
      const projected = projectClaimItemView({
        itemId: item._id,
        name: item.name,
        lineTotalMinor: item.lineTotalMinor,
        quantity: item.quantity,
        allocationMode: item.allocationMode,
        claims: claims.map((claim) => ({
          userId: claim.userId,
          quantity: claim.quantity ?? undefined,
        })),
        viewerUserId: user._id,
      });
      const itemRow = itemRows.find((row) => row.itemId === item._id);
      return {
        ...projected,
        monetaryShortfallMinor: itemRow
          ? itemMonetaryShortfallMinor(itemRow)
          : item.lineTotalMinor,
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
      displayCurrency: tab.defaultCurrency ?? "THB",
      displayCurrencyMinorDigits: tab.defaultCurrencyMinorDigits ?? 2,
      origin: tabOrigin(tab),
      seatsRemaining: seatsRemaining(tab, participants.length),
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
