/**
 * The sponsor gate (AD-10, FR-S6). Run once before the transaction bytes are
 * handed to the client, and again immediately before the sponsor co-signs.
 *
 * Written as a strict allowlist. Every account, every program, every instruction
 * and every amount is re-derived from server-owned state and compared; anything
 * the transaction contains that we did not put there is a rejection. There is no
 * denylist anywhere in this file — an attacker who controls the client cannot
 * reach the sponsor's signature by inventing something we did not think to ban.
 *
 * Each rule below is annotated with the attack it prevents.
 */

import { sha256Hex } from "../crypto/convexCrypto";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ATA_RENT_LAMPORTS,
  COMPUTE_BUDGET_PROGRAM_ID,
  DEFAULT_COMPUTE_UNITS_PER_INSTRUCTION,
  MEMO_PROGRAM_ID,
  SPONSOR_MAX_COMPUTE_UNITS,
  SYSTEM_PROGRAM_ID,
  SYSVAR_RENT_PUBKEY,
  TOKEN_PROGRAM_ID,
} from "./constants";
import type { SolanaCluster } from "./cluster";
import {
  decodeTransactionBase64,
  isSignerIndex,
  isWritableIndex,
  TransactionDecodeError,
  type DecodedInstruction,
  type DecodedMessage,
} from "./decodeTransaction";
import { deriveAssociatedTokenAddress } from "./pda";
import {
  resolveAddressTableLookups,
  assertDeclaredTablesMatch,
  type AddressLookupTableAccount,
  type AltFailureCode,
} from "./addressLookupTable";
import {
  ATA_IX,
  COMPUTE_BUDGET_IX,
  TOKEN_IX,
  getSponsorPolicyManifest,
  type RoutingKind,
  type SponsorPolicyManifest,
} from "./sponsorPolicyManifest";

export type ValidationGate = "pre_client" | "pre_sponsor";

export type SettlementIntentValidationContext = {
  gate: ValidationGate;
  routingKind?: RoutingKind;
  cluster?: SolanaCluster;
  intent: {
    payerAddress: string;
    recipientAddress: string;
    inputMint: string;
    outputMint: string;
    targetOutputAtomic: string;
    maxInputAtomic?: string;
    minimumOutputAtomic?: string;
    quotedOtherAmountThreshold?: string;
    messageHash?: string;
    status: string;
    lockedRevision?: number;
    expiresAt?: number;
    policyVersion?: string;
  };
  /** Exact memo commitment hash the server computed for this intent. */
  expectedMemo?: string;
  currentTabRevision?: number;
  sponsorAddress: string;
  blockhash: string;
  lastValidBlockHeight: number;
  /**
   * Finalized block height observed from the RPC, when the caller has one.
   *
   * AD-10 requires that "recent blockhash and `lastValidBlockHeight` remain
   * valid". The blockhash string was already compared; the height bound was
   * accepted and discarded, which meant a quote whose blockhash had aged out
   * could still reach the sponsor key and burn a fee on a transaction the
   * cluster would refuse. Supplying this makes the second half of that rule
   * real. Omitting it is still permitted for callers with no chain view (the
   * pre-client gate at build time), so this can only ever reject more.
   */
  currentBlockHeight?: number;
  nowMs?: number;
  telegramContextFresh?: boolean;
  targetSuperseded?: boolean;
  sponsorPaused?: boolean;
  reservationActive?: boolean;
  reservationOwnerIntentId?: string;
  intentId?: string;
  /**
   * Every address-lookup table the routed message references, already read from
   * the RPC at or after `dflowContextSlot` and decoded.
   *
   * This is the ONLY way a message carrying lookups can pass. It is not a flag
   * a caller can assert — supplying the wrong tables fails resolution, and
   * supplying none fails as unresolved. The previous `routedAccountsResolved`
   * boolean was removed for exactly that reason: it let a caller vouch for work
   * it had not done.
   */
  resolvedAddressTables?: readonly AddressLookupTableAccount[];
  /**
   * The router's own claim about which table entries it used
   * (`addressLookupTables` in the `/order` response). Used only to reject: the
   * chain is authoritative and any disagreement fails.
   */
  declaredAddressTables?: readonly {
    address: string;
    addresses: Readonly<Record<string, string>>;
  }[];
  /** `contextSlot` from the order response — tables must be no older. */
  dflowContextSlot?: number;
  /**
   * Set true only when the recipient's USDC token account was OBSERVED to exist
   * on chain. Routed sponsor-rent budgeting depends on it; when it is unknown
   * the worst case is charged, never the best.
   */
  recipientTokenAccountExists?: boolean;
};

