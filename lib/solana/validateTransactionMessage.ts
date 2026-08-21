import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { MEMO_PROGRAM_ID, USDC_MINT } from "./constants";
import { parseVersionedTransactionBase64 } from "./buildExactUsdcTransfer";
import { SPONSOR_POLICY_V1 } from "./sponsorPolicyManifest";

export type ValidationGate = "pre_client" | "pre_sponsor";

export type SettlementIntentValidationContext = {
  gate: ValidationGate;
  intent: {
    payerAddress: string;
    recipientAddress: string;
    inputMint: string;
    outputMint: string;
    targetOutputAtomic: string;
    maxInputAtomic?: string;
    minimumOutputAtomic?: string;
    messageHash?: string;
    status: string;
  };
  sponsorAddress: string;
  blockhash: string;
  lastValidBlockHeight: number;
  nowMs?: number;
  telegramContextFresh?: boolean;
  targetSuperseded?: boolean;
  sponsorPaused?: boolean;
  reservationActive?: boolean;
  reservationOwnerIntentId?: string;
  intentId?: string;
};

export type ValidationFailureCode =
  | "INTENT_STATUS_INVALID"
  | "PAYER_MISMATCH"
  | "RECIPIENT_MISMATCH"
  | "MINT_NOT_ALLOWED"
  | "MINT_MISMATCH"
  | "AMOUNT_BELOW_MINIMUM"
  | "MAX_INPUT_EXCEEDED"
  | "FEE_PAYER_MISMATCH"
  | "SIGNER_SET_INVALID"
  | "DESTINATION_SIGNER_REQUIRED"
  | "PROGRAM_NOT_ALLOWED"
  | "INSTRUCTION_DISCRIMINATOR_INVALID"
  | "COMPUTE_UNITS_EXCEEDED"
  | "PRIORITY_FEE_EXCEEDED"
  | "ATA_COUNT_EXCEEDED"
  | "ATA_RENT_EXCEEDED"
  | "SPONSOR_EXPOSURE_EXCEEDED"
  | "PLATFORM_FEE_PRESENT"
  | "MESSAGE_HASH_MISMATCH"
  | "BLOCKHASH_STALE"
  | "TELEGRAM_CONTEXT_STALE"
  | "TARGET_SUPERSEDED"
  | "SELF_PAYMENT"
  | "SPONSOR_PAUSED"
  | "RESERVATION_MISSING"
  | "RESERVATION_OWNER_MISMATCH";

export type ValidationResult =
  | { ok: true; messageHash: string }
  | { ok: false; code: ValidationFailureCode };

const ALLOWED_STATUSES_BY_GATE: Record<ValidationGate, Set<string>> = {
  pre_client: new Set(["quoting", "ready_for_signature"]),
  pre_sponsor: new Set(["ready_for_signature", "user_signed"]),
};

function hashMessageBytes(messageBytes: Uint8Array): string {
  return createHash("sha256").update(messageBytes).digest("hex");
}

function readComputeBudgetLimits(instructions: {
  programId: PublicKey;
  data: Uint8Array;
}[]): { computeUnits: number; priorityFeeLamports: number } {
  let computeUnits = 0;
  let priorityFeeLamports = 0;

  for (const ix of instructions) {
    if (!ix.programId.equals(ComputeBudgetProgramId())) {
      continue;
    }
    if (ix.data.length >= 5 && ix.data[0] === 2) {
      computeUnits = new DataView(ix.data.buffer, ix.data.byteOffset).getUint32(1, true);
    }
    if (ix.data.length >= 9 && ix.data[0] === 3) {
      const microLamports = Number(
        new DataView(ix.data.buffer, ix.data.byteOffset).getBigUint64(1, true),
      );
      priorityFeeLamports = Math.ceil((microLamports * computeUnits) / 1_000_000);
    }
  }

  return { computeUnits, priorityFeeLamports };
}

function ComputeBudgetProgramId(): PublicKey {
  return new PublicKey("ComputeBudget111111111111111111111111111111");
}

function countAtaCreates(instructions: {
  programId: PublicKey;
  data: Uint8Array;
}[]): number {
  const ataProgram = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  return instructions.filter(
    (ix) => ix.programId.equals(ataProgram) && ix.data.length > 0 && ix.data[0] === 1,
  ).length;
}

function estimateAtaRent(ataCreates: number): number {
  return ataCreates > 0 ? 2_039_280 * ataCreates : 0;
}

