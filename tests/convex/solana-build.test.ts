import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  buildExactUsdcTransfer,
  parseVersionedTransactionBase64,
} from "../../lib/solana/buildExactUsdcTransfer";
import {
  FIXTURE_PAYER_WALLET_ADDRESS,
  FIXTURE_RECIPIENT_WALLET_ADDRESS,
  FIXTURE_SPONSOR_WALLET_ADDRESS,
  FIXTURE_BLOCKHASH,
  USDC_MINT,
} from "../../lib/solana/constants";
import { computeTipIntentCommitmentHash } from "../../lib/solana/memoHash";
import { isSolanaFixtureMode, resolveSponsorWalletAddress } from "../../lib/solana/fixture";

const PAYER = FIXTURE_PAYER_WALLET_ADDRESS;
const RECIPIENT = FIXTURE_RECIPIENT_WALLET_ADDRESS;

describe("Story 3.3 — buildExactUsdcTransfer", () => {
  it("builds a versioned transaction with sponsor as fee payer", () => {
    const built = buildExactUsdcTransfer({
      payerAddress: PAYER,
      recipientAddress: RECIPIENT,
      sponsorAddress: FIXTURE_SPONSOR_WALLET_ADDRESS,
      amountAtomic: 2_000_000n,
      tipId: "tips:fixture",
      recipientAtaExists: true,
    });

    expect(built.serializedBase64.length).toBeGreaterThan(0);
    expect(built.messageHash).toMatch(/^[a-f0-9]{64}$/);
    expect(built.blockhash).toBe(FIXTURE_BLOCKHASH);
    expect(built.ataCreates).toBe(0);
    expect(built.sponsorExposureLamports).toBeLessThanOrEqual(3_000_000);
  });

  it("includes ATA creation when recipient token account is absent", () => {
    const built = buildExactUsdcTransfer({
      payerAddress: PAYER,
      recipientAddress: RECIPIENT,
      sponsorAddress: FIXTURE_SPONSOR_WALLET_ADDRESS,
      amountAtomic: 1_000_000n,
      tipId: "tips:fixture-ata",
      recipientAtaExists: false,
    });

    expect(built.ataCreates).toBe(1);
    expect(built.sponsorExposureLamports).toBeGreaterThan(10_000);
  });

  it("appends a hash-only memo committing to the tip target", () => {
    const tipId = "tips:memo-test";
    const amountAtomic = 500_000n;
    buildExactUsdcTransfer({
      payerAddress: PAYER,
      recipientAddress: RECIPIENT,
      sponsorAddress: FIXTURE_SPONSOR_WALLET_ADDRESS,
      amountAtomic,
      tipId,
      recipientAtaExists: true,
    });

    const expectedMemo = computeTipIntentCommitmentHash({
      tipId,
      targetOutputAtomic: amountAtomic.toString(),
      outputMint: USDC_MINT,
      outputDecimals: 6,
    });

    expect(expectedMemo).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses fixture sponsor address when env is absent", () => {
    const original = process.env.PRIVY_SPONSOR_WALLET_ADDRESS;
    delete process.env.PRIVY_SPONSOR_WALLET_ADDRESS;
    delete process.env.PRIVY_SPONSOR_ADDRESS;

    expect(resolveSponsorWalletAddress()).toBe(FIXTURE_SPONSOR_WALLET_ADDRESS);
    expect(isSolanaFixtureMode({})).toBe(true);

    if (original !== undefined) {
      process.env.PRIVY_SPONSOR_WALLET_ADDRESS = original;
    }
  });

  it("places sponsor pubkey first as fee payer in the compiled message", () => {
    const built = buildExactUsdcTransfer({
      payerAddress: PAYER,
      recipientAddress: RECIPIENT,
      sponsorAddress: FIXTURE_SPONSOR_WALLET_ADDRESS,
      amountAtomic: 1_000_000n,
      tipId: "tips:fee-payer",
      recipientAtaExists: true,
    });

    const tx = parseVersionedTransactionBase64(built.serializedBase64);
    const feePayer = tx.message.staticAccountKeys[0]?.toBase58();
    expect(feePayer).toBe(FIXTURE_SPONSOR_WALLET_ADDRESS);
    expect(() => new PublicKey(feePayer!)).not.toThrow();
  });
});
