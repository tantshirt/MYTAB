"use client";

import { useConvex } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { useCallback } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEmbeddedWalletSigner } from "@/features/auth/EmbeddedWalletSigner";
import { useLiveMutation } from "@/features/convex/useConvexData";
import { persistWalletUlSession } from "@/features/auth/persistWalletUlSession";
import { bytesToBase58, base58ToBytes } from "@/lib/solana/decodeTransaction";
import { needsUniversalLinkWallet } from "@/lib/wallet/platform";
import type { NamedWalletProvider } from "@/lib/wallet/providers";
import { detectStandardWallets, findNamedWallet } from "@/lib/wallet/standard";
import {
  beginUniversalLinkSignTransaction,
  writePendingUniversalLink,
  writeUniversalLinkSecret,
} from "@/lib/wallet/universalLinks";
import { waitForUniversalLinkCallback } from "@/lib/wallet/waitForUniversalLinkCallback";
import { bytesToBase64 } from "@/lib/crypto/convexCrypto";
import { openWalletUrl } from "@/features/auth/openWalletUrl";
import {
  readLocalOrConvex,
  type WalletUlHandoffDeps,
} from "@/features/auth/walletUlHandoff";
import { submitExternalUserSignature } from "./submitExternalUserSignature";

function signerForProvider(
  provider: string | null,
): ((transaction: Uint8Array) => Promise<Uint8Array>) | null {
  const wallets = detectStandardWallets();
  if (provider === "phantom" || provider === "solflare" || provider === "backpack") {
    return findNamedWallet(wallets, provider as NamedWalletProvider)?.signTransaction ?? null;
  }
  return wallets[0]?.signTransaction ?? null;
}

function decodeBase64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Both payer kinds reach `recordUserSigned`. The sponsor path is not a
 * substitute for the user's signature.
 */
export function usePayObligation(): {
  pay: (input: {
    intentId: string;
    walletKind: "embedded" | "external" | null;
    walletProvider: string | null;
    preparedTxBase64: string | null;
  }) => Promise<{ ok: true } | { ok: false }>;
} {
  const recordUserSigned = useLiveMutation(api.settlements.recordUserSigned);
  const signEmbedded = useEmbeddedWalletSigner();
  const convex = useConvex() as ConvexReactClient | undefined;
  const issue = useLiveMutation(api.wallets.issueWalletLinkChallenge);
  const consume = useLiveMutation(api.wallets.consumeWalletUlCallback);
  const storeSession = useLiveMutation(api.wallets.storeWalletUlSession);

  const submit = useCallback(
    (intentId: string, preparedTxBase64: string, signTransaction: (tx: Uint8Array) => Promise<Uint8Array>) => {
      if (!recordUserSigned) {
        return Promise.reject(new Error("UNAVAILABLE"));
      }
      return submitExternalUserSignature({
        intentId,
        preparedTxBase64,
        signTransaction,
        recordUserSigned: (args) =>
          recordUserSigned({
            intentId: args.intentId as Id<"settlementIntents">,
            partialSignedTxBase64: args.partialSignedTxBase64,
          }),
      });
    },
    [recordUserSigned],
  );

  const payViaUniversalLink = useCallback(
    async (input: {
      intentId: string;
      preparedTxBase64: string;
      provider: NamedWalletProvider;
    }) => {
      if (!convex || !issue || !consume || !storeSession) {
        throw new Error("UNAVAILABLE");
      }
      const paySession = await convex.query(api.wallets.walletPaySession, {});
      if (!paySession) {
        throw new Error("UL_SESSION_MISSING");
      }

      writeUniversalLinkSecret(paySession.secret);
      const challenge = await issue({});
      writePendingUniversalLink({
        provider: input.provider,
        step: "signTx",
        challengeId: challenge.challengeId,
        messagePrefix: challenge.messagePrefix,
        userId: challenge.userId,
        nonce: challenge.nonce,
        expiresAt: challenge.expiresAt,
        issuedAt: Date.now(),
        dappPublicKey: paySession.dappPublicKey,
        session: paySession.session,
        walletEncryptionPublicKey: paySession.peerPublicKey,
      });

      const opened = beginUniversalLinkSignTransaction({
        pending: {
          provider: input.provider,
          step: "signTx",
          challengeId: challenge.challengeId,
          messagePrefix: challenge.messagePrefix,
          userId: challenge.userId,
          nonce: challenge.nonce,
          expiresAt: challenge.expiresAt,
          issuedAt: Date.now(),
          dappPublicKey: paySession.dappPublicKey,
          session: paySession.session,
          walletEncryptionPublicKey: paySession.peerPublicKey,
        },
        session: paySession.session,
        transactionBase58: bytesToBase58(decodeBase64ToBytes(input.preparedTxBase64)),
        appUrl: window.location.origin,
      });
      await persistWalletUlSession({
        challengeId: challenge.challengeId,
        store: (args) => storeSession(args),
      });
      openWalletUrl(opened.url);

      const deps: Pick<WalletUlHandoffDeps, "queryCallback" | "consumeCallback"> = {
        queryCallback: (id) => convex.query(api.wallets.walletUlCallback, { challengeId: id }),
        consumeCallback: async (id) => {
          await consume({ challengeId: id });
        },
      };

      const signed = await waitForUniversalLinkCallback({
        read: () => readLocalOrConvex(challenge.challengeId, deps.queryCallback, deps.consumeCallback),
        onTimeout: () => new Error("UL_CALLBACK_MISSING"),
      });
      if (!signed.ok || !signed.signature) {
        throw new Error("UL_CALLBACK_MISSING");
      }

      if (!recordUserSigned) {
        throw new Error("UNAVAILABLE");
      }

      let txBytes: Uint8Array;
      try {
        txBytes = base58ToBytes(signed.signature);
      } catch {
        txBytes = decodeBase64ToBytes(signed.signature);
      }

      await recordUserSigned({
        intentId: input.intentId as Id<"settlementIntents">,
        partialSignedTxBase64: bytesToBase64(txBytes),
      });
    },
    [consume, convex, issue, recordUserSigned, storeSession],
  );

  const pay = useCallback(
    async (input: {
      intentId: string;
      walletKind: "embedded" | "external" | null;
      walletProvider: string | null;
      preparedTxBase64: string | null;
    }): Promise<{ ok: true } | { ok: false }> => {
      if (!input.intentId || !input.preparedTxBase64 || !recordUserSigned) {
        return { ok: false };
      }

      try {
        if (input.walletKind === "embedded") {
          if (!signEmbedded) {
            return { ok: false };
          }
          await submit(input.intentId, input.preparedTxBase64, signEmbedded);
          return { ok: true };
        }

        if (input.walletKind === "external") {
          const injected = signerForProvider(input.walletProvider);
          if (injected) {
            await submit(input.intentId, input.preparedTxBase64, injected);
            return { ok: true };
          }
          if (
            needsUniversalLinkWallet() &&
            (input.walletProvider === "phantom" ||
              input.walletProvider === "solflare" ||
              input.walletProvider === "backpack")
          ) {
            await payViaUniversalLink({
              intentId: input.intentId,
              preparedTxBase64: input.preparedTxBase64,
              provider: input.walletProvider,
            });
            return { ok: true };
          }
          return { ok: false };
        }

        return { ok: false };
      } catch {
        return { ok: false };
      }
    },
    [payViaUniversalLink, recordUserSigned, signEmbedded, submit],
  );

  return { pay };
}
