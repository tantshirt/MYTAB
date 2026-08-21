import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { DFLOW_SOLVER_RESERVED_ATTEMPTS } from "../../lib/dflow/constants";

export const PROVIDER_BUDGET = {
  USER_HOUR_LIMIT: 30,
  GROUP_HOUR_LIMIT: 100,
  GLOBAL_HOUR_LIMIT: 10_000,
  SOLVER_RESERVED_ATTEMPTS: DFLOW_SOLVER_RESERVED_ATTEMPTS,
  SOLVER_LEASE_MS: 180_000,
} as const;

type ProviderDimension = "user_hour" | "group_hour" | "global_hour";

function utcHourKey(now = Date.now()): string {
  const date = new Date(now);
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}-${date.getUTCHours()}`;
}

async function readReservedAttempts(
  ctx: MutationCtx,
  dimension: ProviderDimension,
  scopeKey: string,
  windowKey: string,
): Promise<number> {
  const row = await ctx.db
    .query("providerUsageBuckets")
    .withIndex("by_operation_dimension_scope_window", (q) =>
      q
        .eq("operation", "dflow_quote")
        .eq("dimension", dimension)
        .eq("scopeKey", scopeKey)
        .eq("windowKey", windowKey),
    )
    .unique();
  return row?.reservedAttempts ?? 0;
}

async function incrementReservedAttempts(
  ctx: MutationCtx,
  dimension: ProviderDimension,
  scopeKey: string,
  windowKey: string,
  delta: number,
  now: number,
): Promise<void> {
  const existing = await ctx.db
    .query("providerUsageBuckets")
    .withIndex("by_operation_dimension_scope_window", (q) =>
      q
        .eq("operation", "dflow_quote")
        .eq("dimension", dimension)
        .eq("scopeKey", scopeKey)
        .eq("windowKey", windowKey),
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      reservedAttempts: existing.reservedAttempts + delta,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("providerUsageBuckets", {
    operation: "dflow_quote",
    dimension,
    scopeKey,
    windowKey,
    reservedAttempts: delta,
    settledAttempts: 0,
    updatedAt: now,
  });
}

export type ReserveDflowBudgetArgs = {
  userId: Id<"users">;
  groupId: Id<"groups">;
  intentId: Id<"settlementIntents">;
  reservedAttempts?: number;
  now?: number;
};

export type ReserveDflowBudgetResult =
  | { ok: true; windowKey: string; reservedAttempts: number }
  | { ok: false; failureCode: "PROVIDER_QUOTA_EXCEEDED" | "PROVIDER_LEASE_ACTIVE"; retryAfterMs?: number };

/** Atomically reserves AD-24 hourly attempt tokens before the first DFlow request (Story 6.3 AC7). */
export async function reserveDflowBudget(
  ctx: MutationCtx,
  args: ReserveDflowBudgetArgs,
): Promise<ReserveDflowBudgetResult> {
  const now = args.now ?? Date.now();
  const windowKey = utcHourKey(now);
  const reservedAttempts = args.reservedAttempts ?? PROVIDER_BUDGET.SOLVER_RESERVED_ATTEMPTS;

  const staleLease = await ctx.db
    .query("providerConcurrencyLeases")
    .withIndex("by_operation_scope", (q) =>
      q.eq("operation", "dflow_solver").eq("scopeKey", args.groupId),
    )
    .collect();

  for (const lease of staleLease) {
    if (lease.status === "active" && lease.expiresAt <= now) {
      await ctx.db.patch(lease._id, { status: "released", updatedAt: now });
    }
  }

  const activeLease = staleLease.find(
    (lease) => lease.status === "active" && lease.expiresAt > now && lease.intentId !== args.intentId,
  );
  if (activeLease) {
    return {
      ok: false,
      failureCode: "PROVIDER_LEASE_ACTIVE",
      retryAfterMs: Math.max(0, activeLease.expiresAt - now),
    };
  }

  const userUsed = await readReservedAttempts(ctx, "user_hour", args.userId, windowKey);
  const groupUsed = await readReservedAttempts(ctx, "group_hour", args.groupId, windowKey);
  const globalUsed = await readReservedAttempts(ctx, "global_hour", "global", windowKey);

  if (
    userUsed + reservedAttempts > PROVIDER_BUDGET.USER_HOUR_LIMIT ||
    groupUsed + reservedAttempts > PROVIDER_BUDGET.GROUP_HOUR_LIMIT ||
    globalUsed + reservedAttempts > PROVIDER_BUDGET.GLOBAL_HOUR_LIMIT
  ) {
    return { ok: false, failureCode: "PROVIDER_QUOTA_EXCEEDED", retryAfterMs: 3_600_000 };
  }

  await incrementReservedAttempts(ctx, "user_hour", args.userId, windowKey, reservedAttempts, now);
  await incrementReservedAttempts(ctx, "group_hour", args.groupId, windowKey, reservedAttempts, now);
  await incrementReservedAttempts(ctx, "global_hour", "global", windowKey, reservedAttempts, now);

  const existingLease = staleLease.find((lease) => lease.intentId === args.intentId);
  if (existingLease) {
    await ctx.db.patch(existingLease._id, {
      status: "active",
      expiresAt: now + PROVIDER_BUDGET.SOLVER_LEASE_MS,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("providerConcurrencyLeases", {
      operation: "dflow_solver",
      scopeKey: args.groupId,
      intentId: args.intentId,
      status: "active",
      expiresAt: now + PROVIDER_BUDGET.SOLVER_LEASE_MS,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { ok: true, windowKey, reservedAttempts };
}

/** Settles actual DFlow attempts and releases unused reserved tokens (Story 6.3 AC7). */
export async function settleDflowBudget(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    groupId: Id<"groups">;
    intentId: Id<"settlementIntents">;
    windowKey: string;
    reservedAttempts: number;
    usedAttempts: number;
    now?: number;
  },
): Promise<void> {
  const now = args.now ?? Date.now();
  const release = Math.max(0, args.reservedAttempts - args.usedAttempts);

  for (const [dimension, scopeKey] of [
    ["user_hour", args.userId] as const,
    ["group_hour", args.groupId] as const,
    ["global_hour", "global"] as const,
  ]) {
    const row = await ctx.db
      .query("providerUsageBuckets")
      .withIndex("by_operation_dimension_scope_window", (q) =>
        q
          .eq("operation", "dflow_quote")
          .eq("dimension", dimension)
          .eq("scopeKey", scopeKey)
          .eq("windowKey", args.windowKey),
      )
      .unique();

    if (row) {
      await ctx.db.patch(row._id, {
        reservedAttempts: Math.max(0, row.reservedAttempts - release),
        settledAttempts: row.settledAttempts + args.usedAttempts,
        updatedAt: now,
      });
    }
  }

  const lease = await ctx.db
    .query("providerConcurrencyLeases")
    .withIndex("by_intent_id", (q) => q.eq("intentId", args.intentId))
    .unique();

  if (lease) {
    await ctx.db.patch(lease._id, { status: "released", updatedAt: now });
  }
}
