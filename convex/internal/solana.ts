"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  buildExactUsdcTransfer,
  isSolanaFixtureMode,
} from "../../lib/solana";
import { ATA_RENT_LAMPORTS } from "../../lib/solana/constants";
import {
  ClusterConfigError,
  assertClusterRpcAgreement,
} from "../../lib/solana/cluster";
import { resolveSponsorWalletAddress } from "../../lib/solana/fixture";
import { SETTLEMENT_STATUS } from "../lib/settlementState";
import { validateBeforeClientExposure } from "../../lib/solana/validateTransactionMessage";
import { buildValidationContext } from "./solanaPolicy";
import {
  SolanaRpcError,
  createSolanaRpcClient,
  type SolanaRpcClient,
} from "../../lib/solana/rpc";
import {
  SPL_TOKEN_ACCOUNT_SIZE,
  classifyRecipientAta,
  deriveRecipientUsdcAta,
} from "../../lib/solana/tokenAccount";

type BuildLogFields = {
  intentId: string;
  userId: string;
  statusTransition?: string;
  durationMs?: number;
  failureCode?: string;
};

type BuildActionResult =
  | { ok: false; failureCode: string }
  | { ok: true; status: string; messageHash: string };

function logBuildEvent(fields: BuildLogFields): void {
  console.log(JSON.stringify(fields));
}

export const SOLANA_BUILD_FAILURE = {
  RECIPIENT_ATA_UNKNOWN: "RECIPIENT_ATA_UNKNOWN",
  RECIPIENT_ATA_UNUSABLE: "RECIPIENT_ATA_UNUSABLE",
  BLOCKHASH_UNAVAILABLE: "BLOCKHASH_UNAVAILABLE",
  /**
   * The chain's rent-exempt minimum for a token account is higher than the
   * value the sponsor policy prices ATA creation at. Fail closed: proceeding
   * would reserve less than the sponsor is actually about to spend.
   */
  ATA_RENT_ABOVE_POLICY: "ATA_RENT_ABOVE_POLICY",
} as const;

export type ChainPreconditions = {
  blockhash: string;
  lastValidBlockHeight: number;
  recipientAtaExists: boolean;
  recipientAta: string;
  ataRentLamports: number;
};

/**
 * Reads everything about the chain the build depends on, in one place.
 *
 * Three facts, none of which may be guessed:
 *
 *  - a **real recent blockhash** and the block height past which it can no
 *    longer land. `finalized` commitment, because a blockhash from a slot that
 *    later forks away produces a transaction the user signs and the cluster
 *    then refuses;
 *  - whether the **recipient's ATA exists**, which decides whether the sponsor
 *    pays rent (see `lib/solana/tokenAccount.ts` for why guessing costs money
 *    either way);
 *  - the **actual rent-exempt minimum**, so the sponsor reservation matches what
 *    the sponsor will really be charged rather than a constant that drifted.
 */
export async function readChainPreconditions(input: {
  recipientAddress: string;
  usdcMint: string;
  rpc: SolanaRpcClient;
}): Promise<
  | { ok: true; value: ChainPreconditions }
  | { ok: false; failureCode: string; detail?: string }
