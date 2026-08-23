import { describe, expect, it } from "vitest";
import { USDC_MINT, WRAPPED_SOL_MINT } from "@/lib/solana/constants";
import {
  assembleObligationQuote,
  classifyBalanceRead,
  formatUsdcLabel,
  guaranteedReceiveAtomic,
  JUPITER_ATTRIBUTION,
} from "@/lib/settlement/obligationQuote";
import { mapObligationQuoteToSheet } from "@/features/settlement/mapSettleSheet";

const MAYA = {
  recipientName: "Maya",
  recipientId: "users:maya",
  tabName: "Sukhumvit Dinner",
  displayAmountThbMinor: 29_174n,
};

describe("guaranteedReceiveAtomic — D-08", () => {
  it("uses otherAmountThreshold and never an outAmount-shaped estimate", () => {
    const outAmount = 9_000_000n;
    const otherAmountThreshold = 8_250_000n;
    expect(
      guaranteedReceiveAtomic({
        quotedOtherAmountThreshold: otherAmountThreshold,
        minimumOutputAtomic: 8_000_000n,
        obligationAmountAtomic: 8_000_000n,
      }),
    ).toBe(otherAmountThreshold);
    expect(
      guaranteedReceiveAtomic({
        quotedOtherAmountThreshold: otherAmountThreshold,
        minimumOutputAtomic: outAmount,
        obligationAmountAtomic: outAmount,
      }),
    ).toBe(otherAmountThreshold);
    expect(formatUsdcLabel(otherAmountThreshold)).toBe("8.250000 USDC");
  });

  it("falls back to the locked obligation when no DFlow threshold exists", () => {
    expect(
      guaranteedReceiveAtomic({
        quotedOtherAmountThreshold: null,
        minimumOutputAtomic: 8_250_000n,
        obligationAmountAtomic: 8_000_000n,
      }),
    ).toBe(8_250_000n);
  });
});

describe("classifyBalanceRead — fail closed", () => {
  it("refuses a missing stored wallet", () => {
    expect(classifyBalanceRead({ payerAddress: null, rpcConfigured: true })).toBe("NO_WALLET");
  });

  it("refuses an unconfigured or failed RPC", () => {
    expect(
      classifyBalanceRead({ payerAddress: "7xKX…", rpcConfigured: false }),
    ).toBe("RPC_FAILED");
  });

  it("does not invent a pass when either half is missing", () => {
    expect(classifyBalanceRead({ payerAddress: null, rpcConfigured: false })).toBe("NO_WALLET");
  });
});

