/**
 * Adversarial coverage for the sponsor gate.
 *
 * Every negative case below is a transaction an attacker who controls the client
 * could realistically submit. The assertion is always the same shape: the gate
 * rejects, with a named code, before anything reaches the sponsor key.
 */

import { describe, expect, it } from "vitest";
import {
  createApproveInstruction,
  createCloseAccountInstruction,
  createSetAuthorityInstruction,
  createTransferInstruction,
  AuthorityType,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  SPONSOR_POLICY_V1,
  SPONSOR_POLICY_V1_DFLOW,
  buildSponsorPolicyManifest,
  assertManifestSane,
  FORBIDDEN_FIXTURE_PROGRAM_IDS,
} from "../../lib/solana/sponsorPolicyManifest";
import {
  runDualGateValidation,
  validateBeforeClientExposure,
  validateBeforeSponsorCoSign,
  type SettlementIntentValidationContext,
} from "../../lib/solana/validateTransactionMessage";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  COMPUTE_BUDGET_PROGRAM_ID,
  MEMO_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  USDC_MINT,
} from "../../lib/solana/constants";
import { getClusterConfig } from "../../lib/solana/cluster";
import { DFLOW_FIXTURE_PROGRAM_ID } from "../../lib/dflow/constants";
import { SETTLEMENT_STATUS } from "../../convex/lib/settlementState";
import {
  BLOCKHASH,
  ata,
  buildTx,
  makeActors,
  memoFor,
  systemDrainSponsor,
  toBase64,
} from "../helpers/solanaTx";

const actors = makeActors();
const AMOUNT = 1_000_000n;

function context(
  status: string = SETTLEMENT_STATUS.READY_FOR_SIGNATURE,
): Omit<SettlementIntentValidationContext, "gate"> {
  return {
    intent: {
      payerAddress: actors.payer.publicKey.toBase58(),
      recipientAddress: actors.recipient.publicKey.toBase58(),
      inputMint: USDC_MINT,
      outputMint: USDC_MINT,
      targetOutputAtomic: AMOUNT.toString(),
      maxInputAtomic: AMOUNT.toString(),
      minimumOutputAtomic: AMOUNT.toString(),
      status,
    },
    expectedMemo: memoFor("tips:test", AMOUNT),
    sponsorAddress: actors.sponsor.publicKey.toBase58(),
    blockhash: BLOCKHASH,
    lastValidBlockHeight: 999_999_999,
    telegramContextFresh: true,
    targetSuperseded: false,
    sponsorPaused: false,
    intentId: "settlementIntents:1",
  };
}

function expectReject(base64: string, code: string, ctxOverride = {}) {
  const result = validateBeforeClientExposure(base64, {
    ...context(SETTLEMENT_STATUS.QUOTING),
    ...ctxOverride,
  });
  expect(result.ok, `expected rejection with ${code}`).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe(code);
  }
  return result;
}