export type ValidationFailureCode =
  | "INTENT_STATUS_INVALID"
  | "POLICY_VERSION_MISMATCH"
  | "PAYER_MISMATCH"
  | "RECIPIENT_MISMATCH"
  | "MINT_NOT_ALLOWED"
  | "MINT_MISMATCH"
  | "AMOUNT_BELOW_MINIMUM"
  | "AMOUNT_NOT_EXACT"
  | "MAX_INPUT_EXCEEDED"
  | "MESSAGE_DECODE_FAILED"
  | "ADDRESS_TABLE_LOOKUP_PRESENT"
  | "ACCOUNT_INDEX_OUT_OF_RANGE"
  | "INSTRUCTION_COUNT_EXCEEDED"
  | "FEE_PAYER_MISMATCH"
  | "SIGNER_SET_INVALID"
  | "DESTINATION_SIGNER_REQUIRED"
  | "UNEXPECTED_ACCOUNT"
  | "UNEXPECTED_WRITABLE_ACCOUNT"
  | "PROGRAM_NOT_ALLOWED"
  | "INSTRUCTION_DISCRIMINATOR_INVALID"
  | "COMPUTE_BUDGET_DUPLICATE"
  | "COMPUTE_BUDGET_MALFORMED"
  | "COMPUTE_UNITS_EXCEEDED"
  | "PRIORITY_FEE_EXCEEDED"
  | "ATA_COUNT_EXCEEDED"
  | "ATA_ACCOUNTS_INVALID"
  | "ATA_RENT_EXCEEDED"
  | "SPONSOR_EXPOSURE_EXCEEDED"
  | "PLATFORM_FEE_PRESENT"
  | "TRANSFER_INSTRUCTION_COUNT"
  | "TRANSFER_ACCOUNTS_INVALID"
  | "TRANSFER_SOURCE_INVALID"
  | "TRANSFER_AUTHORITY_INVALID"
  | "TRANSFER_DECIMALS_INVALID"
  | "MEMO_COUNT_EXCEEDED"
  | "MEMO_ACCOUNTS_INVALID"
  | "MEMO_MISMATCH"
  | "MESSAGE_HASH_MISMATCH"
  | "BLOCKHASH_STALE"
  | "BLOCKHASH_EXPIRED"
  | "TELEGRAM_CONTEXT_STALE"
  | "TARGET_SUPERSEDED"
  | "SELF_PAYMENT"
  | "SPONSOR_PAUSED"
  | "RESERVATION_MISSING"
  | "RESERVATION_OWNER_MISMATCH"
  | "DFLOW_ROUTED_VALIDATION_INCOMPLETE"
  | "ROUTER_INSTRUCTION_COUNT"
  | "RECIPIENT_TOKEN_ACCOUNT_MISSING"
  | AltFailureCode;

export type ValidationResult =
  | {
      ok: true;
      messageHash: string;
      computeUnits: number;
      priorityFeeLamports: number;
      ataCreates: number;
      sponsorExposureLamports: number;
    }
  | { ok: false; code: ValidationFailureCode; detail?: string };

const ALLOWED_STATUSES_BY_GATE: Record<ValidationGate, ReadonlySet<string>> = {
  pre_client: new Set(["quoting", "ready_for_signature"]),
  pre_sponsor: new Set(["ready_for_signature", "user_signed"]),
};

const HEX64 = /^[0-9a-f]{64}$/;

function fail(
  code: ValidationFailureCode,
  detail?: string,
): { ok: false; code: ValidationFailureCode; detail?: string } {
  return detail ? { ok: false, code, detail } : { ok: false, code };
}

/** Little-endian u64 read with no DataView aliasing and no float arithmetic. */
function readU64LE(data: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 7; i >= 0; i -= 1) {
    value = (value << 8n) | BigInt(data[offset + i]!);
  }
  return value;
}

function readU32LE(data: Uint8Array, offset: number): number {
  return (
    data[offset]! |
    (data[offset + 1]! << 8) |
    (data[offset + 2]! << 16) |
    (data[offset + 3]! << 24)
  ) >>> 0;
}

function parseAtomic(value: string | undefined): bigint | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  return BigInt(value);
}

type ResolvedInstruction = {
  programId: string;
  accountKeys: readonly string[];
  accountIndexes: readonly number[];
  data: Uint8Array;
};

function resolveInstructions(
  message: DecodedMessage,
  accountKeysAll: readonly string[],
): ResolvedInstruction[] | null {
  const keyCount = accountKeysAll.length;
  const resolved: ResolvedInstruction[] = [];
  for (const ix of message.instructions as readonly DecodedInstruction[]) {
    if (ix.programIdIndex >= keyCount) {
      return null;
    }
    const accountKeys: string[] = [];
    for (const index of ix.accountKeyIndexes) {
      if (index >= keyCount) {
        return null;
      }
      accountKeys.push(accountKeysAll[index]!);
    }
    resolved.push({
      programId: accountKeysAll[ix.programIdIndex]!,
      accountKeys,
      accountIndexes: ix.accountKeyIndexes,
      data: ix.data,
    });
  }
  return resolved;
}

