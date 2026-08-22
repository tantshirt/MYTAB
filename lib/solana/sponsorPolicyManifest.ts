/**
 * sponsor-v1 manifest (AD-10, AD-17).
 *
 * Deny by default. Every entry here is something the SERVER itself puts into a
 * transaction it builds; nothing is listed because a client asked for it.
 *
 * Audit notes for entries that were removed from the previous revision:
 *
 *  - `DFLOW_FIXTURE_PROGRAM_ID` — a placeholder id invented for offline fixtures
 *    was on the allowlist. A fixture id is not a cluster variant; allowlisting one
 *    lets a simulated transaction pass the same gate that guards a funded wallet,
 *    and it survives a cluster flip unnoticed. Removed permanently, and
 *    `assertNoFixtureProgramIds` fails the module load if it ever comes back.
 *
 *  - `SYSTEM_PROGRAM_ID` — the System program was allowlisted with an empty
 *    discriminator set, which happened to reject every real System instruction
 *    (they all carry a 4-byte discriminator) but only by accident. A top-level
 *    `SystemProgram.transfer{from: sponsor}` is the single highest-value attack
 *    against a sponsored fee payer: the sponsor is a required signer, so one
 *    instruction drains the whole wallet. The server never emits a top-level
 *    System instruction — creating an ATA CPIs into System from inside the ATA
 *    program — so the program is off the list entirely.
 *
 *  - Token-2022 is deliberately absent. The intent's mint is a classic SPL mint;
 *    a Token-2022 mint can carry transfer hooks and transfer fees that change how
 *    much the recipient actually receives.
 */

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  COMPUTE_BUDGET_PROGRAM_ID,
  MEMO_PROGRAM_ID,
  SPONSOR_MAX_ATA_CREATES,
  SPONSOR_MAX_ATA_RENT_LAMPORTS,
  SPONSOR_MAX_COMPUTE_UNITS,
  SPONSOR_MAX_LAMPORTS_PER_INTENT,
  SPONSOR_MAX_PRIORITY_FEE_LAMPORTS,
  SPONSOR_V1_POLICY_VERSION,
  TOKEN_PROGRAM_ID,
} from "./constants";
import { getClusterConfig, resolveCluster, type SolanaCluster } from "./cluster";
import { DFLOW_FIXTURE_PROGRAM_ID } from "../dflow/constants";

export type RoutingKind = "exact_usdc" | "dflow_sync";

/** ComputeBudget instruction discriminators (first data byte). */
export const COMPUTE_BUDGET_IX = {
  /** 0 RequestUnitsDeprecated, 1 RequestHeapFrame, 4 SetLoadedAccountsDataSizeLimit — all denied. */
  SET_COMPUTE_UNIT_LIMIT: 2,
  SET_COMPUTE_UNIT_PRICE: 3,
} as const;

/** SPL Token instruction discriminators. */
export const TOKEN_IX = {
  TRANSFER: 3,
  /** 4 Approve, 5 Revoke, 6 SetAuthority, 8 Burn, 9 CloseAccount — all denied. */
  TRANSFER_CHECKED: 12,
} as const;

/**
 * Associated Token Account program discriminators.
 * Empty data = `Create` (legacy encoding emitted by @solana/spl-token),
 * `[1]` = `CreateIdempotent`. `[2]` RecoverNested is denied: it moves the balance
 * of a nested ATA to a destination chosen by the instruction's accounts.
 */
export const ATA_IX = {
  CREATE_LEGACY_EMPTY_DATA: -1,
  CREATE_IDEMPOTENT: 1,
} as const;

export type SponsorPolicyManifest = {
  version: typeof SPONSOR_V1_POLICY_VERSION;
  cluster: SolanaCluster;
  routingKind: RoutingKind;
  allowedPrograms: readonly string[];
  /** The only mints any account slot in the transaction may reference. */
  allowedMints: readonly string[];
  /** The only mint the recipient may be credited in. */
  outputMint: string;
  outputDecimals: number;
  allowedInstructionDiscriminators: Readonly<Record<string, readonly number[]>>;
  maxInstructions: number;
  maxComputeUnits: number;
  maxPriorityFeeLamports: number;
  maxAtaCreates: number;
  maxAtaRentLamports: number;
  maxTotalSponsorLamports: number;
  platformFeeBps: 0;
};

/** Program ids that must never appear on any allowlist on any cluster. */
export const FORBIDDEN_FIXTURE_PROGRAM_IDS: readonly string[] = Object.freeze([
  DFLOW_FIXTURE_PROGRAM_ID,
]);

function baseDiscriminators(): Record<string, readonly number[]> {
  return {
    [COMPUTE_BUDGET_PROGRAM_ID]: [
      COMPUTE_BUDGET_IX.SET_COMPUTE_UNIT_LIMIT,
      COMPUTE_BUDGET_IX.SET_COMPUTE_UNIT_PRICE,
    ],
    [TOKEN_PROGRAM_ID]: [TOKEN_IX.TRANSFER, TOKEN_IX.TRANSFER_CHECKED],
    [ASSOCIATED_TOKEN_PROGRAM_ID]: [
      ATA_IX.CREATE_LEGACY_EMPTY_DATA,
      ATA_IX.CREATE_IDEMPOTENT,
    ],
  };
}