describe("manifest audit", () => {
  it("never allowlists a fixture program id on any cluster", () => {
    for (const cluster of ["devnet", "mainnet-beta"] as const) {
      for (const routingKind of ["exact_usdc", "dflow_sync"] as const) {
        const manifest = buildSponsorPolicyManifest({ cluster, routingKind });
        expect(manifest.allowedPrograms).not.toContain(DFLOW_FIXTURE_PROGRAM_ID);
        for (const forbidden of FORBIDDEN_FIXTURE_PROGRAM_IDS) {
          expect(manifest.allowedPrograms).not.toContain(forbidden);
        }
      }
    }
  });

  it("rejects a manifest that reintroduces a fixture program id", () => {
    expect(() =>
      assertManifestSane({
        ...SPONSOR_POLICY_V1,
        allowedPrograms: [...SPONSOR_POLICY_V1.allowedPrograms, DFLOW_FIXTURE_PROGRAM_ID],
      }),
    ).toThrow(/fixture program id/);
  });

  it("rejects an empty or wildcarded allowlist at load time", () => {
    expect(() =>
      assertManifestSane({ ...SPONSOR_POLICY_V1, allowedPrograms: [] }),
    ).toThrow(/must not be empty/);
    expect(() =>
      assertManifestSane({ ...SPONSOR_POLICY_V1, allowedMints: ["*"] }),
    ).toThrow(/wildcard/);
  });

  it("does not allowlist the System program on the direct transfer path", () => {
    expect(SPONSOR_POLICY_V1.allowedPrograms).not.toContain(
      "11111111111111111111111111111111",
    );
  });

  it("binds the mint allowlist to the configured cluster, not a literal", () => {
    const devnet = buildSponsorPolicyManifest({
      cluster: "devnet",
      routingKind: "exact_usdc",
    });
    const mainnet = buildSponsorPolicyManifest({
      cluster: "mainnet-beta",
      routingKind: "exact_usdc",
    });
    expect(devnet.outputMint).not.toBe(mainnet.outputMint);
    expect(devnet.allowedMints).toEqual([getClusterConfig("devnet").usdcMint]);
    expect(mainnet.allowedMints).toEqual([
      getClusterConfig("mainnet-beta").usdcMint,
    ]);
  });

  it("reads the DFlow aggregator program id from cluster config", () => {
    expect(SPONSOR_POLICY_V1_DFLOW.allowedPrograms).toContain(
      getClusterConfig().dflowAggregatorProgramId,
    );
  });

  it("keeps the platform fee at zero", () => {
    expect(SPONSOR_POLICY_V1.platformFeeBps).toBe(0);
  });
});

describe("happy path", () => {
  it("accepts the transaction the server itself builds, at both gates", () => {
    const tx = buildTx({ actors, amount: AMOUNT });
    const gates = runDualGateValidation(toBase64(tx), context());
    expect(gates.preClient.ok).toBe(true);
    expect(gates.preSponsor.ok).toBe(true);
  });

  it("accepts a single recipient-ATA creation funded by the sponsor", () => {
    const tx = buildTx({ actors, amount: AMOUNT, includeAtaCreate: true });
    const result = validateBeforeClientExposure(
      toBase64(tx),
      context(SETTLEMENT_STATUS.QUOTING),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ataCreates).toBe(1);
      expect(result.sponsorExposureLamports).toBe(10_000 + 2_039_280);
    }
  });

  it("accepts transferChecked with the correct mint and decimals", () => {
    const tx = buildTx({ actors, amount: AMOUNT, useTransferChecked: true });
    expect(
      validateBeforeClientExposure(toBase64(tx), context(SETTLEMENT_STATUS.QUOTING))
        .ok,
    ).toBe(true);
  });
});

describe("fee payer and signer set", () => {
  it("rejects a transaction whose fee payer is not the sponsor", () => {
    // Attack: make the victim pay the network fee, or point the fee at an
    // account the sponsor does not control.
    const tx = buildTx({
      actors,
      feePayer: actors.payer.publicKey,
    });
    expectReject(toBase64(tx), "FEE_PAYER_MISMATCH");
  });

  it("rejects an extra required signer", () => {
    // Attack: add a third signer so the co-signed transaction is unusable, or
    // so an attacker account is granted signer authority for a CPI.
    const tx = buildTx({
      actors,
      extraInstructions: [
        new TransactionInstruction({
          programId: new PublicKey(MEMO_PROGRAM_ID),
          keys: [
            {
              pubkey: actors.attacker.publicKey,
              isSigner: true,
              isWritable: false,
            },
          ],
          data: Buffer.from(memoFor("tips:test", AMOUNT), "utf8"),
        }),
      ],
    });
    expectReject(toBase64(tx), "SIGNER_SET_INVALID");
  });

  it("rejects a transaction the payer does not sign at all", () => {
    // Attack: sponsor-only authorisation.
    const tx = buildTx({
      actors,
      authority: actors.sponsor.publicKey,
      source: ata(actors.sponsor.publicKey),
    });
    expectReject(toBase64(tx), "SIGNER_SET_INVALID");
  });
});

