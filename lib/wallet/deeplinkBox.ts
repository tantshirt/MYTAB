/**
 * tweetnacl-compatible box (x25519 + xsalsa20-poly1305) for Phantom-family
 * universal-link payloads. Uses @noble already in the tree — no new package.
 *
 * Owner: Phase 2. Removal: drop when iOS no longer needs per-wallet deeplinks.
 */

import { x25519 } from "@noble/curves/ed25519.js";
import { secretbox } from "@noble/ciphers/salsa.js";
import { bytesToBase58, base58ToBytes } from "../solana/decodeTransaction";

const HSALSA_SIGMA = new Uint32Array([
  0x61707865, // "expa"
  0x3320646e, // "nd 3"
  0x79622d32, // "2-by"
  0x6b206574, // "te k"
]);

function u8ToU32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  ) >>> 0;
}

function u32ToU8LE(out: Uint8Array, offset: number, value: number): void {
  out[offset] = value & 0xff;
  out[offset + 1] = (value >>> 8) & 0xff;
  out[offset + 2] = (value >>> 16) & 0xff;
  out[offset + 3] = (value >>> 24) & 0xff;
}

function rotl(value: number, n: number): number {
  return ((value << n) | (value >>> (32 - n))) >>> 0;
}

/**
 * HSalsa20 as used by nacl.box.before. Public-domain salsa20 core.
 */
export function hsalsa20(key: Uint8Array, nonce16: Uint8Array): Uint8Array {
  let x00 = HSALSA_SIGMA[0]!;
  let x01 = u8ToU32LE(key, 0);
  let x02 = u8ToU32LE(key, 4);
  let x03 = u8ToU32LE(key, 8);
  let x04 = u8ToU32LE(key, 12);
  let x05 = HSALSA_SIGMA[1]!;
  let x06 = u8ToU32LE(nonce16, 0);
  let x07 = u8ToU32LE(nonce16, 4);
  let x08 = u8ToU32LE(nonce16, 8);
  let x09 = u8ToU32LE(nonce16, 12);
  let x10 = HSALSA_SIGMA[2]!;
  let x11 = u8ToU32LE(key, 16);
  let x12 = u8ToU32LE(key, 20);
  let x13 = u8ToU32LE(key, 24);
  let x14 = u8ToU32LE(key, 28);
  let x15 = HSALSA_SIGMA[3]!;

  for (let i = 0; i < 20; i += 2) {
    x04 = (x04 ^ rotl((x00 + x12) >>> 0, 7)) >>> 0;
    x08 = (x08 ^ rotl((x04 + x00) >>> 0, 9)) >>> 0;
    x12 = (x12 ^ rotl((x08 + x04) >>> 0, 13)) >>> 0;
    x00 = (x00 ^ rotl((x12 + x08) >>> 0, 18)) >>> 0;

    x09 = (x09 ^ rotl((x05 + x01) >>> 0, 7)) >>> 0;
    x13 = (x13 ^ rotl((x09 + x05) >>> 0, 9)) >>> 0;
    x01 = (x01 ^ rotl((x13 + x09) >>> 0, 13)) >>> 0;
    x05 = (x05 ^ rotl((x01 + x13) >>> 0, 18)) >>> 0;

    x14 = (x14 ^ rotl((x10 + x06) >>> 0, 7)) >>> 0;
    x02 = (x02 ^ rotl((x14 + x10) >>> 0, 9)) >>> 0;
    x06 = (x06 ^ rotl((x02 + x14) >>> 0, 13)) >>> 0;
    x10 = (x10 ^ rotl((x06 + x02) >>> 0, 18)) >>> 0;

    x03 = (x03 ^ rotl((x15 + x11) >>> 0, 7)) >>> 0;
    x07 = (x07 ^ rotl((x03 + x15) >>> 0, 9)) >>> 0;
    x11 = (x11 ^ rotl((x07 + x03) >>> 0, 13)) >>> 0;
    x15 = (x15 ^ rotl((x11 + x07) >>> 0, 18)) >>> 0;

    x01 = (x01 ^ rotl((x00 + x03) >>> 0, 7)) >>> 0;
    x02 = (x02 ^ rotl((x01 + x00) >>> 0, 9)) >>> 0;
    x03 = (x03 ^ rotl((x02 + x01) >>> 0, 13)) >>> 0;
    x00 = (x00 ^ rotl((x03 + x02) >>> 0, 18)) >>> 0;

    x06 = (x06 ^ rotl((x05 + x04) >>> 0, 7)) >>> 0;
    x07 = (x07 ^ rotl((x06 + x05) >>> 0, 9)) >>> 0;
    x04 = (x04 ^ rotl((x07 + x06) >>> 0, 13)) >>> 0;
    x05 = (x05 ^ rotl((x04 + x07) >>> 0, 18)) >>> 0;

    x11 = (x11 ^ rotl((x10 + x09) >>> 0, 7)) >>> 0;
    x08 = (x08 ^ rotl((x11 + x10) >>> 0, 9)) >>> 0;
    x09 = (x09 ^ rotl((x08 + x11) >>> 0, 13)) >>> 0;
    x10 = (x10 ^ rotl((x09 + x08) >>> 0, 18)) >>> 0;

    x12 = (x12 ^ rotl((x15 + x14) >>> 0, 7)) >>> 0;
    x13 = (x13 ^ rotl((x12 + x15) >>> 0, 9)) >>> 0;
    x14 = (x14 ^ rotl((x13 + x12) >>> 0, 13)) >>> 0;
    x15 = (x15 ^ rotl((x14 + x13) >>> 0, 18)) >>> 0;
  }

  const out = new Uint8Array(32);
  u32ToU8LE(out, 0, x00);
  u32ToU8LE(out, 4, x05);
  u32ToU8LE(out, 8, x10);
  u32ToU8LE(out, 12, x15);
  u32ToU8LE(out, 16, x06);
  u32ToU8LE(out, 20, x07);
  u32ToU8LE(out, 24, x08);
  u32ToU8LE(out, 28, x09);
  return out;
}

export type X25519Keypair = {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
};

export function generateX25519Keypair(): X25519Keypair {
  const secretKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(secretKey);
  return { secretKey, publicKey };
}

/** nacl.box.before — shared key for secretbox. */
export function boxBefore(theirPublicKey: Uint8Array, ourSecretKey: Uint8Array): Uint8Array {
  const shared = x25519.getSharedSecret(ourSecretKey, theirPublicKey);
  return hsalsa20(shared, new Uint8Array(16));
}

export function boxOpenAfter(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  sharedKey: Uint8Array,
): Uint8Array | null {
  try {
    return secretbox(sharedKey, nonce).open(ciphertext);
  } catch {
    return null;
  }
}

export function boxAfter(
  plaintext: Uint8Array,
  nonce: Uint8Array,
  sharedKey: Uint8Array,
): Uint8Array {
  return secretbox(sharedKey, nonce).seal(plaintext);
}

export function encodeKeyBase58(bytes: Uint8Array): string {
  return bytesToBase58(bytes);
}

export function decodeKeyBase58(value: string): Uint8Array {
  return base58ToBytes(value);
}