function instructionDiscriminatorAllowed(programId: string, data: Uint8Array): boolean {
  if (programId === MEMO_PROGRAM_ID) {
    return data.length > 0;
  }

  const allowed = SPONSOR_POLICY_V1.allowedInstructionDiscriminators[programId];
  if (!allowed) {
    return false;
  }
  if (allowed.length === 0) {
    return data.length === 0;
  }
  if (data.length === 0) {
    return false;
  }
  return allowed.includes(data[0]!);
}

/**
 * Single shared FR-S6 / AD-10 validation gate — run before client bytes and before sponsor co-sign.
 */
export function validateTransactionMessage(
  serializedBase64: string,
  context: SettlementIntentValidationContext,
): ValidationResult {
  const tx = parseVersionedTransactionBase64(serializedBase64);
  const messageBytes = tx.message.serialize();
  const messageHash = hashMessageBytes(messageBytes);

  if (!ALLOWED_STATUSES_BY_GATE[context.gate].has(context.intent.status)) {
    return { ok: false, code: "INTENT_STATUS_INVALID" };
  }

  if (context.telegramContextFresh === false) {
    return { ok: false, code: "TELEGRAM_CONTEXT_STALE" };
  }

  if (context.targetSuperseded) {
    return { ok: false, code: "TARGET_SUPERSEDED" };
  }

  if (context.intent.payerAddress === context.intent.recipientAddress) {
    return { ok: false, code: "SELF_PAYMENT" };
  }

  if (context.sponsorPaused) {
    return { ok: false, code: "SPONSOR_PAUSED" };
  }

  if (context.gate === "pre_sponsor") {
    if (!context.reservationActive) {
      return { ok: false, code: "RESERVATION_MISSING" };
    }
    if (
      context.intentId &&
      context.reservationOwnerIntentId &&
      context.reservationOwnerIntentId !== context.intentId
    ) {
      return { ok: false, code: "RESERVATION_OWNER_MISMATCH" };
    }
  }

  const accountKeys = tx.message.staticAccountKeys.map((k) => k.toBase58());
  const feePayer = accountKeys[0];
  if (feePayer !== context.sponsorAddress) {
    return { ok: false, code: "FEE_PAYER_MISMATCH" };
  }

  const requiredSigners = new Set([context.intent.payerAddress, context.sponsorAddress]);
  const numRequiredSignatures = tx.message.header.numRequiredSignatures;
  const signerKeys = accountKeys.slice(0, numRequiredSignatures);
  const signerSet = new Set(signerKeys);

  if (
    signerSet.size !== requiredSigners.size ||
    !signerKeys.every((key) => requiredSigners.has(key))
  ) {
    return { ok: false, code: "SIGNER_SET_INVALID" };
  }

  if (signerKeys.includes(context.intent.recipientAddress)) {
    return { ok: false, code: "DESTINATION_SIGNER_REQUIRED" };
  }

  const decompiled = tx.message.compiledInstructions.map((compiled) => {
    const programId = accountKeys[compiled.programIdIndex]!;
    const keys = compiled.accountKeyIndexes.map((index) => accountKeys[index]!);
    return { programId, keys, data: compiled.data };
  });

  for (const ix of decompiled) {
    if (!SPONSOR_POLICY_V1.allowedPrograms.includes(ix.programId)) {
      return { ok: false, code: "PROGRAM_NOT_ALLOWED" };
    }
    if (!instructionDiscriminatorAllowed(ix.programId, ix.data)) {
      return { ok: false, code: "INSTRUCTION_DISCRIMINATOR_INVALID" };
    }
  }

  const mintsReferenced = decompiled.flatMap((ix) =>
    ix.keys.filter((key) => key === USDC_MINT || key === context.intent.inputMint),
  );
  for (const mint of new Set(mintsReferenced)) {
    if (!SPONSOR_POLICY_V1.allowedMints.includes(mint)) {
      return { ok: false, code: "MINT_NOT_ALLOWED" };
    }
  }

  if (
    context.intent.inputMint !== context.intent.outputMint ||
    context.intent.outputMint !== USDC_MINT
  ) {
    return { ok: false, code: "MINT_MISMATCH" };
  }

  const transferIx = decompiled.find(
    (ix) =>
      ix.programId === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" &&
      ix.data.length > 0 &&
      ix.data[0] === 3,
  );
  if (!transferIx) {
    return { ok: false, code: "AMOUNT_BELOW_MINIMUM" };
  }

  const transferAmount = Buffer.from(transferIx.data).readBigUInt64LE(1);
  const minimumOutput = BigInt(context.intent.minimumOutputAtomic ?? context.intent.targetOutputAtomic);
  if (transferAmount < minimumOutput) {
    return { ok: false, code: "AMOUNT_BELOW_MINIMUM" };
  }

  if (context.intent.maxInputAtomic) {
    const maxInput = BigInt(context.intent.maxInputAtomic);
    if (transferAmount > maxInput) {
      return { ok: false, code: "MAX_INPUT_EXCEEDED" };
    }
  }

  const { computeUnits, priorityFeeLamports } = readComputeBudgetLimits(
    decompiled.map((ix) => ({
      programId: new PublicKey(ix.programId),
      data: ix.data,
    })),
  );

  if (computeUnits > SPONSOR_POLICY_V1.maxComputeUnits) {
    return { ok: false, code: "COMPUTE_UNITS_EXCEEDED" };
  }
  if (priorityFeeLamports > SPONSOR_POLICY_V1.maxPriorityFeeLamports) {
    return { ok: false, code: "PRIORITY_FEE_EXCEEDED" };
  }

  const ataCreates = countAtaCreates(
    decompiled.map((ix) => ({
      programId: new PublicKey(ix.programId),
      data: ix.data,
    })),
  );
  if (ataCreates > SPONSOR_POLICY_V1.maxAtaCreates) {
    return { ok: false, code: "ATA_COUNT_EXCEEDED" };
  }

  const ataRent = estimateAtaRent(ataCreates);
  if (ataRent > SPONSOR_POLICY_V1.maxAtaRentLamports) {
    return { ok: false, code: "ATA_RENT_EXCEEDED" };
  }

  const totalSponsorExposure = priorityFeeLamports + ataRent;
  if (totalSponsorExposure > SPONSOR_POLICY_V1.maxTotalSponsorLamports) {
    return { ok: false, code: "SPONSOR_EXPOSURE_EXCEEDED" };
  }

  if (SPONSOR_POLICY_V1.platformFeeBps !== 0) {
    return { ok: false, code: "PLATFORM_FEE_PRESENT" };
  }

  const recentBlockhash = tx.message.recentBlockhash;
  if (recentBlockhash !== context.blockhash) {
    return { ok: false, code: "BLOCKHASH_STALE" };
  }

  if (context.intent.messageHash && context.intent.messageHash !== messageHash) {
    return { ok: false, code: "MESSAGE_HASH_MISMATCH" };
  }

  void context.lastValidBlockHeight;
  void context.nowMs;

  return { ok: true, messageHash };
}