describe("recipient and amount binding", () => {
  it("rejects a transfer redirected to an attacker ATA", () => {
    // THE attack: the payer signs blind, the sponsor pays, the obligation is
    // marked settled, and the USDC lands in the attacker's account.
    const tx = buildTx({
      actors,
      destination: ata(actors.attacker.publicKey),
    });
    expectReject(toBase64(tx), "RECIPIENT_MISMATCH");
  });

  it("rejects a transfer sourced from an account other than the payer ATA", () => {
    // Attack: drain an account where the payer holds a delegate authority.
    const tx = buildTx({
      actors,
      source: ata(actors.attacker.publicKey),
    });
    expectReject(toBase64(tx), "TRANSFER_SOURCE_INVALID");
  });

  it("rejects an inflated amount", () => {
    const tx = buildTx({ actors, amount: 9_000_000n });
    expectReject(toBase64(tx), "AMOUNT_NOT_EXACT");
  });

  it("rejects an amount below the locked target", () => {
    // Attack: pay one atomic unit and have the obligation marked settled.
    const tx = buildTx({ actors, amount: 1n, memoText: memoFor("tips:test", AMOUNT) });
    expectReject(toBase64(tx), "AMOUNT_NOT_EXACT");
  });

  it("rejects a second transfer riding along with the legitimate one", () => {
    // Attack: the payer signs one message; a hidden second transfer drains the
    // rest of their balance to the attacker.
    const tx = buildTx({
      actors,
      extraInstructions: [
        createTransferInstruction(
          ata(actors.payer.publicKey),
          ata(actors.attacker.publicKey),
          actors.payer.publicKey,
          50_000_000n,
          [],
          new PublicKey(TOKEN_PROGRAM_ID),
        ),
      ],
    });
    expectReject(toBase64(tx), "TRANSFER_INSTRUCTION_COUNT");
  });

  it("rejects a transfer whose authority is not the payer", () => {
    const tx = buildTx({
      actors,
      authority: actors.attacker.publicKey,
    });
    // The attacker authority is not a signer, so the derived-account gate fires
    // first; either way nothing reaches the sponsor.
    const result = validateBeforeClientExposure(
      toBase64(tx),
      context(SETTLEMENT_STATUS.QUOTING),
    );
    expect(result.ok).toBe(false);
  });
});

