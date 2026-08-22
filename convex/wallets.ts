import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { AuthError, UNAUTHORIZED, getCurrentUser } from "./lib/auth";
import {
  issueWalletLinkChallenge as issueWalletLinkChallengeCore,
  linkExternalWalletCore,
} from "./lib/walletChallenge";
import {
  DUPLICATE_DEFAULT_RECEIVING,
  USER_REQUIRED,
  WalletError,
  getDefaultReceivingWalletForUser,
  listUserWallets,
  setDefaultReceivingWallet,
  upsertEmbeddedWallet,
} from "./lib/walletSync";

export {
  DUPLICATE_DEFAULT_RECEIVING,
  USER_REQUIRED,
  WalletError,
} from "./lib/walletSync";
export { WALLET_LINK_ARG_KEYS } from "./lib/walletChallenge";


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

/** True when the authenticated user already has any linked wallet (D-25). */
export const hasLinkedWallet = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { status: "unauthenticated" as const, linked: false };
    }

    const wallets = await listUserWallets(ctx, user._id);
    return { status: "ready" as const, linked: wallets.length > 0 };
  },
});

/**
 * Mints a short-lived nonce bound to the authenticated user.
 * The client signs the returned prefix plus its own `key=` line.
 */
export const issueWalletLinkChallenge = mutation({
  args: {},
  handler: async (ctx) => issueWalletLinkChallengeCore(ctx),
});

/**
 * Link an external wallet from a signed challenge (D-21).
 *
 * Args are the signed message and signature — there is no address argument.
 * The pubkey is recovered from the verified signed bytes, then written.
 */
export const linkExternalWallet = mutation({
  args: {
    challengeId: v.id("walletLinkChallenges"),
    signedMessage: v.string(),
    signature: v.string(),
    provider: v.union(
      v.literal("phantom"),
      v.literal("solflare"),
      v.literal("backpack"),
      v.literal("standard"),
    ),
  },
  handler: async (ctx, args) => linkExternalWalletCore(ctx, args),
});
