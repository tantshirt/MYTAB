import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Applies settlement offset to a tip or obligation target (Story 3.6 stub). */
export async function applySettlementOffset(
  ctx: MutationCtx,
  args: {
    intentId: Id<"settlementIntents">;
    targetKind: "tip" | "obligation";
    tipId?: Id<"tips">;
    obligationId?: Id<"obligations">;
    transactionSignature: string;
    now: number;
  },
): Promise<{ ledgerEventId: Id<"settlementLedgerEvents">; alreadyApplied: boolean }> {
  const existing = await ctx.db
    .query("settlementLedgerEvents")
    .withIndex("by_transaction_signature", (q) =>
      q.eq("transactionSignature", args.transactionSignature),
    )
    .unique();

  if (existing) {
    return { ledgerEventId: existing._id, alreadyApplied: true };
  }

  const ledgerEventId = await ctx.db.insert("settlementLedgerEvents", {
    intentId: args.intentId,
    targetKind: args.targetKind,
    tipId: args.tipId,
    obligationId: args.obligationId,
    eventKind: "settlement_offset",
    transactionSignature: args.transactionSignature,
    createdAt: args.now,
  });

  if (args.targetKind === "tip" && args.tipId) {
    const tip = await ctx.db.get(args.tipId);
    if (tip && tip.status !== "settled") {
      await ctx.db.patch(args.tipId, {
        status: "settled",
        settledAt: args.now,
        settlementIntentId: args.intentId,
        updatedAt: args.now,
      });
    }
  }

  if (args.targetKind === "obligation" && args.obligationId) {
    const obligation = await ctx.db.get(args.obligationId);
    if (obligation && obligation.status !== "settled") {
      await ctx.db.patch(args.obligationId, {
        status: "settled",
        settledAt: args.now,
        settlementIntentId: args.intentId,
        updatedAt: args.now,
      });
    }
  }

  return { ledgerEventId, alreadyApplied: false };
}

/** Returns true when the target already has a confirmed settlement intent. */
export async function isTargetAlreadySettled(
  ctx: MutationCtx,
  args: {
    targetKind: "tip" | "obligation";
    tipId?: Id<"tips">;
    obligationId?: Id<"obligations">;
  },
): Promise<boolean> {
  if (args.targetKind === "tip" && args.tipId) {
    const tip = await ctx.db.get(args.tipId);
    return tip?.status === "settled";
  }

  if (args.targetKind === "obligation" && args.obligationId) {
    const obligation = await ctx.db.get(args.obligationId);
    return obligation?.status === "settled";
  }

  return false;
}
