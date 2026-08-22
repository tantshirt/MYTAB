/**
 * DFlow endpoint and cluster configuration.
 *
 * Two separate axes that are easy to confuse, so they are modelled separately:
 *
 *  1. HOST / ACCESS TIER. `dev-quote-api.dflow.net` needs no API key and is
 *     rate-limited; `quote-api.dflow.net` needs `x-api-key`. Both serve the SAME
 *     network. Adding a production key later is an env change, not a code change.
 *
 *  2. CLUSTER. VERIFIED empirically: a transaction from the dev host carried a
 *     blockhash valid on mainnet-beta and invalid on devnet, with `contextSlot`
 *     within ~45 slots of the mainnet slot; and a devnet USDC mint returns
 *     `route_not_found`. DFlow's Trading API indexes mainnet-beta liquidity ONLY.
 *     The aggregator program being deployed on devnet does not help: the routing
 *     service has no devnet pools to quote against.
 *
 * So the routed path is CLUSTER-GATED. On devnet it fails closed with
 * `DFLOW_UNAVAILABLE_ON_CLUSTER`. It does not fall back to a fixture, and it
 * does not send an order that could only ever produce a transaction the devnet
 * cluster would reject. The direct exact-USDC path is unaffected and remains
 * fully functional on devnet.
 */

import { resolveCluster, type SolanaCluster } from "../solana/cluster";

export const DFLOW_DEV_HOST = "https://dev-quote-api.dflow.net";
export const DFLOW_PROD_HOST = "https://quote-api.dflow.net";

/** The only cluster DFlow's Trading API serves. */
export const DFLOW_SUPPORTED_CLUSTER: SolanaCluster = "mainnet-beta";

/**
 * DFlow's response-signing public key, base58, carried as the RFC 9421 `keyid`.
 * PINNED here on purpose: a key fetched at runtime is a key an attacker can
 * substitute, which would defeat the whole point of verifying the signature.
 */
export const DFLOW_SIGNING_PUBLIC_KEY_BASE58 =
  "EZKxYr7bbXHaKAGw2MEpVUU9He3hwXGejSpCsdsZCmiF";

export const DFLOW_CONFIG_FAILURE = {
  UNAVAILABLE_ON_CLUSTER: "DFLOW_UNAVAILABLE_ON_CLUSTER",
  HOST_INVALID: "DFLOW_HOST_INVALID",
} as const;

export type DflowConfigFailureCode =
  (typeof DFLOW_CONFIG_FAILURE)[keyof typeof DFLOW_CONFIG_FAILURE];

export class DflowConfigError extends Error {
  constructor(
    public readonly code: DflowConfigFailureCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "DflowConfigError";
  }
}

export type DflowEnv = Record<string, string | undefined>;

export type DflowEndpointConfig = {
  baseUrl: string;
  /** Present only on the production tier. Never logged. */
  apiKey?: string;
  tier: "developer" | "production";
  /** Whether responses must carry a verified RFC 9421 signature. Always true. */
  verifySignatures: true;
};

function readEnv(env?: DflowEnv): DflowEnv {
  if (env) {
    return env;
  }
  if (typeof process === "undefined" || !process.env) {
    return {};
  }
  return process.env as DflowEnv;
}

/**
 * Resolves the host and access tier.
 *
 * An explicit `DFLOW_API_BASE_URL` wins so an operator can point at a staging
 * host, but it must be https and must not carry a path/query, because we append
 * `/order` and a query string to it.
 */
export function resolveDflowEndpoint(env?: DflowEnv): DflowEndpointConfig {
  const source = readEnv(env);
  const apiKey = source.DFLOW_API_KEY?.trim() || undefined;
  const override = source.DFLOW_API_BASE_URL?.trim();

  const baseUrl = override
    ? normalizeHost(override)
    : apiKey
      ? DFLOW_PROD_HOST
      : DFLOW_DEV_HOST;

  return {
    baseUrl,
    apiKey,
    tier: apiKey ? "production" : "developer",
    verifySignatures: true,
  };
}

function normalizeHost(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new DflowConfigError(DFLOW_CONFIG_FAILURE.HOST_INVALID, value);
  }
  if (parsed.protocol !== "https:") {
    throw new DflowConfigError(
      DFLOW_CONFIG_FAILURE.HOST_INVALID,
      "DFLOW_API_BASE_URL must be https",
    );
  }
  if (parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== "/")) {
    throw new DflowConfigError(
      DFLOW_CONFIG_FAILURE.HOST_INVALID,
      "DFLOW_API_BASE_URL must be an origin with no path or query",
    );
  }
  return parsed.origin;
}

/** Headers every request carries. The API key is added only on the prod tier. */
export function buildDflowRequestHeaders(input: {
  config: DflowEndpointConfig;
  requestId: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    // Ask DFlow to sign the response, and bind that signature to OUR request id
    // so a replayed response for a different request cannot be accepted.
    "x-sign-request": "true",
    "x-request-id": input.requestId,
  };
  if (input.config.apiKey) {
    headers["x-api-key"] = input.config.apiKey;
  }
  return headers;
}

/** True when the active cluster is one DFlow can actually route on. */
export function isDflowRoutingAvailable(env?: DflowEnv): boolean {
  return resolveCluster(readEnv(env)) === DFLOW_SUPPORTED_CLUSTER;
}

/**
 * Fail-closed cluster gate. Call before any `/order` request and before any
 * routed intent is created. Flipping `SOLANA_CLUSTER=mainnet-beta` enables
 * routing with no code change.
 */
export function assertDflowRoutingAvailable(env?: DflowEnv): SolanaCluster {
  const cluster = resolveCluster(readEnv(env));
  if (cluster !== DFLOW_SUPPORTED_CLUSTER) {
    throw new DflowConfigError(
      DFLOW_CONFIG_FAILURE.UNAVAILABLE_ON_CLUSTER,
      `SOLANA_CLUSTER=${cluster}; DFlow's Trading API serves ${DFLOW_SUPPORTED_CLUSTER} only`,
    );
  }
  return cluster;
}
