/**
 * Payment-sheet quote mapping — pure, no Convex, no I/O.
 *
 * The one guaranteed figure is DFlow's `otherAmountThreshold` (D-08).
 * `outAmount` is an estimate and is not an input to anything here.
 */

import { formatFiatMinorThb } from "../domain/format";
import {
  cryptoAmountFromAtomicString,
  formatCryptoAmountDisplay,
  USDC_DECIMALS,
} from "../domain/crypto";
import { fiatMinorFromInteger } from "../domain/money";
import { WRAPPED_SOL_MINT } from "../solana/constants";
import { JUPITER_ATTRIBUTION } from "../tokens/jupiter";
import type { TokenLookupResult } from "../tokens/types";

export { JUPITER_ATTRIBUTION };

/** The one contractual footer string. Rendered only on the D-22 picker. */
export const JUPITER_PICKER_FOOTER = JUPITER_ATTRIBUTION;

/** User-facing label for the on-chain floor. Never "slippage". */
export const PRICE_PROTECTION_LABEL = "Price protection";

export type QuoteUnavailableReason = "NO_WALLET" | "RPC_FAILED";

export type AssembledQuoteToken = {
  mint: string;
  name: string;
  decimals: number;
  balanceAtomic: string;
  requiredAtomic: string | null;
  affordable: boolean | null;
  logoUri: string | null;
  /** Badge only when this is `true`. Missing/false is unverified. */
  isVerified: boolean;
};

export type AssembledObligationQuote = {
  available: true;
  intentId: string | null;
  status: string | null;
  quoteResolving: boolean;
  quoteExpired: boolean;
  quoteRemainingMs: number;
  staleRevision: boolean;
  /** `otherAmountThreshold` when quoted; otherwise the locked obligation. */
  guaranteedOutputAtomic: string;
  maximumInputAtomic: string | null;
  inputMint: string | null;
  outputMint: string;
  roundUpAtomic: string | null;
  rateNumeratorAtomic: string | null;
  rateDenominatorMinor: string | null;
  displayAmountThbMinor: string;
  tabName: string;
  recipientName: string;
  recipientId: string;
  tokens: AssembledQuoteToken[];
  attribution: typeof JUPITER_ATTRIBUTION;
  walletKind: "embedded" | "external" | null;
  walletProvider: string | null;
  preparedTxBase64: string | null;
};

export type ObligationQuoteResult =
  | { available: false; reason: QuoteUnavailableReason }
  | AssembledObligationQuote;

/**
 * The figure the sheet may promise. `quotedOtherAmountThreshold` is
 * `otherAmountThreshold` from the DFlow order — never `outAmount`.
 */
export function guaranteedReceiveAtomic(input: {
  quotedOtherAmountThreshold: bigint | null | undefined;
  minimumOutputAtomic: bigint;
  obligationAmountAtomic: bigint;
}): bigint {
  if (input.quotedOtherAmountThreshold != null) {
    return input.quotedOtherAmountThreshold;
  }
  if (input.minimumOutputAtomic > 0n) {
    return input.minimumOutputAtomic;
  }
  return input.obligationAmountAtomic;
}

export function classifyBalanceRead(input: {
  payerAddress: string | null;
  rpcConfigured: boolean;
}): QuoteUnavailableReason | null {
  if (!input.payerAddress) {
    return "NO_WALLET";
  }
  if (!input.rpcConfigured) {
    return "RPC_FAILED";
  }
  return null;
}

function displayTokenName(mint: string, symbol: string, name: string): string {
  if (mint === WRAPPED_SOL_MINT) {
    return "Solana";
  }
  return symbol || name;
}

function lookupMetadata(
  mint: string,
  results: readonly TokenLookupResult[],
): TokenLookupResult | undefined {
  return results.find((row) => {
    if (row.status === "ok") {
      return row.metadata.mint === mint;
    }
    return row.mint === mint;
  });
}

export function assembleQuoteToken(input: {
  mint: string;
  fallbackName: string;
  fallbackDecimals: number;
  balanceAtomic: bigint;
  requiredAtomic: bigint | null;
  affordable: boolean | null;
  metadata: TokenLookupResult | undefined;
}): AssembledQuoteToken {
  let name = input.fallbackName;
  let decimals = input.fallbackDecimals;
  let logoUri: string | null = null;
  let isVerified = false;

  if (input.metadata?.status === "ok") {
    name = displayTokenName(
      input.mint,
      input.metadata.metadata.symbol,
      input.metadata.metadata.name,
    );
    decimals = input.metadata.metadata.decimals;
    logoUri = input.metadata.metadata.logoURI;
    isVerified = input.metadata.metadata.verified === true;
  }

  return {
    mint: input.mint,
    name,
    decimals,
    balanceAtomic: input.balanceAtomic.toString(),
    requiredAtomic: input.requiredAtomic === null ? null : input.requiredAtomic.toString(),
    affordable: input.affordable,
    logoUri,
    isVerified,
  };
}

