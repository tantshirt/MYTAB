import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { AllocationMode } from "../../lib/domain/allocation";
import { DomainError, DomainErrorCode } from "../../lib/domain/errors";
import { fiatMinorFromInteger } from "../../lib/domain/money";
import {
  assertQuantityClaimWrite,
  claimedQuantitySum,
  resolveItemAllocationMode,
} from "../../lib/domain/quantityClaim";
import {
  loadItemClaimRows,
  persistComputedAllocations,
  sharesForItemRow,
} from "./allocationSync";
import { bumpRevision, checkClientRevision } from "./revisionSync";
import { assertTabUnlocked, tabRevision } from "./tabAuth";

export const CLAIM_FAILURE = {
  CANNOT_RELEASE_OTHERS: "CANNOT_RELEASE_OTHERS",
  ITEM_NOT_FOUND: "ITEM_NOT_FOUND",
  INVALID_MODE: "INVALID_MODE",
  QUANTITY_EXCEEDS_ITEM: "QUANTITY_EXCEEDS_ITEM",
  INVALID_QUANTITY: "INVALID_QUANTITY",
} as const;

async function recomputeTab(
  ctx: MutationCtx,
  tabId: Id<"tabs">,
  revision: number,
  now: number,
) {
  const items = await ctx.db
    .query("items")
    .withIndex("by_tab_id", (q) => q.eq("tabId", tabId))
    .collect();
  const adjustments = await ctx.db
    .query("adjustments")
    .withIndex("by_tab_id", (q) => q.eq("tabId", tabId))
    .collect();
  const itemRows = await loadItemClaimRows(ctx, tabId, items);
  await persistComputedAllocations(ctx, {
    tabId,
    revision,
    itemRows,
    adjustments,
    now,
  });
}

async function recomputeItemShares(
  ctx: MutationCtx,
  item: Doc<"items">,
  revision: number,
  now: number,
) {
  const claims = await ctx.db
    .query("allocations")
    .withIndex("by_item_id", (q) => q.eq("itemId", item._id))
    .collect();

  const mode = resolveItemAllocationMode(item.allocationMode, item.quantity);
  const claimWeights = claims.map((claim) => ({
    participantId: claim.userId,
    weight: 1,
    quantity: claim.quantity ?? undefined,
    percentageBps: claim.percentageBps ?? undefined,
    fixedMinor:
      claim.fixedMinor !== undefined ? fiatMinorFromInteger(Number(claim.fixedMinor)) : undefined,
  }));

  const shares = sharesForItemRow({
    itemId: item._id,
    lineTotalMinor: fiatMinorFromInteger(item.lineTotalMinor),
    mode,
    itemQuantity: item.quantity,
    claims: claimWeights,
  });

  for (const claim of claims) {
    const share = shares.find((candidate) => candidate.participantId === claim.userId);
    await ctx.db.patch(claim._id, {
      revision,
      amountMinor: BigInt(share?.amountMinor ?? 0),
      roundingMinor: BigInt(share?.roundingMinor ?? 0),
      updatedAt: now,
    });
  }
}

function refuseQuantityWrite(error: unknown): never {
  if (error instanceof DomainError) {
    if (error.code === DomainErrorCode.OUT_OF_BOUNDS) {
      throw new Error(CLAIM_FAILURE.QUANTITY_EXCEEDS_ITEM);
    }
    if (
      error.code === DomainErrorCode.NON_INTEGER_NUMBER ||
      error.code === DomainErrorCode.NEGATIVE_NOT_ALLOWED
    ) {
      throw new Error(CLAIM_FAILURE.INVALID_QUANTITY);
    }
  }
  throw error;
}

function othersClaimedQuantity(
  claims: readonly { userId: string; quantity?: number }[],
  userId: string,
): number {
  return claimedQuantitySum(claims.filter((claim) => claim.userId !== userId));
}

