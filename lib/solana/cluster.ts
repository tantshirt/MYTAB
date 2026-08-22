/**
 * Cluster configuration (AD-10, AD-22).
 *
 * The cluster is the ONLY thing that changes between the devnet ship and the
 * mainnet flip. Everything the sponsor policy asserts against — the USDC mint,
 * the DFlow aggregator program id, the RPC host — is derived from this module,
 * so no verification rule contains a cluster literal.
 *
 * Deny by default:
 *  - an unrecognised `SOLANA_CLUSTER` throws, it never falls back to a default;
 *  - the RPC URL must demonstrably belong to the configured cluster, otherwise
 *    startup throws. A devnet mint can never be validated against a mainnet RPC.
 */

export type SolanaCluster = "devnet" | "mainnet-beta";

export const CLUSTER_FAILURE = {
  UNKNOWN_CLUSTER: "SOLANA_CLUSTER_UNKNOWN",
  RPC_MISMATCH: "SOLANA_CLUSTER_RPC_MISMATCH",
  RPC_UNVERIFIED: "SOLANA_CLUSTER_RPC_UNVERIFIED",
} as const;

export type ClusterFailureCode =
  (typeof CLUSTER_FAILURE)[keyof typeof CLUSTER_FAILURE];

export class ClusterConfigError extends Error {
  constructor(
    public readonly code: ClusterFailureCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "ClusterConfigError";
  }
}

export type ClusterConfig = {
  cluster: SolanaCluster;
  /** Circle USDC mint for this cluster. Recipient output mint (AD-22). */
  usdcMint: string;
  usdcDecimals: 6;
  /** Native/wrapped SOL mint — identical on every cluster. */
  wrappedSolMint: string;
  /** DFlow Aggregator v4 — deployed on both clusters, read from config anyway. */
  dflowAggregatorProgramId: string;
};

const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

/** DFlow Aggregator v4. Present on devnet and mainnet-beta as of 2026-08. */
const DFLOW_AGGREGATOR_V4 = "DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH";

const CLUSTERS: Record<SolanaCluster, ClusterConfig> = {
  "mainnet-beta": {
    cluster: "mainnet-beta",
    usdcMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    usdcDecimals: 6,
    wrappedSolMint: WRAPPED_SOL_MINT,
    dflowAggregatorProgramId: DFLOW_AGGREGATOR_V4,
  },
  devnet: {
    cluster: "devnet",
    usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    usdcDecimals: 6,
    wrappedSolMint: WRAPPED_SOL_MINT,
    dflowAggregatorProgramId: DFLOW_AGGREGATOR_V4,
  },
};

export const SUPPORTED_CLUSTERS: readonly SolanaCluster[] = Object.freeze([
  "devnet",
  "mainnet-beta",
]);

type ClusterEnv = Record<string, string | undefined>;

function readEnv(): ClusterEnv {
  if (typeof process === "undefined" || !process.env) {
    return {};
  }
  return process.env as ClusterEnv;
}

/**
 * Default cluster is devnet. Mainnet is reached only by setting
 * `SOLANA_CLUSTER=mainnet-beta` deliberately — never by omission.
 */
export function resolveCluster(env: ClusterEnv = readEnv()): SolanaCluster {
  const raw = env.SOLANA_CLUSTER?.trim().toLowerCase();
  if (!raw) {
    return "devnet";
  }
  if (raw === "mainnet" || raw === "mainnet-beta") {
    return "mainnet-beta";
  }
  if (raw === "devnet") {
    return "devnet";
  }
  throw new ClusterConfigError(
    CLUSTER_FAILURE.UNKNOWN_CLUSTER,
    `SOLANA_CLUSTER=${raw}; supported: ${SUPPORTED_CLUSTERS.join(", ")}`,
  );
}

export function getClusterConfig(
  cluster: SolanaCluster = resolveCluster(),
): ClusterConfig {
  return CLUSTERS[cluster];
}

