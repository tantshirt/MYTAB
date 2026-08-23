import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const DUPLICATE_DEFAULT_RECEIVING = "DUPLICATE_DEFAULT_RECEIVING";
export const WALLET_NOT_FOUND = "WALLET_NOT_FOUND";
export const USER_REQUIRED = "USER_REQUIRED";

export class WalletError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "WalletError";
  }
}

type WalletCtx = MutationCtx | QueryCtx;
export type WalletRecord = Pick<
  Doc<"wallets">,
  | "_id"
  | "kind"
  | "privyWalletId"
  | "provider"
  | "solanaAddress"
  | "isEmbedded"
  | "isDefaultReceiving"
>;
export type ExternalWalletProvider = NonNullable<Doc<"wallets">["provider"]>;

/** Whether a new embedded wallet should become the default receiving wallet. */
export function shouldNewEmbeddedWalletBeDefault(
  existingWallets: ReadonlyArray<Pick<Doc<"wallets">, "isDefaultReceiving">>,
): boolean {
  return !existingWallets.some((wallet) => wallet.isDefaultReceiving);
}

/** Marks one wallet as default and clears all others for the user in one transaction. */
export async function setDefaultReceivingWallet(
  ctx: MutationCtx,
  userId: Id<"users">,
  walletId: Id<"wallets">,
  existingWallets: ReadonlyArray<Doc<"wallets">>,
): Promise<void> {
  const target = existingWallets.find((wallet) => wallet._id === walletId);
  if (!target) {
    throw new WalletError(WALLET_NOT_FOUND);
  }

  const otherDefaults = existingWallets.filter(
    (wallet) => wallet.isDefaultReceiving && wallet._id !== walletId,
  );
  if (otherDefaults.length > 0 && target.isDefaultReceiving) {
    throw new WalletError(DUPLICATE_DEFAULT_RECEIVING);
  }

  const now = Date.now();
  for (const wallet of otherDefaults) {
    await ctx.db.patch(wallet._id, {
      isDefaultReceiving: false,
      lastDefaultAt: now,
      updatedAt: now,
    });
  }

  if (!target.isDefaultReceiving) {
    await ctx.db.patch(walletId, {
      isDefaultReceiving: true,
      updatedAt: now,
    });
  }
}

export async function listUserWallets(
  ctx: WalletCtx,
  userId: Id<"users">,
): Promise<Array<Doc<"wallets">>> {
  return ctx.db
    .query("wallets")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .collect();
}

export async function upsertEmbeddedWallet(
  ctx: MutationCtx,
  userId: Id<"users">,
  privyWalletId: string,
  solanaAddress: string,
): Promise<{ walletId: Id<"wallets">; created: boolean }> {
  const existingWallets = await listUserWallets(ctx, userId);
  const existing = existingWallets.find(
    (wallet) => wallet.kind === "embedded" && wallet.privyWalletId === privyWalletId,
  );
  const now = Date.now();

  if (existing) {
    await ctx.db.patch(existing._id, {
      kind: "embedded",
      privyWalletId,
      solanaAddress,
      isEmbedded: true,
      updatedAt: now,
    });
    return { walletId: existing._id, created: false };
  }

  const walletId = await ctx.db.insert("wallets", {
    userId,
    kind: "embedded",
    privyWalletId,
    solanaAddress,
    isEmbedded: true,
    isDefaultReceiving: false,
    createdAt: now,
    updatedAt: now,
  });

  const wallets = await listUserWallets(ctx, userId);
  await setDefaultReceivingWallet(ctx, userId, walletId, wallets);

  return { walletId, created: true };
}

/**
 * Upsert an external wallet whose address was recovered from a verified
 * signed challenge — never from a client argument (D-21, H7).
 */
export async function upsertExternalWallet(
  ctx: MutationCtx,
  userId: Id<"users">,
  solanaAddress: string,
  provider: ExternalWalletProvider,
): Promise<{ walletId: Id<"wallets">; created: boolean }> {
  const existingWallets = await listUserWallets(ctx, userId);
  const existing = existingWallets.find(
    (wallet) => wallet.kind === "external" && wallet.solanaAddress === solanaAddress,
  );
  const now = Date.now();

  if (existing) {
    await ctx.db.patch(existing._id, {
      provider,
      isEmbedded: false,
      updatedAt: now,
    });
    const wallets = await listUserWallets(ctx, userId);
    await setDefaultReceivingWallet(ctx, userId, existing._id, wallets);
    return { walletId: existing._id, created: false };
  }

  const walletId = await ctx.db.insert("wallets", {
    userId,
    kind: "external",
    provider,
    solanaAddress,
    isEmbedded: false,
    isDefaultReceiving: false,
    createdAt: now,
    updatedAt: now,
  });

  const wallets = await listUserWallets(ctx, userId);
  await setDefaultReceivingWallet(ctx, userId, walletId, wallets);

  return { walletId, created: true };
}

/** Another user's row already holds this address — refuse rather than steal it. */
export async function findWalletBySolanaAddress(
  ctx: WalletCtx,
  solanaAddress: string,
): Promise<Doc<"wallets"> | null> {
  const matches = await ctx.db
    .query("wallets")
    .withIndex("by_solana_address", (q) => q.eq("solanaAddress", solanaAddress))
    .collect();
  return matches[0] ?? null;
}

/** Resolves the user's default receiving wallet from stored records only (FR-T5, AD-13). */
export async function getDefaultReceivingWalletForUser(
  ctx: WalletCtx,
  userId: Id<"users">,
): Promise<WalletRecord | null> {
  const wallets = await ctx.db
    .query("wallets")
    .withIndex("by_user_and_default", (q) =>
      q.eq("userId", userId).eq("isDefaultReceiving", true),
    )
    .collect();

  if (wallets.length > 1) {
    throw new WalletError(DUPLICATE_DEFAULT_RECEIVING);
  }

  return wallets[0] ?? null;
}

/** The row that last lost default — source for "send what you received". */
export function findPreviousReceivingWallet<
  T extends {
    _id: Id<"wallets">;
    isDefaultReceiving: boolean;
    lastDefaultAt?: number;
    createdAt: number;
  },
>(wallets: readonly T[]): T | null {
  const previous = wallets.filter((wallet) => !wallet.isDefaultReceiving);
  if (previous.length === 0) {
    return null;
  }
  return previous.reduce((best, row) => {
    const bestKey = best.lastDefaultAt ?? best.createdAt;
    const rowKey = row.lastDefaultAt ?? row.createdAt;
    return rowKey > bestKey ? row : best;
  });
}
