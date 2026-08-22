/**
 * SPL token-account decoding and the recipient-ATA existence question.
 *
 * `buildExactUsdcTransfer` needs one bit of chain state before it can build:
 * does the recipient's associated token account already exist? Guessing either
 * way is a real loss.
 *
 *  - Guess "exists" when it does not: the transfer targets an uninitialised
 *    account and the whole transaction fails on chain after the sponsor has
 *    already paid the fee.
 *  - Guess "does not exist" when it does: the sponsor is charged rent for an
 *    account that is already there, and the ATA-create instruction makes the
 *    transaction fail anyway.
 *
 * So the answer comes from the chain, and an account that exists at the ATA
 * address but is not a healthy, initialised, correctly-owned USDC account for
 * this recipient is a rejection rather than a "close enough".
 */

import { base64ToBytes, bytesToBase58 } from "./decodeTransaction";
import { deriveAssociatedTokenAddress } from "./pda";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "./constants";

/** Exact size of an SPL Token (v1) account. Token-2022 accounts are larger. */
export const SPL_TOKEN_ACCOUNT_SIZE = 165;

export const TOKEN_ACCOUNT_STATE = {
  UNINITIALIZED: 0,
  INITIALIZED: 1,
  FROZEN: 2,
} as const;

export type DecodedTokenAccount = {
  mint: string;
  owner: string;
  amount: bigint;
  state: number;
};

function readU64LE(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 7; i >= 0; i -= 1) {
    value = (value << 8n) | BigInt(bytes[offset + i]!);
  }
  return value;
}

/**
 * Decodes the fixed 165-byte SPL token account layout.
 * Returns null for any length other than exactly 165 — a Token-2022 account
 * with extensions is a different program and is not allowlisted here.
 */
export function decodeTokenAccount(dataBase64: string): DecodedTokenAccount | null {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(dataBase64);
  } catch {
    return null;
  }
  if (bytes.length !== SPL_TOKEN_ACCOUNT_SIZE) {
    return null;
  }
  return {
    mint: bytesToBase58(bytes.slice(0, 32)),
    owner: bytesToBase58(bytes.slice(32, 64)),
    amount: readU64LE(bytes, 64),
    state: bytes[108]!,
  };
}

export const ATA_LOOKUP_FAILURE = {
  /** Something occupies the ATA address that is not a usable USDC account. */
  UNUSABLE: "RECIPIENT_ATA_UNUSABLE",
} as const;

export type RecipientAtaStatus =
  | { ok: true; address: string; exists: boolean }
  | { ok: false; address: string; failureCode: string; detail: string };

export type MinimalAccountInfo = {
  dataBase64: string;
  owner: string;
} | null;

/** The recipient's canonical USDC associated token address. */
export function deriveRecipientUsdcAta(recipientAddress: string, usdcMint: string): string {
  return deriveAssociatedTokenAddress({
    owner: recipientAddress,
    mint: usdcMint,
    tokenProgramId: TOKEN_PROGRAM_ID,
    associatedTokenProgramId: ASSOCIATED_TOKEN_PROGRAM_ID,
  });
}

/**
 * Turns a fetched account into the create-or-not decision.
 *
 * Pure so the whole decision table is unit-testable without an RPC. `account`
 * is whatever `getAccountInfo` returned for {@link deriveRecipientUsdcAta}.
 */
export function classifyRecipientAta(input: {
  address: string;
  account: MinimalAccountInfo;
  expectedOwner: string;
  expectedMint: string;
}): RecipientAtaStatus {
  const { address, account, expectedOwner, expectedMint } = input;

  if (account === null) {
    return { ok: true, address, exists: false };
  }

  // An account at the ATA address owned by anything other than the SPL Token
  // program cannot be transferred into, and the ATA-create would fail too.
  if (account.owner !== TOKEN_PROGRAM_ID) {
    return {
      ok: false,
      address,
      failureCode: ATA_LOOKUP_FAILURE.UNUSABLE,
      detail: `owner ${account.owner} is not the SPL Token program`,
    };
  }

  const decoded = decodeTokenAccount(account.dataBase64);
  if (!decoded) {
    return {
      ok: false,
      address,
      failureCode: ATA_LOOKUP_FAILURE.UNUSABLE,
      detail: "account data is not a 165-byte SPL token account",
    };
  }

  if (decoded.state !== TOKEN_ACCOUNT_STATE.INITIALIZED) {
    return {
      ok: false,
      address,
      failureCode: ATA_LOOKUP_FAILURE.UNUSABLE,
      detail: `token account state ${decoded.state} is not Initialized`,
    };
  }

  // Both of these would be a payment to the wrong place even though the address
  // is the one we derived.
  if (decoded.mint !== expectedMint) {
    return {
      ok: false,
      address,
      failureCode: ATA_LOOKUP_FAILURE.UNUSABLE,
      detail: `mint ${decoded.mint} is not the configured USDC mint`,
    };
  }
  if (decoded.owner !== expectedOwner) {
    return {
      ok: false,
      address,
      failureCode: ATA_LOOKUP_FAILURE.UNUSABLE,
      detail: `token account owner ${decoded.owner} is not the recipient`,
    };
  }

  return { ok: true, address, exists: true };
}