describe("program and instruction allowlist", () => {
  it("rejects a System transfer that would drain the sponsor wallet", () => {
    // The highest-value attack against a sponsored fee payer: the sponsor is
    // already a required signer, so one System transfer empties the wallet.
    const tx = buildTx({
      actors,
      extraInstructions: [systemDrainSponsor(actors)],
    });
    expectReject(toBase64(tx), "PROGRAM_NOT_ALLOWED");
  });

  it("rejects SetAuthority on the payer token account", () => {
    // Attack: hand the attacker permanent control of the payer's USDC account,
    // long after this transaction confirms.
    const tx = buildTx({
      actors,
      extraInstructions: [
        createSetAuthorityInstruction(
          ata(actors.payer.publicKey),
          actors.payer.publicKey,
          AuthorityType.AccountOwner,
          actors.attacker.publicKey,
          [],
          new PublicKey(TOKEN_PROGRAM_ID),
        ),
      ],
    });
    expectReject(toBase64(tx), "INSTRUCTION_DISCRIMINATOR_INVALID");
  });

  it("rejects Approve (delegate) on the payer token account", () => {
    // Attack: a standing delegate lets the attacker move funds later.
    const tx = buildTx({
      actors,
      extraInstructions: [
        createApproveInstruction(
          ata(actors.payer.publicKey),
          actors.attacker.publicKey,
          actors.payer.publicKey,
          1_000_000_000n,
          [],
          new PublicKey(TOKEN_PROGRAM_ID),
        ),
      ],
    });
    expectReject(toBase64(tx), "INSTRUCTION_DISCRIMINATOR_INVALID");
  });

  it("rejects CloseAccount, which sweeps rent to a chosen destination", () => {
    const tx = buildTx({
      actors,
      extraInstructions: [
        createCloseAccountInstruction(
          ata(actors.payer.publicKey),
          actors.attacker.publicKey,
          actors.payer.publicKey,
          [],
          new PublicKey(TOKEN_PROGRAM_ID),
        ),
      ],
    });
    expectReject(toBase64(tx), "INSTRUCTION_DISCRIMINATOR_INVALID");
  });

  it("rejects a Token-2022 transfer", () => {
    // Attack: a Token-2022 mint can carry a transfer fee or a transfer hook, so
    // the recipient receives less than the instruction claims.
    const tx = buildTx({
      actors,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        createTransferInstruction(
          ata(actors.payer.publicKey),
          ata(actors.recipient.publicKey),
          actors.payer.publicKey,
          AMOUNT,
          [],
          new PublicKey(TOKEN_2022_PROGRAM_ID),
        ),
      ],
    });
    expectReject(toBase64(tx), "PROGRAM_NOT_ALLOWED");
  });

  it("rejects an unknown program entirely", () => {
    const tx = buildTx({
      actors,
      extraInstructions: [
        new TransactionInstruction({
          programId: new PublicKey("Stake11111111111111111111111111111111111111"),
          keys: [],
          data: Buffer.from([0]),
        }),
      ],
    });
    expectReject(toBase64(tx), "PROGRAM_NOT_ALLOWED");
  });
});

describe("account set", () => {
  /**
   * Isolates the deny-by-default backstop: a ComputeBudget instruction ignores
   * its account list, so an attacker can attach accounts there without changing
   * any other rule. Those accounts still end up in the signed message.
   */
  function withSmuggledAccount(isWritable: boolean) {
    return buildTx({
      actors,
      computeUnitPriceMicroLamports: null,
      extraInstructions: [
        new TransactionInstruction({
          programId: new PublicKey(COMPUTE_BUDGET_PROGRAM_ID),
          keys: [
            { pubkey: actors.attacker.publicKey, isSigner: false, isWritable },
          ],
          data: Buffer.from(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }).data,
          ),
        }),
      ],
    });
  }

  it("rejects an unexpected account appearing in the key list", () => {
    expectReject(toBase64(withSmuggledAccount(false)), "UNEXPECTED_ACCOUNT");
  });

  it("rejects a known account being made writable", () => {
    // Attack: mark the mint writable so an allowlisted program could mutate it.
    // Rejected by role, not by identity.
    const tx = buildTx({
      actors,
      computeUnitPriceMicroLamports: null,
      extraInstructions: [
        new TransactionInstruction({
          programId: new PublicKey(COMPUTE_BUDGET_PROGRAM_ID),
          keys: [
            { pubkey: new PublicKey(USDC_MINT), isSigner: false, isWritable: true },
          ],
          data: Buffer.from(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }).data,
          ),
        }),
      ],
    });
    expectReject(toBase64(tx), "UNEXPECTED_WRITABLE_ACCOUNT");
  });

  it("rejects the payer wallet being marked writable", () => {
    // Attack: a writable payer key lets an allowlisted program CPI move the
    // payer's lamports, not just their token balance.
    const tx = buildTx({
      actors,
      computeUnitPriceMicroLamports: null,
      extraInstructions: [
        new TransactionInstruction({
          programId: new PublicKey(COMPUTE_BUDGET_PROGRAM_ID),
          keys: [
            {
              pubkey: actors.payer.publicKey,
              isSigner: true,
              isWritable: true,
            },
          ],
          data: Buffer.from(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }).data,
          ),
        }),
      ],
    });
    expectReject(toBase64(tx), "UNEXPECTED_WRITABLE_ACCOUNT");
  });
});

