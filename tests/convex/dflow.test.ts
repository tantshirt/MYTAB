import { describe, expect, it } from "vitest";
import {
  buildDflowFixtureQuote,
  isDflowFixtureMode,
} from "../../lib/dflow/fixture";
import {
  buildDflowOrderRequestParams,
  validateDflowOrderResponse,
} from "../../convex/internal/dflow";
import { parseDflowOrderResponse } from "../../lib/dflow/schema";
import {
  FIXTURE_PAYER_WALLET_ADDRESS,
  FIXTURE_RECIPIENT_WALLET_ADDRESS,
  FIXTURE_SPONSOR_WALLET_ADDRESS,
  USDC_MINT,
  WRAPPED_SOL_MINT,
} from "../../lib/solana/constants";
import { DFLOW_ORDER_PARAMS } from "../../lib/dflow/constants";
import { createHash } from "node:crypto";
import { parseVersionedTransactionBase64 } from "../../lib/solana/buildExactUsdcTransfer";
import { verifyPartialSignedMessage } from "../../convex/lib/solanaFixture";

describe("Story 6.2 — DFlow order fixture", () => {
  it("uses fixed sponsor and destination parameters", () => {
    const params = buildDflowOrderRequestParams({
      inputMint: WRAPPED_SOL_MINT,
      outputMint: USDC_MINT,
      inputAmountAtomic: 50_000_000n,
      payerAddress: FIXTURE_PAYER_WALLET_ADDRESS,
      recipientAddress: FIXTURE_RECIPIENT_WALLET_ADDRESS,
      sponsorAddress: FIXTURE_SPONSOR_WALLET_ADDRESS,
    });

    expect(params.sponsor).toBe(FIXTURE_SPONSOR_WALLET_ADDRESS);
    expect(params.destinationWallet).toBe(FIXTURE_RECIPIENT_WALLET_ADDRESS);
    expect(params.sponsorExec).toBe(false);
    expect(params.allowSyncExec).toBe(DFLOW_ORDER_PARAMS.allowSyncExec);
    expect(params.allowAsyncExec).toBe(false);
    expect(params.includeAddressLookupTables).toBe(true);
    expect(params).not.toHaveProperty("feeAccount");
  });

  it("validates fixture responses with Zod and reads otherAmountThreshold", () => {
    const quote = buildDflowFixtureQuote({
      inputMint: WRAPPED_SOL_MINT,
      outputMint: USDC_MINT,
      inputAmountAtomic: 100_000_000n,
      minimumOutputAtomic: 10_000_000n,
      sponsorAddress: FIXTURE_SPONSOR_WALLET_ADDRESS,
      destinationWallet: FIXTURE_RECIPIENT_WALLET_ADDRESS,
      payerAddress: FIXTURE_PAYER_WALLET_ADDRESS,
    });

    const parsed = validateDflowOrderResponse(quote);
    expect(parsed.executionMode).toBe("sync");
    expect(parsed.destinationWalletMustSign).toBe(false);
    expect(BigInt(parsed.otherAmountThreshold)).toBeGreaterThanOrEqual(10_000_000n);
  });

  it("rejects async execution mode at the boundary", () => {
    expect(() =>
      parseDflowOrderResponse({
        transaction: "abc",
        outAmount: "1",
        otherAmountThreshold: "1",
        contextSlot: 1,
        executionMode: "async",
        destinationWalletMustSign: false,
      }),
    ).toThrow();
  });

  it("preserves message bytes for co-sign verification", () => {
    const quote = buildDflowFixtureQuote({
      inputMint: WRAPPED_SOL_MINT,
      outputMint: USDC_MINT,
      inputAmountAtomic: 100_000_000n,
      minimumOutputAtomic: 10_000_000n,
      sponsorAddress: FIXTURE_SPONSOR_WALLET_ADDRESS,
      destinationWallet: FIXTURE_RECIPIENT_WALLET_ADDRESS,
      payerAddress: FIXTURE_PAYER_WALLET_ADDRESS,
    });

    const tx = parseVersionedTransactionBase64(quote.transaction);
    const hash = createHash("sha256").update(tx.message.serialize()).digest("hex");
    expect(hash).toBe(quote.messageHash);

    const partial = `${quote.transaction}::message=${quote.transaction}::userSig=fixture-user`;
    const fixtureCheck = verifyPartialSignedMessage(partial, hashMessageBytes(quote.transaction));
    expect(fixtureCheck.ok).toBe(true);
  });

  it("runs in fixture mode without an API key", () => {
    expect(isDflowFixtureMode({})).toBe(true);
    expect(isDflowFixtureMode({ DFLOW_API_KEY: "live-key" })).toBe(false);
  });
});

function hashMessageBytes(messageBytes: string): string {
  return createHash("sha256").update(messageBytes).digest("hex");
}
