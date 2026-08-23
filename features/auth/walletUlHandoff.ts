import type { Id } from "@/convex/_generated/dataModel";
import { CONNECT_COPY } from "./connectCopy";
import { WalletLinkClientError } from "./walletLinkError";
import { buildWalletLinkMessage } from "@/lib/wallet/challenge";
import type { NamedWalletProvider } from "@/lib/wallet/providers";
import { readTelegramSecureStorage } from "@/lib/wallet/telegramSecureStorage";
import {
  applyStoredUniversalLinkBlob,
  beginUniversalLinkSign,
  clearUniversalLinkCallback,
  clearUniversalLinkSession,
  hydratePendingUniversalLink,
  readPendingUniversalLink,
  readUniversalLinkCallback,
  readUniversalLinkPeer,
  readUniversalLinkSecret,
  writeUniversalLinkSecret,
  type UniversalLinkCallback,
} from "@/lib/wallet/universalLinks";
import { waitForUniversalLinkCallback } from "@/lib/wallet/waitForUniversalLinkCallback";

export type WalletUlBlobView =
  | { status: "pending"; ulSecret?: string; ulPending?: string }
  | { status: "error"; errorCode: string; ulSecret?: string; ulPending?: string }
  | {
      status: "ready";
      data: string;
      nonce: string;
      encryptionPublicKey: string;
      ulSecret?: string;
      ulPending?: string;
    };

function hydrateSessionFromView(blob: WalletUlBlobView): void {
  if (blob.ulSecret) {
    writeUniversalLinkSecret(blob.ulSecret);
  }
  if (blob.ulPending) {
    hydratePendingUniversalLink(blob.ulPending);
  }
}

export type WalletUlHandoffDeps = {
  queryCallback: (challengeId: Id<"walletLinkChallenges">) => Promise<WalletUlBlobView | null>;
  consumeCallback: (challengeId: Id<"walletLinkChallenges">) => Promise<void>;
  submitSigned: (input: {
    challengeId: Id<"walletLinkChallenges">;
    signedMessage: string;
    signature: string;
    provider: NamedWalletProvider;
  }) => Promise<void>;
  openUrl: (url: string) => void;
  persistSession?: (
    challengeId: Id<"walletLinkChallenges">,
    secret: string,
    pending: string,
  ) => Promise<{ ok: boolean }>;
  storePaySession?: (input: {
    session: string;
    secret: string;
    peerPublicKey: string;
    dappPublicKey: string;
  }) => Promise<void>;
};

async function persistIfPossible(
  deps: WalletUlHandoffDeps,
  challengeId: Id<"walletLinkChallenges">,
): Promise<void> {
  const secret = readUniversalLinkSecret();
  const pending = readPendingUniversalLink();
  if (!secret || !pending || !deps.persistSession) {
    return;
  }
  await deps.persistSession(challengeId, secret, JSON.stringify(pending));
}

async function readLocalOrConvex(
  challengeId: Id<"walletLinkChallenges">,
  queryCallback: WalletUlHandoffDeps["queryCallback"],
  consumeCallback: WalletUlHandoffDeps["consumeCallback"],
): Promise<UniversalLinkCallback | null> {
  const local = readUniversalLinkCallback();
  if (local && !(local.ok === false && local.errorCode === "consumed")) {
    return local;
  }

  const blob = await queryCallback(challengeId);
  if (!blob) {
    return null;
  }
  hydrateSessionFromView(blob);
  if (blob.status === "pending") {
    return null;
  }
  if (blob.status === "error") {
    return { ok: false, errorCode: blob.errorCode };
  }

  if (!readUniversalLinkSecret()) {
    return { ok: false, errorCode: "UL_SECRET_MISSING" };
  }

  const applied = applyStoredUniversalLinkBlob(blob);
  await consumeCallback(challengeId);
  return applied;
}

export async function completeUniversalLinkAfterConnect(input: {
  deps: WalletUlHandoffDeps;
  challengeId: Id<"walletLinkChallenges">;
  provider: NamedWalletProvider;
}): Promise<void> {
  const pending = readPendingUniversalLink();
  if (!pending?.publicKey || !pending.session) {
    clearUniversalLinkSession();
    throw new WalletLinkClientError("UL_CALLBACK_MISSING", CONNECT_COPY.failedCallback);
  }

  clearUniversalLinkCallback();

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
  await persistIfPossible(input.deps, input.challengeId);
  input.deps.openUrl(sign.url);

  let signed: UniversalLinkCallback;
  try {
    signed = await waitForUniversalLinkCallback({
      read: () =>
        readLocalOrConvex(input.challengeId, input.deps.queryCallback, input.deps.consumeCallback),
      onTimeout: () =>
        new WalletLinkClientError("UL_CALLBACK_MISSING", CONNECT_COPY.failedCallback),
    });
  } catch (error) {
    clearUniversalLinkSession();
    throw error;
  }

  if (!signed.ok || !signed.signature) {
    clearUniversalLinkSession();
    throw new WalletLinkClientError("UL_CALLBACK_MISSING", CONNECT_COPY.failedCallback);
  }

  await input.deps.submitSigned({
    challengeId: pending.challengeId as Id<"walletLinkChallenges">,
    signedMessage,
    signature: signed.signature,
    provider: input.provider,
  });
  const secret = readUniversalLinkSecret();
  const peer = readUniversalLinkPeer() ?? pending.walletEncryptionPublicKey;
  if (input.deps.storePaySession && pending.session && secret && peer) {
    await input.deps.storePaySession({
      session: pending.session,
      secret,
      peerPublicKey: peer,
      dappPublicKey: pending.dappPublicKey,
    });
  }
  clearUniversalLinkSession();
}

