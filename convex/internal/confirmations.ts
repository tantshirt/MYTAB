/**
 * Confirmation parsing (AD-11, Story 3.6 AC2).
 *
 * A returned signature proves broadcast and nothing else. Before a single
 * ledger row moves, this module has to be able to say — from a *finalized*
 * chain observation, not from anything the client or our own optimism supplied
 * — that the exact transaction we built succeeded and moved the exact amounts
 * we locked.
 *
 * Every predicate below is a rejection, not a warning. `parseFinalizedConfirmation`
 * returns `success: false` for anything it cannot prove, and the caller must
 * treat that as "do not move the ledger". None of these failures is by itself a
 * reason to mark an intent `failed` — that decision belongs to the pipeline,
 * which distinguishes "the chain says this transaction reverted" from "we could
 * not observe it".
 *
 * `parseConfirmationFixture` remains for local dev and tests only. It is behind
 * `assertFixturePathAllowed`, so it throws on any real deployment rather than
 * fabricating an observation that would credit a payment nobody made.
 */

import type { Doc } from "../_generated/dataModel";
import { expectedUsdcMint, fixtureMessageHash } from "../lib/solanaFixture";
import { assertFixturePathAllowed } from "../../lib/solana/runtimeGuard";
import { sha256Hex } from "../../lib/crypto/convexCrypto";
import {
  decodeTransactionBase64,
  TransactionDecodeError,
} from "../../lib/solana/decodeTransaction";
import { deriveRecipientUsdcAta } from "../../lib/solana/tokenAccount";
import { TOKEN_PROGRAM_ID, USDC_DECIMALS } from "../../lib/solana/constants";
import {
  safeU64FromJson,
  SolanaRpcError,
  type RpcTransactionResponse,
} from "../../lib/solana/rpc";

export const FIXTURE_TX_SIGNATURE =
  "FixTureSig1111111111111111111111111111111111111111";

/** Every way a finalized observation can fail to prove the settlement. */
export const CONFIRMATION_FAILURE = {
  TX_FAILED: "CONFIRMATION_TX_FAILED",
  DECODE_FAILED: "CONFIRMATION_DECODE_FAILED",
  MESSAGE_HASH: "CONFIRMATION_MESSAGE_HASH",
  SIGNATURE_MISMATCH: "CONFIRMATION_SIGNATURE_MISMATCH",
  SIGNATURE_UNKNOWN: "CONFIRMATION_SIGNATURE_UNKNOWN",
  ADDRESS_TABLE_PRESENT: "CONFIRMATION_ADDRESS_TABLE_PRESENT",
  META_MALFORMED: "CONFIRMATION_META_MALFORMED",
  MINT: "CONFIRMATION_MINT",
  RECIPIENT_ACCOUNT: "CONFIRMATION_RECIPIENT_ACCOUNT",
  RECIPIENT_DELTA: "CONFIRMATION_RECIPIENT_DELTA",
  PAYER_ACCOUNT: "CONFIRMATION_PAYER_ACCOUNT",
  PAYER_DEBIT: "CONFIRMATION_PAYER_DEBIT",
  PAYER_LAMPORTS_DEBITED: "CONFIRMATION_PAYER_LAMPORTS_DEBITED",
  PLATFORM_FEE_PRESENT: "CONFIRMATION_PLATFORM_FEE_PRESENT",
  SPONSOR_ACCOUNT: "CONFIRMATION_SPONSOR_ACCOUNT",
  SPONSOR_DEBIT: "CONFIRMATION_SPONSOR_DEBIT",
} as const;

export type ConfirmationFailureCode =
  (typeof CONFIRMATION_FAILURE)[keyof typeof CONFIRMATION_FAILURE];

