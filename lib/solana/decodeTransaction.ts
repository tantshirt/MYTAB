/**
 * Dependency-free Solana transaction wire decoder.
 *
 * Written by hand rather than reusing `@solana/web3.js` for three reasons:
 *  1. It runs unchanged in the Convex default runtime (a V8 isolate), so the
 *     public `recordUserSigned` mutation can verify signatures without pulling
 *     `node-fetch`/`jayson`/`rpc-websockets` into the bundle.
 *  2. Every field the sponsor policy asserts against is produced by code we can
 *     audit line by line, with no library-version behaviour drift.
 *  3. It is strict: trailing bytes, out-of-range indexes and malformed compact-u16
 *     lengths are hard errors rather than silently truncated reads. A decoder that
 *     tolerates garbage is a decoder an attacker can use to smuggle instructions
 *     past a validator that only inspects the part that parsed.
 */

import bs58 from "bs58";

export const DECODE_FAILURE = {
  TRUNCATED: "TX_DECODE_TRUNCATED",
  TRAILING_BYTES: "TX_DECODE_TRAILING_BYTES",
  BAD_LENGTH_PREFIX: "TX_DECODE_BAD_LENGTH_PREFIX",
  BAD_VERSION: "TX_DECODE_UNSUPPORTED_VERSION",
  BAD_HEADER: "TX_DECODE_BAD_HEADER",
  BAD_BASE64: "TX_DECODE_BAD_BASE64",
  SIGNATURE_COUNT_MISMATCH: "TX_DECODE_SIGNATURE_COUNT_MISMATCH",
} as const;

export type DecodeFailureCode =
  (typeof DECODE_FAILURE)[keyof typeof DECODE_FAILURE];

export class TransactionDecodeError extends Error {
  constructor(
    public readonly code: DecodeFailureCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "TransactionDecodeError";
  }
}

export type DecodedInstruction = {
  programIdIndex: number;
  accountKeyIndexes: readonly number[];
  data: Uint8Array;
};

export type DecodedAddressTableLookup = {
  accountKey: string;
  writableIndexes: readonly number[];
  readonlyIndexes: readonly number[];
};

export type DecodedMessage = {
  /** `legacy` or 0 for a v0 message. */
  version: "legacy" | 0;
  numRequiredSignatures: number;
  numReadonlySignedAccounts: number;
  numReadonlyUnsignedAccounts: number;
  /** Base58 account keys carried in the message itself (no ALT resolution). */
  staticAccountKeys: readonly string[];
  recentBlockhash: string;
  instructions: readonly DecodedInstruction[];
  addressTableLookups: readonly DecodedAddressTableLookup[];
  /** Exact bytes that are signed — the message, without the signature array. */
  serialized: Uint8Array;
};

export type DecodedTransaction = {
  /** One 64-byte slot per required signer, in signer order. */
  signatures: readonly Uint8Array[];
  message: DecodedMessage;
};

const SIGNATURE_BYTES = 64;
const PUBKEY_BYTES = 32;
const MESSAGE_VERSION_MASK = 0x80;

class Cursor {
  offset = 0;

  constructor(readonly bytes: Uint8Array) {}

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  u8(): number {
    if (this.remaining < 1) {
      throw new TransactionDecodeError(DECODE_FAILURE.TRUNCATED, "u8");
    }
    return this.bytes[this.offset++]!;
  }

  peekU8(): number {
    if (this.remaining < 1) {
      throw new TransactionDecodeError(DECODE_FAILURE.TRUNCATED, "peek");
    }
    return this.bytes[this.offset]!;
  }

  take(length: number): Uint8Array {
    if (length < 0 || this.remaining < length) {
      throw new TransactionDecodeError(
        DECODE_FAILURE.TRUNCATED,
        `take(${length})`,
      );
    }
    const slice = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  /**
   * ShortVec / compact-u16. Rejects non-canonical encodings (a value that could
   * have been written in fewer bytes) so two different byte strings can never
   * decode to the same message — that would break message-hash binding.
   */
  compactU16(): number {
    let value = 0;
    for (let group = 0; group < 3; group += 1) {
      const byte = this.u8();
      value |= (byte & 0x7f) << (group * 7);
      if ((byte & 0x80) === 0) {
        if (group > 0 && (byte & 0x7f) === 0) {
          throw new TransactionDecodeError(
            DECODE_FAILURE.BAD_LENGTH_PREFIX,
            "non-canonical compact-u16",
          );
        }
        if (value > 0xffff) {
          throw new TransactionDecodeError(
            DECODE_FAILURE.BAD_LENGTH_PREFIX,
            "compact-u16 overflow",
          );
        }
        return value;
      }
    }
    throw new TransactionDecodeError(
      DECODE_FAILURE.BAD_LENGTH_PREFIX,
      "compact-u16 too long",
    );
  }
}

export function base64ToBytes(value: string): Uint8Array {
  try {
    if (typeof atob === "function") {
      const binary = atob(value);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        out[i] = binary.charCodeAt(i);
      }
      return out;
    }
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    return new Uint8Array(Buffer.from(value, "base64"));
  } catch {
    throw new TransactionDecodeError(DECODE_FAILURE.BAD_BASE64);
  }
}

export function bytesToBase58(bytes: Uint8Array): string {
  return bs58.encode(bytes);
}

export function base58ToBytes(value: string): Uint8Array {
  return Uint8Array.from(bs58.decode(value));
}