/** Toggles the viewer's claim on an item (Story 5.4). */
export async function toggleOwnClaimCore(
  ctx: MutationCtx,
  args: {
    tabId: Id<"tabs">;
    itemId: Id<"items">;
    userId: Id<"users">;
    clientRevision: number;
    now: number;
  },
): Promise<{ revision: number; claimed: boolean }> {
  const tab = await ctx.db.get(args.tabId);
  if (!tab) {
    throw new Error(CLAIM_FAILURE.ITEM_NOT_FOUND);
  }
  assertTabUnlocked(tab);
  checkClientRevision(args.clientRevision, tabRevision(tab));

  const item = await ctx.db.get(args.itemId);
  if (!item || item.tabId !== args.tabId) {
    throw new Error(CLAIM_FAILURE.ITEM_NOT_FOUND);
  }

  const existing = await ctx.db
    .query("allocations")
    .withIndex("by_item_id", (q) => q.eq("itemId", args.itemId))
    .collect();

  const ownClaim = existing.find((claim) => claim.userId === args.userId);
  const mode = resolveItemAllocationMode(item.allocationMode, item.quantity);

  if (ownClaim) {
    await ctx.db.delete(ownClaim._id);
  } else {
    if (mode === "quantity") {
      try {
        assertQuantityClaimWrite({
          itemQuantity: item.quantity,
          nextQuantity: 1,
          othersClaimed: othersClaimedQuantity(existing, args.userId),
        });
      } catch (error) {
        refuseQuantityWrite(error);
      }
    }
    await ctx.db.insert("allocations", {
      tabId: args.tabId,
      itemId: args.itemId,
      userId: args.userId,
      revision: tabRevision(tab),
      mode,
      quantity: mode === "quantity" ? 1 : undefined,
      amountMinor: 0n,
      roundingMinor: 0n,
      createdAt: args.now,
      updatedAt: args.now,
    });
  }

  const newRevision = bumpRevision(tabRevision(tab));
  await ctx.db.patch(args.tabId, { revision: newRevision, updatedAt: args.now });

  await recomputeItemShares(ctx, item, newRevision, args.now);
  await recomputeTab(ctx, args.tabId, newRevision, args.now);

  return { revision: newRevision, claimed: !ownClaim };
}

/** Organizer assigns an item to a participant (Story 5.7 AC3). */
export async function organizerAssignItemCore(
  ctx: MutationCtx,
  args: {
    tabId: Id<"tabs">;
    itemId: Id<"items">;
    targetUserId: Id<"users">;
    clientRevision: number;
    now: number;
  },
): Promise<{ revision: number }> {
  const tab = await ctx.db.get(args.tabId);
  if (!tab) {
    throw new Error(CLAIM_FAILURE.ITEM_NOT_FOUND);
  }
  assertTabUnlocked(tab);
  checkClientRevision(args.clientRevision, tabRevision(tab));

  const item = await ctx.db.get(args.itemId);
  if (!item || item.tabId !== args.tabId) {
    throw new Error(CLAIM_FAILURE.ITEM_NOT_FOUND);
  }

  const existing = await ctx.db
    .query("allocations")
    .withIndex("by_item_id", (q) => q.eq("itemId", args.itemId))
    .collect();

  for (const claim of existing) {
    await ctx.db.delete(claim._id);
  }

  const mode = resolveItemAllocationMode(item.allocationMode, item.quantity);
  await ctx.db.insert("allocations", {
    tabId: args.tabId,
    itemId: args.itemId,
    userId: args.targetUserId,
    revision: tabRevision(tab),
    mode,
    quantity: mode === "quantity" ? item.quantity : undefined,
    amountMinor: BigInt(item.lineTotalMinor),
    roundingMinor: 0n,
    createdAt: args.now,
    updatedAt: args.now,
  });

  const newRevision = bumpRevision(tabRevision(tab));
  await ctx.db.patch(args.tabId, { revision: newRevision, updatedAt: args.now });
  await recomputeTab(ctx, args.tabId, newRevision, args.now);

  return { revision: newRevision };
}

