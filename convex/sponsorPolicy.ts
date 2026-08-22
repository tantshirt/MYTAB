/** sponsor-v1 caps, allowlists, and kill switch (AD-17, Story 3.8). */

import { getSponsorPolicyManifest } from "../lib/solana/sponsorPolicyManifest";

export const SPONSOR_POLICY_VERSION = "sponsor-v1";

export type SponsorEnvironment = "production" | "development";

export type SponsorCaps = {
  perTransactionLamports: bigint;
  perUserDayLamports: bigint;
  perWalletDayLamports: bigint;
  perGroupDayLamports: bigint;
  dailyAggregateLamports: bigint;
  globalEpochLamports: bigint;
  maxPriorityFeeLamports: bigint;
  maxAtaRentLamports: bigint;
  maxSponsorDebitPerIntentLamports: bigint;
};

export const SPONSOR_FAILURE = {
  PAUSED: "SPONSOR_PAUSED",
  CAP_PER_TRANSACTION: "SPONSOR_CAP_PER_TRANSACTION",
  CAP_PER_USER_DAY: "SPONSOR_CAP_PER_USER_DAY",
  CAP_PER_WALLET_DAY: "SPONSOR_CAP_PER_WALLET_DAY",
  CAP_PER_GROUP_DAY: "SPONSOR_CAP_PER_GROUP_DAY",
  CAP_DAILY_AGGREGATE: "SPONSOR_CAP_DAILY_AGGREGATE",
  CAP_GLOBAL_EPOCH: "SPONSOR_CAP_GLOBAL_EPOCH",
  ALLOWLIST_PROGRAM: "SPONSOR_ALLOWLIST_PROGRAM",
  ALLOWLIST_MINT: "SPONSOR_ALLOWLIST_MINT",
  ALLOWLIST_RECIPIENT: "SPONSOR_ALLOWLIST_RECIPIENT",
  ALLOWLIST_INSTRUCTION: "SPONSOR_ALLOWLIST_INSTRUCTION",
} as const;

/** Canonical sponsor-v1 lamport caps from AD-17 / Implementation Readiness Contract. */
const CAPS: Record<SponsorEnvironment, SponsorCaps> = {
  production: {
    perTransactionLamports: 3_000_000n,
    perUserDayLamports: 15_000_000n,
    perWalletDayLamports: 15_000_000n,
    perGroupDayLamports: 75_000_000n,
    dailyAggregateLamports: 250_000_000n,
    globalEpochLamports: 1_000_000_000n,
    maxPriorityFeeLamports: 250_000n,
    maxAtaRentLamports: 2_500_000n,
    maxSponsorDebitPerIntentLamports: 3_000_000n,
  },
  development: {
    perTransactionLamports: 3_000_000n,
    perUserDayLamports: 6_000_000n,
    perWalletDayLamports: 6_000_000n,
    perGroupDayLamports: 20_000_000n,
    dailyAggregateLamports: 50_000_000n,
    globalEpochLamports: 100_000_000n,
    maxPriorityFeeLamports: 250_000n,
    maxAtaRentLamports: 2_500_000n,
    maxSponsorDebitPerIntentLamports: 3_000_000n,
  },
};

/**
 * Coarse allowlist applied at reservation time (Story 3.8 AC2).
 *
 * This is a cheap pre-check on intent metadata, NOT the authority on what a
 * transaction may contain — `lib/solana/validateTransactionMessage.ts` decodes
 * the actual bytes and is the gate that guards the sponsor key. The value here
 * is that a reservation cannot even be taken out for a mint or program the
 * manifest would refuse later.
 *
 * Every entry is derived from the active cluster manifest; nothing is a literal.
 */
export function sponsorReservationAllowlist() {
  const manifest = getSponsorPolicyManifest("exact_usdc");
  return {
    programs: new Set(manifest.allowedPrograms),
    /** Exactly the configured cluster USDC mint — a wrong-cluster mint rejects. */
    outputMint: manifest.outputMint,
    recipients: new Set<string>(),
    instructions: new Set(["transfer", "transferChecked", "memo"]),
  };
}

export type SponsorUsageSnapshot = {
  userDayReserved: bigint;
  walletDayReserved: bigint;
  groupDayReserved: bigint;
  dailyAggregateReserved: bigint;
  globalEpochReserved: bigint;
};

export type SponsorReservationRequest = {
  environment: SponsorEnvironment;
  reservedLamports: bigint;
  usage: SponsorUsageSnapshot;
  allowlist: {
    programId: string;
    mint: string;
    recipientAddress: string;
    instructionKind: string;
  };
  paused?: boolean;
};

export type SponsorReservationResult =
  | { ok: true }
  | { ok: false; failureCode: string };