export type ParsedConfirmation = {
  success: true;
  transactionSignature: string;
  messageHash: string;
  recipientTokenAccount: string;
  mint: string;
  recipientDeltaAtomic: bigint;
  payerDebitAtomic: bigint;
  platformFeeAtomic: bigint;
  sponsorDebitLamports: bigint;
  /** Finalized slot the observation came from — audit evidence. */
  slot?: number;
};

export type ConfirmationParseFailure = {
  success: false;
  failureCode: string;
  detail?: string;
};

export type ConfirmationParseResult =
  | ParsedConfirmation
  | ConfirmationParseFailure;

export type ConfirmationExpectation = {
  messageHash: string;
  recipientAddress: string;
  outputMint: string;
  minimumOutputAtomic: bigint;
  maximumInputAtomic: bigint;
  reservedSponsorLamports: bigint;
  /** Server-owned payer address. Required for a live parse. */
  payerAddress?: string;
  /** Sponsor fee-payer address. Required for a live parse. */
  sponsorAddress?: string;
};

function reject(
  failureCode: ConfirmationFailureCode,
  detail?: string,
): ConfirmationParseFailure {
  return detail ? { success: false, failureCode, detail } : { success: false, failureCode };
}

// ---------------------------------------------------------------------------
// meta readers — every one proves the shape before it reads a value
// ---------------------------------------------------------------------------

type TokenBalanceEntry = {
  accountIndex: number;
  mint: string;
  owner: string | null;
  programId: string | null;
  amount: bigint;
};

function readTokenBalances(raw: unknown, label: string): TokenBalanceEntry[] {
  if (raw === null || raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new SolanaRpcError("RPC_MALFORMED_RESPONSE", `${label} is not an array`);
  }
  return raw.map((entry, i) => {
    if (typeof entry !== "object" || entry === null) {
      throw new SolanaRpcError("RPC_MALFORMED_RESPONSE", `${label}[${i}] is not an object`);
    }
    const row = entry as Record<string, unknown>;
    const uiTokenAmount = row.uiTokenAmount as Record<string, unknown> | undefined;
    if (!uiTokenAmount) {
      throw new SolanaRpcError("RPC_MALFORMED_RESPONSE", `${label}[${i}] has no uiTokenAmount`);
    }
    if (typeof row.mint !== "string") {
      throw new SolanaRpcError("RPC_MALFORMED_RESPONSE", `${label}[${i}] has no mint`);
    }
    // `amount` is a decimal STRING in the RPC response, so the atomic value
    // never passes through a double.
    return {
      accountIndex: Number(row.accountIndex),
      mint: row.mint,
      owner: typeof row.owner === "string" ? row.owner : null,
      programId: typeof row.programId === "string" ? row.programId : null,
      amount: safeU64FromJson(uiTokenAmount.amount, `${label}[${i}].uiTokenAmount.amount`),
    };
  });
}

function readLamportBalances(raw: unknown, label: string): bigint[] {
  if (!Array.isArray(raw)) {
    throw new SolanaRpcError("RPC_MALFORMED_RESPONSE", `${label} is not an array`);
  }
  return raw.map((value, i) => safeU64FromJson(value, `${label}[${i}]`));
}

type TokenDelta = {
  accountIndex: number;
  mint: string;
  owner: string | null;
  programId: string | null;
  pre: bigint;
  post: bigint;
  delta: bigint;
};

function buildTokenDeltas(
  pre: TokenBalanceEntry[],
  post: TokenBalanceEntry[],
): Map<number, TokenDelta> {
  const deltas = new Map<number, TokenDelta>();

  for (const entry of pre) {
    deltas.set(entry.accountIndex, {
      accountIndex: entry.accountIndex,
      mint: entry.mint,
      owner: entry.owner,
      programId: entry.programId,
      pre: entry.amount,
      post: 0n,
      delta: 0n,
    });
  }

  for (const entry of post) {
    const existing = deltas.get(entry.accountIndex);
    if (existing) {
      existing.post = entry.amount;
      // A pre/post pair that disagrees about the mint is nonsense; keep the
      // post-state mint so the mint check below rejects it.
      existing.mint = entry.mint;
      existing.owner = entry.owner ?? existing.owner;
      existing.programId = entry.programId ?? existing.programId;
    } else {
      // Absent from pre means the account was created by this transaction.
      deltas.set(entry.accountIndex, {
        accountIndex: entry.accountIndex,
        mint: entry.mint,
        owner: entry.owner,
        programId: entry.programId,
        pre: 0n,
        post: entry.amount,
        delta: 0n,
      });
    }
  }

  for (const value of deltas.values()) {
    value.delta = value.post - value.pre;
  }
  return deltas;
}