describe("compute budget", () => {
  it("rejects a priority fee above the sponsor cap", () => {
    const tx = buildTx({
      actors,
      computeUnitPriceMicroLamports: 10_000_000,
    });
    expectReject(toBase64(tx), "PRIORITY_FEE_EXCEEDED");
  });

  it("prices a fee correctly when the price instruction precedes the limit", () => {
    // Regression: the previous implementation read the CU limit as it walked the
    // instruction list, so a price placed FIRST was multiplied by zero and every
    // priority fee passed the cap.
    const tx = buildTx({
      actors,
      priceBeforeLimit: true,
      computeUnitPriceMicroLamports: 10_000_000,
    });
    expectReject(toBase64(tx), "PRIORITY_FEE_EXCEEDED");
  });

  it("prices a fee against the chain default when no CU limit is set", () => {
    // Regression: omitting SetComputeUnitLimit made the old code compute a fee
    // of zero, while the chain would price it against its own default budget.
    const tx = buildTx({
      actors,
      computeUnitLimit: null,
      computeUnitPriceMicroLamports: 10_000_000,
    });
    expectReject(toBase64(tx), "PRIORITY_FEE_EXCEEDED");
  });

  it("rejects a compute unit limit above the cap", () => {
    const tx = buildTx({ actors, computeUnitLimit: 1_400_001 });
    expectReject(toBase64(tx), "COMPUTE_UNITS_EXCEEDED");
  });

  it("rejects duplicate compute budget instructions", () => {
    const tx = buildTx({
      actors,
      extraInstructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000 }),
      ],
    });
    expectReject(toBase64(tx), "COMPUTE_BUDGET_DUPLICATE");
  });

  it("rejects a heap-frame request the sponsor would pay for", () => {
    const tx = buildTx({
      actors,
      extraInstructions: [
        ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }),
      ],
    });
    expectReject(toBase64(tx), "INSTRUCTION_DISCRIMINATOR_INVALID");
  });

  it("computes the priority fee without floating point", () => {
    // u64 max microLamports would lose precision through Number arithmetic.
    const tx = buildTx({
      actors,
      computeUnitPriceMicroLamports: 18_446_744_073_709_551_615n,
    });
    expectReject(toBase64(tx), "PRIORITY_FEE_EXCEEDED");
  });
});

describe("memo", () => {
  it("rejects a memo bound to a different obligation", () => {
    const tx = buildTx({ actors, memoText: memoFor("tips:other", AMOUNT) });
    expectReject(toBase64(tx), "MEMO_MISMATCH");
  });

  it("rejects a free-form memo when no expected memo is supplied", () => {
    const tx = buildTx({ actors, memoText: "pay alice for dinner" });
    const ctx = context(SETTLEMENT_STATUS.QUOTING);
    delete (ctx as { expectedMemo?: string }).expectedMemo;
    const result = validateBeforeClientExposure(toBase64(tx), ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("MEMO_MISMATCH");
    }
  });

  it("rejects more than one memo", () => {
    const tx = buildTx({
      actors,
      extraInstructions: [
        new TransactionInstruction({
          programId: new PublicKey(MEMO_PROGRAM_ID),
          keys: [],
          data: Buffer.from(memoFor("tips:test", AMOUNT), "utf8"),
        }),
      ],
    });
    expectReject(toBase64(tx), "MEMO_COUNT_EXCEEDED");
  });
});

describe("freshness and hash binding", () => {
  it("rejects a stale blockhash", () => {
    const tx = buildTx({ actors, blockhash: "11111111111111111111111111111112" });
    expectReject(toBase64(tx), "BLOCKHASH_STALE");
  });

  it("rejects a message hash that does not match the persisted one", () => {
    const tx = buildTx({ actors });
    const ctx = context(SETTLEMENT_STATUS.QUOTING);
    expectReject(toBase64(tx), "MESSAGE_HASH_MISMATCH", {
      intent: { ...ctx.intent, messageHash: "0".repeat(64) },
    });
  });

  it("rejects an unparseable payload", () => {
    expectReject("not-base64-at-all!!", "MESSAGE_DECODE_FAILED");
  });

  it("rejects trailing bytes appended after a valid transaction", () => {
    const tx = buildTx({ actors });
    const bytes = tx.serialize();
    const padded = new Uint8Array(bytes.length + 4);
    padded.set(bytes);
    expectReject(Buffer.from(padded).toString("base64"), "MESSAGE_DECODE_FAILED");
  });
});

