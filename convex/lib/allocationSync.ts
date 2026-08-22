import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  allocateAllAdjustments,
  allocateByMode,
  buildParticipantBreakdowns,
  computeBillTotalMinor,
  resolveAdjustmentAmountMinor,
  sumShareAmounts,
  type AdjustmentKind,
  type AllocationMode,
  type BillAdjustmentInput,
  type ClaimWeight,
  type PersistedShare,
} from "../../lib/domain/allocation";
import { fiatMinorFromInteger, type FiatMinor } from "../../lib/domain/money";

export type ItemClaimRow = {
  itemId: Id<"items">;
  lineTotalMinor: FiatMinor;
  mode: AllocationMode;
  claims: ClaimWeight[];
};

export type TabBillTotals = {
  itemSubtotalMinor: FiatMinor;
  serviceMinor: FiatMinor;
  taxMinor: FiatMinor;
  discountMinor: FiatMinor;
  groupTipMinor: FiatMinor;
  billTotalMinor: FiatMinor;
};

function toFiatMinor(value: number | bigint): FiatMinor {
  return fiatMinorFromInteger(Number(value));
}

function mapAdjustmentKind(
  kind: Doc<"adjustments">["kind"],
): AdjustmentKind {
  if (kind === "service") {
    return "service";
  }
  return kind;
}

function percentageBaseMinor(
  kind: Doc<"adjustments">["kind"],
  percentageBase: Doc<"adjustments">["percentageBase"],
  running: {
    itemSubtotalMinor: FiatMinor;
    afterServiceMinor: FiatMinor;
    afterTaxMinor: FiatMinor;
  },
): FiatMinor {
  if (percentageBase === "after_service_charge" || kind === "tax") {
    return running.afterServiceMinor;
  }
  if (percentageBase === "after_tax") {
    return running.afterTaxMinor;
  }
  return running.itemSubtotalMinor;
}

/** Resolves bill adjustments into domain inputs using canonical order. */
export function resolveTabAdjustments(
  adjustments: readonly Doc<"adjustments">[],
  itemSubtotalMinor: FiatMinor,
): { inputs: BillAdjustmentInput[]; totals: TabBillTotals } {
  const sorted = [...adjustments].sort((a, b) => a.position - b.position);

  let serviceMinor = fiatMinorFromInteger(0);
  let taxMinor = fiatMinorFromInteger(0);
  let discountMinor = fiatMinorFromInteger(0);
  let groupTipMinor = fiatMinorFromInteger(0);

  const inputs: BillAdjustmentInput[] = [];

  for (const adjustment of sorted) {
    const afterServiceMinor = itemSubtotalMinor + serviceMinor;
    const afterTaxMinor = afterServiceMinor + taxMinor;
    const baseMinor = percentageBaseMinor(adjustment.kind, adjustment.percentageBase, {
      itemSubtotalMinor,
      afterServiceMinor: toFiatMinor(afterServiceMinor),
      afterTaxMinor: toFiatMinor(afterTaxMinor),
    });

    const input: BillAdjustmentInput = {
      kind: mapAdjustmentKind(adjustment.kind),
      amountMinor:
        adjustment.calculation === "fixed"
          ? toFiatMinor(adjustment.valueMinorOrBps)
          : fiatMinorFromInteger(0),
      calculation: adjustment.calculation,
      percentageBaseMinor: baseMinor,
      percentageBps:
        adjustment.calculation === "percentage" ? adjustment.valueMinorOrBps : undefined,
    };

    const resolvedMinor = resolveAdjustmentAmountMinor(input);
    inputs.push({ ...input, amountMinor: resolvedMinor });

    if (adjustment.kind === "service") {
      serviceMinor = resolvedMinor;
    } else if (adjustment.kind === "tax") {
      taxMinor = resolvedMinor;
    } else if (adjustment.kind === "discount") {
      discountMinor = resolvedMinor;
    } else {
      groupTipMinor = resolvedMinor;
    }
  }

  const billTotalMinor = computeBillTotalMinor({
    itemSubtotalMinor,
    serviceMinor: toFiatMinor(serviceMinor),
    taxMinor: toFiatMinor(taxMinor),
    discountMinor: toFiatMinor(discountMinor),
    groupTipMinor: toFiatMinor(groupTipMinor),
  });

  return {
    inputs,
    totals: {
      itemSubtotalMinor,
      serviceMinor: toFiatMinor(serviceMinor),
      taxMinor: toFiatMinor(taxMinor),
      discountMinor: toFiatMinor(discountMinor),
      groupTipMinor: toFiatMinor(groupTipMinor),
      billTotalMinor,
    },
  };
}

/** Computes item shares from claim rows without persistence. */
export function computeItemShares(rows: readonly ItemClaimRow[]): PersistedShare[] {
  const combined = new Map<string, { amountMinor: FiatMinor; roundingMinor: FiatMinor }>();

  for (const row of rows) {
    const shares = allocateByMode(row.lineTotalMinor, row.mode, row.claims);
    for (const share of shares) {
      const existing = combined.get(share.participantId) ?? {
        amountMinor: fiatMinorFromInteger(0),
        roundingMinor: fiatMinorFromInteger(0),
      };
      combined.set(share.participantId, {
        amountMinor: (existing.amountMinor + share.amountMinor) as FiatMinor,
        roundingMinor: (existing.roundingMinor + share.roundingMinor) as FiatMinor,
      });
    }
  }

  return [...combined.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([participantId, values]) => ({
      participantId,
      amountMinor: values.amountMinor,
      roundingMinor: values.roundingMinor,
    }));
}