/** Builds the manifest for one cluster and one routing mode. */
export function buildSponsorPolicyManifest(input: {
  cluster?: SolanaCluster;
  routingKind: RoutingKind;
}): SponsorPolicyManifest {
  const cluster = input.cluster ?? resolveCluster();
  const config = getClusterConfig(cluster);
  const isDflow = input.routingKind === "dflow_sync";

  const allowedPrograms = isDflow
    ? [
        COMPUTE_BUDGET_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
        config.dflowAggregatorProgramId,
      ]
    : [
        COMPUTE_BUDGET_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
        MEMO_PROGRAM_ID,
      ];

  const allowedInstructionDiscriminators = baseDiscriminators();
  if (!isDflow) {
    // Memo carries the commitment hash; its content is asserted separately
    // against the exact hash the server computed, so no discriminator applies.
    allowedInstructionDiscriminators[MEMO_PROGRAM_ID] = [];
  }

  const manifest: SponsorPolicyManifest = {
    version: SPONSOR_V1_POLICY_VERSION,
    cluster,
    routingKind: input.routingKind,
    allowedPrograms: Object.freeze(allowedPrograms),
    allowedMints: Object.freeze(
      isDflow
        ? [config.usdcMint, config.wrappedSolMint]
        : [config.usdcMint],
    ),
    outputMint: config.usdcMint,
    outputDecimals: config.usdcDecimals,
    allowedInstructionDiscriminators: Object.freeze(
      allowedInstructionDiscriminators,
    ),
    // ComputeBudget×2 + optional ATA create + transfer + optional memo.
    maxInstructions: isDflow ? 8 : 5,
    maxComputeUnits: SPONSOR_MAX_COMPUTE_UNITS,
    maxPriorityFeeLamports: SPONSOR_MAX_PRIORITY_FEE_LAMPORTS,
    maxAtaCreates: SPONSOR_MAX_ATA_CREATES,
    maxAtaRentLamports: SPONSOR_MAX_ATA_RENT_LAMPORTS,
    maxTotalSponsorLamports: SPONSOR_MAX_LAMPORTS_PER_INTENT,
    platformFeeBps: 0,
  };

  assertManifestSane(manifest);
  return manifest;
}

const WILDCARDS = new Set(["*", "any", "all", ""]);

/** Deployment-time gate: an empty, wildcarded, or fixture-tainted manifest throws. */
export function assertManifestSane(manifest: SponsorPolicyManifest): void {
  if (manifest.allowedPrograms.length === 0) {
    throw new Error("SPONSOR_POLICY: program allowlist must not be empty");
  }
  if (manifest.allowedMints.length === 0) {
    throw new Error("SPONSOR_POLICY: mint allowlist must not be empty");
  }
  if (!manifest.outputMint) {
    throw new Error("SPONSOR_POLICY: output mint must be configured");
  }
  for (const entry of [...manifest.allowedPrograms, ...manifest.allowedMints]) {
    if (WILDCARDS.has(entry.trim().toLowerCase())) {
      throw new Error(`SPONSOR_POLICY: wildcard entry rejected (${entry})`);
    }
  }
  if (manifest.platformFeeBps !== 0) {
    throw new Error("SPONSOR_POLICY: platform fee must be zero (decision 10)");
  }
  assertNoFixtureProgramIds(manifest);
}

export function assertNoFixtureProgramIds(manifest: SponsorPolicyManifest): void {
  for (const programId of manifest.allowedPrograms) {
    if (FORBIDDEN_FIXTURE_PROGRAM_IDS.includes(programId)) {
      throw new Error(
        `SPONSOR_POLICY: fixture program id must never be allowlisted (${programId})`,
      );
    }
  }
}

/** Manifest for the active cluster, direct exact-USDC transfer path. */
export const SPONSOR_POLICY_V1: SponsorPolicyManifest =
  buildSponsorPolicyManifest({ routingKind: "exact_usdc" });

/** Manifest for the active cluster, DFlow sync-routed path. */
export const SPONSOR_POLICY_V1_DFLOW: SponsorPolicyManifest =
  buildSponsorPolicyManifest({ routingKind: "dflow_sync" });

export function getSponsorPolicyManifest(
  routingKind: RoutingKind,
  cluster?: SolanaCluster,
): SponsorPolicyManifest {
  if (cluster) {
    return buildSponsorPolicyManifest({ cluster, routingKind });
  }
  return routingKind === "dflow_sync"
    ? SPONSOR_POLICY_V1_DFLOW
    : SPONSOR_POLICY_V1;
}

/** @deprecated kept for callers of the previous export name. */
export function assertManifestNonEmpty(): void {
  assertManifestSane(SPONSOR_POLICY_V1);
  assertManifestSane(SPONSOR_POLICY_V1_DFLOW);
}

assertManifestNonEmpty();