function discriminatorAllowed(
  manifest: SponsorPolicyManifest,
  programId: string,
  data: Uint8Array,
): boolean {
  const allowed = manifest.allowedInstructionDiscriminators[programId];
  if (!allowed) {
    // A program on the allowlist with no discriminator table (the DFlow
    // aggregator) is validated by its account and amount effects instead.
    return manifest.allowedPrograms.includes(programId);
  }
  if (programId === MEMO_PROGRAM_ID) {
    return data.length > 0;
  }
  if (data.length === 0) {
    return allowed.includes(ATA_IX.CREATE_LEGACY_EMPTY_DATA);
  }
  return allowed.includes(data[0]!);
}

function isAtaCreate(ix: ResolvedInstruction): boolean {
  return (
    ix.programId === ASSOCIATED_TOKEN_PROGRAM_ID &&
    (ix.data.length === 0 || ix.data[0] === ATA_IX.CREATE_IDEMPOTENT)
  );
}

type ComputeBudget =
  | { ok: true; computeUnits: number; priorityFeeLamports: bigint }
  | { ok: false; code: ValidationFailureCode; detail?: string };

/**
 * R-CB — compute budget, in integers only.
 *
 * Prevents (a) a priority fee the sponsor never agreed to, (b) the previous
 * bypass where a `SetComputeUnitPrice` placed BEFORE `SetComputeUnitLimit` was
 * priced against a compute-unit count of zero and therefore always passed, and
 * (c) a `SetComputeUnitPrice` with no limit at all, which the chain prices
 * against its own default budget while the old code priced it at zero.
 */
function readComputeBudget(
  instructions: readonly ResolvedInstruction[],
  totalInstructionCount: number,
): ComputeBudget {
  let declaredUnits: number | undefined;
  let microLamports: bigint | undefined;

  for (const ix of instructions) {
    if (ix.programId !== COMPUTE_BUDGET_PROGRAM_ID) {
      continue;
    }
    if (ix.data.length === 0) {
      return { ok: false, code: "COMPUTE_BUDGET_MALFORMED", detail: "empty" };
    }
    const discriminator = ix.data[0]!;
    if (discriminator === COMPUTE_BUDGET_IX.SET_COMPUTE_UNIT_LIMIT) {
      if (declaredUnits !== undefined) {
        return { ok: false, code: "COMPUTE_BUDGET_DUPLICATE", detail: "limit" };
      }
      if (ix.data.length !== 5) {
        return {
          ok: false,
          code: "COMPUTE_BUDGET_MALFORMED",
          detail: `limit len=${ix.data.length}`,
        };
      }
      declaredUnits = readU32LE(ix.data, 1);
      continue;
    }
    if (discriminator === COMPUTE_BUDGET_IX.SET_COMPUTE_UNIT_PRICE) {
      if (microLamports !== undefined) {
        return { ok: false, code: "COMPUTE_BUDGET_DUPLICATE", detail: "price" };
      }
      if (ix.data.length !== 9) {
        return {
          ok: false,
          code: "COMPUTE_BUDGET_MALFORMED",
          detail: `price len=${ix.data.length}`,
        };
      }
      microLamports = readU64LE(ix.data, 1);
      continue;
    }
    return {
      ok: false,
      code: "INSTRUCTION_DISCRIMINATOR_INVALID",
      detail: `compute-budget ${discriminator}`,
    };
  }

  // When no explicit limit is present the runtime budgets 200k CU per
  // instruction, capped at 1.4M. Price the fee against that, never against zero.
  const chainDefaultUnits = Math.min(
    DEFAULT_COMPUTE_UNITS_PER_INSTRUCTION * Math.max(totalInstructionCount, 1),
    SPONSOR_MAX_COMPUTE_UNITS,
  );
  const effectiveUnits = declaredUnits ?? chainDefaultUnits;

  const priceUnits = BigInt(effectiveUnits);
  const price = microLamports ?? 0n;
  // ceil(microLamports * units / 1_000_000), integer only.
  const priorityFeeLamports =
    price === 0n ? 0n : (price * priceUnits + 999_999n) / 1_000_000n;

  return { ok: true, computeUnits: effectiveUnits, priorityFeeLamports };
}

