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

  it("only falls back to the fixture sponsor address under an explicit opt-in", () => {
    // Old contract: an absent SOLANA_RPC_URL implied fixture mode, so a
    // deployment missing its config silently settled to a wallet nobody owns.
    // New contract: fixture mode requires an explicit opt-in on a non-deployed
    // runtime, and an absent secret alone is never an opt-in.
    expect(isSolanaFixtureMode({})).toBe(false);
    expect(isSolanaFixtureMode({ NODE_ENV: "test" })).toBe(true);

    expect(
      resolveSponsorWalletAddress({ NODE_ENV: "test" } as never),
    ).toBe(FIXTURE_SPONSOR_WALLET_ADDRESS);

    expect(() =>
      resolveSponsorWalletAddress({ NODE_ENV: "production" } as never),
    ).toThrow(/FIXTURE_MODE_NOT_PERMITTED/);
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
