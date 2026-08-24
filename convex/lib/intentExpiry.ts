import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  SETTLEMENT_STATUS,
  type SettlementStatus,
  assertSettlementTransition,
} from "./settlementState";
import { releaseSponsorReservation } from "./sponsorReservation";
import { releaseDflowLease } from "./providerBudget";

export const EXPIRABLE_STATUSES: ReadonlySet<SettlementStatus> = new Set([
  SETTLEMENT_STATUS.CREATED,
  SETTLEMENT_STATUS.QUOTING,
  SETTLEMENT_STATUS.READY_FOR_SIGNATURE,
]);

export function isIntentPastExpiry(intent: Pick<Doc<"settlementIntents">, "expiresAt">, now: number): boolean {
  return intent.expiresAt <= now;
}

export function canExpireIntent(status: SettlementStatus): boolean {
  return EXPIRABLE_STATUSES.has(status);
}

/** Transitions a past-due intent to expired when allowed (Story 3.9 AC2). */
export async function expireIntentIfPastDue(
  ctx: MutationCtx,
  intent: Doc<"settlementIntents">,
  now = Date.now(),
): Promise<Doc<"settlementIntents">> {
  if (!canExpireIntent(intent.status as SettlementStatus)) {
    return intent;
  }

  if (!isIntentPastExpiry(intent, now)) {
    return intent;
  }

  assertSettlementTransition(intent.status as SettlementStatus, SETTLEMENT_STATUS.EXPIRED);
  await releaseSponsorReservation(ctx, intent._id, now);
  await releaseDflowLease(ctx, intent._id, now);

  await ctx.db.patch(intent._id, {
    status: SETTLEMENT_STATUS.EXPIRED,
    updatedAt: now,
  });

  return {
    ...intent,
    status: SETTLEMENT_STATUS.EXPIRED,
    updatedAt: now,
  };
}

/** Sweeps expired intents for the Convex cron (Story 3.9 AC1). */
export async function sweepExpiredIntents(
  ctx: MutationCtx,
  now = Date.now(),
): Promise<{ expiredCount: number; scannedCount: number }> {
  let expiredCount = 0;
  let scannedCount = 0;

  for (const status of EXPIRABLE_STATUSES) {
    const intents = await ctx.db
      .query("settlementIntents")
      .withIndex("by_status", (q) => q.eq("status", status))
      .collect();

    for (const intent of intents) {
      scannedCount += 1;
      if (!isIntentPastExpiry(intent, now)) {
        continue;
      }

      await expireIntentIfPastDue(ctx, intent, now);
      expiredCount += 1;
    }
  }

  return { expiredCount, scannedCount };
}
