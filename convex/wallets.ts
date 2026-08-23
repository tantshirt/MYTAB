import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { AuthError, UNAUTHORIZED, getCurrentUser } from "./lib/auth";
import {
  USDC_DECIMALS,
  USDC_MINT,
} from "../lib/solana/constants";
import { createSolanaRpcClient } from "../lib/solana/rpc";
import { decodeTokenAccount, deriveRecipientUsdcAta } from "../lib/solana/tokenAccount";
import { formatCryptoAmountDisplay, cryptoAmountFromAtomicString } from "../lib/domain/crypto";
import {
  issueWalletLinkChallenge as issueWalletLinkChallengeCore,
  linkExternalWalletCore,
} from "./lib/walletChallenge";
import {
  consumeWalletUlCallbackCore,
  readWalletUlCallbackCore,
  storeWalletUlSessionCore,
} from "./lib/walletUlCallback";
import {
  createWalletMoveIntentCore,
  readWalletMoveOfferBase,
  type WalletMoveOfferBase,
} from "./lib/walletMoveSync";
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

    const result = await upsertEmbeddedWallet(ctx, user._id, privyWalletId, solanaAddress);
    if (result.created) {
      const wallets = await listUserWallets(ctx, user._id);
      await setDefaultReceivingWallet(ctx, user._id, result.walletId, wallets);
    }
    return result;
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

/**
 * Authenticated read of a stashed UL callback. Null for strangers and
 * the wrong user — same as a missing row.
 */
export const walletUlCallback = query({
  args: { challengeId: v.id("walletLinkChallenges") },
  handler: async (ctx, args) => readWalletUlCallbackCore(ctx, args.challengeId),
});

/** Marks the current UL recording as applied so a second waiter cannot reuse it. */
export const consumeWalletUlCallback = mutation({
  args: { challengeId: v.id("walletLinkChallenges") },
  handler: async (ctx, args) => consumeWalletUlCallbackCore(ctx, args.challengeId),
});

/**
 * Authenticated persist of the dapp X25519 secret + pending session.
 * The unauthenticated HTTPS callback must never read or write these fields.
 */
export const storeWalletUlSession = mutation({
  args: {
    challengeId: v.id("walletLinkChallenges"),
    secret: v.string(),
    pending: v.string(),
  },
  handler: async (ctx, args) => storeWalletUlSessionCore(ctx, args),
});

/**
 * Persist the UL session on the current default external row so Pay can
 * `/signTransaction` after the WebView is killed. No address argument.
 */
export const storeWalletPaySession = mutation({
  args: {
    session: v.string(),
    secret: v.string(),
    peerPublicKey: v.string(),
    dappPublicKey: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new AuthError(UNAUTHORIZED);
    }
    const wallet = await getDefaultReceivingWalletForUser(ctx, user._id);
    if (!wallet || wallet.kind !== "external") {
      return { ok: false as const };
    }
    await ctx.db.patch(wallet._id, {
      ulSession: args.session.trim(),
      ulSecret: args.secret.trim(),
      ulPeerPublicKey: args.peerPublicKey.trim(),
      ulDappPublicKey: args.dappPublicKey.trim(),
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const walletPaySession = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }
    const wallet = await getDefaultReceivingWalletForUser(ctx, user._id);
    if (!wallet || wallet.kind !== "external") {
      return null;
    }
    const row = await ctx.db.get(wallet._id);
    if (!row?.ulSession || !row.ulSecret || !row.ulPeerPublicKey || !row.ulDappPublicKey) {
      return null;
    }
    return {
      walletId: row._id,
      provider: row.provider ?? null,
      session: row.ulSession,
      secret: row.ulSecret,
      peerPublicKey: row.ulPeerPublicKey,
      dappPublicKey: row.ulDappPublicKey,
    };
  },
});

export const walletRoster = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }
    const wallets = await listUserWallets(ctx, user._id);
    const def = wallets.find((row) => row.isDefaultReceiving) ?? null;
    return {
      defaultKind: def?.kind ?? null,
      defaultProvider: def?.provider ?? null,
      hasEmbedded: wallets.some((row) => row.kind === "embedded"),
      hasExternal: wallets.some((row) => row.kind === "external"),
    };
  },
});

