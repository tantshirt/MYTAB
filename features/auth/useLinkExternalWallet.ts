"use client";

import { useMutation } from "convex/react";
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
  beginUniversalLinkSign,
  clearUniversalLinkSession,
  parseUniversalLinkSearch,
  readPendingUniversalLink,
  readUniversalLinkCallback,
  writeUniversalLinkCallback,
} from "@/lib/wallet/universalLinks";
import { CONNECT_COPY } from "./connectCopy";

export class WalletLinkClientError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "WalletLinkClientError";
  }
}

function openExternalUrl(url: string): void {
  const webApp = window.Telegram?.WebApp as { openLink?: (href: string) => void } | undefined;
  if (typeof webApp?.openLink === "function") {
    webApp.openLink(url);
    return;
  }
  window.location.assign(url);
}

async function waitForUniversalLinkCallback(timeoutMs = 120_000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (readUniversalLinkCallback()) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new WalletLinkClientError("UL_CALLBACK_MISSING", CONNECT_COPY.failedCallback));
        return;
      }
      window.setTimeout(tick, 400);
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (!readUniversalLinkCallback()) {
        reject(new WalletLinkClientError("UL_CALLBACK_MISSING", CONNECT_COPY.failedCallback));
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    tick();
    window.setTimeout(() => {
      document.removeEventListener("visibilitychange", onVisible);
    }, timeoutMs + 50);
  });
}

/**
 * Issue a challenge, get a signature from wallet-standard or an iOS
 * universal link, then call `linkExternalWallet`. Never sends an address
 * as authorization.
 */
export function useLinkExternalWallet(): {
  linkNamed: (provider: NamedWalletProvider) => Promise<void>;
  linkDetected: (provider: ExternalWalletProvider) => Promise<void>;
} {
  const issue = useMutation(api.wallets.issueWalletLinkChallenge);
  const link = useMutation(api.wallets.linkExternalWallet);

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
      openExternalUrl(url);

      try {
        await waitForUniversalLinkCallback();
      } catch (error) {
        clearUniversalLinkSession();
        throw error;
      }

      const callback = readUniversalLinkCallback();
      const pending = readPendingUniversalLink();
      if (!callback?.ok || !pending?.publicKey || !pending.session) {
        clearUniversalLinkSession();
        throw new WalletLinkClientError("UL_CALLBACK_MISSING", CONNECT_COPY.failedCallback);
      }

      writeUniversalLinkCallback({ ok: false, errorCode: "consumed" });

      const signedMessage = buildWalletLinkMessage({
        userId: pending.userId,
        nonce: pending.nonce,
        expiresAt: pending.expiresAt,
        publicKey: pending.publicKey,
      });

      const sign = beginUniversalLinkSign({
        pending,
        session: pending.session,
        message: signedMessage,
        appUrl: window.location.origin,
      });
      openExternalUrl(sign.url);

      try {
        await waitForUniversalLinkCallback();
      } catch (error) {
        clearUniversalLinkSession();
        throw error;
      }

      const signed = readUniversalLinkCallback();
      if (!signed?.ok || !signed.signature) {
        clearUniversalLinkSession();
        throw new WalletLinkClientError("UL_CALLBACK_MISSING", CONNECT_COPY.failedCallback);
      }

      await submitSigned({
        challengeId: pending.challengeId as Id<"walletLinkChallenges">,
        signedMessage,
        signature: signed.signature,
        provider,
      });
      clearUniversalLinkSession();
    },
    [issue, submitSigned],
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