/** Sets allocation mode and optional mode-specific inputs (Story 5.11). */
export async function setItemAllocationModeCore(
  ctx: MutationCtx,
  args: {
    tabId: Id<"tabs">;
    itemId: Id<"items">;
    userId: Id<"users">;
    clientRevision: number;
    mode: AllocationMode;
    quantity?: number;
    percentageBps?: number;
    fixedMinor?: number;
    now: number;
  },
): Promise<{ revision: number }> {
  const tab = await ctx.db.get(args.tabId);
  if (!tab) {
    throw new Error(CLAIM_FAILURE.ITEM_NOT_FOUND);
  }
  assertTabUnlocked(tab);
  checkClientRevision(args.clientRevision, tabRevision(tab));

  const item = await ctx.db.get(args.itemId);
  if (!item || item.tabId !== args.tabId) {
    throw new Error(CLAIM_FAILURE.ITEM_NOT_FOUND);
  }

  if (args.mode === "quantity" && args.quantity !== undefined) {
    const existing = await ctx.db
      .query("allocations")
      .withIndex("by_item_id", (q) => q.eq("itemId", args.itemId))
      .collect();
    try {
      assertQuantityClaimWrite({
        itemQuantity: item.quantity,
        nextQuantity: args.quantity,
        othersClaimed: othersClaimedQuantity(existing, args.userId),
      });
    } catch (error) {
      refuseQuantityWrite(error);
    }
  }

  await ctx.db.patch(args.itemId, {
    allocationMode: args.mode,
    updatedAt: args.now,
  });

  const existing = await ctx.db
    .query("allocations")
    .withIndex("by_item_id", (q) => q.eq("itemId", args.itemId))
    .collect();
  const ownClaim = existing.find((claim) => claim.userId === args.userId);

  if (ownClaim) {
    await ctx.db.patch(ownClaim._id, {
      mode: args.mode,
      quantity: args.quantity,
      percentageBps: args.percentageBps,
      fixedMinor: args.fixedMinor !== undefined ? BigInt(args.fixedMinor) : undefined,
      updatedAt: args.now,
    });
  }

  const newRevision = bumpRevision(tabRevision(tab));
  await ctx.db.patch(args.tabId, { revision: newRevision, updatedAt: args.now });

  const refreshedItem = (await ctx.db.get(args.itemId))!;
  await recomputeItemShares(ctx, refreshedItem, newRevision, args.now);
  await recomputeTab(ctx, args.tabId, newRevision, args.now);

  return { revision: newRevision };
}

/** Sets the viewer's integer claimed count on a quantity-mode item (D-23, D-29). */
export async function setOwnClaimQuantityCore(
  ctx: MutationCtx,
  args: {
    tabId: Id<"tabs">;
    itemId: Id<"items">;
    userId: Id<"users">;
    clientRevision: number;
    quantity: number;
    now: number;
  },
): Promise<{ revision: number; claimed: boolean; quantity: number }> {
  const tab = await ctx.db.get(args.tabId);
  if (!tab) {
    throw new Error(CLAIM_FAILURE.ITEM_NOT_FOUND);
  }
  assertTabUnlocked(tab);
  checkClientRevision(args.clientRevision, tabRevision(tab));

  const item = await ctx.db.get(args.itemId);
  if (!item || item.tabId !== args.tabId) {
    throw new Error(CLAIM_FAILURE.ITEM_NOT_FOUND);
  }

  const mode = resolveItemAllocationMode(item.allocationMode, item.quantity);
  if (mode !== "quantity") {
    throw new Error(CLAIM_FAILURE.INVALID_MODE);
  }

  const existing = await ctx.db
    .query("allocations")
    .withIndex("by_item_id", (q) => q.eq("itemId", args.itemId))
    .collect();
  const ownClaim = existing.find((claim) => claim.userId === args.userId);

  try {
    assertQuantityClaimWrite({
      itemQuantity: item.quantity,
      nextQuantity: args.quantity,
      othersClaimed: othersClaimedQuantity(existing, args.userId),
    });
  } catch (error) {
    refuseQuantityWrite(error);
  }

  if (item.allocationMode !== "quantity") {
    await ctx.db.patch(args.itemId, {
      allocationMode: "quantity",
      updatedAt: args.now,
    });
  }

  if (args.quantity === 0) {
    if (ownClaim) {
      await ctx.db.delete(ownClaim._id);
    }
  } else if (ownClaim) {
    await ctx.db.patch(ownClaim._id, {
      mode: "quantity",
      quantity: args.quantity,
      updatedAt: args.now,
    });
  } else {
    await ctx.db.insert("allocations", {
      tabId: args.tabId,
      itemId: args.itemId,
      userId: args.userId,
      revision: tabRevision(tab),
      mode: "quantity",
      quantity: args.quantity,
      amountMinor: 0n,
      roundingMinor: 0n,
      createdAt: args.now,
      updatedAt: args.now,
    });
  }

  const newRevision = bumpRevision(tabRevision(tab));
  await ctx.db.patch(args.tabId, { revision: newRevision, updatedAt: args.now });

  const refreshedItem = (await ctx.db.get(args.itemId))!;
  await recomputeItemShares(ctx, refreshedItem, newRevision, args.now);
  await recomputeTab(ctx, args.tabId, newRevision, args.now);

  return { revision: newRevision, claimed: args.quantity > 0, quantity: args.quantity };
}
