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
  "_id" | "privyWalletId" | "solanaAddress" | "isEmbedded" | "isDefaultReceiving"
>;

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
  ctx: MutationCtx,
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
  const existing = existingWallets.find((wallet) => wallet.privyWalletId === privyWalletId);
  const now = Date.now();

  if (existing) {
    await ctx.db.patch(existing._id, {
      solanaAddress,
      isEmbedded: true,
      updatedAt: now,
    });
    return { walletId: existing._id, created: false };
  }

  const isDefaultReceiving = shouldNewEmbeddedWalletBeDefault(existingWallets);
  const walletId = await ctx.db.insert("wallets", {
    userId,
    privyWalletId,
    solanaAddress,
    isEmbedded: true,
    isDefaultReceiving,
    createdAt: now,
    updatedAt: now,
  });

  return { walletId, created: true };
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
