import { describe, expect, it } from "vitest";
import { CONNECT_COPY } from "@/features/auth/connectCopy";
import { connectFailureMessage } from "@/features/auth/connectFailureMessage";
import { WalletLinkClientError } from "@/features/auth/walletLinkError";

/*
 * Three named wallets and the embedded wallet all failed with one identical
 * sentence — "That wallet didn't come back." — because anything that was not a
 * `WalletLinkClientError` collapsed onto `CONNECT_COPY.failed`.
 *
 * The most frequent failure never reaches a wallet at all:
 * `wallets.issueWalletLinkChallenge` runs first and throws `UNAUTHORIZED` when
 * the Convex user row is not there. Reporting that as a wallet round-trip
 * describes a step the person never got to, and sends whoever reads the bug
 * report off to fix three wallet integrations that are fine.
 */
describe("connect failures say which step failed", () => {
  it("names the session when the challenge is refused, and mentions no wallet", () => {
    const message = connectFailureMessage(new Error("UNAUTHORIZED"), "phantom");

    expect(message).toBe(CONNECT_COPY.sessionExpired);
    expect(message).not.toContain("wallet");
    // "Try again" cannot renew a session, so it must not be the advice.
    expect(message).not.toContain("Try again");
  });

  it("treats a missing Telegram context the same way", () => {
    expect(connectFailureMessage(new Error("TELEGRAM_CONTEXT_REQUIRED"))).toBe(
      CONNECT_COPY.sessionExpired,
    );
    expect(connectFailureMessage(new Error("USER_REQUIRED"))).toBe(
      CONNECT_COPY.sessionExpired,
    );
  });

  it("names the wallet that could not be opened", () => {
    const message = connectFailureMessage(
      new WalletLinkClientError("WALLET_NOT_FOUND"),
      "solflare",
    );

    expect(message).toContain("Solflare");
    expect(message).not.toContain("Phantom");
  });

  it("keeps the round-trip sentence for a wallet that genuinely did not return", () => {
    const message = connectFailureMessage(
      new WalletLinkClientError("UL_CALLBACK_MISSING", CONNECT_COPY.failedCallback),
      "backpack",
    );

    expect(message).toBe(CONNECT_COPY.failedCallback);
  });

  it("falls back to the generic sentence for an unrecognised failure", () => {
    expect(connectFailureMessage(new Error("something else"))).toBe(CONNECT_COPY.failed);
    expect(connectFailureMessage(undefined)).toBe(CONNECT_COPY.failed);
  });

  /*
   * §4.0 rule 2 — copy names no mechanism. A raw code reaching the screen is
   * the failure this whole module exists to prevent, so assert it directly.
   */
  it("never leaks a code onto the screen", () => {
    for (const error of [
      new Error("UNAUTHORIZED"),
      new WalletLinkClientError("WALLET_NOT_FOUND"),
      new Error("boom"),
    ]) {
      const message = connectFailureMessage(error, "phantom");
      expect(message).not.toContain("UNAUTHORIZED");
      expect(message).not.toContain("WALLET_NOT_FOUND");
      expect(message).not.toMatch(/[A-Z]{4,}_[A-Z]{4,}/);
    }
  });
});