function readMessage(cursor: Cursor): DecodedMessage {
  const messageStart = cursor.offset;
  const prefix = cursor.peekU8();

  let version: "legacy" | 0;
  if ((prefix & MESSAGE_VERSION_MASK) === 0) {
    version = "legacy";
  } else {
    const versionNumber = prefix & 0x7f;
    if (versionNumber !== 0) {
      throw new TransactionDecodeError(
        DECODE_FAILURE.BAD_VERSION,
        `v${versionNumber}`,
      );
    }
    version = 0;
    cursor.u8();
  }

  const numRequiredSignatures = cursor.u8();
  const numReadonlySignedAccounts = cursor.u8();
  const numReadonlyUnsignedAccounts = cursor.u8();

  const accountCount = cursor.compactU16();
  const staticAccountKeys: string[] = [];
  for (let i = 0; i < accountCount; i += 1) {
    staticAccountKeys.push(bytesToBase58(cursor.take(PUBKEY_BYTES)));
  }

  if (
    numRequiredSignatures === 0 ||
    numRequiredSignatures > accountCount ||
    numReadonlySignedAccounts > numRequiredSignatures ||
    numReadonlySignedAccounts + numReadonlyUnsignedAccounts > accountCount
  ) {
    throw new TransactionDecodeError(
      DECODE_FAILURE.BAD_HEADER,
      `sig=${numRequiredSignatures} ro-signed=${numReadonlySignedAccounts} ro-unsigned=${numReadonlyUnsignedAccounts} keys=${accountCount}`,
    );
  }

  const recentBlockhash = bytesToBase58(cursor.take(PUBKEY_BYTES));

  const instructionCount = cursor.compactU16();
  const instructions: DecodedInstruction[] = [];
  for (let i = 0; i < instructionCount; i += 1) {
    const programIdIndex = cursor.u8();
    const accountIndexCount = cursor.compactU16();
    const accountKeyIndexes: number[] = [];
    for (let k = 0; k < accountIndexCount; k += 1) {
      accountKeyIndexes.push(cursor.u8());
    }
    const dataLength = cursor.compactU16();
    instructions.push({
      programIdIndex,
      accountKeyIndexes,
      data: cursor.take(dataLength),
    });
  }

  const addressTableLookups: DecodedAddressTableLookup[] = [];
  if (version === 0) {
    const lookupCount = cursor.compactU16();
    for (let i = 0; i < lookupCount; i += 1) {
      const accountKey = bytesToBase58(cursor.take(PUBKEY_BYTES));
      const writableCount = cursor.compactU16();
      const writableIndexes = Array.from(cursor.take(writableCount));
      const readonlyCount = cursor.compactU16();
      const readonlyIndexes = Array.from(cursor.take(readonlyCount));
      addressTableLookups.push({
        accountKey,
        writableIndexes,
        readonlyIndexes,
      });
    }
  }

  return {
    version,
    numRequiredSignatures,
    numReadonlySignedAccounts,
    numReadonlyUnsignedAccounts,
    staticAccountKeys,
    recentBlockhash,
    instructions,
    addressTableLookups,
    serialized: cursor.bytes.slice(messageStart, cursor.offset),
  };
}

/**
 * Decodes a fully or partially signed transaction. Any trailing byte is a hard
 * error: an attacker must not be able to append data that the validator ignores
 * but a downstream consumer (or a different decoder) interprets.
 */
export function decodeTransaction(bytes: Uint8Array): DecodedTransaction {
  const cursor = new Cursor(bytes);
  const signatureCount = cursor.compactU16();
  const signatures: Uint8Array[] = [];
  for (let i = 0; i < signatureCount; i += 1) {
    signatures.push(cursor.take(SIGNATURE_BYTES));
  }

  const message = readMessage(cursor);

  if (cursor.remaining !== 0) {
    throw new TransactionDecodeError(
      DECODE_FAILURE.TRAILING_BYTES,
      `${cursor.remaining} byte(s)`,
    );
  }

  if (signatureCount !== message.numRequiredSignatures) {
    throw new TransactionDecodeError(
      DECODE_FAILURE.SIGNATURE_COUNT_MISMATCH,
      `signatures=${signatureCount} required=${message.numRequiredSignatures}`,
    );
  }

  return { signatures, message };
}

export function decodeTransactionBase64(value: string): DecodedTransaction {
  return decodeTransaction(base64ToBytes(value));
}

/** Decodes a standalone message (no signature array). */
export function decodeMessage(bytes: Uint8Array): DecodedMessage {
  const cursor = new Cursor(bytes);
  const message = readMessage(cursor);
  if (cursor.remaining !== 0) {
    throw new TransactionDecodeError(
      DECODE_FAILURE.TRAILING_BYTES,
      `${cursor.remaining} byte(s)`,
    );
  }
  return message;
}

/** True when a signature slot is still empty (all zero bytes). */
export function isEmptySignature(signature: Uint8Array): boolean {
  return signature.every((byte) => byte === 0);
}

/** Static account keys the message marks writable, by compiled-message roles. */
export function isWritableIndex(
  message: DecodedMessage,
  index: number,
): boolean {
  const keyCount = message.staticAccountKeys.length;
  if (index < message.numRequiredSignatures) {
    return index < message.numRequiredSignatures - message.numReadonlySignedAccounts;
  }
  return index < keyCount - message.numReadonlyUnsignedAccounts;
}

export function isSignerIndex(message: DecodedMessage, index: number): boolean {
  return index < message.numRequiredSignatures;
}