export function assembleObligationQuote(input: {
  intentId: string | null;
  status: string | null;
  quoteResolving: boolean;
  quoteExpired: boolean;
  quoteRemainingMs: number;
  staleRevision: boolean;
  quotedOtherAmountThreshold: bigint | null;
  minimumOutputAtomic: bigint;
  obligationAmountAtomic: bigint;
  maximumInputAtomic: bigint | null;
  inputMint: string | null;
  outputMint: string;
  roundUpAtomic: bigint | null;
  rateNumeratorAtomic: bigint | null;
  rateDenominatorMinor: bigint | null;
  displayAmountThbMinor: bigint;
  tabName: string;
  recipientName: string;
  recipientId: string;
  walletKind: "embedded" | "external" | null;
  walletProvider: string | null;
  preparedTxBase64: string | null;
  tokens: ReadonlyArray<{
    mint: string;
    fallbackName: string;
    fallbackDecimals: number;
    balanceAtomic: bigint;
    requiredAtomic: bigint | null;
    affordable: boolean | null;
  }>;
  metadata: readonly TokenLookupResult[];
}): AssembledObligationQuote {
  const guaranteed = guaranteedReceiveAtomic({
    quotedOtherAmountThreshold: input.quotedOtherAmountThreshold,
    minimumOutputAtomic: input.minimumOutputAtomic,
    obligationAmountAtomic: input.obligationAmountAtomic,
  });

  return {
    available: true,
    intentId: input.intentId,
    status: input.status,
    quoteResolving: input.quoteResolving,
    quoteExpired: input.quoteExpired,
    quoteRemainingMs: input.quoteRemainingMs,
    staleRevision: input.staleRevision,
    guaranteedOutputAtomic: guaranteed.toString(),
    maximumInputAtomic:
      input.maximumInputAtomic === null ? null : input.maximumInputAtomic.toString(),
    inputMint: input.inputMint,
    outputMint: input.outputMint,
    roundUpAtomic: input.roundUpAtomic === null ? null : input.roundUpAtomic.toString(),
    rateNumeratorAtomic:
      input.rateNumeratorAtomic === null ? null : input.rateNumeratorAtomic.toString(),
    rateDenominatorMinor:
      input.rateDenominatorMinor === null ? null : input.rateDenominatorMinor.toString(),
    displayAmountThbMinor: input.displayAmountThbMinor.toString(),
    tabName: input.tabName,
    recipientName: input.recipientName,
    recipientId: input.recipientId,
    attribution: JUPITER_ATTRIBUTION,
    walletKind: input.walletKind,
    walletProvider: input.walletProvider,
    preparedTxBase64: input.preparedTxBase64,
    tokens: input.tokens.map((token) =>
      assembleQuoteToken({
        ...token,
        metadata: lookupMetadata(token.mint, input.metadata),
      }),
    ),
  };
}

export function formatAtomicLabel(atomic: string, decimals: number, symbol: string): string {
  const amount = cryptoAmountFromAtomicString(atomic, decimals);
  return `${formatCryptoAmountDisplay(amount)} ${symbol}`;
}

export function formatUsdcLabel(atomic: string | bigint): string {
  return formatAtomicLabel(atomic.toString(), USDC_DECIMALS, "USDC");
}

export function formatThbLabel(minor: string | bigint): string | null {
  try {
    const asNumber = Number(minor);
    if (!Number.isSafeInteger(asNumber)) {
      return null;
    }
    return formatFiatMinorThb(fiatMinorFromInteger(asNumber));
  } catch {
    return null;
  }
}

export function formatRateLabel(
  numeratorAtomic: string,
  denominatorMinor: string,
): string | null {
  try {
    const numerator = BigInt(numeratorAtomic);
    const denominator = BigInt(denominatorMinor);
    if (numerator <= 0n || denominator <= 0n) {
      return null;
    }
    const usdcAtomic = 10n ** BigInt(USDC_DECIMALS);
    const thbMinor = (usdcAtomic * denominator) / numerator;
    const label = formatThbLabel(thbMinor.toString());
    return label ? `${label} per USDC` : null;
  } catch {
    return null;
  }
}