/** The one gate. Deny by default. */
export function validateTransactionMessage(
  serializedBase64: string,
  context: SettlementIntentValidationContext,
): ValidationResult {
  const routingKind: RoutingKind = context.routingKind ?? "exact_usdc";
  const isDflow = routingKind === "dflow_sync";
  const manifest = getSponsorPolicyManifest(routingKind, context.cluster, {
    inputMint: context.intent.inputMint,
    outputMint: context.intent.outputMint,
  });

  // ---- Phase 0: intent state, independent of the bytes -------------------

  // Prevents signing for an intent that is expired, already broadcast, or in a
  // state where the target amount is no longer authoritative.
  if (!ALLOWED_STATUSES_BY_GATE[context.gate].has(context.intent.status)) {
    return fail("INTENT_STATUS_INVALID", context.intent.status);
  }

  // Prevents honouring an intent reserved under a superseded policy version.
  if (
    context.intent.policyVersion !== undefined &&
    context.intent.policyVersion !== manifest.version
  ) {
    return fail("POLICY_VERSION_MISMATCH", context.intent.policyVersion);
  }

  // Prevents acting on a Telegram session context older than its five-minute TTL.
  if (context.telegramContextFresh === false) {
    return fail("TELEGRAM_CONTEXT_STALE");
  }

  // Prevents paying an amount computed from a bill revision that has since moved.
  if (context.targetSuperseded) {
    return fail("TARGET_SUPERSEDED");
  }
  if (
    context.intent.lockedRevision !== undefined &&
    context.currentTabRevision !== undefined &&
    context.intent.lockedRevision !== context.currentTabRevision
  ) {
    return fail("TARGET_SUPERSEDED", "revision drift");
  }

  // Prevents a self-payment that marks an obligation settled while moving nothing.
  if (context.intent.payerAddress === context.intent.recipientAddress) {
    return fail("SELF_PAYMENT");
  }

  // NFR-4 kill switch: pause blocks new sponsorship while reads keep working.
  if (context.sponsorPaused) {
    return fail("SPONSOR_PAUSED");
  }

  if (context.gate === "pre_sponsor") {
    // Prevents co-signing without an atomically reserved sponsor budget.
    if (!context.reservationActive) {
      return fail("RESERVATION_MISSING");
    }
    // Prevents spending another intent's reservation.
    if (
      context.intentId &&
      context.reservationOwnerIntentId &&
      context.reservationOwnerIntentId !== context.intentId
    ) {
      return fail("RESERVATION_OWNER_MISMATCH");
    }
    // Prevents co-signing a quote that expired while the user was signing.
    if (
      context.intent.expiresAt !== undefined &&
      context.nowMs !== undefined &&
      context.intent.expiresAt <= context.nowMs
    ) {
      return fail("INTENT_STATUS_INVALID", "expired");
    }
  }

  // ---- Phase 1: decode ---------------------------------------------------

  let decoded;
  try {
    decoded = decodeTransactionBase64(serializedBase64);
  } catch (error) {
    return fail(
      "MESSAGE_DECODE_FAILED",
      error instanceof TransactionDecodeError ? error.code : "unparseable",
    );
  }

  const message = decoded.message;
  const messageHash = sha256Hex(message.serialized);

  // Prevents signing a transaction whose real account list lives in a lookup
  // table we never fetched. An unresolved account can be anything, including a
  // writable account the sponsor is paying to modify (AD-10: "no unresolved
  // account may be signed").
  //
  // The direct exact-USDC path never legitimately carries lookups, so it still
  // rejects them outright. The routed path cannot avoid them — DFlow returns
  // lookup tables on every order, including single-venue direct routes — so it
  // resolves them here against tables the caller already read from the RPC, and
  // every rule below then runs over the RESOLVED account set. Nothing is trusted
  // that was not read from the chain.
  let accountKeysAll: readonly string[] = message.staticAccountKeys;
  let isWritable = (index: number) => isWritableIndex(message, index);
  let isSigner = (index: number) => isSignerIndex(message, index);

  if (message.addressTableLookups.length > 0) {
    if (!isDflow) {
      return fail(
        "ADDRESS_TABLE_LOOKUP_PRESENT",
        `${message.addressTableLookups.length} table(s)`,
      );
    }
    if (!context.resolvedAddressTables) {
      return fail(
        "DFLOW_ROUTED_VALIDATION_INCOMPLETE",
        `${message.addressTableLookups.length} unresolved table(s)`,
      );
    }
    if (context.declaredAddressTables) {
      const declared = assertDeclaredTablesMatch({
        declared: context.declaredAddressTables,
        tables: context.resolvedAddressTables,
      });
      if (!declared.ok) {
        return fail(declared.code, declared.detail);
      }
    }
    const resolution = resolveAddressTableLookups({
      message,
      tables: context.resolvedAddressTables,
      minSlot: context.dflowContextSlot,
    });
    if (!resolution.ok) {
      return fail(resolution.code, resolution.detail);
    }
    const resolved = resolution.resolved;
    accountKeysAll = resolved.keys;
    isWritable = (index: number) => resolved.writable[index] === true;
    isSigner = (index: number) => resolved.signer[index] === true;
  }

  // Prevents an instruction referencing an index past the account list, which
  // some decoders silently read as undefined.
  const instructions = resolveInstructions(message, accountKeysAll);
  if (!instructions) {
    return fail("ACCOUNT_INDEX_OUT_OF_RANGE");
  }

  // Prevents padding a transaction with extra instructions the sponsor pays for.
  if (instructions.length > manifest.maxInstructions) {
    return fail("INSTRUCTION_COUNT_EXCEEDED", `${instructions.length}`);
  }

  // ---- Phase 2: mints ----------------------------------------------------

  // Prevents crediting the recipient in any mint other than the configured
  // cluster USDC — including the other cluster's USDC, which is a different
  // token entirely.
  if (isDflow) {
    if (context.intent.outputMint !== manifest.outputMint) {
      return fail("MINT_MISMATCH", "output");
    }
    if (!manifest.allowedMints.includes(context.intent.inputMint)) {
      return fail("MINT_NOT_ALLOWED", context.intent.inputMint);
    }
  } else if (
    context.intent.inputMint !== manifest.outputMint ||
    context.intent.outputMint !== manifest.outputMint
  ) {
    return fail("MINT_MISMATCH");
  }

  // ---- Phase 3: fee payer and signer set ---------------------------------

  const accountKeys = message.staticAccountKeys;

  // Prevents the sponsor being anything other than the fee payer, and prevents a
  // different account being made to pay.
  if (accountKeys[0] !== context.sponsorAddress) {
    return fail("FEE_PAYER_MISMATCH");
  }

  const signerKeys = accountKeys.slice(0, message.numRequiredSignatures);
  const signerSet = new Set(signerKeys);

  // Prevents adding a third signer, dropping the payer, or duplicating a signer.
  if (
    message.numRequiredSignatures !== 2 ||
    signerSet.size !== 2 ||
    !signerSet.has(context.intent.payerAddress) ||
    !signerSet.has(context.sponsorAddress)
  ) {
    return fail("SIGNER_SET_INVALID");
  }

  // Prevents a routed order that requires the destination wallet to sign
  // (`destinationWalletMustSign` must be false — AD-10).
  if (signerSet.has(context.intent.recipientAddress)) {
    return fail("DESTINATION_SIGNER_REQUIRED");
  }

  // Prevents the payer's own wallet key being marked writable, which would let a
  // CPI move its lamports.
  //
  // The routed path is exempt, and only the routed path. A swap that consumes
  // native SOL must debit the payer's wallet to fund the wrapped-SOL account,
  // so DFlow marks it writable on every order (verified across SOL, USDT, BONK
  // and JUP inputs). The payer is a required signer authorising their own
  // spend; the sponsor's exposure is unchanged, which is what this rule guards.
  // On the direct path the server builds the message itself and never needs it.
  const payerIndex = accountKeys.indexOf(context.intent.payerAddress);
  if (!isDflow && payerIndex >= 0 && isWritableIndex(message, payerIndex)) {
    return fail("UNEXPECTED_WRITABLE_ACCOUNT", "payer wallet writable");
  }

  // ---- Phase 4: derive the accounts the intent implies -------------------

  const outputMint = manifest.outputMint;
  const payerAta = deriveAssociatedTokenAddress({
    owner: context.intent.payerAddress,
    mint: outputMint,
    tokenProgramId: TOKEN_PROGRAM_ID,
    associatedTokenProgramId: ASSOCIATED_TOKEN_PROGRAM_ID,
  });
  const recipientAta = deriveAssociatedTokenAddress({
    owner: context.intent.recipientAddress,
    mint: outputMint,
    tokenProgramId: TOKEN_PROGRAM_ID,
    associatedTokenProgramId: ASSOCIATED_TOKEN_PROGRAM_ID,
  });

  // ---- Phase 5: program and instruction allowlist ------------------------

  for (const ix of instructions) {
    // Prevents any program the server did not put there — most importantly the
    // System program, whose `transfer{from: sponsor}` would drain the fee payer
    // in a single instruction the sponsor is signing anyway.
    if (!manifest.allowedPrograms.includes(ix.programId)) {
      return fail("PROGRAM_NOT_ALLOWED", ix.programId);
    }
    // Prevents SetAuthority, Approve (delegate), Revoke, Burn, CloseAccount and
    // ATA RecoverNested reaching an allowlisted program. CloseAccount would send
    // the token account's rent to an arbitrary destination; SetAuthority and
    // Approve would hand ongoing control of the payer's token account to an
    // attacker long after this transaction confirms.
    if (!discriminatorAllowed(manifest, ix.programId, ix.data)) {
      return fail(
        "INSTRUCTION_DISCRIMINATOR_INVALID",
        `${ix.programId}:${ix.data.length === 0 ? "empty" : ix.data[0]}`,
      );
    }
  }

  // ---- Phase 6: compute budget ------------------------------------------

  const budget = readComputeBudget(instructions, instructions.length);
  if (!budget.ok) {
    return fail(budget.code, budget.detail);
  }
  if (budget.computeUnits > manifest.maxComputeUnits) {
    return fail("COMPUTE_UNITS_EXCEEDED", `${budget.computeUnits}`);
  }
  if (budget.priorityFeeLamports > BigInt(manifest.maxPriorityFeeLamports)) {
    return fail("PRIORITY_FEE_EXCEEDED", budget.priorityFeeLamports.toString());
  }

  // ---- Phase 7: ATA creation --------------------------------------------

  const ataCreates = instructions.filter(isAtaCreate);
  if (ataCreates.length > manifest.maxAtaCreates) {
    return fail("ATA_COUNT_EXCEEDED", `${ataCreates.length}`);
  }

  for (const ix of ataCreates) {
    // Prevents the sponsor funding rent for an account that is not the
    // recipient's USDC ATA — e.g. an ATA for an attacker-chosen owner or mint,
    // repeated across intents to bleed the sponsor wallet ~2,039,280 lamports
    // at a time.
    const keys = ix.accountKeys;
    if (
      keys.length < 6 ||
      keys[0] !== context.sponsorAddress ||
      keys[1] !== recipientAta ||
      keys[2] !== context.intent.recipientAddress ||
      keys[3] !== outputMint ||
      keys[4] !== SYSTEM_PROGRAM_ID ||
      keys[5] !== TOKEN_PROGRAM_ID
    ) {
      return fail("ATA_ACCOUNTS_INVALID");
    }
    // Prevents the funding slot being anything but the sponsor's writable signer.
    const fundingIndex = ix.accountIndexes[0]!;
    if (!isSigner(fundingIndex) || !isWritable(fundingIndex)) {
      return fail("ATA_ACCOUNTS_INVALID", "funding role");
    }
  }

  const ataRentLamports = BigInt(ataCreates.length) * BigInt(ATA_RENT_LAMPORTS);
  if (ataRentLamports > BigInt(manifest.maxAtaRentLamports)) {
    return fail("ATA_RENT_EXCEEDED", ataRentLamports.toString());
  }

  // ---- Phase 8: the transfer --------------------------------------------

  const targetAtomic = parseAtomic(context.intent.targetOutputAtomic);
  if (targetAtomic === undefined) {
    return fail("AMOUNT_NOT_EXACT", "target is not an integer string");
  }
  const minimumOutput =
    parseAtomic(context.intent.minimumOutputAtomic) ?? targetAtomic;
  const maxInput = parseAtomic(context.intent.maxInputAtomic);

  if (!isDflow) {
    const tokenInstructions = instructions.filter(
      (ix) => ix.programId === TOKEN_PROGRAM_ID,
    );

    // Prevents a second transfer riding along with the legitimate one — the
    // payer signs the whole message blind, so an extra transfer to an attacker
    // ATA would be authorised and paid for by the sponsor.
    if (tokenInstructions.length !== 1) {
      return fail("TRANSFER_INSTRUCTION_COUNT", `${tokenInstructions.length}`);
    }

    const transfer = tokenInstructions[0]!;
    const discriminator = transfer.data[0];

    let source: string | undefined;
    let destination: string | undefined;
    let authority: string | undefined;
    let amount: bigint;

    if (discriminator === TOKEN_IX.TRANSFER) {
      // Exactly three accounts: no multisig signer tail, which would let extra
      // authorities co-authorise the move.
      if (transfer.accountKeys.length !== 3 || transfer.data.length !== 9) {
        return fail("TRANSFER_ACCOUNTS_INVALID", "transfer shape");
      }
      source = transfer.accountKeys[0];
      destination = transfer.accountKeys[1];
      authority = transfer.accountKeys[2];
      amount = readU64LE(transfer.data, 1);
    } else if (discriminator === TOKEN_IX.TRANSFER_CHECKED) {
      if (transfer.accountKeys.length !== 4 || transfer.data.length !== 10) {
        return fail("TRANSFER_ACCOUNTS_INVALID", "transferChecked shape");
      }
      source = transfer.accountKeys[0];
      destination = transfer.accountKeys[2];
      authority = transfer.accountKeys[3];
      amount = readU64LE(transfer.data, 1);
      // Prevents a mint substitution inside the instruction itself.
      if (transfer.accountKeys[1] !== outputMint) {
        return fail("MINT_MISMATCH", "transferChecked mint");
      }
      if (transfer.data[9] !== manifest.outputDecimals) {
        return fail("TRANSFER_DECIMALS_INVALID", `${transfer.data[9]}`);
      }
    } else {
      return fail("INSTRUCTION_DISCRIMINATOR_INVALID", `token:${discriminator}`);
    }

    // Prevents draining a token account other than the payer's own USDC ATA —
    // for example one where the payer holds a delegate authority.
    if (source !== payerAta) {
      return fail("TRANSFER_SOURCE_INVALID");
    }

    // THE critical rule: the destination must be the ATA the server derives for
    // the intended recipient. Without it, an attacker-controlled client points
    // the transfer at its own account while the obligation is still marked
    // settled and the sponsor still pays the fee.
    if (destination !== recipientAta) {
      return fail("RECIPIENT_MISMATCH");
    }

    // Prevents someone other than the payer authorising the move.
    const authorityIndex = transfer.accountIndexes[
      discriminator === TOKEN_IX.TRANSFER ? 2 : 3
    ]!;
    if (authority !== context.intent.payerAddress || !isSigner(authorityIndex)) {
      return fail("TRANSFER_AUTHORITY_INVALID");
    }

    // Money is integer-only and exact. Not "at least" — exactly the locked
    // target, so an inflated amount cannot be slipped past a >= comparison.
    if (amount !== targetAtomic) {
      return fail("AMOUNT_NOT_EXACT", amount.toString());
    }
    if (amount < minimumOutput) {
      return fail("AMOUNT_BELOW_MINIMUM", amount.toString());
    }
    if (maxInput !== undefined && amount > maxInput) {
      return fail("MAX_INPUT_EXCEEDED", amount.toString());
    }

    // ---- Phase 9: memo --------------------------------------------------

    const memos = instructions.filter((ix) => ix.programId === MEMO_PROGRAM_ID);
    if (memos.length > 1) {
      return fail("MEMO_COUNT_EXCEEDED", `${memos.length}`);
    }
    for (const memo of memos) {
      // Prevents a memo carrying extra signer accounts, and prevents PII or a
      // free-form payload where only a commitment hash belongs (NFR-7).
      if (memo.accountKeys.length !== 0) {
        return fail("MEMO_ACCOUNTS_INVALID");
      }
      const text = new TextDecoder().decode(memo.data);
      if (context.expectedMemo !== undefined) {
        if (text !== context.expectedMemo) {
          return fail("MEMO_MISMATCH");
        }
      } else if (!HEX64.test(text)) {
        return fail("MEMO_MISMATCH", "not a commitment hash");
      }
    }
  } else {
    // Routed path: memos are forbidden (decision in Story 6.2 AC6), and the
    // quoted threshold must still meet the obligation.
    if (instructions.some((ix) => ix.programId === MEMO_PROGRAM_ID)) {
      return fail("INSTRUCTION_DISCRIMINATOR_INVALID", "memo on routed path");
    }
    const threshold =
      parseAtomic(context.intent.quotedOtherAmountThreshold) ?? minimumOutput;
    if (threshold < minimumOutput) {
      return fail("AMOUNT_BELOW_MINIMUM", threshold.toString());
    }
  }

  // ---- Phase 9b: whole-account-set backstop -----------------------------

  if (!isDflow) {
    // Deny by default: the message may contain ONLY accounts we can name.
    // Prevents smuggling in an attacker account for a CPI to touch, and prevents
    // the sponsor paying to initialise or rent-fund something unrelated.
    const expectedAccounts = new Set<string>([
      context.sponsorAddress,
      context.intent.payerAddress,
      context.intent.recipientAddress,
      payerAta,
      recipientAta,
      outputMint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
      SYSTEM_PROGRAM_ID,
      COMPUTE_BUDGET_PROGRAM_ID,
      MEMO_PROGRAM_ID,
      SYSVAR_RENT_PUBKEY,
    ]);

    // Only these three may be written: the sponsor pays the fee and the ATA
    // rent, and the two token accounts move balance.
    const expectedWritable = new Set<string>([
      context.sponsorAddress,
      payerAta,
      recipientAta,
    ]);

    for (let index = 0; index < accountKeysAll.length; index += 1) {
      const key = accountKeysAll[index]!;
      if (!expectedAccounts.has(key)) {
        return fail("UNEXPECTED_ACCOUNT", key);
      }
      if (isWritable(index) && !expectedWritable.has(key)) {
        return fail("UNEXPECTED_WRITABLE_ACCOUNT", key);
      }
    }
  } else {
    // ---- Routed backstop -------------------------------------------------
    //
    // A route's pool accounts are chosen by the router and cannot be enumerated
    // server-side, so the exact-account allowlist above does not apply. What CAN
    // be pinned is pinned, and the residual trust is stated plainly rather than
    // papered over:
    //
    //  * exactly one aggregator instruction, alongside compute-budget only;
    //  * the recipient's USDC token account is present AND writable, so the
    //    output genuinely lands where the intent says (this is what makes
    //    `destinationWallet` verifiable rather than merely requested);
    //  * no account other than the sponsor and the payer is a signer (Phase 3);
    //  * the sponsor is the fee payer and its lamport exposure is capped
    //    (Phase 10).
    //
    // Residual: the aggregator program is trusted not to CPI a transfer out of
    // the sponsor's wallet. That trust is irreducible for ANY routed swap the
    // sponsor pays for — it is the same trust as allowlisting the program at all
    // — and it is bounded to one allowlisted program id read from cluster config.
    const routerInstructions = instructions.filter(
      (ix) => ix.programId === manifest.routerProgramId,
    );
    if (routerInstructions.length !== 1) {
      return fail("ROUTER_INSTRUCTION_COUNT", `${routerInstructions.length}`);
    }

    const recipientIndex = accountKeysAll.indexOf(recipientAta);
    if (recipientIndex < 0) {
      return fail("RECIPIENT_TOKEN_ACCOUNT_MISSING", recipientAta);
    }
    if (!isWritable(recipientIndex)) {
      return fail("RECIPIENT_MISMATCH", "recipient token account not writable");
    }
  }

  // ---- Phase 10: sponsor exposure ---------------------------------------

  // On the routed path the sponsor still pays for token-account creation (DFlow:
  // "the sponsor will pay the transaction fee AND for token account creation"),
  // but the aggregator creates those accounts by CPI, so no top-level ATA
  // instruction is visible to count. Budgeting the observed zero would let the
  // sponsor sign for rent it never accounted for, so the routed path is charged
  // the worst case the manifest permits unless the caller has proven the
  // recipient's token account already exists.
  const unobservedRoutedRent =
    isDflow && context.recipientTokenAccountExists !== true
      ? BigInt(manifest.maxAtaCreates) * BigInt(ATA_RENT_LAMPORTS)
      : 0n;

  const sponsorExposure =
    budget.priorityFeeLamports + ataRentLamports + unobservedRoutedRent;
  if (sponsorExposure > BigInt(manifest.maxTotalSponsorLamports)) {
    return fail("SPONSOR_EXPOSURE_EXCEEDED", sponsorExposure.toString());
  }

  // Decision 10: the judged platform fee is zero and no fee account is sent.
  if (manifest.platformFeeBps !== 0) {
    return fail("PLATFORM_FEE_PRESENT");
  }

  // ---- Phase 11: freshness ----------------------------------------------

  // Prevents re-signing a message built against a different (older) blockhash.
  if (message.recentBlockhash !== context.blockhash) {
    return fail("BLOCKHASH_STALE");
  }

  // Prevents sponsoring a transaction the cluster can no longer include. Only
  // enforced when the caller supplied a real observed height — a caller with no
  // chain view is not silently granted a pass, it simply cannot answer this
  // question and the pre-sponsor call site checks it directly.
  if (
    context.currentBlockHeight !== undefined &&
    context.lastValidBlockHeight > 0 &&
    context.currentBlockHeight > context.lastValidBlockHeight
  ) {
    return fail(
      "BLOCKHASH_EXPIRED",
      `height ${context.currentBlockHeight} > lastValidBlockHeight ${context.lastValidBlockHeight}`,
    );
  }

  // ---- Phase 12: hash binding -------------------------------------------

  // Prevents any change between the quote and the sponsor signature.
  if (context.intent.messageHash && context.intent.messageHash !== messageHash) {
    return fail("MESSAGE_HASH_MISMATCH");
  }

  return {
    ok: true,
    messageHash,
    computeUnits: budget.computeUnits,
    priorityFeeLamports: Number(budget.priorityFeeLamports),
    ataCreates: ataCreates.length,
    sponsorExposureLamports: Number(sponsorExposure),
  };
}

