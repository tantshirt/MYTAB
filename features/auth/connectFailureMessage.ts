import { NAMED_WALLET_LABELS, type NamedWalletProvider } from "@/lib/wallet/providers";
import { CONNECT_COPY } from "./connectCopy";
import { WalletLinkClientError } from "./walletLinkError";

/**
 * What actually went wrong, in the person's words.
 *
 * Every failure on this path used to collapse to one sentence — "That wallet
 * didn't come back. Try again, or skip and claim." — because `connectNamed`
 * mapped anything that was not a `WalletLinkClientError` straight onto
 * `CONNECT_COPY.failed`.
 *
 * The most common failure is not a wallet failing to return. It is
 * `wallets.issueWalletLinkChallenge` throwing `UNAUTHORIZED`, which happens
 * *before* the wallet is opened at all: the challenge is issued first, and it
 * needs a Convex user row that the Telegram bootstrap owns. When that throws,
 * the old copy described a wallet round-trip that never started — it named a
 * step the person had not reached, and pointed them at "try again", which
 * cannot fix a lapsed session.
 *
 * That mattered beyond politeness. Three named wallets and the embedded wallet
 * all failing with one identical sentence is indistinguishable from three
 * broken wallet integrations, which is the wrong thing to go and fix.
 *
 * So: separate what failed before the wallet from what failed at the wallet,
 * and name no mechanism in either (§4.0 rule 2 — no codes, no "challenge", no
 * "endpoint").
 */
export function connectFailureMessage(
  error: unknown,
  provider?: NamedWalletProvider,
): string {
  const detail = error instanceof Error ? error.message : String(error ?? "");

  /*
   * Session first, and before the `WalletLinkClientError` branch — Convex
   * redacts a plain `Error`'s message in production, so this matches on
   * whatever survives rather than on an exact string.
   */
  if (
    detail.includes("UNAUTHORIZED") ||
    detail.includes("TELEGRAM_CONTEXT_REQUIRED") ||
    detail.includes("USER_REQUIRED")
  ) {
    return CONNECT_COPY.sessionExpired;
  }

  if (error instanceof WalletLinkClientError) {
    // The wallet is not installed, or is not one this phone can hand off to.
    // "Try again" is the wrong advice, so this branch does not offer it.
    if (error.code === "WALLET_NOT_FOUND") {
      return provider
        ? CONNECT_COPY.walletNotFound(NAMED_WALLET_LABELS[provider])
        : CONNECT_COPY.failed;
    }
    return error.message;
  }

  return CONNECT_COPY.failed;
}
