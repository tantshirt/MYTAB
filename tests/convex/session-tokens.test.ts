import { describe, expect, it } from "vitest";
import {
  TAB_SESSION_TTL_MS,
  ACTION_TOKEN_TTL_MS,
  assertTokenActive,
  assertTokenType,
  generateOpaqueToken,
  hashSessionToken,
  isTokenExpired,
  SessionTokenError,
  TOKEN_CONSUMED,
  TOKEN_EXPIRED,
  TOKEN_REVOKED,
  TOKEN_TYPE_MISMATCH,
  utcDayKey,
} from "../../convex/lib/sessionTokenSync";

describe("Story 1.9 — opaque session tokens", () => {
  it("AC1 — generates opaque random tokens with no embedded meaning", () => {
    const token = generateOpaqueToken();
    expect(token.length).toBeGreaterThan(20);
    expect(token).not.toMatch(/tab|group|wallet|amount/i);
    expect(hashSessionToken(token)).not.toBe(token);
  });

  it("AC1 — hashes tokens for at-rest storage", () => {
    const token = generateOpaqueToken();
    const hash = hashSessionToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashSessionToken(token));
  });

  it("AC6 — tab_session TTL is 24h and action_token TTL is 10m", () => {
    expect(TAB_SESSION_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(ACTION_TOKEN_TTL_MS).toBe(10 * 60 * 1000);
  });

  it("AC3 — rejects expired, revoked, and consumed tokens by category", () => {
    const now = Date.now();
    expect(() => assertTokenActive("revoked", now + 60_000, now)).toThrow(SessionTokenError);
    expect(() => assertTokenActive("revoked", now + 60_000, now)).toThrow(TOKEN_REVOKED);

    expect(() => assertTokenActive("consumed", now + 60_000, now)).toThrow(TOKEN_CONSUMED);

    expect(() => assertTokenActive("active", now - 1, now)).toThrow(TOKEN_EXPIRED);
    expect(isTokenExpired(now - 1, now)).toBe(true);
  });

  it("AC6 — rejects token type mismatch", () => {
    expect(() => assertTokenType("tab_session", "action_token")).toThrow(TOKEN_TYPE_MISMATCH);
  });

  it("AC5 — utcDayKey supports rate-limit windows", () => {
    expect(utcDayKey(Date.parse("2026-08-21T15:30:00.000Z"))).toBe("2026-08-21");
  });
});
