/**
 * Reading `decimals` off the mint account — the only source we trust for it.
 *
 * A token list's `decimals` field is metadata: a human typed it, or a crawler
 * copied it, and either can be wrong. The mint account owns the real value and
 * the SPL Token program enforces it. Since decimals is the exponent that turns
 * an integer atomic amount into a displayed number, a list that says 6 for a
 * 9-decimal mint makes every amount on the screen wrong by 1000x. That is not
 * a display bug in a payments product; it is a wrong payment.
 *
 * So: the list proposes, the chain disposes, and a mismatch is a rejection.
 *
 * Layout (SPL Token v1, and the base of every Token-2022 mint):
 *
 *   0..4    COption<Pubkey> discriminant for mint_authority (u32 LE)
 *   4..36   mint_authority
 *   36..44  supply (u64 LE)
 *   44      decimals (u8)          <- the only field this module needs
 *   45      is_initialized (bool)
 *   46..50  COption<Pubkey> discriminant for freeze_authority
 *   50..82  freeze_authority
 *
 * A Token-2022 mint carrying extensions is padded to 165 bytes (the size of a
 * token *account*, so the two can never be confused by length alone), then
 * carries an account-type discriminator at offset 165 and a TLV region after
 * it. The base 82 bytes are unchanged, so byte 44 is decimals in both.
 */

import { base64ToBytes, bytesToBase58 } from "../solana/decodeTransaction";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../solana/constants";
import {
  TOKEN_METADATA_FAILURE,
  TokenMetadataError,
  isValidDecimals,
} from "./types";

/** Exact size of an SPL Token (v1) mint, and of a bare Token-2022 mint. */
export const MINT_ACCOUNT_SIZE = 82;

/**
 * Offset of the account-type discriminator in an extended Token-2022 account.
 * Equal to the SPL token-account size on purpose: a padded mint is 166+ bytes,
 * which no v1 account can be.
 */
export const TOKEN_2022_ACCOUNT_TYPE_OFFSET = 165;
/** `AccountType::Mint` in the Token-2022 discriminator. */
export const TOKEN_2022_ACCOUNT_TYPE_MINT = 1;

const DECIMALS_OFFSET = 44;
const IS_INITIALIZED_OFFSET = 45;
const MINT_AUTHORITY_OPTION_OFFSET = 0;
const MINT_AUTHORITY_OFFSET = 4;
const FREEZE_AUTHORITY_OPTION_OFFSET = 46;
const FREEZE_AUTHORITY_OFFSET = 50;

export type DecodedMint = {
  decimals: number;
  isInitialized: boolean;
  /** null when the mint authority has been revoked (fixed supply). */
  mintAuthority: string | null;
  /** Non-null means the issuer can freeze holders' accounts. */
  freezeAuthority: string | null;
  /** Which token program owns it — v1 and Token-2022 are both legitimate. */
  programId: string;
};

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

/** True for a length that can hold a mint under either token program. */
export function isMintAccountLength(length: number): boolean {
  if (length === MINT_ACCOUNT_SIZE) {
    return true;
  }
  // Extended Token-2022 mint: base + padding + discriminator + at least a TLV.
  return length > TOKEN_2022_ACCOUNT_TYPE_OFFSET;
}

/**
 * Decodes a mint account, or returns null when the bytes are not one.
 *
 * Returns null rather than throwing so the caller can distinguish "this
 * address is not a token" from "the RPC failed" — those are different answers
 * for the payment sheet.
 */
export function decodeMintAccount(input: {
  dataBase64: string;
  owner: string;
}): DecodedMint | null {
  if (input.owner !== TOKEN_PROGRAM_ID && input.owner !== TOKEN_2022_PROGRAM_ID) {
    return null;
  }

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(input.dataBase64);
  } catch {
    return null;
  }

  if (!isMintAccountLength(bytes.length)) {
    return null;
  }

  // A 165-byte-plus buffer is only a mint if it says so. Without this check a
  // *token account* under Token-2022 would decode as a mint and hand back
  // whatever byte 44 of its owner pubkey happens to be, as "decimals".
  if (bytes.length > TOKEN_2022_ACCOUNT_TYPE_OFFSET) {
    if (input.owner !== TOKEN_2022_PROGRAM_ID) {
      return null;
    }
    if (bytes[TOKEN_2022_ACCOUNT_TYPE_OFFSET] !== TOKEN_2022_ACCOUNT_TYPE_MINT) {
      return null;
    }
  }

  const decimals = bytes[DECIMALS_OFFSET]!;
  if (!isValidDecimals(decimals)) {
    return null;
  }

  const hasMintAuthority = readU32LE(bytes, MINT_AUTHORITY_OPTION_OFFSET) === 1;
  const hasFreezeAuthority =
    readU32LE(bytes, FREEZE_AUTHORITY_OPTION_OFFSET) === 1;

  return {
    decimals,
    isInitialized: bytes[IS_INITIALIZED_OFFSET] === 1,
    mintAuthority: hasMintAuthority
      ? bytesToBase58(bytes.slice(MINT_AUTHORITY_OFFSET, MINT_AUTHORITY_OFFSET + 32))
      : null,
    freezeAuthority: hasFreezeAuthority
      ? bytesToBase58(
          bytes.slice(FREEZE_AUTHORITY_OFFSET, FREEZE_AUTHORITY_OFFSET + 32),
        )
      : null,
    programId: input.owner,
  };
}

/** Minimal account shape — matches `SolanaRpcClient.getAccountInfo`'s result. */
export type MintAccountInfo = { dataBase64: string; owner: string } | null;

/**
 * Proves a claimed decimals value against the chain.
 *
 * Throws on every path except agreement. There is no "probably fine" outcome:
 * an unreadable mint, an uninitialised mint, and a mismatch all mean we cannot
 * scale this token's amounts, which means we cannot transact it.
 */
export function assertDecimalsMatchChain(input: {
  mint: string;
  claimedDecimals: number;
  account: MintAccountInfo;
}): number {
  const { mint, claimedDecimals, account } = input;

  if (account === null) {
    throw new TokenMetadataError(
      TOKEN_METADATA_FAILURE.NOT_A_MINT,
      `${mint} has no account on chain`,
      mint,
    );
  }

  const decoded = decodeMintAccount(account);
  if (!decoded) {
    throw new TokenMetadataError(
      TOKEN_METADATA_FAILURE.NOT_A_MINT,
      `${mint} is not an SPL mint (owner ${account.owner})`,
      mint,
    );
  }

  if (!decoded.isInitialized) {
    throw new TokenMetadataError(
      TOKEN_METADATA_FAILURE.NOT_A_MINT,
      `${mint} is an uninitialised mint`,
      mint,
    );
  }

  if (decoded.decimals !== claimedDecimals) {
    throw new TokenMetadataError(
      TOKEN_METADATA_FAILURE.DECIMALS_MISMATCH,
      `${mint}: list says ${claimedDecimals} decimals, chain says ${decoded.decimals}`,
      mint,
    );
  }

  return decoded.decimals;
}