export const walletMoveOfferBase = query({
  args: {},
  handler: async (ctx) => readWalletMoveOfferBase(ctx),
});

/** You-only: exact USDC still sitting on the previous receiving row. */
export type WalletMoveOfferView = {
  sourceKind: "embedded" | "external";
  sourceProvider: string | null;
  destinationLabel: string;
  destinationProvider: string | null;
  amountAtomic: string;
  amountLabel: string;
};

export const getWalletMoveOffer = action({
  args: {},
  handler: async (ctx): Promise<WalletMoveOfferView | null> => {
    const offer: WalletMoveOfferBase | null = await ctx.runQuery(
      internal.wallets.walletMoveOfferBaseInternal,
      {},
    );
    if (!offer) {
      return null;
    }

    let rpc;
    try {
      rpc = createSolanaRpcClient();
    } catch {
      return null;
    }

    const ata = deriveRecipientUsdcAta(offer.sourceAddress, USDC_MINT);
    let amountAtomic = 0n;
    try {
      const account = await rpc.getAccountInfo(ata, "confirmed");
      if (account) {
        const decoded = decodeTokenAccount(account.dataBase64);
        if (
          decoded &&
          decoded.mint === USDC_MINT &&
          decoded.owner === offer.sourceAddress
        ) {
          amountAtomic = decoded.amount;
        }
      }
    } catch {
      return null;
    }

    if (amountAtomic <= 0n) {
      return null;
    }

    const amount = cryptoAmountFromAtomicString(amountAtomic.toString(), USDC_DECIMALS);
    return {
      sourceKind: offer.sourceKind,
      sourceProvider: offer.sourceProvider,
      destinationLabel: offer.destinationLabel,
      destinationProvider: offer.destinationProvider,
      amountAtomic: amountAtomic.toString(),
      amountLabel: `${formatCryptoAmountDisplay(amount)} USDC`,
    };
  },
});

export const walletMoveOfferBaseInternal = internalQuery({
  args: {},
  handler: async (ctx) => readWalletMoveOfferBase(ctx),
});

export const createWalletMoveIntentInternal = internalMutation({
  args: {
    idempotencyKey: v.string(),
    amountAtomic: v.int64(),
  },
  handler: async (ctx, args) => {
    const result = await createWalletMoveIntentCore(ctx, {
      idempotencyKey: args.idempotencyKey,
      amountAtomic: args.amountAtomic,
    });
    if (result.created) {
      await ctx.scheduler.runAfter(0, internal.internal.solana.buildExactUsdcTransferAction, {
        intentId: result.intentId,
      });
    }
    return result;
  },
});

/**
 * One You action: move received USDC from the previous row to the new default.
 * Accepts neither address — source and destination are stored rows.
 */
export const createWalletMove = action({
  args: { idempotencyKey: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ intentId: string; created: boolean }> => {
    const offer: WalletMoveOfferBase | null = await ctx.runQuery(
      internal.wallets.walletMoveOfferBaseInternal,
      {},
    );
    if (!offer) {
      throw new Error("NO_PREVIOUS_WALLET");
    }

    let rpc;
    try {
      rpc = createSolanaRpcClient();
    } catch {
      throw new Error("RPC_FAILED");
    }

    const ata = deriveRecipientUsdcAta(offer.sourceAddress, USDC_MINT);
    const account = await rpc.getAccountInfo(ata, "confirmed");
    const decoded = account ? decodeTokenAccount(account.dataBase64) : null;
    const amountAtomic =
      decoded && decoded.mint === USDC_MINT && decoded.owner === offer.sourceAddress
        ? decoded.amount
        : 0n;
    if (amountAtomic <= 0n) {
      throw new Error("AMOUNT_REQUIRED");
    }

    return ctx.runMutation(internal.wallets.createWalletMoveIntentInternal, {
      idempotencyKey: args.idempotencyKey,
      amountAtomic,
    });
  },
});
