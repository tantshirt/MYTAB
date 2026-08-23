/**
 * Server-issued wallet-link challenge (D-21, H7).
 *
 * The mutation takes the signed message and the signature — never a
 * `solanaAddress` argument. The pubkey is parsed out of the signed bytes
 * after the prefix is shown to match the stored nonce, then the signature
 * is verified against that parsed key. Writing a client-supplied address
 * that merely "agrees" with a signature is the H7 pattern.
 */

import { ed25519 } from "@noble/curves/ed25519.js";
import { base58ToBytes, bytesToBase58 } from "../solana/decodeTransaction";

export const WALLET_LINK_CHALLENGE_TTL_MS = 15 * 60_000;

export const WALLET_LINK_FAILURE = {
  CHALLENGE_NOT_FOUND: "WALLET_LINK_CHALLENGE_NOT_FOUND",
  CHALLENGE_EXPIRED: "WALLET_LINK_CHALLENGE_EXPIRED",
  CHALLENGE_CONSUMED: "WALLET_LINK_CHALLENGE_CONSUMED",
  CHALLENGE_USER_MISMATCH: "WALLET_LINK_CHALLENGE_USER_MISMATCH",
  MESSAGE_MISMATCH: "WALLET_LINK_MESSAGE_MISMATCH",
  SIGNATURE_INVALID: "WALLET_LINK_SIGNATURE_INVALID",
  KEY_INVALID: "WALLET_LINK_KEY_INVALID",
  PROVIDER_INVALID: "WALLET_LINK_PROVIDER_INVALID",
  ADDRESS_OWNED_ELSEWHERE: "WALLET_LINK_ADDRESS_OWNED_ELSEWHERE",
} as const;

export type WalletLinkFailureCode =
  (typeof WALLET_LINK_FAILURE)[keyof typeof WALLET_LINK_FAILURE];

export const WALLET_LINK_MESSAGE_KIND = "mytab:link-wallet";
export const WALLET_LINK_MESSAGE_VERSION = "1";

export type WalletLinkChallengeFields = {
  userId: string;
  nonce: string;
  expiresAt: number;
};

/** The exact prefix the server issued. The signed message appends `key=<base58>`. */
export function buildWalletLinkMessagePrefix(fields: WalletLinkChallengeFields): string {
  return [
    WALLET_LINK_MESSAGE_KIND,
    `v=${WALLET_LINK_MESSAGE_VERSION}`,
    `uid=${fields.userId}`,
    `nonce=${fields.nonce}`,
    `exp=${fields.expiresAt}`,
  ].join("\n");
}

/** Full bytes the wallet signs — prefix plus the signer's own pubkey. */
export function buildWalletLinkMessage(
  fields: WalletLinkChallengeFields & { publicKey: string },
): string {
  return `${buildWalletLinkMessagePrefix(fields)}\nkey=${fields.publicKey}`;
}

export type ParsedWalletLinkMessage = WalletLinkChallengeFields & {
  publicKey: string;
};

export function parseWalletLinkMessage(message: string): ParsedWalletLinkMessage | null {
  const lines = message.split("\n");
  if (lines.length !== 6) {
    return null;
  }
  if (lines[0] !== WALLET_LINK_MESSAGE_KIND) {
    return null;
  }
  const version = readField(lines[1], "v");
  const userId = readField(lines[2], "uid");
  const nonce = readField(lines[3], "nonce");
  const expRaw = readField(lines[4], "exp");
  const publicKey = readField(lines[5], "key");
  if (
    version !== WALLET_LINK_MESSAGE_VERSION ||
    !userId ||
    !nonce ||
    !expRaw ||
    !publicKey
  ) {
    return null;
  }
  const expiresAt = Number(expRaw);
  if (!Number.isInteger(expiresAt) || expiresAt <= 0) {
    return null;
  }
  return { userId, nonce, expiresAt, publicKey };
}

function readField(line: string | undefined, name: string): string | null {
  if (!line) {
    return null;
  }
  const prefix = `${name}=`;
  if (!line.startsWith(prefix)) {
    return null;
  }
  const value = line.slice(prefix.length);
  return value.length > 0 ? value : null;
}

export type VerifyWalletLinkInput = {
  signedMessage: string;
  signatureBase58: string;
  expected: WalletLinkChallengeFields;
};

export type VerifyWalletLinkResult =
  | { ok: true; publicKey: string }
  | { ok: false; failureCode: WalletLinkFailureCode };

/**
 * Prove possession of the key named *inside* the signed message.
 * The expected prefix is reconstructed from the stored challenge — the
 * client cannot pick a different user, nonce, or expiry.
 */
export function verifyWalletLinkSignature(input: VerifyWalletLinkInput): VerifyWalletLinkResult {
  const parsed = parseWalletLinkMessage(input.signedMessage);
  if (!parsed) {
    return { ok: false, failureCode: WALLET_LINK_FAILURE.MESSAGE_MISMATCH };
  }

  const expectedPrefix = buildWalletLinkMessagePrefix(input.expected);
  const actualPrefix = buildWalletLinkMessagePrefix(parsed);
  if (expectedPrefix !== actualPrefix) {
    return { ok: false, failureCode: WALLET_LINK_FAILURE.MESSAGE_MISMATCH };
  }

  const expectedFull = buildWalletLinkMessage({
    ...input.expected,
    publicKey: parsed.publicKey,
  });
  if (expectedFull !== input.signedMessage) {
    return { ok: false, failureCode: WALLET_LINK_FAILURE.MESSAGE_MISMATCH };
  }

  let publicKeyBytes: Uint8Array;
  let signatureBytes: Uint8Array;
  try {
    publicKeyBytes = base58ToBytes(parsed.publicKey);
    signatureBytes = base58ToBytes(input.signatureBase58);
  } catch {
    return { ok: false, failureCode: WALLET_LINK_FAILURE.KEY_INVALID };
  }

  if (publicKeyBytes.length !== 32 || signatureBytes.length !== 64) {
    return { ok: false, failureCode: WALLET_LINK_FAILURE.KEY_INVALID };
  }

  const messageBytes = new TextEncoder().encode(input.signedMessage);
  let valid = false;
  try {
    valid = ed25519.verify(signatureBytes, messageBytes, publicKeyBytes, {
      zip215: false,
    });
  } catch {
    valid = false;
  }

  if (!valid) {
    return { ok: false, failureCode: WALLET_LINK_FAILURE.SIGNATURE_INVALID };
  }

  return { ok: true, publicKey: parsed.publicKey };
}

export function encodeSignatureBase58(signature: Uint8Array): string {
  return bytesToBase58(signature);
}