> {
  const recipientAta = deriveRecipientUsdcAta(input.recipientAddress, input.usdcMint);

  let latest: Awaited<ReturnType<SolanaRpcClient["getLatestBlockhash"]>>;
  let account: Awaited<ReturnType<SolanaRpcClient["getAccountInfo"]>>;
  try {
    // Sequential, not parallel: the ATA answer must not be read from a slot
    // older than the blockhash we are about to commit to.
    latest = await input.rpc.getLatestBlockhash("finalized");
    account = await input.rpc.getAccountInfo(recipientAta, "finalized");
  } catch (error) {
    const rpcError = error instanceof SolanaRpcError ? error : null;
    return {
      ok: false,
      failureCode: rpcError?.code ?? SOLANA_BUILD_FAILURE.BLOCKHASH_UNAVAILABLE,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const status = classifyRecipientAta({
    address: recipientAta,
    account,
    expectedOwner: input.recipientAddress,
    expectedMint: input.usdcMint,
  });
  if (!status.ok) {
    return { ok: false, failureCode: status.failureCode, detail: status.detail };
  }

  let ataRentLamports = ATA_RENT_LAMPORTS;
  if (!status.exists) {
    let rent: bigint;
    try {
      rent = await input.rpc.getMinimumBalanceForRentExemption(
        SPL_TOKEN_ACCOUNT_SIZE,
        "finalized",
      );
    } catch (error) {
      const rpcError = error instanceof SolanaRpcError ? error : null;
      return {
        ok: false,
        failureCode: rpcError?.code ?? SOLANA_BUILD_FAILURE.BLOCKHASH_UNAVAILABLE,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    // The sponsor gate prices ATA creation at the ATA_RENT_LAMPORTS constant.
    // If the chain now wants more, the gate's exposure figure understates the
    // real debit, and under-reserving sponsor funds is exactly the failure the
    // caps exist to prevent. Refuse rather than quietly under-reserve.
    if (rent > BigInt(ATA_RENT_LAMPORTS)) {
      return {
        ok: false,
        failureCode: SOLANA_BUILD_FAILURE.ATA_RENT_ABOVE_POLICY,
        detail: `chain rent ${rent} > policy ${ATA_RENT_LAMPORTS}`,
      };
    }
    ataRentLamports = Number(rent);
  }

  return {
    ok: true,
    value: {
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
      recipientAtaExists: status.exists,
      recipientAta,
      ataRentLamports,
    },
  };
}

/**
 * Builds an exact USDC transfer with the sponsor as fee payer (Story 3.3).
 *
 * Live by default. Every chain fact — blockhash, expiry height, recipient ATA
 * existence, rent — comes from the configured RPC. The fixture path is
 * reachable only through `assertFixturePathAllowed`, which refuses on any real
 * deployment including devnet.
 */
export const buildExactUsdcTransferAction = internalAction({
  args: {
    intentId: v.id("settlementIntents"),
    /**
     * Test/fixture override only. On a live run the answer is read from the
     * chain and this argument is ignored, because a caller-supplied answer to a
     * question about chain state is not an answer.
     */
    recipientAtaExists: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<BuildActionResult> => {
    const startedAt = Date.now();
    const intent = await ctx.runQuery(internal.settlements.getIntentInternal, {
      intentId: args.intentId,
    });

    if (!intent || intent.status !== SETTLEMENT_STATUS.CREATED) {
      return { ok: false, failureCode: "INVALID_INTENT_STATUS" };
    }

    await ctx.runMutation(internal.settlements.markQuotingInternal, {
      intentId: args.intentId,
    });

    const wallet = await ctx.runQuery(internal.settlements.getWalletInternal, {
      walletId: intent.walletId,
    });

    if (!wallet) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: "PAYER_WALLET_REQUIRED",
        releaseReservation: false,
      });
      return { ok: false, failureCode: "PAYER_WALLET_REQUIRED" };
    }

    const fixtureMode = isSolanaFixtureMode();

    // Startup assertion for every live run: the configured cluster and the
    // configured RPC endpoint must demonstrably agree. Without this a devnet
    // mint could be validated here and the transaction broadcast to mainnet.
    if (!fixtureMode) {
      try {
        assertClusterRpcAgreement();
      } catch (error) {
        const failureCode =
          error instanceof ClusterConfigError ? error.code : "SOLANA_CLUSTER_UNKNOWN";
        await ctx.runMutation(internal.settlements.markFailedInternal, {
          intentId: args.intentId,
          failureCode,
          releaseReservation: false,
        });
        return { ok: false, failureCode };
      }
    }

    const sponsorAddress = resolveSponsorWalletAddress();

    // ---- chain preconditions ------------------------------------------------
    let chain: ChainPreconditions | null = null;
    if (!fixtureMode) {
      const preconditions = await readChainPreconditions({
        recipientAddress: intent.recipientAddress,
        usdcMint: intent.outputMint,
        rpc: createSolanaRpcClient(),
      });
      if (!preconditions.ok) {
        await ctx.runMutation(internal.settlements.markFailedInternal, {
          intentId: args.intentId,
          failureCode: preconditions.failureCode,
          releaseReservation: false,
        });
        logBuildEvent({
          intentId: args.intentId,
          userId: intent.userId,
          statusTransition: `${SETTLEMENT_STATUS.QUOTING}->${SETTLEMENT_STATUS.FAILED}`,
          durationMs: Date.now() - startedAt,
          failureCode: preconditions.failureCode,
        });
        return { ok: false, failureCode: preconditions.failureCode };
      }
      chain = preconditions.value;
    }

    // Fixture builds keep the explicit-answer requirement: even there, a build
    // with no answer about the recipient's ATA is a build on a guess.
    const recipientAtaExists = chain
      ? chain.recipientAtaExists
      : (args.recipientAtaExists ?? true);

    const built = buildExactUsdcTransfer({
      payerAddress: wallet.solanaAddress,
      recipientAddress: intent.recipientAddress,
      sponsorAddress,
      amountAtomic: intent.minimumOutputAtomic,
      tipId: intent.tipId,
      obligationId: intent.obligationId,
      billSnapshotHash: intent.billSnapshotHash,
      recipientAtaExists,
      ...(chain
        ? {
            blockhash: chain.blockhash,
            lastValidBlockHeight: chain.lastValidBlockHeight,
            ataRentLamports: chain.ataRentLamports,
          }
        : {}),
    });

    if (built.ataCreates > 1) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: "ATA_LIMIT_EXCEEDED",
        releaseReservation: false,
      });
      logBuildEvent({
        intentId: args.intentId,
        userId: intent.userId,
        statusTransition: `${SETTLEMENT_STATUS.QUOTING}->${SETTLEMENT_STATUS.FAILED}`,
        durationMs: Date.now() - startedAt,
        failureCode: "ATA_LIMIT_EXCEEDED",
      });
      return { ok: false, failureCode: "ATA_LIMIT_EXCEEDED" };
    }

    const tab = intent.tabId
      ? await ctx.runQuery(internal.settlements.getTabInternal, { tabId: intent.tabId })
      : null;

    const validation = validateBeforeClientExposure(built.serializedBase64, {
      ...buildValidationContext(intent, wallet.solanaAddress, sponsorAddress, {
        blockhash: built.blockhash,
        lastValidBlockHeight: built.lastValidBlockHeight,
        status: SETTLEMENT_STATUS.QUOTING,
      }),
      routingKind: "exact_usdc",
      intentId: args.intentId,
      currentTabRevision: tab?.lockedRevision ?? tab?.revision,
      nowMs: startedAt,
      expectedMemo: built.expectedMemo,
      intent: {
        payerAddress: wallet.solanaAddress,
        recipientAddress: intent.recipientAddress,
        inputMint: intent.inputMint,
        outputMint: intent.outputMint,
        targetOutputAtomic: intent.minimumOutputAtomic.toString(),
        maxInputAtomic: intent.maximumInputAtomic.toString(),
        minimumOutputAtomic: intent.minimumOutputAtomic.toString(),
        status: SETTLEMENT_STATUS.QUOTING,
        lockedRevision: intent.tabRevision,
        expiresAt: intent.expiresAt,
      },
    });

    if (!validation.ok) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: validation.code,
        releaseReservation: false,
      });
      logBuildEvent({
        intentId: args.intentId,
        userId: intent.userId,
        statusTransition: `${SETTLEMENT_STATUS.QUOTING}->${SETTLEMENT_STATUS.FAILED}`,
        durationMs: Date.now() - startedAt,
        failureCode: validation.code,
      });
      return { ok: false, failureCode: validation.code };
    }

    const ready = await ctx.runMutation(internal.settlements.applyQuotedTransactionInternal, {
      intentId: args.intentId,
      serializedMessage: built.serializedBase64,
      messageHash: built.messageHash,
      blockhash: built.blockhash,
      lastValidBlockHeight: built.lastValidBlockHeight,
      sponsorExposureLamports: BigInt(built.sponsorExposureLamports),
    });

    if (!ready.ok) {
      return { ok: false, failureCode: ready.failureCode };
    }

    logBuildEvent({
      intentId: args.intentId,
      userId: intent.userId,
      statusTransition: `${SETTLEMENT_STATUS.QUOTING}->${SETTLEMENT_STATUS.READY_FOR_SIGNATURE}`,
      durationMs: Date.now() - startedAt,
    });

    return {
      ok: true,
      status: ready.status,
      messageHash: built.messageHash,
    };
  },
});
