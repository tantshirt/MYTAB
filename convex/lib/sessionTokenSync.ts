import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const TAB_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const ACTION_TOKEN_TTL_MS = 10 * 60 * 1000;

export type SessionTokenType = "tab_session" | "action_token";
export type SessionSubjectKind = "tab" | "tip" | "balance";
export type SessionTokenStatus = "active" | "consumed" | "revoked" | "expired";

export const TOKEN_EXPIRED = "TOKEN_EXPIRED";
export const TOKEN_REVOKED = "TOKEN_REVOKED";
export const TOKEN_CONSUMED = "TOKEN_CONSUMED";
export const TOKEN_NOT_FOUND = "TOKEN_NOT_FOUND";
export const TOKEN_TYPE_MISMATCH = "TOKEN_TYPE_MISMATCH";
export const TOKEN_INVALID = "TOKEN_INVALID";

export type SessionTokenFailureCode =
  | typeof TOKEN_EXPIRED
  | typeof TOKEN_REVOKED
  | typeof TOKEN_CONSUMED
  | typeof TOKEN_NOT_FOUND
  | typeof TOKEN_TYPE_MISMATCH
  | typeof TOKEN_INVALID;

export class SessionTokenError extends Error {
  constructor(public readonly code: SessionTokenFailureCode) {
    super(code);
    this.name = "SessionTokenError";
  }
}

/** Generates a cryptographically random opaque token (FR-N3). */
export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

/** Hashes a token for at-rest storage — DB reads never yield usable tokens (AC1). */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time token comparison for verification paths. */
export function tokensMatch(presented: string, expectedHash: string): boolean {
  const presentedHash = hashSessionToken(presented);
  const left = Buffer.from(presentedHash);
  const right = Buffer.from(expectedHash);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function ttlForTokenType(tokenType: SessionTokenType): number {
  return tokenType === "tab_session" ? TAB_SESSION_TTL_MS : ACTION_TOKEN_TTL_MS;
}

export function isTokenExpired(expiresAt: number, now = Date.now()): boolean {
  return expiresAt <= now;
}

export function assertTokenActive(
  status: SessionTokenStatus,
  expiresAt: number,
  now = Date.now(),
): void {
  if (status === "revoked") {
    throw new SessionTokenError(TOKEN_REVOKED);
  }
  if (status === "consumed") {
    throw new SessionTokenError(TOKEN_CONSUMED);
  }
  if (status === "expired" || isTokenExpired(expiresAt, now)) {
    throw new SessionTokenError(TOKEN_EXPIRED);
  }
}

export function assertTokenType(
  actual: SessionTokenType,
  expected: SessionTokenType,
): void {
  if (actual !== expected) {
    throw new SessionTokenError(TOKEN_TYPE_MISMATCH);
  }
}

/** UTC day key for rate-limit windows (AD-24). */
export function utcDayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}
