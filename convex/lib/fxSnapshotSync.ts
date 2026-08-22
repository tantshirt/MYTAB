/**
 * FX snapshot persistence and selection (binding decision 6).
 *
 * Snapshots are append-only. Nothing in this module patches an existing row, so
 * a locked bill's `fxSnapshotId` always resolves to the exact rational it was
 * locked against — a locked snapshot never silently refreshes.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  FX_DIRECTION,
  FX_POLICY_VERSION,
  FX_PROVIDER_FRANKFURTER_BOT,
  FX_PROVIDER_MANUAL,
  FxError,
  FxErrorCode,
  assertFxSnapshotFresh,
  buildFxSnapshotFields,
  isFxSnapshotFresh,
  resolveFreshnessWindowMs,
  thbMinorToUsdcAtomic,
  type FxRateQuote,
  type FxRational,
} from "../../lib/domain/fx";
import { MANUAL_FX_RATIONAL, MANUAL_USD_THB_RATE_TEXT } from "../../lib/domain/fxFixture";
import { assertFixturePathAllowed } from "../../lib/solana/runtimeGuard";
import { requireGroupMember } from "./auth";

export {
  FX_DIRECTION,
  FX_POLICY_VERSION,
  FX_PROVIDER_FRANKFURTER_BOT,
  FX_PROVIDER_MANUAL,
  FxError,
  FxErrorCode,
};

export const FX_QUOTE_MINT_USDC = "USDC";
export const FX_BASE_CURRENCY_THB = "THB";

export const FX_SNAPSHOT_UNAVAILABLE = "FX_SNAPSHOT_UNAVAILABLE";

/** Thrown when production has no usable rate — the fail-closed path. */
export class FxUnavailableError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FxUnavailableError";
    this.code = code;
  }
}

type AnyCtx = QueryCtx | MutationCtx;

export type FxSnapshotInsert = {
  numeratorAtomic: bigint;
  denominatorMinor: bigint;
  provider: string;
  providerAsOf: number;
  expiresAt: number;
  policyVersion: string;
  isFixture: boolean;
  fetchedAt: number;
};

/** Inserts a snapshot row. Insert-only by design — snapshots are immutable. */
export async function insertFxSnapshot(
  ctx: MutationCtx,
  fields: FxSnapshotInsert,
): Promise<Id<"fxSnapshots">> {
  if (fields.numeratorAtomic <= 0n || fields.denominatorMinor <= 0n) {
    throw new FxError(
      FxErrorCode.NON_POSITIVE_RATIONAL,
      `Refusing to persist a non-positive FX rational ${fields.numeratorAtomic}/${fields.denominatorMinor}`,
    );
  }

  return ctx.db.insert("fxSnapshots", {
    baseCurrency: FX_BASE_CURRENCY_THB,
    quoteMint: FX_QUOTE_MINT_USDC,
    direction: FX_DIRECTION,
    numeratorAtomic: fields.numeratorAtomic,
    denominatorMinor: fields.denominatorMinor,
    provider: fields.provider,
    providerAsOf: fields.providerAsOf,
    fetchedAt: fields.fetchedAt,
    expiresAt: fields.expiresAt,
    policyVersion: fields.policyVersion,
    isFixture: fields.isFixture,
  });
}

/** Most recent snapshot for a provider, by provider business date. */
export async function findLatestFxSnapshot(
  ctx: AnyCtx,
  provider: string = FX_PROVIDER_FRANKFURTER_BOT,
): Promise<Doc<"fxSnapshots"> | null> {
  return ctx.db
    .query("fxSnapshots")
    .withIndex("by_provider_as_of", (q) => q.eq("provider", provider))
    .order("desc")
    .first();
}