/** Counts items with no claimants. */
export function countUnassignedItems(rows: readonly ItemClaimRow[]): number {
  return rows.filter((row) => row.claims.length === 0).length;
}

/** Builds participant breakdowns for footer and bill review. */
export function computeTabBreakdowns(
  itemRows: readonly ItemClaimRow[],
  adjustments: readonly Doc<"adjustments">[],
) {
  const itemSubtotalMinor = itemRows.reduce(
    (sum, row) => (sum + row.lineTotalMinor) as FiatMinor,
    fiatMinorFromInteger(0),
  );
  const { inputs, totals } = resolveTabAdjustments(adjustments, itemSubtotalMinor);
  const itemShares = computeItemShares(itemRows);
  const adjustmentAllocations = allocateAllAdjustments(itemShares, inputs);
  const breakdowns = buildParticipantBreakdowns(itemShares, adjustmentAllocations);

  return {
    itemShares,
    adjustmentAllocations,
    breakdowns,
    totals,
    itemSharesTotalMinor: sumShareAmounts(itemShares),
  };
}

export async function loadItemClaimRows(
  ctx: QueryCtx | MutationCtx,
  tabId: Id<"tabs">,
  items: readonly Doc<"items">[],
): Promise<ItemClaimRow[]> {
  const rows: ItemClaimRow[] = [];

  for (const item of items) {
    const claimDocs = await ctx.db
      .query("allocations")
      .withIndex("by_item_id", (q) => q.eq("itemId", item._id))
      .collect();

    const claims: ClaimWeight[] = claimDocs.map((claim) => ({
      participantId: claim.userId,
      weight: 1,
      quantity: claim.quantity ?? undefined,
      percentageBps: claim.percentageBps ?? undefined,
      fixedMinor: claim.fixedMinor !== undefined ? toFiatMinor(claim.fixedMinor) : undefined,
    }));

    rows.push({
      itemId: item._id,
      lineTotalMinor: toFiatMinor(item.lineTotalMinor),
      mode: item.allocationMode ?? "equal",
      claims,
    });
  }

  return rows;
}

/** Persists computed item and adjustment allocations for the current revision. */
export async function persistComputedAllocations(
  ctx: MutationCtx,
  args: {
    tabId: Id<"tabs">;
    revision: number;
    itemRows: readonly ItemClaimRow[];
    adjustments: readonly Doc<"adjustments">[];
    now: number;
  },
): Promise<TabBillTotals> {
  const { breakdowns, totals, adjustmentAllocations, itemShares } = computeTabBreakdowns(
    args.itemRows,
    args.adjustments,
  );

  const existingItemAllocations = await ctx.db
    .query("allocations")
    .withIndex("by_tab_id", (q) => q.eq("tabId", args.tabId))
    .collect();
  for (const row of existingItemAllocations) {
    await ctx.db.delete(row._id);
  }

  const existingAdjustmentAllocations = await ctx.db
    .query("adjustmentAllocations")
    .withIndex("by_tab_id", (q) => q.eq("tabId", args.tabId))
    .collect();
  for (const row of existingAdjustmentAllocations) {
    await ctx.db.delete(row._id);
  }

  for (const itemRow of args.itemRows) {
    const shares = allocateByMode(itemRow.lineTotalMinor, itemRow.mode, itemRow.claims);
    for (const share of shares) {
      const claim = itemRow.claims.find((candidate) => candidate.participantId === share.participantId);
      await ctx.db.insert("allocations", {
        tabId: args.tabId,
        itemId: itemRow.itemId,
        userId: share.participantId as Id<"users">,
        revision: args.revision,
        mode: itemRow.mode,
        quantity: claim?.quantity,
        percentageBps: claim?.percentageBps,
        fixedMinor: claim?.fixedMinor !== undefined ? BigInt(claim.fixedMinor) : undefined,
        amountMinor: BigInt(share.amountMinor),
        roundingMinor: BigInt(share.roundingMinor),
        createdAt: args.now,
        updatedAt: args.now,
      });
    }
  }

  for (const allocation of adjustmentAllocations) {
    const adjustment = args.adjustments.find((row) => mapAdjustmentKind(row.kind) === allocation.kind);
    if (!adjustment) {
      continue;
    }
    for (const share of allocation.byParticipant) {
      await ctx.db.insert("adjustmentAllocations", {
        tabId: args.tabId,
        adjustmentId: adjustment._id,
        userId: share.participantId as Id<"users">,
        revision: args.revision,
        kind: adjustment.kind,
        amountMinor: BigInt(share.amountMinor),
        roundingMinor: BigInt(share.roundingMinor),
        createdAt: args.now,
        updatedAt: args.now,
      });
    }
  }

  await ctx.db.patch(args.tabId, {
    itemSubtotalMinor: BigInt(totals.itemSubtotalMinor),
    serviceMinor: BigInt(totals.serviceMinor),
    taxMinor: BigInt(totals.taxMinor),
    discountMinor: BigInt(totals.discountMinor),
    groupTipMinor: BigInt(totals.groupTipMinor),
    billTotalMinor: BigInt(totals.billTotalMinor),
    updatedAt: args.now,
  });

  void breakdowns;
  void itemShares;

  return totals;
}

