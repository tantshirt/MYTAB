import { buildExactUsdcTransfer } from "../solana/buildExactUsdcTransfer";
import type { DflowOrderResponse } from "./schema";
import { resolveFixtureBlockhash } from "../solana/fixture";

export type DflowFixtureQuoteInput = {
  inputMint: string;
  outputMint: string;
  inputAmountAtomic: bigint;
  minimumOutputAtomic: bigint;
  sponsorAddress: string;
  destinationWallet: string;
  payerAddress: string;
};

export type DflowFixtureQuoteResult = DflowOrderResponse & {
  serializedTransactionBase64: string;
  messageHash: string;
  blockhash: string;
  lastValidBlockHeight: number;
  sponsorExposureLamports: number;
  ataCreates: number;
};

/**
 * Deterministic DFlow fixture quote — builds a real serialized transaction without memo (Story 6.2 AC6).
 */
export function buildDflowFixtureQuote(input: DflowFixtureQuoteInput): DflowFixtureQuoteResult {
  const ratioNumerator = 10n;
  const ratioDenominator = 9n;
  const projectedOutput = (input.inputAmountAtomic * ratioNumerator) / ratioDenominator;
  const threshold =
    projectedOutput >= input.minimumOutputAtomic ? projectedOutput : input.minimumOutputAtomic;

  const built = buildExactUsdcTransfer({
    payerAddress: input.payerAddress,
    recipientAddress: input.destinationWallet,
    sponsorAddress: input.sponsorAddress,
    amountAtomic: threshold,
    recipientAtaExists: true,
    skipMemo: true,
  });

  const fixture = resolveFixtureBlockhash();

  return {
    transaction: built.serializedBase64,
    outAmount: threshold.toString(),
    otherAmountThreshold: threshold.toString(),
    contextSlot: 424_242_424,
    executionMode: "sync",
    destinationWalletMustSign: false,
    lastValidBlockHeight: built.lastValidBlockHeight,
    addressLookupTableAddresses: [],
    serializedTransactionBase64: built.serializedBase64,
    messageHash: built.messageHash,
    blockhash: built.blockhash,
    sponsorExposureLamports: built.sponsorExposureLamports,
    ataCreates: built.ataCreates,
  };
}

/** True when no DFlow API key is configured — offline fixture only. */
export function isDflowFixtureMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return !env.DFLOW_API_KEY?.trim();
}
