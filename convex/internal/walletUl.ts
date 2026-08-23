import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { recordWalletUlCallbackCore } from "../lib/walletUlCallback";
import type { Id } from "../_generated/dataModel";
import { isWalletUlChallengeId } from "../../lib/wallet/universalLinkParams";

export const recordCallback = internalMutation({
  args: {
    challengeId: v.string(),
    data: v.optional(v.string()),
    nonce: v.optional(v.string()),
    encryptionPublicKey: v.optional(v.string()),
    errorCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!isWalletUlChallengeId(args.challengeId)) {
      return { ok: false as const };
    }
    return recordWalletUlCallbackCore(ctx, {
      challengeId: args.challengeId as Id<"walletLinkChallenges">,
      data: args.data,
      nonce: args.nonce,
      encryptionPublicKey: args.encryptionPublicKey,
      errorCode: args.errorCode,
    });
  },
});
