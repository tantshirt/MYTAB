import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  computeBillBreakdown,
  type BillAdjustmentInput,
  type BillItemInput,
  assertItemName,
  assertItemQuantity,
  computeLineTotalMinor,
} from "../../lib/domain/bill";
import { fiatMinorFromInteger } from "../../lib/domain/money";
import { getDefaultReceivingWalletForUser } from "./walletSync";

export const PAYER_RECIPIENT_SAME = "PAYER_RECIPIENT_SAME";
export const RECIPIENT_WALLET_REQUIRED = "RECIPIENT_WALLET_REQUIRED";
export const INVALID_ITEM = "INVALID_ITEM";
export const DISCOUNT_EXCEEDS_TOTAL = "DISCOUNT_EXCEEDS_TOTAL";

export class TabBillError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ?? code);
    this.name = "TabBillError";
  }
}

export async function bumpTabRevision(
  ctx: MutationCtx,
  tabId: Id<"tabs">,
  tab: Doc<"tabs">,
  now: number,
): Promise<number> {
  const revision = (tab.revision ?? 0) + 1;
  await ctx.db.patch(tabId, {
    revision,
    updatedAt: now,
  });
  return revision;
}

export async function assertRecipientWalletReady(
  ctx: MutationCtx,
  recipientUserId: Id<"users">,
): Promise<void> {
  const wallet = await getDefaultReceivingWalletForUser(ctx, recipientUserId);
  if (!wallet) {
    throw new TabBillError(RECIPIENT_WALLET_REQUIRED);
  }
}

export function assertDistinctPayerRecipient(
  payerUserId: Id<"users">,
  recipientUserId: Id<"users">,
): void {
  if (payerUserId === recipientUserId) {
    throw new TabBillError(PAYER_RECIPIENT_SAME);
  }
}

export function validateItemInput(input: BillItemInput): {
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
} {
  try {
    const name = input.name.trim();
    assertItemName(name);
    assertItemQuantity(input.quantity);
    const lineTotalMinor = computeLineTotalMinor(input.quantity, input.unitPriceMinor);
    return {
      name,
      quantity: input.quantity,
      unitPriceMinor: Number(input.unitPriceMinor),
      lineTotalMinor: Number(lineTotalMinor),
    };
  } catch {
    throw new TabBillError(INVALID_ITEM);
  }
}

export async function listTabItems(ctx: MutationCtx, tabId: Id<"tabs">) {
  return ctx.db
    .query("items")
    .withIndex("by_tab_and_sort", (q) => q.eq("tabId", tabId))
    .collect();
}

export async function listTabAdjustments(ctx: MutationCtx, tabId: Id<"tabs">) {
  return ctx.db
    .query("adjustments")
    .withIndex("by_tab_id", (q) => q.eq("tabId", tabId))
    .collect();
}

export function toBillAdjustmentInputs(
  rows: ReadonlyArray<Doc<"adjustments">>,
): BillAdjustmentInput[] {
  return rows.map((row) => ({
    kind: row.kind,
    calculation: row.calculation,
    valueMinorOrBps: row.valueMinorOrBps,
    percentageBase: row.percentageBase,
  }));
}

export async function recomputeTabTotals(ctx: MutationCtx, tabId: Id<"tabs">) {
  const items = await listTabItems(ctx, tabId);
  const adjustments = await listTabAdjustments(ctx, tabId);

  try {
    const breakdown = computeBillBreakdown(
      items.map((item) => ({ lineTotalMinor: fiatMinorFromInteger(item.lineTotalMinor) })),
      toBillAdjustmentInputs(adjustments),
    );
    return breakdown;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Discount cannot exceed")) {
      throw new TabBillError(DISCOUNT_EXCEEDS_TOTAL, error.message);
    }
    throw error;
  }
}

export async function nextItemSortOrder(ctx: MutationCtx, tabId: Id<"tabs">): Promise<number> {
  const items = await listTabItems(ctx, tabId);
  if (items.length === 0) {
    return 0;
  }
  return Math.max(...items.map((item) => item.sortOrder)) + 1;
}