/**
 * Cold-start resume after `startapp=ulcb_*`. The original tap's promise is gone.
 * Fail closed if the X25519 secret died with the WebView.
 */
export async function resumeUniversalLinkWallet(input: {
  deps: WalletUlHandoffDeps;
  challengeId: Id<"walletLinkChallenges">;
}): Promise<"linked" | "idle" | "failed"> {
  if (!readUniversalLinkSecret() || !readPendingUniversalLink()) {
    const blob = await input.deps.queryCallback(input.challengeId);
    if (blob) {
      hydrateSessionFromView(blob);
    }
  }
  if (!readUniversalLinkSecret()) {
    const fromSecure = await readTelegramSecureStorage();
    if (fromSecure) {
      writeUniversalLinkSecret(fromSecure);
    }
  }

  const pending = readPendingUniversalLink();
  if (!pending || pending.challengeId !== input.challengeId) {
    return "idle";
  }

  /*
   * An expired challenge is finished, not resumable.
   *
   * `useWalletUlResume` falls back to whatever `readPendingUniversalLink()`
   * still holds when there is no `startapp=ulcb_*`, so a pending record from an
   * abandoned attempt survives in web storage and gets picked up on a later,
   * unrelated launch. Re-opening the wallet for it sends a signMessage link
   * built on a session the wallet has long since dropped, and Phantom answers
   * with a bare internal error — observed in production as
   * `error=-32603` arriving seven seconds after launch, before the person had
   * touched anything.
   *
   * The signature could not be accepted at this point either: `linkExternalWallet`
   * checks the challenge's own expiry. So this clears the dead session instead
   * of asking someone to approve a prompt whose result would be refused.
   */
  if (pending.expiresAt <= Date.now()) {
    clearUniversalLinkSession();
    return "idle";
  }

  if (!readUniversalLinkSecret()) {
    clearUniversalLinkSession();
    return "failed";
  }

  try {
    if (pending.step === "connect" && pending.publicKey && pending.session) {
      await completeUniversalLinkAfterConnect({
        deps: input.deps,
        challengeId: input.challengeId,
        provider: pending.provider,
      });
      return "linked";
    }

    /*
     * Resuming INTO the sign step: re-ask for the signature.
     *
     * The connect leg finished in a WebView that no longer exists — Telegram
     * reopens the Mini App fresh on `startapp=ulcb_*`, so the instance that
     * opened the signMessage link is gone along with whatever it was awaiting.
     * This branch used to fall straight through to `waitForUniversalLinkCallback`
     * and wait 120 seconds for a callback that only arrives if somebody is
     * looking at a wallet prompt. Nobody was: the prompt was never opened in
     * this instance. The person sat on "Waiting for your wallet…" until it
     * timed out, having approved the connect and been asked for nothing since.
     *
     * So: if the signature is already recorded, use it. If it is not, open the
     * wallet again rather than wait for an event that cannot happen.
     */
    if (pending.step === "sign" && pending.publicKey && pending.session) {
      const existing = await readLocalOrConvex(
        input.challengeId,
        input.deps.queryCallback,
        input.deps.consumeCallback,
      );

      if (existing == null) {
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
        await persistIfPossible(input.deps, input.challengeId);
        input.deps.openUrl(sign.url);
      }
    }

    const callback = await waitForUniversalLinkCallback({
      read: () =>
        readLocalOrConvex(input.challengeId, input.deps.queryCallback, input.deps.consumeCallback),
      onTimeout: () =>
        new WalletLinkClientError("UL_CALLBACK_MISSING", CONNECT_COPY.failedCallback),
    });

    if (!callback.ok) {
      clearUniversalLinkSession();
      return "failed";
    }

    if (pending.step === "sign") {
      if (!callback.signature || !pending.publicKey) {
        clearUniversalLinkSession();
        return "failed";
      }
      const signedMessage = buildWalletLinkMessage({
        userId: pending.userId,
        nonce: pending.nonce,
        expiresAt: pending.expiresAt,
        publicKey: pending.publicKey,
      });
      await input.deps.submitSigned({
        challengeId: pending.challengeId as Id<"walletLinkChallenges">,
        signedMessage,
        signature: callback.signature,
        provider: pending.provider,
      });
      const secret = readUniversalLinkSecret();
      const peer = readUniversalLinkPeer() ?? pending.walletEncryptionPublicKey;
      if (input.deps.storePaySession && pending.session && secret && peer) {
        await input.deps.storePaySession({
          session: pending.session,
          secret,
          peerPublicKey: peer,
          dappPublicKey: pending.dappPublicKey,
        });
      }
      clearUniversalLinkSession();
      return "linked";
    }

    await completeUniversalLinkAfterConnect({
      deps: input.deps,
      challengeId: input.challengeId,
      provider: pending.provider,
    });
    return "linked";
  } catch {
    clearUniversalLinkSession();
    return "failed";
  }
}

export { readLocalOrConvex };
