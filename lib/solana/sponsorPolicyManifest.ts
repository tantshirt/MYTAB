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
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  USDC_MINT,
} from "./constants";

export type SponsorPolicyManifest = {
  version: typeof SPONSOR_V1_POLICY_VERSION;
  allowedPrograms: readonly string[];
  allowedMints: readonly string[];
  /** First byte of instruction data for allowed program instructions. */
  allowedInstructionDiscriminators: Readonly<Record<string, readonly number[]>>;
  maxComputeUnits: number;
  maxPriorityFeeLamports: number;
  maxAtaCreates: number;
  maxAtaRentLamports: number;
  maxTotalSponsorLamports: number;
  platformFeeBps: 0;
};

/** Immutable sponsor-v1 manifest — no wildcards (AD-10, AD-17). */
export const SPONSOR_POLICY_V1: SponsorPolicyManifest = {
  version: SPONSOR_V1_POLICY_VERSION,
  allowedPrograms: [
    SYSTEM_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    COMPUTE_BUDGET_PROGRAM_ID,
    MEMO_PROGRAM_ID,
  ],
  allowedMints: [USDC_MINT],
  allowedInstructionDiscriminators: {
    [COMPUTE_BUDGET_PROGRAM_ID]: [2, 3],
    [TOKEN_PROGRAM_ID]: [3, 12],
    [ASSOCIATED_TOKEN_PROGRAM_ID]: [1],
    [MEMO_PROGRAM_ID]: [0],
    [SYSTEM_PROGRAM_ID]: [],
  },
  maxComputeUnits: SPONSOR_MAX_COMPUTE_UNITS,
  maxPriorityFeeLamports: SPONSOR_MAX_PRIORITY_FEE_LAMPORTS,
  maxAtaCreates: SPONSOR_MAX_ATA_CREATES,
  maxAtaRentLamports: SPONSOR_MAX_ATA_RENT_LAMPORTS,
  maxTotalSponsorLamports: SPONSOR_MAX_LAMPORTS_PER_INTENT,
  platformFeeBps: 0,
};

export function assertManifestNonEmpty(): void {
  if (SPONSOR_POLICY_V1.allowedPrograms.length === 0) {
    throw new Error("SPONSOR_POLICY_V1: program allowlist must not be empty");
  }
  if (SPONSOR_POLICY_V1.allowedMints.length === 0) {
    throw new Error("SPONSOR_POLICY_V1: mint allowlist must not be empty");
  }
}

assertManifestNonEmpty();