describe("mapObligationQuoteToSheet", () => {
  it("stays unavailable with no tokens when the quote is missing", () => {
    expect(mapObligationQuoteToSheet(null).status).toBe("unavailable");
    expect(mapObligationQuoteToSheet(undefined).tokens).toEqual([]);
    expect(mapObligationQuoteToSheet({ available: false, reason: "RPC_FAILED" })).toMatchObject({
      status: "unavailable",
      billAmount: "",
      tokens: [],
    });
  });

  it("puts otherAmountThreshold on the guarantee line", () => {
    const quote = assembleObligationQuote({
      ...MAYA,
      intentId: "intents:1",
      status: "ready_for_signature",
      quoteResolving: false,
      quoteExpired: false,
      quoteRemainingMs: 40_000,
      staleRevision: false,
      quotedOtherAmountThreshold: 8_250_000n,
      minimumOutputAtomic: 8_000_000n,
      obligationAmountAtomic: 8_000_000n,
      maximumInputAtomic: 41_200_000n,
      inputMint: WRAPPED_SOL_MINT,
      outputMint: USDC_MINT,
      roundUpAtomic: null,
      rateNumeratorAtomic: 1_000_000n,
      rateDenominatorMinor: 3_536n,
      walletKind: "embedded",
      walletProvider: null,
      preparedTxBase64: null,
      tokens: [
        {
          mint: WRAPPED_SOL_MINT,
          fallbackName: "Solana",
          fallbackDecimals: 9,
          balanceAtomic: 61_200_000n,
          requiredAtomic: 41_200_000n,
          affordable: true,
        },
      ],
      metadata: [
        {
          status: "ok",
          metadata: {
            mint: WRAPPED_SOL_MINT,
            symbol: "SOL",
            name: "Solana",
            decimals: 9,
            logoURI: "https://example.test/sol.png",
            verified: true,
            provenance: {
              source: "cluster_pin",
              cluster: "mainnet-beta",
              fetchedAt: 1,
              decimalsVerifiedAt: 1,
            },
          },
        },
      ],
    });

    const sheet = mapObligationQuoteToSheet(quote);
    expect(sheet.status).toBe("ready");
    expect(sheet.recipientName).toBe("Maya");
    expect(sheet.minimumReceiveAmount).toBe("8.250000 USDC");
    expect(sheet.minimumReceiveAmount).not.toContain("9.000000");
    expect(sheet.tokens[0]?.logoUri).toBe("https://example.test/sol.png");
    expect(sheet.tokens[0]?.isVerified).toBe(true);
    expect(sheet.held).toBe(false);
    expect(quote.attribution).toBe(JUPITER_ATTRIBUTION);
  });

  it("marks the sheet held when the intent is unknown", () => {
    const quote = assembleObligationQuote({
      ...MAYA,
      intentId: "intents:held",
      status: "unknown",
      quoteResolving: false,
      quoteExpired: false,
      quoteRemainingMs: 0,
      staleRevision: false,
      quotedOtherAmountThreshold: 8_250_000n,
      minimumOutputAtomic: 8_250_000n,
      obligationAmountAtomic: 8_250_000n,
      maximumInputAtomic: 8_250_000n,
      inputMint: USDC_MINT,
      outputMint: USDC_MINT,
      roundUpAtomic: null,
      rateNumeratorAtomic: null,
      rateDenominatorMinor: null,
      walletKind: "embedded",
      walletProvider: null,
      preparedTxBase64: null,
      tokens: [
        {
          mint: USDC_MINT,
          fallbackName: "USDC",
          fallbackDecimals: 6,
          balanceAtomic: 12_400_000n,
          requiredAtomic: 8_250_000n,
          affordable: true,
        },
      ],
      metadata: [],
    });

    const sheet = mapObligationQuoteToSheet(quote);
    expect(sheet.held).toBe(true);
    expect(sheet.billAmount).toBeTruthy();
    expect(sheet.billAmount).not.toMatch(/^[—–-]$/);
  });

  it("marks a token verified only when isVerified === true", () => {
    const unverified = assembleObligationQuote({
      ...MAYA,
      intentId: null,
      status: null,
      quoteResolving: false,
      quoteExpired: false,
      quoteRemainingMs: 0,
      staleRevision: false,
      quotedOtherAmountThreshold: null,
      minimumOutputAtomic: 8_250_000n,
      obligationAmountAtomic: 8_250_000n,
      maximumInputAtomic: 8_250_000n,
      inputMint: USDC_MINT,
      outputMint: USDC_MINT,
      roundUpAtomic: null,
      rateNumeratorAtomic: null,
      rateDenominatorMinor: null,
      walletKind: "external",
      walletProvider: "phantom",
      preparedTxBase64: null,
      tokens: [
        {
          mint: USDC_MINT,
          fallbackName: "USDC",
          fallbackDecimals: 6,
          balanceAtomic: 12_400_000n,
          requiredAtomic: 8_250_000n,
          affordable: true,
        },
      ],
      metadata: [
        {
          status: "ok",
          metadata: {
            mint: USDC_MINT,
            symbol: "USDC",
            name: "USD Coin",
            decimals: 6,
            logoURI: "https://example.test/usdc.png",
            verified: false,
            provenance: {
              source: "jupiter",
              cluster: "mainnet-beta",
              fetchedAt: 1,
              decimalsVerifiedAt: 1,
            },
          },
        },
      ],
    });

    expect(unverified.tokens[0]?.isVerified).toBe(false);
    expect(mapObligationQuoteToSheet(unverified).tokens[0]?.isVerified).toBe(false);
  });
});
