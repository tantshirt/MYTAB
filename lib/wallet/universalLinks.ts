/**
 * iOS universal-link path for the three named wallets (U-10, D-28).
 *
 * Telegram Mini App is a WebView — Safari Web Extensions do not apply, and
 * MWA is unsupported on every iOS surface. These https:// hosts are
 * load-bearing. Return-to-Telegram after sign is unproven: if the callback
 * payload is missing, callers must fail closed. Do not invent a fourth wallet.
 */

import { bytesToBase58 } from "../solana/decodeTransaction";
import {
  boxAfter,
  boxBefore,
  boxOpenAfter,
  decodeKeyBase58,
  encodeKeyBase58,
  generateX25519Keypair,
} from "./deeplinkBox";
import type { NamedWalletProvider } from "./providers";

export const UNIVERSAL_LINK_HOSTS: Record<NamedWalletProvider, string> = {
  phantom: "https://phantom.app/ul/v1",
  solflare: "https://solflare.com/ul/v1",
  backpack: "https://backpack.app/ul/v1",
};

export const UL_PENDING_KEY = "mytab:wallet-ul-pending";
export const UL_CALLBACK_KEY = "mytab:wallet-ul-callback";
export const UL_SECRET_KEY = "mytab:wallet-ul-secret";

export const WALLET_CALLBACK_PATH = "/wallet/callback";

export type UniversalLinkPending = {
  provider: NamedWalletProvider;
  step: "connect" | "sign";
  challengeId: string;
  messagePrefix: string;
  userId: string;
  nonce: string;
  expiresAt: number;
  issuedAt: number;
  dappPublicKey: string;
  session?: string;
  publicKey?: string;
};

export type UniversalLinkCallback =
  | {
      ok: true;
      provider: NamedWalletProvider;
      publicKey?: string;
      session?: string;
      signature?: string;
    }
  | { ok: false; errorCode: string };

function sessionGet(key: string): string | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionSet(key: string, value: string): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* private mode — the path will fail closed */
  }
}