/** Persists a Bank of Thailand quote, or returns the existing row for that date. */
export async function recordBotFxSnapshot(
  ctx: MutationCtx,
  quote: FxRateQuote,
  now: number,
): Promise<{ fxSnapshotId: Id<"fxSnapshots">; created: boolean }> {
  const fields = buildFxSnapshotFields(quote);

  const existing = await ctx.db
    .query("fxSnapshots")
    .withIndex("by_provider_as_of", (q) =>
      q.eq("provider", FX_PROVIDER_FRANKFURTER_BOT).eq("providerAsOf", fields.providerAsOf),
    )
    .first();

  if (existing) {
    // Same provider business date: keep the row we already locked bills against.
    return { fxSnapshotId: existing._id, created: false };
  }

  const fxSnapshotId = await insertFxSnapshot(ctx, {
    numeratorAtomic: fields.numeratorAtomic,
    denominatorMinor: fields.denominatorMinor,
    provider: fields.provider,
    providerAsOf: fields.providerAsOf,
    expiresAt: fields.expiresAt,
    policyVersion: fields.policyVersion,
    isFixture: false,
    fetchedAt: now,
  });

  return { fxSnapshotId, created: true };
}

/**
 * Creates the visibly badged manual snapshot.
 *
 * Non-production only: {@link assertFixturePathAllowed} throws
 * `RuntimeGuardError` on any real deployment — devnet included — rather than
 * letting a hand-picked rate price real money.
 */
export async function createManualFxSnapshot(
  ctx: MutationCtx,
  now: number,
): Promise<Id<"fxSnapshots">> {
  assertFixturePathAllowed("fx.manualSnapshot");

  const providerAsOf = now;
  const providerDate = new Date(now).toISOString().slice(0, 10);

  return insertFxSnapshot(ctx, {
    numeratorAtomic: MANUAL_FX_RATIONAL.numeratorAtomic,
    denominatorMinor: MANUAL_FX_RATIONAL.denominatorMinor,
    provider: FX_PROVIDER_MANUAL,
    providerAsOf,
    expiresAt: providerAsOf + resolveFreshnessWindowMs(providerDate),
    policyVersion: `manual:${MANUAL_USD_THB_RATE_TEXT}`,
    isFixture: true,
    fetchedAt: now,
  });
}

/** @deprecated Use {@link createManualFxSnapshot}. Kept for existing call sites. */
export const createFixtureFxSnapshot = createManualFxSnapshot;

/**
 * Resolves the snapshot a new tab should be priced against.
 *
 * Order: the freshest Bank of Thailand snapshot, else the badged manual
 * snapshot outside production, else a hard failure. Production never falls back.
 */
export async function resolveFxSnapshotIdForTab(
  ctx: MutationCtx,
  now: number,
): Promise<Id<"fxSnapshots">> {
  const latest = await findLatestFxSnapshot(ctx, FX_PROVIDER_FRANKFURTER_BOT);

  if (latest && isFxSnapshotFresh(latest, now)) {
    return latest._id;
  }

  try {
    return await createManualFxSnapshot(ctx, now);
  } catch (cause) {
    throw new FxUnavailableError(
      latest ? FxErrorCode.STALE_SNAPSHOT : FX_SNAPSHOT_UNAVAILABLE,
      latest
        ? `No fresh ${FX_PROVIDER_FRANKFURTER_BOT} rate: newest expired at ${latest.expiresAt}, now ${now}. ` +
            `Refusing to price a tab against a stale rate. (${(cause as Error).message})`
        : `No ${FX_PROVIDER_FRANKFURTER_BOT} rate has ever been recorded. ` +
            `Refusing to price a tab without one. (${(cause as Error).message})`,
    );
  }
}

export type FxSnapshotLike = Pick<
  Doc<"fxSnapshots">,
  "numeratorAtomic" | "denominatorMinor" | "direction" | "expiresAt"
>;

export function fxRationalFromSnapshot(snapshot: FxSnapshotLike): FxRational {
  return {
    numeratorAtomic: snapshot.numeratorAtomic,
    denominatorMinor: snapshot.denominatorMinor,
  };
}

