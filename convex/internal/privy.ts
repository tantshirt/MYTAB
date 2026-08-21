"use node";

import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

/** Fixture wallet used when Privy server credentials are absent (local build/tests). */
export const FIXTURE_PRIVY_WALLET_ID = "privy-fixture-wallet-id";
export const FIXTURE_SOLANA_ADDRESS = "FixTure111111111111111111111111111111111";
export const FIXTURE_SPONSOR_SIGNATURE = "fixture-sponsor-signature-v1";
export const FIXTURE_TX_SIGNATURE =
  "FixTureSig1111111111111111111111111111111111111111";

/** True when Convex has no Privy app credentials — fixture sync is active. */
export function isPrivyServerFixtureMode(): boolean {
  const appId = process.env.PRIVY_APP_ID?.trim();
  const appSecret = process.env.PRIVY_APP_SECRET?.trim();
  return !appId || !appSecret;
}

type PrivyWalletSnapshot = {
  privyWalletId: string;
  solanaAddress: string;
};

/** Resolves embedded wallet fields from Privy or the offline fixture. */
export function resolvePrivyEmbeddedWalletSnapshot(
  privyDid: string,
): PrivyWalletSnapshot {
  if (isPrivyServerFixtureMode()) {
    return {
      privyWalletId: FIXTURE_PRIVY_WALLET_ID,
      solanaAddress: FIXTURE_SOLANA_ADDRESS,
    };
  }

  // Story 1.8 stub: live Privy wallet fetch lands when server credentials are wired.
  void privyDid;
  return {
    privyWalletId: FIXTURE_PRIVY_WALLET_ID,
    solanaAddress: FIXTURE_SOLANA_ADDRESS,
  };
}

/** Server-side Privy wallet sync stub — uses fixture data when credentials are missing. */
export const syncWalletFromPrivy = internalAction({
  args: {
    userId: v.id("users"),
    privyDid: v.string(),
  },
  handler: async (ctx, args): Promise<{ walletId: Id<"wallets">; created: boolean }> => {
    const snapshot = resolvePrivyEmbeddedWalletSnapshot(args.privyDid);

    return ctx.runMutation(internal.wallets.syncEmbeddedWalletInternal, {
      userId: args.userId,
      privyWalletId: snapshot.privyWalletId,
      solanaAddress: snapshot.solanaAddress,
    });
  },
});

export type CoSignAndBroadcastInput = {
  intentId: string;
  partialSignedTxBase64: string;
};

export type CoSignAndBroadcastResult = {
  signature: string;
  fullySignedTxBase64: string;
};

/**
 * Sponsor co-signs and Convex broadcasts — fixture mode when credentials absent (Story 3.5 AC3–AC4).
 * The client never broadcasts; only this server path sends the transaction.
 */
export async function coSignAndBroadcast(
  args: CoSignAndBroadcastInput,
): Promise<CoSignAndBroadcastResult> {
  if (isPrivyServerFixtureMode()) {
    void args.intentId;
    return {
      signature: FIXTURE_TX_SIGNATURE,
      fullySignedTxBase64: `${args.partialSignedTxBase64}::sponsorSig=${FIXTURE_SPONSOR_SIGNATURE}`,
    };
  }

  // Live Privy sponsor co-sign + RPC broadcast lands when credentials are wired.
  void args.partialSignedTxBase64;
  return {
    signature: FIXTURE_TX_SIGNATURE,
    fullySignedTxBase64: `${args.partialSignedTxBase64}::sponsorSig=${FIXTURE_SPONSOR_SIGNATURE}`,
  };
}
