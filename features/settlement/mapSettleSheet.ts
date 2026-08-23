import type { PaymentTokenOption } from "@/components/settlement-sheet/PaymentTokenSelector";
import type { SettleSheetData } from "./types";
import { WRAPPED_SOL_MINT } from "@/lib/solana/constants";
import {
  formatAtomicLabel,
  formatRateLabel,
  formatThbLabel,
  formatUsdcLabel,
  type AssembledQuoteToken,
  type ObligationQuoteResult,
} from "@/lib/settlement/obligationQuote";

export const EMPTY_SETTLE_SHEET: SettleSheetData = {
  status: "unavailable",
  intentId: "",
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
  quoteResolving: false,
  staleRevision: false,
  held: false,
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
  return tokens.find((token) => token.mint === mint) ?? tokens[0];
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

  const billAmount = formatThbLabel(quote.displayAmountThbMinor);
  const minimumReceiveAmount = formatUsdcLabel(quote.guaranteedOutputAtomic);
  if (!billAmount || !minimumReceiveAmount || !quote.recipientName) {
    return EMPTY_SETTLE_SHEET;
  }

  const selected = tokenByMint(quote.tokens, quote.inputMint);
  const spendAtomic = quote.maximumInputAtomic;
  let spendLabel = "";
  let maximumSpend = "";
  if (spendAtomic && selected) {
    const unit = selected.mint === WRAPPED_SOL_MINT ? "SOL" : selected.name;
    const formatted = formatAtomicLabel(spendAtomic, selected.decimals, unit);
    spendLabel = selected.mint === quote.outputMint ? formatted : `≈ ${formatted}`;
    maximumSpend = formatted;
  } else if (quote.inputMint === quote.outputMint || quote.inputMint === null) {
    spendLabel = minimumReceiveAmount;
    maximumSpend = minimumReceiveAmount;
  }

  return {
    status: "ready",
    intentId: quote.intentId ?? "",
    billAmountLabel: quote.tabName ? `your share of ${quote.tabName}` : "your share",
    billAmount,
    recipientName: quote.recipientName,
    recipientId: quote.recipientId,
    destinationAsset: "USDC",
    spendLabel,
    maximumSpend,
    minimumReceiveAmount,
    rateLabel:
      quote.rateNumeratorAtomic && quote.rateDenominatorMinor
        ? (formatRateLabel(quote.rateNumeratorAtomic, quote.rateDenominatorMinor) ?? "")
        : "",
    quoteRemainingMs: quote.quoteRemainingMs,
    quoteExpired: quote.quoteExpired,
    quoteResolving: quote.quoteResolving,
    staleRevision: quote.staleRevision,
    held: quote.status === "unknown",
    roundUpLabel: "",
    roundUpAmountLabel: "",
    tokens: quote.tokens.map(toPaymentTokenOption),
    walletKind: quote.walletKind,
    walletProvider: quote.walletProvider,
    preparedTxBase64: quote.preparedTxBase64,
  };
}
