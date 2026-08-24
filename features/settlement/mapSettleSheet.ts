import type { PaymentTokenOption } from "@/components/settlement-sheet/PaymentTokenSelector";
import type { SettleSheetData } from "./types";
import { USDC_MINT, WRAPPED_SOL_MINT } from "@/lib/solana/constants";
import {
  formatAtomicLabel,
  formatRateLabel,
  formatFiatLabel,
  type AssembledQuoteToken,
  type ObligationQuoteResult,
} from "@/lib/settlement/obligationQuote";

export const EMPTY_SETTLE_SHEET: SettleSheetData = {
  status: "unavailable",
  intentId: "",
  activeInputMint: "",
  billAmountLabel: "",
  billAmount: "",
  recipientName: "",
  recipientId: "",
  destinationAsset: "USDC",
  spendLabel: "",
  maximumSpend: "",
  minimumReceiveAmount: "",
  rateLabel: "",
  quoteRemainingMs: 0,
  quoteExpired: false,
  recoveryRequired: false,
  quoteResolving: false,
  staleRevision: false,
  held: false,
  payable: false,
  roundUpLabel: "",
  roundUpAmountLabel: "",
  tokens: [],
  walletKind: null,
  walletProvider: null,
  preparedTxBase64: null,
};

export function toPaymentTokenOption(token: AssembledQuoteToken): PaymentTokenOption {
  const unit = token.mint === WRAPPED_SOL_MINT ? "SOL" : token.name;
  return {
    id: token.mint,
    name: token.name,
    balanceLabel: formatAtomicLabel(token.balanceAtomic, token.decimals, unit),
    affordable: token.affordable !== false,
    logoUri: token.logoUri,
    isVerified: token.isVerified === true,
  };
}

function tokenByMint(
  tokens: readonly AssembledQuoteToken[],
  mint: string | null,
): AssembledQuoteToken | undefined {
  if (!mint) {
    return tokens[0];
  }
  return tokens.find((token) => token.mint === mint);
}

export function mapObligationQuoteToSheet(
  quote: ObligationQuoteResult | null | undefined,
): SettleSheetData {
  if (!quote || !quote.available) {
    return {
      ...EMPTY_SETTLE_SHEET,
      unavailableReason: quote && "reason" in quote ? quote.reason : undefined,
    };
  }

  const billAmount = formatFiatLabel(
    quote.displayAmountMinor ?? quote.displayAmountThbMinor,
    quote.displayCurrency,
  );
  // Before an intent exists, a legacy `obligationAmountAtomic` is the stable
  // reference amount. It is already denominated in USDC atomic units and must
  // never be formatted with a distinct frozen receive token's decimals/symbol.
  const receiveAmountPriced =
    quote.outputMint === USDC_MINT ||
    (quote.intentId !== null &&
      !quote.quoteResolving &&
      quote.maximumInputAtomic !== null &&
      BigInt(quote.guaranteedOutputAtomic) > 0n);
  const minimumReceiveAmount = receiveAmountPriced
    ? formatAtomicLabel(quote.guaranteedOutputAtomic, quote.outputDecimals, quote.outputSymbol)
    : "";
  if (!billAmount || !quote.recipientName) {
    return EMPTY_SETTLE_SHEET;
  }

  const selected = tokenByMint(quote.tokens, quote.inputMint);
  if (quote.inputMint && !selected) {
    return {
      ...EMPTY_SETTLE_SHEET,
      unavailableReason: "TOKEN_METADATA_UNAVAILABLE",
    };
  }
  const spendAtomic = quote.maximumInputAtomic;
  let spendLabel = "";
  let maximumSpend = "";
  if (spendAtomic && selected) {
    const unit = selected.mint === WRAPPED_SOL_MINT ? "SOL" : selected.name;
    const formatted = formatAtomicLabel(spendAtomic, selected.decimals, unit);
    spendLabel = selected.mint === quote.outputMint ? formatted : `Up to ${formatted}`;
    maximumSpend = formatted;
  } else if (quote.inputMint === quote.outputMint || quote.inputMint === null) {
    spendLabel = minimumReceiveAmount;
    maximumSpend = minimumReceiveAmount;
  }

  return {
    status: "ready",
    intentId: quote.intentId ?? "",
    activeInputMint: quote.inputMint ?? "",
    billAmountLabel: quote.tabName ? `your share of ${quote.tabName}` : "your share",
    billAmount,
    recipientName: quote.recipientName,
    recipientId: quote.recipientId,
    destinationAsset: quote.outputSymbol,
    spendLabel,
    maximumSpend,
    minimumReceiveAmount,
    rateLabel:
      quote.rateNumeratorAtomic && quote.rateDenominatorMinor
        ? (formatRateLabel(
            quote.rateNumeratorAtomic,
            quote.rateDenominatorMinor,
            quote.displayCurrency,
          ) ?? "")
        : "",
    quoteRemainingMs: quote.quoteRemainingMs,
    quoteExpired: quote.quoteExpired,
    recoveryRequired: quote.status === "failed" || quote.status === "expired",
    quoteResolving: quote.quoteResolving,
    staleRevision: quote.staleRevision,
    held: quote.status === "unknown",
    payable:
      quote.status === "ready_for_signature" &&
      Boolean(quote.intentId && selected && quote.preparedTxBase64) &&
      !quote.quoteExpired &&
      !quote.staleRevision,
    roundUpLabel: "",
    roundUpAmountLabel: "",
    tokens: quote.tokens.map(toPaymentTokenOption),
    walletKind: quote.walletKind,
    walletProvider: quote.walletProvider,
    preparedTxBase64: quote.preparedTxBase64,
  };
}