/** Resolves production vs development from ENVIRONMENT / VERCEL_ENV. */
export function resolveSponsorEnvironment(
  env: {
    ENVIRONMENT?: string;
    VERCEL_ENV?: string;
    NODE_ENV?: string;
  } = readProcessEnv(),
): SponsorEnvironment {
  if (env.ENVIRONMENT === "production" || env.VERCEL_ENV === "production") {
    return "production";
  }
  if (env.NODE_ENV === "production" && env.VERCEL_ENV === undefined) {
    return "production";
  }
  return "development";
}

export function getSponsorCaps(
  environment: SponsorEnvironment = resolveSponsorEnvironment(),
): SponsorCaps {
  return CAPS[environment];
}

/** Emergency pause — blocks new sponsorship without blocking reads (AD-17). */
export function isSponsorPaused(
  env: { SPONSOR_PAUSE?: string } = readProcessEnv(),
): boolean {
  const value = env.SPONSOR_PAUSE?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/** UTC day bucket key for daily cap windows. */
export function utcDayKey(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function wouldExceedCap(
  currentReserved: bigint,
  increment: bigint,
  cap: bigint,
): boolean {
  return currentReserved + increment > cap;
}

/** Pure evaluation of all six budget dimensions plus allowlists. */
export function evaluateSponsorReservation(
  request: SponsorReservationRequest,
): SponsorReservationResult {
  if (request.paused ?? isSponsorPaused()) {
    return { ok: false, failureCode: SPONSOR_FAILURE.PAUSED };
  }

  const caps = getSponsorCaps(request.environment);
  const { reservedLamports, usage, allowlist } = request;

  if (reservedLamports > caps.perTransactionLamports) {
    return { ok: false, failureCode: SPONSOR_FAILURE.CAP_PER_TRANSACTION };
  }

  if (
    wouldExceedCap(
      usage.userDayReserved,
      reservedLamports,
      caps.perUserDayLamports,
    )
  ) {
    return { ok: false, failureCode: SPONSOR_FAILURE.CAP_PER_USER_DAY };
  }

  if (
    wouldExceedCap(
      usage.walletDayReserved,
      reservedLamports,
      caps.perWalletDayLamports,
    )
  ) {
    return { ok: false, failureCode: SPONSOR_FAILURE.CAP_PER_WALLET_DAY };
  }

  if (
    wouldExceedCap(
      usage.groupDayReserved,
      reservedLamports,
      caps.perGroupDayLamports,
    )
  ) {
    return { ok: false, failureCode: SPONSOR_FAILURE.CAP_PER_GROUP_DAY };
  }

  if (
    wouldExceedCap(
      usage.dailyAggregateReserved,
      reservedLamports,
      caps.dailyAggregateLamports,
    )
  ) {
    return { ok: false, failureCode: SPONSOR_FAILURE.CAP_DAILY_AGGREGATE };
  }

  if (
    wouldExceedCap(
      usage.globalEpochReserved,
      reservedLamports,
      caps.globalEpochLamports,
    )
  ) {
    return { ok: false, failureCode: SPONSOR_FAILURE.CAP_GLOBAL_EPOCH };
  }

  const manifestAllowlist = sponsorReservationAllowlist();

  if (!manifestAllowlist.programs.has(allowlist.programId)) {
    return { ok: false, failureCode: SPONSOR_FAILURE.ALLOWLIST_PROGRAM };
  }
  // Exactly the configured cluster USDC mint. A devnet mint reserved against a
  // mainnet manifest (or the reverse) is a rejection, not a warning.
  if (allowlist.mint !== manifestAllowlist.outputMint) {
    return { ok: false, failureCode: SPONSOR_FAILURE.ALLOWLIST_MINT };
  }
  if (
    manifestAllowlist.recipients.size > 0 &&
    !manifestAllowlist.recipients.has(allowlist.recipientAddress)
  ) {
    return { ok: false, failureCode: SPONSOR_FAILURE.ALLOWLIST_RECIPIENT };
  }
  if (!manifestAllowlist.instructions.has(allowlist.instructionKind)) {
    return { ok: false, failureCode: SPONSOR_FAILURE.ALLOWLIST_INSTRUCTION };
  }

  return { ok: true };
}

/** Default worst-case sponsor debit reserved per intent. */
export function defaultIntentSponsorReservationLamports(
  environment: SponsorEnvironment = resolveSponsorEnvironment(),
): bigint {
  return getSponsorCaps(environment).maxSponsorDebitPerIntentLamports;
}

function readProcessEnv(): Record<string, string | undefined> {
  if (typeof process === "undefined") {
    return {};
  }
  return process.env as Record<string, string | undefined>;
}
