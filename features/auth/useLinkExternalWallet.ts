"use client";

import { useConvex, useMutation } from "convex/react";
import { useCallback } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { bytesToBase58 } from "@/lib/solana/decodeTransaction";
import { buildWalletLinkMessage } from "@/lib/wallet/challenge";
import { needsUniversalLinkWallet } from "@/lib/wallet/platform";
import type { ExternalWalletProvider, NamedWalletProvider } from "@/lib/wallet/providers";
import { detectStandardWallets, findNamedWallet } from "@/lib/wallet/standard";
import {
  beginUniversalLinkConnect,
  clearUniversalLinkSession,
} from "@/lib/wallet/universalLinks";
import { waitForUniversalLinkCallback } from "@/lib/wallet/waitForUniversalLinkCallback";
import { CONNECT_COPY } from "./connectCopy";
import { openWalletUrl } from "./openWalletUrl";
import { persistWalletUlSession } from "./persistWalletUlSession";
import { WalletLinkClientError } from "./walletLinkError";
import {
  completeUniversalLinkAfterConnect,
  readLocalOrConvex,
  type WalletUlHandoffDeps,
} from "./walletUlHandoff";

export { WalletLinkClientError } from "./walletLinkError";

/**
 * Issue a challenge, get a signature from wallet-standard or a universal
 * link, then call `linkExternalWallet`. Never sends an address
 * as authorization.
 */
export function useLinkExternalWallet(): {
  linkNamed: (provider: NamedWalletProvider) => Promise<void>;
  linkDetected: (provider: ExternalWalletProvider) => Promise<void>;
} {
  const convex = useConvex();
  const issue = useMutation(api.wallets.issueWalletLinkChallenge);
  const link = useMutation(api.wallets.linkExternalWallet);
  const consume = useMutation(api.wallets.consumeWalletUlCallback);
  const storeSession = useMutation(api.wallets.storeWalletUlSession);
  const storePaySession = useMutation(api.wallets.storeWalletPaySession);

  const submitSigned = useCallback(
    async (input: {
      challengeId: Id<"walletLinkChallenges">;
      signedMessage: string;
      signature: string;
      provider: ExternalWalletProvider;
    }) => {
      await link(input);
    },
    [link],
  );

  const handoffDeps = useCallback((): WalletUlHandoffDeps => {
    return {
      queryCallback: (challengeId) => convex.query(api.wallets.walletUlCallback, { challengeId }),
      consumeCallback: async (challengeId) => {
        await consume({ challengeId });
      },
      submitSigned,
      openUrl: openWalletUrl,
      persistSession: (challengeId, secret, pending) =>
        storeSession({ challengeId, secret, pending }),
      storePaySession: (input) => storePaySession(input).then(() => undefined),
    };
  }, [convex, consume, submitSigned, storeSession, storePaySession]);

  const linkViaStandard = useCallback(
    async (provider: NamedWalletProvider | "standard") => {
      const challenge = await issue({});
      const wallets = detectStandardWallets();
      const wallet =
        provider === "standard"
          ? wallets[0]
          : findNamedWallet(wallets, provider) ?? wallets.find((item) => item.provider === provider);
      if (!wallet) {
        throw new WalletLinkClientError("WALLET_NOT_FOUND", CONNECT_COPY.failed);
      }

      const account = await wallet.connect();
      const signedMessage = buildWalletLinkMessage({
        userId: challenge.userId,
        nonce: challenge.nonce,
        expiresAt: challenge.expiresAt,
        publicKey: account.address,
      });
      const signature = await wallet.signMessage(new TextEncoder().encode(signedMessage));
      await submitSigned({
        challengeId: challenge.challengeId,
        signedMessage,
        signature: bytesToBase58(signature),
        provider: wallet.provider,
      });
    },
    [issue, submitSigned],
  );

  const linkViaUniversalLink = useCallback(
    async (provider: NamedWalletProvider) => {
      const challenge = await issue({});
      const { url } = beginUniversalLinkConnect({
        provider,
        challengeId: challenge.challengeId,
        messagePrefix: challenge.messagePrefix,
        userId: challenge.userId,
        nonce: challenge.nonce,
        expiresAt: challenge.expiresAt,
        appUrl: window.location.origin,
      });
      await persistWalletUlSession({
        challengeId: challenge.challengeId,
        store: (args) => storeSession(args),
      });
      openWalletUrl(url);

      try {
        const first = await waitForUniversalLinkCallback({
          read: () =>
            readLocalOrConvex(challenge.challengeId, handoffDeps().queryCallback, handoffDeps().consumeCallback),
          onTimeout: () =>
            new WalletLinkClientError("UL_CALLBACK_MISSING", CONNECT_COPY.failedCallback),
        });
        if (!first.ok) {
          clearUniversalLinkSession();
          throw new WalletLinkClientError("UL_CALLBACK_MISSING", CONNECT_COPY.failedCallback);
        }
        await completeUniversalLinkAfterConnect({
          deps: handoffDeps(),
          challengeId: challenge.challengeId,
          provider,
        });
      } catch (error) {
        clearUniversalLinkSession();
        throw error;
      }
    },
    [issue, handoffDeps, storeSession],
  );

  const linkNamed = useCallback(
    async (provider: NamedWalletProvider) => {
      const wallets = detectStandardWallets();
      const injected = findNamedWallet(wallets, provider);
      if (injected) {
        await linkViaStandard(provider);
        return;
      }
      if (needsUniversalLinkWallet()) {
        await linkViaUniversalLink(provider);
        return;
      }
      throw new WalletLinkClientError("WALLET_NOT_FOUND", CONNECT_COPY.failed);
    },
    [linkViaStandard, linkViaUniversalLink],
  );

  const linkDetected = useCallback(
    async (provider: ExternalWalletProvider) => {
      if (provider === "standard") {
        await linkViaStandard("standard");
        return;
      }
      await linkNamed(provider);
    },
    [linkNamed, linkViaStandard],
  );

  return { linkNamed, linkDetected };
}