/** Expected USDC mint for the active cluster — the only mint a payout may credit. */
export function resolveUsdcMint(env: ClusterEnv = readEnv()): string {
  return getClusterConfig(resolveCluster(env)).usdcMint;
}

export function resolveWrappedSolMint(env: ClusterEnv = readEnv()): string {
  return getClusterConfig(resolveCluster(env)).wrappedSolMint;
}

export function resolveDflowAggregatorProgramId(
  env: ClusterEnv = readEnv(),
): string {
  return getClusterConfig(resolveCluster(env)).dflowAggregatorProgramId;
}

/**
 * Infers the cluster an RPC endpoint serves from its host. Returns undefined when
 * the host carries no cluster marker — in that case the operator must state it
 * explicitly via `SOLANA_RPC_CLUSTER`; we never guess.
 */
export function inferClusterFromRpcUrl(rpcUrl: string): SolanaCluster | undefined {
  let host: string;
  try {
    host = new URL(rpcUrl).host.toLowerCase();
  } catch {
    return undefined;
  }

  const hasDevnet = /(^|[.\-/])devnet([.\-]|$)/.test(host);
  const hasMainnet = /(^|[.\-/])mainnet(-beta)?([.\-]|$)/.test(host);

  if (hasDevnet && hasMainnet) {
    return undefined;
  }
  if (hasDevnet) {
    return "devnet";
  }
  if (hasMainnet) {
    return "mainnet-beta";
  }
  return undefined;
}

/**
 * Asserts the configured cluster and the configured RPC endpoint agree.
 *
 * Prevents: signing a transaction whose mint/program ids were validated against
 * devnet config and then broadcasting it to mainnet (or the reverse), which is
 * how a "test" transaction ends up spending real sponsor SOL.
 *
 * Throws when the RPC host carries a cluster marker that contradicts the config,
 * and when the host carries no marker and `SOLANA_RPC_CLUSTER` was not set.
 */
export function assertClusterRpcAgreement(env: ClusterEnv = readEnv()): {
  cluster: SolanaCluster;
  rpcUrl: string;
} {
  const cluster = resolveCluster(env);
  const rpcUrl = env.SOLANA_RPC_URL?.trim();

  if (!rpcUrl) {
    throw new ClusterConfigError(
      CLUSTER_FAILURE.RPC_UNVERIFIED,
      "SOLANA_RPC_URL is not set; a live cluster path requires an explicit RPC endpoint",
    );
  }

  const inferred = inferClusterFromRpcUrl(rpcUrl);
  const declared = env.SOLANA_RPC_CLUSTER?.trim().toLowerCase();
  const declaredCluster =
    declared === "mainnet" || declared === "mainnet-beta"
      ? "mainnet-beta"
      : declared === "devnet"
        ? "devnet"
        : undefined;

  if (declared && !declaredCluster) {
    throw new ClusterConfigError(
      CLUSTER_FAILURE.UNKNOWN_CLUSTER,
      `SOLANA_RPC_CLUSTER=${declared}`,
    );
  }

  if (inferred && declaredCluster && inferred !== declaredCluster) {
    throw new ClusterConfigError(
      CLUSTER_FAILURE.RPC_MISMATCH,
      `RPC host implies ${inferred} but SOLANA_RPC_CLUSTER=${declaredCluster}`,
    );
  }

  const effective = inferred ?? declaredCluster;

  if (!effective) {
    throw new ClusterConfigError(
      CLUSTER_FAILURE.RPC_UNVERIFIED,
      "RPC host carries no cluster marker; set SOLANA_RPC_CLUSTER to state it explicitly",
    );
  }

  if (effective !== cluster) {
    throw new ClusterConfigError(
      CLUSTER_FAILURE.RPC_MISMATCH,
      `SOLANA_CLUSTER=${cluster} but RPC endpoint serves ${effective}`,
    );
  }

  return { cluster, rpcUrl };
}
