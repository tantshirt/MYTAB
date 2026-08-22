import { TOKEN_PROGRAM_ID } from "../../lib/solana/constants";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  SPONSOR_POLICY_VERSION,
  type SponsorEnvironment,
  type SponsorUsageSnapshot,
  defaultIntentSponsorReservationLamports,
  evaluateSponsorReservation,
  utcDayKey,
} from "../sponsorPolicy";

export type SponsorBucketDimension =
  | "user_day"
  | "wallet_day"
  | "group_day"
  | "daily_aggregate"
  | "global_epoch";

type BucketKey = {
  dimension: SponsorBucketDimension;
  scopeKey: string;
  windowKey: string;
};

async function readBucketReserved(
  ctx: MutationCtx,
  key: BucketKey,
): Promise<bigint> {
  const row = await ctx.db
    .query("sponsorUsageBuckets")
    .withIndex("by_dimension_scope_window", (q) =>
      q
        .eq("policyVersion", SPONSOR_POLICY_VERSION)
        .eq("dimension", key.dimension)
        .eq("scopeKey", key.scopeKey)
        .eq("windowKey", key.windowKey),
    )
    .unique();

  return row?.reservedLamports ?? 0n;
}

async function incrementBucketReserved(
  ctx: MutationCtx,
  key: BucketKey,
  delta: bigint,
  now: number,
): Promise<void> {
  const existing = await ctx.db
    .query("sponsorUsageBuckets")
    .withIndex("by_dimension_scope_window", (q) =>
      q
        .eq("policyVersion", SPONSOR_POLICY_VERSION)
        .eq("dimension", key.dimension)
        .eq("scopeKey", key.scopeKey)
        .eq("windowKey", key.windowKey),
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      reservedLamports: existing.reservedLamports + delta,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("sponsorUsageBuckets", {
    policyVersion: SPONSOR_POLICY_VERSION,
    dimension: key.dimension,
    scopeKey: key.scopeKey,
    windowKey: key.windowKey,
    reservedLamports: delta,
    settledLamports: 0n,
    updatedAt: now,
  });
}

export async function readSponsorUsageSnapshot(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    walletId: Id<"wallets">;
    groupId: Id<"groups">;
    now?: number;
  },
): Promise<SponsorUsageSnapshot> {
  const day = utcDayKey(args.now ?? Date.now());

  const [userDayReserved, walletDayReserved, groupDayReserved, dailyAggregateReserved, globalEpochReserved] =
    await Promise.all([
      readBucketReserved(ctx, {
        dimension: "user_day",
        scopeKey: args.userId,
        windowKey: day,
      }),
      readBucketReserved(ctx, {
        dimension: "wallet_day",
        scopeKey: args.walletId,
        windowKey: day,
      }),
      readBucketReserved(ctx, {
        dimension: "group_day",
        scopeKey: args.groupId,
        windowKey: day,
      }),
      readBucketReserved(ctx, {
        dimension: "daily_aggregate",
        scopeKey: "_aggregate",
        windowKey: day,
      }),
      readBucketReserved(ctx, {
        dimension: "global_epoch",
        scopeKey: "_global",
        windowKey: "epoch",
      }),
    ]);

  return {
    userDayReserved,
    walletDayReserved,
    groupDayReserved,
    dailyAggregateReserved,
    globalEpochReserved,
  };
}

export type ReserveSponsorBudgetArgs = {
  intentId: Id<"settlementIntents">;
  userId: Id<"users">;
  walletId: Id<"wallets">;
  groupId: Id<"groups">;
  environment: SponsorEnvironment;
  reservedLamports?: bigint;
  recipientAddress: string;
  outputMint: string;
  paused?: boolean;
  now?: number;
};

export type ReserveSponsorBudgetResult =
  | { ok: true; reservedLamports: bigint }
  | { ok: false; failureCode: string };

/** Atomically reserves sponsor budget across all six dimensions (Story 3.8 AC6). */
export async function reserveSponsorBudget(
  ctx: MutationCtx,
  args: ReserveSponsorBudgetArgs,
): Promise<ReserveSponsorBudgetResult> {
  const now = args.now ?? Date.now();
  const reservedLamports =
    args.reservedLamports ??
    defaultIntentSponsorReservationLamports(args.environment);

  const existingReservation = await ctx.db
    .query("sponsorReservations")
    .withIndex("by_intent_id", (q) => q.eq("intentId", args.intentId))
    .unique();

  if (existingReservation?.status === "active") {
    return { ok: true, reservedLamports: existingReservation.reservedLamports };
  }

  const usage = await readSponsorUsageSnapshot(ctx, {
    userId: args.userId,
    walletId: args.walletId,
    groupId: args.groupId,
    now,
  });

  const evaluation = evaluateSponsorReservation({
    environment: args.environment,
    reservedLamports,
    usage,
    allowlist: {
      programId: TOKEN_PROGRAM_ID,
      mint: args.outputMint,
      recipientAddress: args.recipientAddress,
      instructionKind: "transferChecked",
    },
    paused: args.paused,
  });

  if (!evaluation.ok) {
    return evaluation;
  }

  const day = utcDayKey(now);
  const increments: BucketKey[] = [
    { dimension: "user_day", scopeKey: args.userId, windowKey: day },
    { dimension: "wallet_day", scopeKey: args.walletId, windowKey: day },
    { dimension: "group_day", scopeKey: args.groupId, windowKey: day },
    { dimension: "daily_aggregate", scopeKey: "_aggregate", windowKey: day },
    { dimension: "global_epoch", scopeKey: "_global", windowKey: "epoch" },
  ];

  for (const key of increments) {
    await incrementBucketReserved(ctx, key, reservedLamports, now);
  }

  if (existingReservation) {
    await ctx.db.patch(existingReservation._id, {
      reservedLamports,
      status: "active",
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("sponsorReservations", {
      intentId: args.intentId,
      policyVersion: SPONSOR_POLICY_VERSION,
      reservedLamports,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }

  return { ok: true, reservedLamports };
}

export async function releaseSponsorReservation(
  ctx: MutationCtx,
  intentId: Id<"settlementIntents">,
  now: number = Date.now(),
): Promise<void> {
  const reservation = await ctx.db
    .query("sponsorReservations")
    .withIndex("by_intent_id", (q) => q.eq("intentId", intentId))
    .unique();

  if (!reservation || reservation.status !== "active") {
    return;
  }

  const intent = await ctx.db.get(intentId);
  if (!intent) {
    return;
  }

  const day = utcDayKey(now);
  const delta = -reservation.reservedLamports;
  const keys: BucketKey[] = [
    { dimension: "user_day", scopeKey: intent.userId, windowKey: day },
    { dimension: "wallet_day", scopeKey: intent.walletId, windowKey: day },
    { dimension: "group_day", scopeKey: intent.groupId, windowKey: day },
    { dimension: "daily_aggregate", scopeKey: "_aggregate", windowKey: day },
    { dimension: "global_epoch", scopeKey: "_global", windowKey: "epoch" },
  ];

  for (const key of keys) {
    await incrementBucketReserved(ctx, key, delta, now);
  }

  await ctx.db.patch(reservation._id, {
    status: "released",
    updatedAt: now,
  });
}