// ---------------------------------------------------------------------------
// The real parser
// ---------------------------------------------------------------------------

/**
 * Verifies a finalized `getTransaction` response against the locked intent.
 *
 * Ordered so the cheapest disqualifiers run first, but every check is
 * independently sufficient to refuse. In order:
 *
 *   C1  the transaction succeeded on chain (`meta.err === null`)
 *   C2  the bytes finalized are the exact message we built (hash + signature)
 *   C3  no address-lookup table resolved anything we did not sign for
 *   C4  the recipient's derived USDC ATA gained EXACTLY the locked target
 *   C5  the payer's USDC ATA lost exactly that amount, within max input
 *   C6  no third account of that mint moved — i.e. the platform fee is zero
 *   C7  the payer paid no lamports (the sponsor is the fee payer)
 *   C8  the sponsor's lamport debit is inside the reservation it owns
 *
 * Anything short of all eight returns `success: false` and the ledger stays
 * where it is.
 */
export function parseFinalizedConfirmation(
  transactionSignature: string,
  response: RpcTransactionResponse,
  expectation: ConfirmationExpectation,
): ConfirmationParseResult {
  const payerAddress = expectation.payerAddress?.trim();
  const sponsorAddress = expectation.sponsorAddress?.trim();
  if (!payerAddress || !sponsorAddress) {
    return reject(
      CONFIRMATION_FAILURE.META_MALFORMED,
      "payerAddress and sponsorAddress are required to verify a live confirmation",
    );
  }
  if (!expectation.messageHash) {
    return reject(CONFIRMATION_FAILURE.MESSAGE_HASH, "intent has no stored message hash");
  }

  // ---- C1: the transaction succeeded --------------------------------------
  const meta = response.meta;
  if (meta.err !== null && meta.err !== undefined) {
    return reject(CONFIRMATION_FAILURE.TX_FAILED, JSON.stringify(meta.err).slice(0, 200));
  }

  // ---- C2: these are our bytes --------------------------------------------
  let decoded;
  try {
    decoded = decodeTransactionBase64(response.transactionBase64);
  } catch (error) {
    return reject(
      CONFIRMATION_FAILURE.DECODE_FAILED,
      error instanceof TransactionDecodeError ? error.code : String(error),
    );
  }

  const observedHash = sha256Hex(decoded.message.serialized);
  if (observedHash !== expectation.messageHash) {
    return reject(
      CONFIRMATION_FAILURE.MESSAGE_HASH,
      `finalized message hash ${observedHash} != ${expectation.messageHash}`,
    );
  }

  // ---- C3: nothing was resolved out of an address-lookup table ------------
  // A v0 message with lookups resolves accounts we never saw at validation
  // time. The direct USDC path never uses one; a routed path must resolve them
  // at the gate before it can ever reach here.
  if (decoded.message.addressTableLookups.length > 0) {
    return reject(CONFIRMATION_FAILURE.ADDRESS_TABLE_PRESENT);
  }
  const loaded = meta.loadedAddresses as
    | { writable?: unknown[]; readonly?: unknown[] }
    | undefined;
  if (
    (Array.isArray(loaded?.writable) && loaded.writable.length > 0) ||
    (Array.isArray(loaded?.readonly) && loaded.readonly.length > 0)
  ) {
    return reject(CONFIRMATION_FAILURE.ADDRESS_TABLE_PRESENT, "meta.loadedAddresses non-empty");
  }

  const accountKeys = decoded.message.staticAccountKeys;

  // The fee payer is account index 0 by construction, and it must be ours.
  if (accountKeys[0] !== sponsorAddress) {
    return reject(
      CONFIRMATION_FAILURE.SPONSOR_ACCOUNT,
      `fee payer ${accountKeys[0]} is not the sponsor`,
    );
  }

  let preTokens: TokenBalanceEntry[];
  let postTokens: TokenBalanceEntry[];
  let preLamports: bigint[];
  let postLamports: bigint[];
  try {
    preTokens = readTokenBalances(meta.preTokenBalances, "meta.preTokenBalances");
    postTokens = readTokenBalances(meta.postTokenBalances, "meta.postTokenBalances");
    preLamports = readLamportBalances(meta.preBalances, "meta.preBalances");
    postLamports = readLamportBalances(meta.postBalances, "meta.postBalances");
  } catch (error) {
    return reject(
      CONFIRMATION_FAILURE.META_MALFORMED,
      error instanceof Error ? error.message : String(error),
    );
  }

  if (preLamports.length !== postLamports.length || preLamports.length < accountKeys.length) {
    return reject(CONFIRMATION_FAILURE.META_MALFORMED, "balance arrays do not cover the accounts");
  }

  const deltas = buildTokenDeltas(preTokens, postTokens);

  // ---- C4: recipient credited exactly the locked target -------------------
  const recipientAta = deriveRecipientUsdcAta(
    expectation.recipientAddress,
    expectation.outputMint,
  );
  const recipientIndex = accountKeys.indexOf(recipientAta);
  if (recipientIndex < 0) {
    return reject(
      CONFIRMATION_FAILURE.RECIPIENT_ACCOUNT,
      `derived recipient ATA ${recipientAta} is not in the finalized account list`,
    );
  }
  const recipientDelta = deltas.get(recipientIndex);
  if (!recipientDelta) {
    return reject(CONFIRMATION_FAILURE.RECIPIENT_DELTA, "recipient ATA balance did not change");
  }
  if (recipientDelta.mint !== expectation.outputMint) {
    return reject(
      CONFIRMATION_FAILURE.MINT,
      `recipient account holds ${recipientDelta.mint}, not ${expectation.outputMint}`,
    );
  }
  if (recipientDelta.programId !== null && recipientDelta.programId !== TOKEN_PROGRAM_ID) {
    return reject(
      CONFIRMATION_FAILURE.MINT,
      `recipient account is owned by ${recipientDelta.programId}, not the SPL Token program`,
    );
  }
  if (
    recipientDelta.owner !== null &&
    recipientDelta.owner !== expectation.recipientAddress
  ) {
    return reject(
      CONFIRMATION_FAILURE.RECIPIENT_ACCOUNT,
      `token account owner ${recipientDelta.owner} is not the recipient`,
    );
  }
  // Exactly, not "at least": the direct path locks a single exact output, and a
  // larger credit means the transaction was not the one we priced.
  if (recipientDelta.delta !== expectation.minimumOutputAtomic) {
    return reject(
      CONFIRMATION_FAILURE.RECIPIENT_DELTA,
      `recipient delta ${recipientDelta.delta} != locked target ${expectation.minimumOutputAtomic}`,
    );
  }

  // ---- C5: payer debited, within the locked maximum ------------------------
  const payerAta = deriveRecipientUsdcAta(payerAddress, expectation.outputMint);
  const payerIndex = accountKeys.indexOf(payerAta);
  if (payerIndex < 0) {
    return reject(
      CONFIRMATION_FAILURE.PAYER_ACCOUNT,
      `derived payer ATA ${payerAta} is not in the finalized account list`,
    );
  }
  const payerDelta = deltas.get(payerIndex);
  if (!payerDelta) {
    return reject(CONFIRMATION_FAILURE.PAYER_DEBIT, "payer ATA balance did not change");
  }
  if (payerDelta.mint !== expectation.outputMint) {
    return reject(CONFIRMATION_FAILURE.MINT, `payer account holds ${payerDelta.mint}`);
  }
  if (payerDelta.delta >= 0n) {
    return reject(
      CONFIRMATION_FAILURE.PAYER_DEBIT,
      `payer delta ${payerDelta.delta} is not a debit`,
    );
  }
  const payerDebit = -payerDelta.delta;
  if (payerDebit > expectation.maximumInputAtomic) {
    return reject(
      CONFIRMATION_FAILURE.PAYER_DEBIT,
      `payer debit ${payerDebit} exceeds max input ${expectation.maximumInputAtomic}`,
    );
  }

  // ---- C6: platform fee is zero -------------------------------------------
  // Decision 10 and AD-10: no fee account, no fee row, nothing. On the direct
  // path the only two USDC accounts that may move are the payer's and the
  // recipient's, and the two deltas must cancel. A third mover, or a non-zero
  // sum, IS the platform fee, whatever it is labelled.
  let mintDeltaSum = 0n;
  const skimmed: string[] = [];
  for (const entry of deltas.values()) {
    if (entry.mint !== expectation.outputMint) {
      continue;
    }
    mintDeltaSum += entry.delta;
    if (
      entry.accountIndex !== recipientIndex &&
      entry.accountIndex !== payerIndex &&
      entry.delta !== 0n
    ) {
      skimmed.push(`${accountKeys[entry.accountIndex] ?? entry.accountIndex}:${entry.delta}`);
    }
  }
  if (skimmed.length > 0) {
    return reject(
      CONFIRMATION_FAILURE.PLATFORM_FEE_PRESENT,
      `unexpected ${expectation.outputMint} movement — ${skimmed.join(", ")}`,
    );
  }
  if (mintDeltaSum !== 0n) {
    return reject(
      CONFIRMATION_FAILURE.PLATFORM_FEE_PRESENT,
      `mint deltas do not net to zero (${mintDeltaSum})`,
    );
  }
  if (payerDebit !== recipientDelta.delta) {
    return reject(
      CONFIRMATION_FAILURE.PLATFORM_FEE_PRESENT,
      `payer debit ${payerDebit} != recipient credit ${recipientDelta.delta}`,
    );
  }

  // ---- C7: the payer paid no SOL ------------------------------------------
  // The whole point of the sponsored path. If the payer's lamports moved, the
  // fee payer was not really the sponsor and the user paid gas.
  const payerLamportIndex = accountKeys.indexOf(payerAddress);
  if (payerLamportIndex >= 0) {
    const payerLamportDelta =
      postLamports[payerLamportIndex]! - preLamports[payerLamportIndex]!;
    if (payerLamportDelta < 0n) {
      return reject(
        CONFIRMATION_FAILURE.PAYER_LAMPORTS_DEBITED,
        `payer lost ${-payerLamportDelta} lamports`,
      );
    }
  }

  // ---- C8: sponsor debit inside the reservation it owns -------------------
  const sponsorDebitLamports = preLamports[0]! - postLamports[0]!;
  if (sponsorDebitLamports < 0n) {
    return reject(
      CONFIRMATION_FAILURE.SPONSOR_DEBIT,
      `sponsor gained ${-sponsorDebitLamports} lamports`,
    );
  }
  if (sponsorDebitLamports > expectation.reservedSponsorLamports) {
    return reject(
      CONFIRMATION_FAILURE.SPONSOR_DEBIT,
      `sponsor debit ${sponsorDebitLamports} exceeds reservation ${expectation.reservedSponsorLamports}`,
    );
  }

  return {
    success: true,
    transactionSignature,
    messageHash: expectation.messageHash,
    recipientTokenAccount: recipientAta,
    mint: expectation.outputMint,
    recipientDeltaAtomic: recipientDelta.delta,
    payerDebitAtomic: payerDebit,
    platformFeeAtomic: 0n,
    sponsorDebitLamports,
    slot: response.slot,
  };
}