describe("mint binding", () => {
  it("rejects an intent carrying the other cluster's USDC mint", () => {
    // A devnet deployment validating a mainnet mint (or the reverse) is a
    // wrong-cluster transaction, not a warning.
    const other =
      getClusterConfig().cluster === "devnet"
        ? getClusterConfig("mainnet-beta").usdcMint
        : getClusterConfig("devnet").usdcMint;
    const tx = buildTx({ actors });
    const ctx = context(SETTLEMENT_STATUS.QUOTING);
    expectReject(toBase64(tx), "MINT_MISMATCH", {
      intent: { ...ctx.intent, outputMint: other, inputMint: other },
    });
  });
});

describe("state, pause and reservation gates", () => {
  it("rejects when the sponsor kill switch is on", () => {
    const tx = buildTx({ actors });
    expectReject(toBase64(tx), "SPONSOR_PAUSED", { sponsorPaused: true });
  });

  it("rejects at the pre-sponsor gate without an active reservation", () => {
    const tx = buildTx({ actors });
    const result = validateBeforeSponsorCoSign(toBase64(tx), {
      ...context(),
      reservationActive: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("RESERVATION_MISSING");
    }
  });

  it("rejects a reservation owned by a different intent", () => {
    const tx = buildTx({ actors });
    const result = validateBeforeSponsorCoSign(toBase64(tx), {
      ...context(),
      reservationActive: true,
      reservationOwnerIntentId: "settlementIntents:someone-else",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("RESERVATION_OWNER_MISMATCH");
    }
  });

  it("rejects an expired intent at the pre-sponsor gate", () => {
    const tx = buildTx({ actors });
    const ctx = context();
    const result = validateBeforeSponsorCoSign(toBase64(tx), {
      ...ctx,
      reservationActive: true,
      reservationOwnerIntentId: ctx.intentId,
      nowMs: 2_000,
      intent: { ...ctx.intent, expiresAt: 1_000 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INTENT_STATUS_INVALID");
    }
  });

  it("rejects a self payment", () => {
    const tx = buildTx({ actors });
    const ctx = context(SETTLEMENT_STATUS.QUOTING);
    expectReject(toBase64(tx), "SELF_PAYMENT", {
      intent: {
        ...ctx.intent,
        recipientAddress: actors.payer.publicKey.toBase58(),
      },
    });
  });

  it("rejects a superseded bill revision", () => {
    const tx = buildTx({ actors });
    const ctx = context(SETTLEMENT_STATUS.QUOTING);
    expectReject(toBase64(tx), "TARGET_SUPERSEDED", {
      intent: { ...ctx.intent, lockedRevision: 3 },
      currentTabRevision: 4,
    });
  });

  it("rejects a policy version that does not match the manifest", () => {
    const tx = buildTx({ actors });
    const ctx = context(SETTLEMENT_STATUS.QUOTING);
    expectReject(toBase64(tx), "POLICY_VERSION_MISMATCH", {
      intent: { ...ctx.intent, policyVersion: "sponsor-v0" },
    });
  });
});

describe("routed (DFlow) path", () => {
  it("never reaches sponsor co-sign until lookup tables are resolved", () => {
    const tx = buildTx({ actors, includeMemo: false });
    const result = validateBeforeSponsorCoSign(toBase64(tx), {
      ...context(),
      routingKind: "dflow_sync",
      reservationActive: true,
      reservationOwnerIntentId: context().intentId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("DFLOW_ROUTED_VALIDATION_INCOMPLETE");
    }
  });
});
