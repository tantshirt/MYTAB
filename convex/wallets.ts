import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { AuthError, UNAUTHORIZED, getCurrentUser } from "./lib/auth";
import {
  DUPLICATE_DEFAULT_RECEIVING,
  USER_REQUIRED,
  WalletError,
  getDefaultReceivingWalletForUser,
  setDefaultReceivingWallet,
  upsertEmbeddedWallet,
} from "./lib/walletSync";

export {
  DUPLICATE_DEFAULT_RECEIVING,
  USER_REQUIRED,
  WalletError,
} from "./lib/walletSync";

/** Upserts the authenticated user's Privy embedded Solana wallet (FR-W1, FR-W2). */
export const syncEmbeddedWallet = mutation({
  args: {
    privyWalletId: v.string(),
    solanaAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new AuthError(UNAUTHORIZED);
    }

    const privyWalletId = args.privyWalletId.trim();
    const solanaAddress = args.solanaAddress.trim();
    if (!privyWalletId || !solanaAddress) {
      throw new WalletError("INVALID_WALLET_INPUT");
    }

    return upsertEmbeddedWallet(ctx, user._id, privyWalletId, solanaAddress);
  },
});

/** Internal upsert path for server-side Privy sync actions. */
export const syncEmbeddedWalletInternal = internalMutation({
  args: {
    userId: v.id("users"),
    privyWalletId: v.string(),
    solanaAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const privyWalletId = args.privyWalletId.trim();
    const solanaAddress = args.solanaAddress.trim();
    if (!privyWalletId || !solanaAddress) {
      throw new WalletError("INVALID_WALLET_INPUT");
    }

    return upsertEmbeddedWallet(ctx, args.userId, privyWalletId, solanaAddress);
  },
});

/** Marks one wallet as the default receiver; rejects duplicate defaults in one transaction. */
export const markDefaultReceivingWallet = internalMutation({
  args: {
    userId: v.id("users"),
    walletId: v.id("wallets"),
  },
  handler: async (ctx, args) => {
    const wallets = await ctx.db
      .query("wallets")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .collect();

    await setDefaultReceivingWallet(ctx, args.userId, args.walletId, wallets);
    return { ok: true as const };
  },
});

/** Returns the authenticated user's default receiving wallet from Convex records only. */
export const defaultReceivingWallet = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }

    return getDefaultReceivingWalletForUser(ctx, user._id);
  },
});