/** Convenience wrapper for the pre-client gate (Story 3.4 AC2). */
export function validateBeforeClientExposure(
  serializedBase64: string,
  context: Omit<SettlementIntentValidationContext, "gate">,
): ValidationResult {
  return validateTransactionMessage(serializedBase64, { ...context, gate: "pre_client" });
}

/** Convenience wrapper for the pre-sponsor gate (Story 3.4 AC3). */
export function validateBeforeSponsorCoSign(
  serializedBase64: string,
  context: Omit<SettlementIntentValidationContext, "gate">,
): ValidationResult {
  return validateTransactionMessage(serializedBase64, { ...context, gate: "pre_sponsor" });
}

/** Runs the shared checklist at both gates (Story 3.4 AC3). */
export function runDualGateValidation(
  serializedBase64: string,
  context: Omit<SettlementIntentValidationContext, "gate">,
): {
  preClient: ValidationResult;
  preSponsor: ValidationResult;
} {
  return {
    preClient: validateBeforeClientExposure(serializedBase64, context),
    preSponsor: validateBeforeSponsorCoSign(serializedBase64, {
      ...context,
      reservationActive: true,
      reservationOwnerIntentId: context.intentId,
    }),
  };
}

/** Parses without mutating — used in tests to confirm invalid bytes fail both gates. */
export function assertValidOrThrow(
  serializedBase64: string,
  context: SettlementIntentValidationContext,
): string {
  const result = validateTransactionMessage(serializedBase64, context);
  if (!result.ok) {
    throw new Error(result.code);
  }
  return result.messageHash;
}

/** Re-export for policy module consumers. */
export { VersionedTransaction };
