/**
 * Universal-link path for the three named wallets (U-10, D-28).
 *
 * Telegram Mini App is a WebView on every OS — Safari Web Extensions do not
 * apply, and MWA is unsupported on iOS. These https:// hosts are load-bearing.
 * HTTPS redirect_link opens the mobile browser, not Telegram; the callback is
 * stashed on Convex and the Mini App reopens via `startapp=ulcb_*`.
 * Return-to-Telegram after sign is unproven on a physical phone. Do not invent
 * a fourth wallet.
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
import {
  buildWalletUlStartParam,
  isWalletUlChallengeId,
  parseWalletUlStartParam,
  readUniversalLinkEncryptionPublicKey,
  WALLET_UL_START_PREFIX,
} from "./universalLinkParams";

export {
  buildWalletUlStartParam,
  isWalletUlChallengeId,
  parseWalletUlStartParam,
  readUniversalLinkEncryptionPublicKey,
  WALLET_UL_START_PREFIX,
};

export const UNIVERSAL_LINK_HOSTS: Record<NamedWalletProvider, string> = {
  phantom: "https://phantom.app/ul/v1",
  solflare: "https://solflare.com/ul/v1",
  backpack: "https://backpack.app/ul/v1",
};

export const UL_PENDING_KEY = "mytab:wallet-ul-pending";
export const UL_CALLBACK_KEY = "mytab:wallet-ul-callback";
export const UL_SECRET_KEY = "mytab:wallet-ul-secret";

export const WALLET_CALLBACK_PATH = "/wallet/callback";

const UL_PEER_KEY = `${UL_SECRET_KEY}:peer`;

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

function webStorageGet(storage: Storage | undefined, key: string): string | null {
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function webStorageSet(storage: Storage | undefined, key: string, value: string): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, value);
  } catch {
    /* private mode — the path will fail closed */
  }
}

function webStorageClear(storage: Storage | undefined, keys: string[]): void {
  if (!storage) {
    return;
  }
  try {
    for (const key of keys) {
      storage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

function sessionStore(): Storage | undefined {
  return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
}

function localStore(): Storage | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

function storeGet(key: string): string | null {
  return webStorageGet(sessionStore(), key) ?? webStorageGet(localStore(), key);
}

function storeSet(key: string, value: string): void {
  webStorageSet(sessionStore(), key, value);
  webStorageSet(localStore(), key, value);
}

function storeClear(...keys: string[]): void {
  webStorageClear(sessionStore(), keys);
  webStorageClear(localStore(), keys);
}

export function readPendingUniversalLink(): UniversalLinkPending | null {
  const raw = storeGet(UL_PENDING_KEY);
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
  storeSet(UL_PENDING_KEY, JSON.stringify(pending));
}

export function clearUniversalLinkSession(): void {
  storeClear(UL_PENDING_KEY, UL_CALLBACK_KEY, UL_SECRET_KEY, UL_PEER_KEY);
}

export function readUniversalLinkCallback(): UniversalLinkCallback | null {
  const raw = storeGet(UL_CALLBACK_KEY);
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
  storeSet(UL_CALLBACK_KEY, JSON.stringify(payload));
}

export function clearUniversalLinkCallback(): void {
  storeClear(UL_CALLBACK_KEY);
}

export function readUniversalLinkSecret(): string | null {
  return storeGet(UL_SECRET_KEY);
}

export function resolveWalletCallbackUrl(origin = "", challengeId?: string): string {
  const base =
    origin || (typeof window !== "undefined" ? window.location.origin : "");
  const url = `${base.replace(/\/$/, "")}${WALLET_CALLBACK_PATH}`;
  if (!challengeId) {
    return url;
  }
  return `${url}?c=${encodeURIComponent(challengeId)}`;
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
  storeSet(UL_SECRET_KEY, encodeKeyBase58(keypair.secretKey));

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
    redirect_link: resolveWalletCallbackUrl(
      new URL(input.appUrl).origin,
      input.challengeId,
    ),
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
  const secretRaw = storeGet(UL_SECRET_KEY);
  const theirPub = input.pending.dappPublicKey;
  if (!secretRaw) {
    throw new Error("UL_SECRET_MISSING");
  }

  const walletPub = storeGet(UL_PEER_KEY);
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
    redirect_link: resolveWalletCallbackUrl(
      new URL(input.appUrl).origin,
      input.pending.challengeId,
    ),
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
  const secretRaw = storeGet(UL_SECRET_KEY);
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
    storeSet(UL_PEER_KEY, input.phantomEncryptionPublicKey);
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

  const encryptionKey = readUniversalLinkEncryptionPublicKey(params);
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

export function applyStoredUniversalLinkBlob(blob: {
  data: string;
  nonce: string;
  encryptionPublicKey: string;
}): UniversalLinkCallback {
  const params = new URLSearchParams({
    data: blob.data,
    nonce: blob.nonce,
    encryption_public_key: blob.encryptionPublicKey,
  });
  const parsed = parseUniversalLinkSearch(`?${params.toString()}`);
  const result = parsed ?? { ok: false as const, errorCode: "UL_CALLBACK_MISSING" };
  writeUniversalLinkCallback(result);
  return result;
}