/**
 * Converts a display amount to the recipient's USDC target using a snapshot.
 *
 * Rounds up, so the recipient is never short of the locked display amount.
 */
export function usdcAtomicFromSnapshot(
  snapshot: FxSnapshotLike,
  thbMinor: bigint | number,
): bigint {
  return thbMinorToUsdcAtomic(thbMinor, fxRationalFromSnapshot(snapshot));
}

export const FX_SNAPSHOT_NOT_FOR_TAB = "FX_SNAPSHOT_NOT_FOR_TAB";
export const FX_TAB_NOT_FOUND = "TAB_NOT_FOUND";

export class FxAuthError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "FxAuthError";
    this.code = code;
  }
}

/**
 * Loads a snapshot on behalf of a viewer, authorising against the *tab*.
 *
 * A snapshot id on its own grants nothing. The caller must name the tab they
 * are viewing; membership of that tab's group is checked, and the snapshot must
 * be the one that tab actually references. Without this anchor an fxSnapshots
 * id is an unguessable-but-not-secret handle that any authenticated caller
 * could read — which is what this replaced.
 */
export async function loadFxSnapshotForTabViewer(
  ctx: QueryCtx | MutationCtx,
  tabId: Id<"tabs">,
  fxSnapshotId: Id<"fxSnapshots">,
): Promise<Doc<"fxSnapshots"> | null> {
  const tab = await ctx.db.get(tabId);
  if (!tab) {
    throw new FxAuthError(FX_TAB_NOT_FOUND);
  }

  await requireGroupMember(ctx, tab.groupId);

  if (tab.fxSnapshotId !== fxSnapshotId) {
    throw new FxAuthError(FX_SNAPSHOT_NOT_FOR_TAB);
  }

  return ctx.db.get(fxSnapshotId);
}

export type LockFxFields = {
  fxNumeratorAtomic: bigint;
  fxDenominatorMinor: bigint;
  fxProvider: string;
  fxPolicyVersion: string;
};

/** The FX columns frozen onto a bill lock snapshot. */
export function fxFieldsFromSnapshot(snapshot: Doc<"fxSnapshots">): LockFxFields {
  return {
    fxNumeratorAtomic: snapshot.numeratorAtomic,
    fxDenominatorMinor: snapshot.denominatorMinor,
    fxProvider: snapshot.provider,
    fxPolicyVersion: snapshot.policyVersion,
  };
}

/**
 * Loads the snapshot a tab must be locked against, failing closed.
 *
 * Called at lock time — the moment the rate stops being advisory and starts
 * determining what the recipient is paid. A missing snapshot, a wrong-direction
 * snapshot, or an expired one all refuse the lock rather than guessing a rate.
 */
export async function requireLockableFxSnapshot(
  ctx: AnyCtx,
  fxSnapshotId: Id<"fxSnapshots"> | undefined,
  now: number,
): Promise<Doc<"fxSnapshots">> {
  if (!fxSnapshotId) {
    throw new FxUnavailableError(
      FX_SNAPSHOT_UNAVAILABLE,
      "Refusing to lock a bill with no FX snapshot: the settlement amount would have no provenance",
    );
  }

  const snapshot = await ctx.db.get(fxSnapshotId);
  if (!snapshot) {
    throw new FxUnavailableError(
      FX_SNAPSHOT_UNAVAILABLE,
      `FX snapshot ${fxSnapshotId} referenced by the tab no longer exists`,
    );
  }

  assertFxSnapshotUsable(snapshot, now);
  return snapshot;
}

/**
 * Fail-closed guard for pricing paths that are about to create an obligation.
 *
 * Locked bills deliberately bypass this: once a bill is locked its snapshot is
 * frozen and must be used as-is, never re-checked for freshness and never
 * swapped for a newer one.
 */
export function assertFxSnapshotUsable(snapshot: FxSnapshotLike, now: number): void {
  assertFxSnapshotFresh(snapshot, now);
}