function sessionClear(...keys: string[]): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    for (const key of keys) {
      sessionStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

export function readPendingUniversalLink(): UniversalLinkPending | null {
  const raw = sessionGet(UL_PENDING_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as UniversalLinkPending;
  } catch {
    return null;
  }
}

export function writePendingUniversalLink(pending: UniversalLinkPending): void {
  sessionSet(UL_PENDING_KEY, JSON.stringify(pending));
}

export function clearUniversalLinkSession(): void {
  sessionClear(UL_PENDING_KEY, UL_CALLBACK_KEY, UL_SECRET_KEY);
}

export function readUniversalLinkCallback(): UniversalLinkCallback | null {
  const raw = sessionGet(UL_CALLBACK_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as UniversalLinkCallback;
  } catch {
    return null;
  }
}

export function writeUniversalLinkCallback(payload: UniversalLinkCallback): void {
  sessionSet(UL_CALLBACK_KEY, JSON.stringify(payload));
}

export function resolveWalletCallbackUrl(origin = ""): string {
  const base =
    origin || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base.replace(/\/$/, "")}${WALLET_CALLBACK_PATH}`;
}

function randomNonce24(): Uint8Array {
  const nonce = new Uint8Array(24);
  crypto.getRandomValues(nonce);
  return nonce;
}

export function beginUniversalLinkConnect(input: {
  provider: NamedWalletProvider;
  challengeId: string;
  messagePrefix: string;
  userId: string;
  nonce: string;
  expiresAt: number;
  appUrl: string;
  cluster?: "mainnet-beta" | "devnet";
}): { url: string; pending: UniversalLinkPending } {
  const keypair = generateX25519Keypair();
  sessionSet(UL_SECRET_KEY, encodeKeyBase58(keypair.secretKey));

  const dappPublicKey = encodeKeyBase58(keypair.publicKey);
  const pending: UniversalLinkPending = {
    provider: input.provider,
    step: "connect",
    challengeId: input.challengeId,
    messagePrefix: input.messagePrefix,
    userId: input.userId,
    nonce: input.nonce,
    expiresAt: input.expiresAt,
    issuedAt: Date.now(),
    dappPublicKey,
  };
  writePendingUniversalLink(pending);

  const params = new URLSearchParams({
    app_url: input.appUrl,
    dapp_encryption_public_key: dappPublicKey,
    redirect_link: resolveWalletCallbackUrl(new URL(input.appUrl).origin),
    cluster: input.cluster ?? "mainnet-beta",
  });

  return {
    url: `${UNIVERSAL_LINK_HOSTS[input.provider]}/connect?${params.toString()}`,
    pending,
  };
}

export function beginUniversalLinkSign(input: {
  pending: UniversalLinkPending;
  session: string;
  message: string;
  appUrl: string;
}): { url: string } {
  const secretRaw = sessionGet(UL_SECRET_KEY);
  const theirPub = input.pending.dappPublicKey;
  if (!secretRaw) {
    throw new Error("UL_SECRET_MISSING");
  }

  // The wallet's encryption pubkey was stored on the pending row after connect.
  const walletEncryptionKey = input.pending.dappPublicKey;
  void walletEncryptionKey;

  const walletPub = sessionGet(`${UL_SECRET_KEY}:peer`);
  if (!walletPub) {
    throw new Error("UL_PEER_MISSING");
  }

  const shared = boxBefore(decodeKeyBase58(walletPub), decodeKeyBase58(secretRaw));
  const nonce = randomNonce24();
  const payload = boxAfter(
    new TextEncoder().encode(
      JSON.stringify({
        session: input.session,
        message: bytesToBase58(new TextEncoder().encode(input.message)),
        display: "utf8",
      }),
    ),
    nonce,
    shared,
  );

  writePendingUniversalLink({ ...input.pending, step: "sign", session: input.session });

  const params = new URLSearchParams({
    dapp_encryption_public_key: theirPub,
    nonce: bytesToBase58(nonce),
    redirect_link: resolveWalletCallbackUrl(new URL(input.appUrl).origin),
    payload: bytesToBase58(payload),
  });

  return {
    url: `${UNIVERSAL_LINK_HOSTS[input.pending.provider]}/signMessage?${params.toString()}`,
  };
}

export type DecryptedConnectPayload = {
  public_key: string;
  session: string;
};

export type DecryptedSignPayload = {
  signature: string;
};

export function decryptUniversalLinkData(input: {
  data: string;
  nonce: string;
  phantomEncryptionPublicKey: string;
}): Record<string, unknown> | null {
  const secretRaw = sessionGet(UL_SECRET_KEY);
  if (!secretRaw) {
    return null;
  }
  try {
    const shared = boxBefore(
      decodeKeyBase58(input.phantomEncryptionPublicKey),
      decodeKeyBase58(secretRaw),
    );
    const opened = boxOpenAfter(
      decodeKeyBase58(input.data),
      decodeKeyBase58(input.nonce),
      shared,
    );
    if (!opened) {
      return null;
    }
    sessionSet(`${UL_SECRET_KEY}:peer`, input.phantomEncryptionPublicKey);
    return JSON.parse(new TextDecoder().decode(opened)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseUniversalLinkSearch(search: string): UniversalLinkCallback | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const errorCode = params.get("errorCode") ?? params.get("errorMessage");
  if (errorCode) {
    return { ok: false, errorCode };
  }

  const pending = readPendingUniversalLink();
  if (!pending) {
    return { ok: false, errorCode: "UL_CALLBACK_ORPHAN" };
  }

  const encryptionKey =
    params.get("phantom_encryption_public_key") ??
    params.get("solflare_encryption_public_key") ??
    params.get("encryption_public_key");
  const nonce = params.get("nonce");
  const data = params.get("data");

  if (!encryptionKey || !nonce || !data) {
    return { ok: false, errorCode: "UL_CALLBACK_MISSING" };
  }

  const decrypted = decryptUniversalLinkData({
    data,
    nonce,
    phantomEncryptionPublicKey: encryptionKey,
  });
  if (!decrypted) {
    return { ok: false, errorCode: "UL_CALLBACK_DECRYPT_FAILED" };
  }

  if (pending.step === "connect") {
    const publicKey = typeof decrypted.public_key === "string" ? decrypted.public_key : undefined;
    const session = typeof decrypted.session === "string" ? decrypted.session : undefined;
    if (!publicKey || !session) {
      return { ok: false, errorCode: "UL_CALLBACK_MISSING" };
    }
    writePendingUniversalLink({ ...pending, publicKey, session });
    return { ok: true, provider: pending.provider, publicKey, session };
  }

  const signature = typeof decrypted.signature === "string" ? decrypted.signature : undefined;
  if (!signature) {
    return { ok: false, errorCode: "UL_CALLBACK_MISSING" };
  }
  return { ok: true, provider: pending.provider, signature, publicKey: pending.publicKey };
}
