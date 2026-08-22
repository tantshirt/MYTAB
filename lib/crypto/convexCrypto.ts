import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

function toBytes(input: string | Uint8Array): Uint8Array {
  if (typeof input === "string") {
    return new TextEncoder().encode(input);
  }
  return input;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** SHA-256 hex digest — Convex default-runtime safe (no Node APIs). */
export function sha256Hex(input: string | Uint8Array): string {
  return bytesToHex(sha256(toBytes(input)));
}

/** SHA-256 raw bytes. */
export function sha256Bytes(input: string | Uint8Array): Uint8Array {
  return sha256(toBytes(input));
}

/** HMAC-SHA256 hex digest. */
export function hmacSha256Hex(key: Uint8Array, message: string | Uint8Array): string {
  return bytesToHex(hmac(sha256, key, toBytes(message)));
}

/** Constant-time byte comparison. */
export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i]! ^ right[i]!;
  }
  return diff === 0;
}

/** Constant-time hex string comparison. */
export function timingSafeEqualHex(leftHex: string, rightHex: string): boolean {
  try {
    return timingSafeEqual(hexToBytes(leftHex), hexToBytes(rightHex));
  } catch {
    return false;
  }
}

/** Cryptographically random base64url string. */
export function randomBase64Url(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