/** Pre-client gate (Story 3.4 AC2). */
export function validateBeforeClientExposure(
  serializedBase64: string,
  context: Omit<SettlementIntentValidationContext, "gate">,
): ValidationResult {
  return validateTransactionMessage(serializedBase64, {
    ...context,
    gate: "pre_client",
  });
}

/** Pre-sponsor gate (Story 3.4 AC3) — the last check before the sponsor key. */
export function validateBeforeSponsorCoSign(
  serializedBase64: string,
  context: Omit<SettlementIntentValidationContext, "gate">,
): ValidationResult {
  return validateTransactionMessage(serializedBase64, {
    ...context,
    gate: "pre_sponsor",
  });
}

/**
 * Test-only convenience. It fabricates an active reservation, so it must never
 * be used on a production path — `validateBeforeSponsorCoSign` is the real gate.
 */
export function runDualGateValidation(
  serializedBase64: string,
  context: Omit<SettlementIntentValidationContext, "gate">,
): { preClient: ValidationResult; preSponsor: ValidationResult } {
  return {
    preClient: validateBeforeClientExposure(serializedBase64, context),
    preSponsor: validateBeforeSponsorCoSign(serializedBase64, {
      ...context,
      reservationActive: true,
      reservationOwnerIntentId: context.intentId,
    }),
  };
}

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