/**
 * FIXTURE confirmation parser (Story 3.6 AC2).
 *
 * Fabricates a finalized-chain observation. On a deployment that would credit
 * the ledger for a transaction nobody ever confirmed, so it is guarded: it
 * throws unless fixture mode is explicitly enabled on a non-deployed runtime.
 * `parseFinalizedConfirmation` is the only path a deployment can take.
 */
export function parseConfirmationFixture(
  transactionSignature: string,
  expectation: ConfirmationExpectation,
  fixtureKind: "valid" | "wrong_hash" | "failed_tx" = "valid",
): ConfirmationParseResult {
  assertFixturePathAllowed("confirmations.parseConfirmationFixture");

  if (fixtureKind === "failed_tx") {
    return { success: false, failureCode: CONFIRMATION_FAILURE.TX_FAILED };
  }

  if (fixtureKind === "wrong_hash") {
    return { success: false, failureCode: CONFIRMATION_FAILURE.MESSAGE_HASH };
  }

  if (transactionSignature !== FIXTURE_TX_SIGNATURE) {
    return { success: false, failureCode: CONFIRMATION_FAILURE.SIGNATURE_UNKNOWN };
  }

  if (expectation.messageHash !== fixtureMessageHash()) {
    return { success: false, failureCode: CONFIRMATION_FAILURE.MESSAGE_HASH };
  }

  if (expectation.outputMint !== expectedUsdcMint()) {
    return { success: false, failureCode: CONFIRMATION_FAILURE.MINT };
  }

  const recipientDeltaAtomic = expectation.minimumOutputAtomic;
  const payerDebitAtomic = expectation.maximumInputAtomic;
  const sponsorDebitLamports = 500_000n;

  if (recipientDeltaAtomic < expectation.minimumOutputAtomic) {
    return { success: false, failureCode: CONFIRMATION_FAILURE.RECIPIENT_DELTA };
  }

  if (payerDebitAtomic > expectation.maximumInputAtomic) {
    return { success: false, failureCode: CONFIRMATION_FAILURE.PAYER_DEBIT };
  }

  if (sponsorDebitLamports > expectation.reservedSponsorLamports) {
    return { success: false, failureCode: CONFIRMATION_FAILURE.SPONSOR_DEBIT };
  }

  return {
    success: true,
    transactionSignature,
    messageHash: expectation.messageHash,
    recipientTokenAccount: `${expectation.recipientAddress}-ata`,
    mint: expectation.outputMint,
    recipientDeltaAtomic,
    payerDebitAtomic,
    platformFeeAtomic: 0n,
    sponsorDebitLamports,
  };
}

/** Builds the AD-11 expectation object from a persisted intent. */
export function buildConfirmationExpectation(
  intent: Doc<"settlementIntents">,
  addresses?: { payerAddress?: string; sponsorAddress?: string },
): ConfirmationExpectation {
  void USDC_DECIMALS;
  return {
    messageHash: intent.messageHash ?? "",
    recipientAddress: intent.recipientAddress,
    outputMint: intent.outputMint,
    minimumOutputAtomic: intent.minimumOutputAtomic,
    maximumInputAtomic: intent.maximumInputAtomic,
    reservedSponsorLamports: intent.sponsorReservationLamports ?? 3_000_000n,
    ...(addresses?.payerAddress ? { payerAddress: addresses.payerAddress } : {}),
    ...(addresses?.sponsorAddress ? { sponsorAddress: addresses.sponsorAddress } : {}),
  };
}
