/**
 * Turning an atomic amount plus token metadata into text.
 *
 * This is the only sanctioned bridge from `TokenMetadata` to a displayed
 * number, and it exists so that no surface ever writes
 * `Number(atomic) / 10 ** decimals`. That expression is correct for small
 * USDC amounts and silently wrong for a 9-decimal token above ~9 million
 * atomic units, which is the kind of bug that ships because the happy path
 * looks fine.
 *
 * The scaling itself is delegated to `lib/domain/crypto.ts`, which is pure
 * BigInt and already used by the settlement display path. Decimals arrive from
 * `assertTransactable` on any money-moving path, so the exponent used here has
 * been proven against the mint account.
 */

import {
  cryptoAmountFromAtomicString,
  formatCryptoAmountDisplay,
  type CryptoAmount,
} from "../domain/crypto";
import type { TokenMetadata } from "./types";

/** Builds a `CryptoAmount` scaled by this token's proven decimals. */
export function cryptoAmountForToken(
  metadata: TokenMetadata,
  amountAtomic: bigint | string,
): CryptoAmount {
  const atomicText =
    typeof amountAtomic === "bigint" ? amountAtomic.toString() : amountAtomic;
  return cryptoAmountFromAtomicString(atomicText, metadata.decimals);
}

/**
 * `"1,840.000000"` — grouped, full precision, no symbol.
 *
 * Delegates to `formatCryptoAmountDisplay` except for the zero-decimals case,
 * which that helper renders as `"7.0"` — it pads an empty fraction to a minimum
 * of one digit. Harmless for USDC, which is the only token it was written for,
 * but wrong for an indivisible token, where a trailing point implies a
 * precision that does not exist. Corrected here rather than in `lib/domain`
 * because that helper's output is already baked into settlement copy.
 */
export function formatTokenAmount(
  metadata: TokenMetadata,
  amountAtomic: bigint | string,
): string {
  const amount = cryptoAmountForToken(metadata, amountAtomic);
  const formatted = formatCryptoAmountDisplay(amount);
  if (amount.decimals > 0) {
    return formatted;
  }
  return formatted.slice(0, formatted.indexOf("."));
}

/**
 * `"1,840.000000 USDC"`, with unverified tokens carrying a visible marker.
 *
 * The marker is not decoration. An unverified mint may be wearing a familiar
 * symbol, and a payer reading "1,840.000000 USDC" has no way to tell it from
 * the real thing. Any surface that renders an unverified token must show that
 * it is unverified; this helper makes doing so the default.
 */
export function formatTokenAmountWithSymbol(
  metadata: TokenMetadata,
  amountAtomic: bigint | string,
): string {
  const amount = formatTokenAmount(metadata, amountAtomic);
  return metadata.verified
    ? `${amount} ${metadata.symbol}`
    : `${amount} ${metadata.symbol} (unverified)`;
}

/** `"So1111…1112"` — for the one place a raw mint must be shown legibly. */
export function truncateMint(mint: string, lead = 4, tail = 4): string {
  if (mint.length <= lead + tail + 1) {
    return mint;
  }
  return `${mint.slice(0, lead)}…${mint.slice(-tail)}`;
}
