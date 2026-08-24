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
  INVALID_TARGET: "INVALID_TARGET",
  CLAIM_NOT_FOUND: "CLAIM_NOT_FOUND",
  NO_REMAINING_QUANTITY: "NO_REMAINING_QUANTITY",
  NO_REMAINING_WEIGHT: "NO_REMAINING_WEIGHT",
  INVALID_WEIGHT_OVERRIDE: "INVALID_WEIGHT_OVERRIDE",
} as const;

export type OrganizerResolutionOperation =
  | "assign_remaining"
  | "share_with_everyone"
  | "remove_claimant"
  | "reassign_claimant"
  | "organizer_covers_remainder";

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

/**
 * Fair organizer resolution. Existing claims are never erased by an
 * assign-remaining action; destructive replacement only happens for the
 * explicit "share with everyone" choice visible in the sheet.
 */
export async function organizerResolveItemCore(
  ctx: MutationCtx,
  args: {
    tabId: Id<"tabs">;
    itemId: Id<"items">;
    organizerUserId: Id<"users">;
    participantUserIds: Id<"users">[];
    operation: OrganizerResolutionOperation;
    targetUserIds?: Id<"users">[];
    sourceUserId?: Id<"users">;
    targetUserId?: Id<"users">;
    clientRevision: number;
    now: number;
  },
): Promise<{ revision: number }> {
  const tab = await ctx.db.get(args.tabId);
  if (!tab) throw new Error(CLAIM_FAILURE.ITEM_NOT_FOUND);
  assertTabUnlocked(tab);
  checkClientRevision(args.clientRevision, tabRevision(tab));

  const item = await ctx.db.get(args.itemId);
  if (!item || item.tabId !== args.tabId) throw new Error(CLAIM_FAILURE.ITEM_NOT_FOUND);

  const participantSet = new Set(args.participantUserIds);
  const assertParticipant = (userId: Id<"users"> | undefined): Id<"users"> => {
    if (!userId || !participantSet.has(userId)) throw new Error(CLAIM_FAILURE.INVALID_TARGET);
    return userId;
  };
  assertParticipant(args.organizerUserId);

  let existing = await ctx.db
    .query("allocations")
    .withIndex("by_item_id", (q) => q.eq("itemId", args.itemId))
    .collect();
  const mode = resolveItemAllocationMode(item.allocationMode, item.quantity);

  const insertClaim = async (
    userId: Id<"users">,
    quantity?: number,
    claimMode: AllocationMode = mode,
  ) => {
    await ctx.db.insert("allocations", {
      tabId: args.tabId,
      itemId: args.itemId,
      userId,
      revision: tabRevision(tab),
      mode: claimMode,
      quantity,
      amountMinor: 0n,
      roundingMinor: 0n,
      createdAt: args.now,
      updatedAt: args.now,
    });
  };

  const assignRemaining = async (rawTargets: Id<"users">[]) => {
    const targets = [...new Set(rawTargets.map(assertParticipant))];
    if (targets.length === 0) throw new Error(CLAIM_FAILURE.INVALID_TARGET);
    if (mode === "fixed" || mode === "percentage") {
      const totalWeight = existing.reduce(
        (sum, claim) => sum + (
          mode === "fixed" ? Number(claim.fixedMinor ?? 0n) : (claim.percentageBps ?? 0)
        ),
        0,
      );
      const targetWeight = mode === "fixed" ? item.lineTotalMinor : 10_000;
      const remainingWeight = targetWeight - totalWeight;
      if (!Number.isSafeInteger(totalWeight) || remainingWeight <= 0) {
        throw new Error(CLAIM_FAILURE.NO_REMAINING_WEIGHT);
      }
      const base = Math.floor(remainingWeight / targets.length);
      let extra = remainingWeight % targets.length;
      for (const userId of targets) {
        const addWeight = base + (extra > 0 ? 1 : 0);
        if (extra > 0) extra -= 1;
        if (addWeight <= 0) continue;
        const claim = existing.find((row) => row.userId === userId);
        if (claim) {
          await ctx.db.patch(
            claim._id,
            mode === "fixed"
              ? { mode, fixedMinor: (claim.fixedMinor ?? 0n) + BigInt(addWeight), updatedAt: args.now }
              : { mode, percentageBps: (claim.percentageBps ?? 0) + addWeight, updatedAt: args.now },
          );
        } else {
          await ctx.db.insert("allocations", {
            tabId: args.tabId,
            itemId: args.itemId,
            userId,
            revision: tabRevision(tab),
            mode,
            fixedMinor: mode === "fixed" ? BigInt(addWeight) : undefined,
            percentageBps: mode === "percentage" ? addWeight : undefined,
            amountMinor: 0n,
            roundingMinor: 0n,
            createdAt: args.now,
            updatedAt: args.now,
          });
        }
      }
      return;
    }
    if (mode !== "quantity") {
      const claimed = new Set(existing.map((claim) => claim.userId));
      for (const userId of targets) {
        if (!claimed.has(userId)) await insertClaim(userId);
      }
      if (existing.length + targets.filter((id) => !claimed.has(id)).length > 1) {
        await ctx.db.patch(item._id, { allocationMode: "equal", updatedAt: args.now });
      }
      return;
    }

    const remaining = item.quantity - claimedQuantitySum(existing);
    if (remaining <= 0) throw new Error(CLAIM_FAILURE.NO_REMAINING_QUANTITY);
    const base = Math.floor(remaining / targets.length);
    let extra = remaining % targets.length;
    for (const userId of targets) {
      const quantity = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra -= 1;
      if (quantity === 0) continue;
      const claim = existing.find((row) => row.userId === userId);
      if (claim) {
        await ctx.db.patch(claim._id, {
          mode: "quantity",
          quantity: (claim.quantity ?? 0) + quantity,
          updatedAt: args.now,
        });
      } else {
        await insertClaim(userId, quantity);
      }
    }
  };

  if (args.operation === "assign_remaining") {
    await assignRemaining(args.targetUserIds ?? []);
  } else if (args.operation === "organizer_covers_remainder") {
    await assignRemaining([args.organizerUserId]);
  } else if (args.operation === "share_with_everyone") {
    for (const claim of existing) await ctx.db.delete(claim._id);
    await ctx.db.patch(item._id, { allocationMode: "equal", updatedAt: args.now });
    for (const userId of new Set(args.participantUserIds)) {
      await insertClaim(userId, undefined, "equal");
    }
  } else if (args.operation === "remove_claimant") {
    const source = assertParticipant(args.sourceUserId);
    const claim = existing.find((row) => row.userId === source);
    if (!claim) throw new Error(CLAIM_FAILURE.CLAIM_NOT_FOUND);
    await ctx.db.delete(claim._id);
  } else if (args.operation === "reassign_claimant") {
    const source = assertParticipant(args.sourceUserId);
    const target = assertParticipant(args.targetUserId);
    if (source === target) throw new Error(CLAIM_FAILURE.INVALID_TARGET);
    const sourceClaim = existing.find((row) => row.userId === source);
    if (!sourceClaim) throw new Error(CLAIM_FAILURE.CLAIM_NOT_FOUND);
    const targetClaim = existing.find((row) => row.userId === target);
    if (targetClaim) {
      if (mode === "quantity") {
        await ctx.db.patch(targetClaim._id, {
          quantity: (targetClaim.quantity ?? 0) + (sourceClaim.quantity ?? 0),
          updatedAt: args.now,
        });
      } else if (mode === "fixed") {
        if (sourceClaim.fixedMinor === undefined || targetClaim.fixedMinor === undefined) {
          throw new Error(CLAIM_FAILURE.INVALID_WEIGHT_OVERRIDE);
        }
        await ctx.db.patch(targetClaim._id, {
          fixedMinor: targetClaim.fixedMinor + sourceClaim.fixedMinor,
          updatedAt: args.now,
        });
      } else if (mode === "percentage") {
        if (sourceClaim.percentageBps === undefined || targetClaim.percentageBps === undefined) {
          throw new Error(CLAIM_FAILURE.INVALID_WEIGHT_OVERRIDE);
        }
        await ctx.db.patch(targetClaim._id, {
          percentageBps: targetClaim.percentageBps + sourceClaim.percentageBps,
          updatedAt: args.now,
        });
      }
      await ctx.db.delete(sourceClaim._id);
    } else {
      await ctx.db.patch(sourceClaim._id, { userId: target, updatedAt: args.now });
    }
  }

  const newRevision = bumpRevision(tabRevision(tab));
  await ctx.db.patch(args.tabId, { revision: newRevision, updatedAt: args.now });
  const refreshedItem = (await ctx.db.get(args.itemId))!;
  await recomputeItemShares(ctx, refreshedItem, newRevision, args.now);
  await recomputeTab(ctx, args.tabId, newRevision, args.now);
  return { revision: newRevision };
}

/** Organizer assigns only the unclaimed remainder to one participant. */
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
  return organizerResolveItemCore(ctx, {
    ...args,
    organizerUserId: args.targetUserId,
    participantUserIds: [args.targetUserId],
    operation: "assign_remaining",
    targetUserIds: [args.targetUserId],
  });
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
