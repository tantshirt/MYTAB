/**
 * Pure helpers for Privy's server REST API — request shaping and embedded
 * Solana wallet selection.
 *
 * Endpoint:  GET https://api.privy.io/v1/users/{privyDid}
 * Auth:      HTTP Basic, username = PRIVY_APP_ID, password = PRIVY_APP_SECRET,
 *            plus the `privy-app-id: <PRIVY_APP_ID>` header.
 * Docs:      https://docs.privy.io/api-reference/users/get
 *
 * Nothing here reads the environment or performs I/O — the caller supplies the
 * credentials and does the fetch, so every branch below is unit-testable.
 *
 * Cluster note: a Privy embedded Solana wallet is a single keypair whose
 * address is identical on devnet and mainnet-beta. Selection therefore filters
 * on `chain_type === "solana"` and never on `chain_id`, so nothing in this file
 * changes when the cluster flips. {@link solanaCaip2ForCluster} exists only for
 * call sites (signing/RPC) that genuinely need the CAIP-2 id.
 */

export const PRIVY_API_BASE_URL = "https://api.privy.io";
export const PRIVY_API_HOSTNAME = "api.privy.io";

export const PrivyWalletErrorCode = {
  MISSING_CREDENTIALS: "PRIVY_MISSING_CREDENTIALS",
  INVALID_DID: "PRIVY_INVALID_DID",
  USER_NOT_FOUND: "PRIVY_USER_NOT_FOUND",
  UNAUTHORIZED: "PRIVY_UNAUTHORIZED",
  RATE_LIMITED: "PRIVY_RATE_LIMITED",
  UNAVAILABLE: "PRIVY_UNAVAILABLE",
  MALFORMED_RESPONSE: "PRIVY_MALFORMED_RESPONSE",
  NO_SOLANA_WALLET: "PRIVY_NO_SOLANA_WALLET",
  WALLET_ID_MISSING: "PRIVY_WALLET_ID_MISSING",
  INVALID_WALLET_ADDRESS: "PRIVY_INVALID_WALLET_ADDRESS",
} as const;
export type PrivyWalletErrorCode =
  (typeof PrivyWalletErrorCode)[keyof typeof PrivyWalletErrorCode];

export class PrivyWalletError extends Error {
  readonly code: PrivyWalletErrorCode;
  readonly retryable: boolean;

  constructor(code: PrivyWalletErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "PrivyWalletError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type PrivyLinkedWallet = {
  type?: string;
  id?: string | null;
  address?: string | null;
  chain_type?: string | null;
  chain_id?: string | null;
  wallet_client_type?: string | null;
  wallet_client?: string | null;
  connector_type?: string | null;
  wallet_index?: number | null;
  imported?: boolean | null;
  delegated?: boolean | null;
  first_verified_at?: number | null;
  verified_at?: number | null;
};

export type PrivyUserResponse = {
  id?: string;
  linked_accounts?: unknown;
};

export type PrivyWalletSnapshot = {
  privyWalletId: string;
  solanaAddress: string;
  /** How many embedded Solana wallets Privy returned — >1 means a deterministic pick was made. */
  candidateCount: number;
};

// ---------------------------------------------------------------------------
// Cluster
// ---------------------------------------------------------------------------

export type SolanaCluster = "mainnet-beta" | "devnet" | "testnet";

/** CAIP-2 chain ids Privy uses for Solana. Address resolution does not depend on these. */
export const SOLANA_CAIP2_BY_CLUSTER: Record<SolanaCluster, string> = {
  "mainnet-beta": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  testnet: "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z",
};

export function normalizeSolanaCluster(value: string | undefined): SolanaCluster {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "devnet" || normalized === "testnet") {
    return normalized;
  }
  if (normalized === "mainnet" || normalized === "mainnet-beta") {
    return "mainnet-beta";
  }
  // Fail closed toward the cluster with real value at stake only when explicitly
  // configured; an unset cluster is a configuration error the caller surfaces.
  return "devnet";
}

export function solanaCaip2ForCluster(cluster: SolanaCluster): string {
  return SOLANA_CAIP2_BY_CLUSTER[cluster];
}

// ---------------------------------------------------------------------------
// Request shaping
// ---------------------------------------------------------------------------

function base64(input: string): string {
  const globalBtoa = (globalThis as { btoa?: (value: string) => string }).btoa;
  if (typeof globalBtoa === "function") {
    return globalBtoa(input);
  }
  const nodeBuffer = (globalThis as { Buffer?: { from(v: string, e: string): { toString(e: string): string } } })
    .Buffer;
  if (nodeBuffer) {
    return nodeBuffer.from(input, "utf8").toString("base64");
  }
  throw new PrivyWalletError(
    PrivyWalletErrorCode.UNAVAILABLE,
    "No base64 encoder available in this runtime",
  );
}

const PRIVY_DID_PATTERN = /^did:privy:[A-Za-z0-9_-]{1,128}$/;

export function assertPrivyDid(privyDid: string): string {
  const trimmed = privyDid.trim();
  if (!PRIVY_DID_PATTERN.test(trimmed)) {
    throw new PrivyWalletError(
      PrivyWalletErrorCode.INVALID_DID,
      `Privy DID is malformed: ${JSON.stringify(privyDid)}`,
    );
  }
  return trimmed;
}

export type PrivyRequest = {
  url: string;
  method: "GET";
  headers: Record<string, string>;
};

/** Builds the authenticated `GET /v1/users/{did}` request. */
export function buildPrivyGetUserRequest(
  appId: string,
  appSecret: string,
  privyDid: string,
): PrivyRequest {
  const id = appId.trim();
  const secret = appSecret.trim();
  if (!id || !secret) {
    throw new PrivyWalletError(
      PrivyWalletErrorCode.MISSING_CREDENTIALS,
      "PRIVY_APP_ID and PRIVY_APP_SECRET are both required to reach the Privy server API",
    );
  }

  const did = assertPrivyDid(privyDid);
  return {
    url: `${PRIVY_API_BASE_URL}/v1/users/${encodeURIComponent(did)}`,
    method: "GET",
    headers: {
      Authorization: `Basic ${base64(`${id}:${secret}`)}`,
      "privy-app-id": id,
      accept: "application/json",
    },
  };
}

/** Maps a Privy HTTP status onto a named, classified error. */
export function privyErrorForStatus(status: number, bodyExcerpt: string): PrivyWalletError {
  if (status === 404) {
    return new PrivyWalletError(
      PrivyWalletErrorCode.USER_NOT_FOUND,
      `Privy has no user for that DID (404): ${bodyExcerpt}`,
    );
  }
  if (status === 401 || status === 403) {
    return new PrivyWalletError(
      PrivyWalletErrorCode.UNAUTHORIZED,
      `Privy rejected the app credentials (${status}): ${bodyExcerpt}`,
    );
  }
  if (status === 429) {
    return new PrivyWalletError(
      PrivyWalletErrorCode.RATE_LIMITED,
      `Privy rate limited the wallet lookup (429): ${bodyExcerpt}`,
      true,
    );
  }
  if (status >= 500) {
    return new PrivyWalletError(
      PrivyWalletErrorCode.UNAVAILABLE,
      `Privy is unavailable (${status}): ${bodyExcerpt}`,
      true,
    );
  }
  return new PrivyWalletError(
    PrivyWalletErrorCode.MALFORMED_RESPONSE,
    `Unexpected Privy response (${status}): ${bodyExcerpt}`,
  );
}

/** Seconds to wait from a `Retry-After` header, clamped; null when absent/unusable. */
export function parseRetryAfterMs(headerValue: string | null, maxMs = 10_000): number | null {
  if (!headerValue) {
    return null;
  }
  const seconds = Number(headerValue.trim());
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return Math.min(Math.round(seconds * 1000), maxMs);
}

/** Full jitter-free exponential backoff, deterministic so tests can assert it. */
export function backoffDelayMs(attempt: number, baseMs = 250, maxMs = 4_000): number {
  return Math.min(baseMs * 2 ** attempt, maxMs);
}

// ---------------------------------------------------------------------------
// Wallet selection
// ---------------------------------------------------------------------------

const BASE58_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isPlausibleSolanaAddress(address: string): boolean {
  return BASE58_ADDRESS_PATTERN.test(address);
}

function isEmbeddedSolanaWallet(account: PrivyLinkedWallet): boolean {
  if (account.type !== "wallet") {
    return false;
  }
  if (account.chain_type?.toLowerCase() !== "solana") {
    return false;
  }
  // Privy marks its own wallets with wallet_client_type "privy"; the REST shape
  // also carries connector_type "embedded". Accept either, reject externals.
  const clientType = (account.wallet_client_type ?? account.wallet_client ?? "").toLowerCase();
  const connectorType = (account.connector_type ?? "").toLowerCase();
  return clientType === "privy" || connectorType === "embedded";
}

/**
 * Stable ordering for the multiple-wallet case.
 *
 * Privy can return more than one embedded Solana wallet (extra wallets created
 * by a client, imported keys, recovery flows). Picking one at random would move
 * a user's receiving address between syncs, so the order below is total and
 * deterministic: lowest `wallet_index`, then earliest first verification, then
 * address, then wallet id. The same input always yields the same wallet.
 */
export function compareEmbeddedWallets(a: PrivyLinkedWallet, b: PrivyLinkedWallet): number {
  const indexA = typeof a.wallet_index === "number" ? a.wallet_index : Number.MAX_SAFE_INTEGER;
  const indexB = typeof b.wallet_index === "number" ? b.wallet_index : Number.MAX_SAFE_INTEGER;
  if (indexA !== indexB) {
    return indexA - indexB;
  }

  const verifiedA = a.first_verified_at ?? a.verified_at ?? Number.MAX_SAFE_INTEGER;
  const verifiedB = b.first_verified_at ?? b.verified_at ?? Number.MAX_SAFE_INTEGER;
  if (verifiedA !== verifiedB) {
    return verifiedA - verifiedB;
  }

  const addressCompare = (a.address ?? "").localeCompare(b.address ?? "");
  if (addressCompare !== 0) {
    return addressCompare;
  }
  return (a.id ?? "").localeCompare(b.id ?? "");
}

function readLinkedAccounts(user: PrivyUserResponse): PrivyLinkedWallet[] {
  const accounts = user.linked_accounts;
  if (!Array.isArray(accounts)) {
    throw new PrivyWalletError(
      PrivyWalletErrorCode.MALFORMED_RESPONSE,
      "Privy user response has no linked_accounts array",
    );
  }
  return accounts.filter((entry): entry is PrivyLinkedWallet =>
    typeof entry === "object" && entry !== null,
  );
}

/**
 * Resolves the user's embedded Solana wallet id and address.
 *
 * @throws PrivyWalletError NO_SOLANA_WALLET when the user has not been given one yet.
 * @throws PrivyWalletError WALLET_ID_MISSING when Privy omits the wallet id we must sign with.
 * @throws PrivyWalletError INVALID_WALLET_ADDRESS when the address is not base58-shaped.
 */
export function selectEmbeddedSolanaWallet(user: PrivyUserResponse): PrivyWalletSnapshot {
  const candidates = readLinkedAccounts(user).filter(isEmbeddedSolanaWallet);

  if (candidates.length === 0) {
    throw new PrivyWalletError(
      PrivyWalletErrorCode.NO_SOLANA_WALLET,
      `Privy user ${user.id ?? "<unknown>"} has no embedded Solana wallet yet`,
    );
  }

  const chosen = [...candidates].sort(compareEmbeddedWallets)[0];

  const privyWalletId = chosen.id?.trim() ?? "";
  if (!privyWalletId) {
    throw new PrivyWalletError(
      PrivyWalletErrorCode.WALLET_ID_MISSING,
      `Privy returned an embedded Solana wallet without an id for user ${user.id ?? "<unknown>"}; ` +
        "server-side signing is impossible without it",
    );
  }

  const solanaAddress = chosen.address?.trim() ?? "";
  if (!isPlausibleSolanaAddress(solanaAddress)) {
    throw new PrivyWalletError(
      PrivyWalletErrorCode.INVALID_WALLET_ADDRESS,
      `Privy returned a non-base58 Solana address ${JSON.stringify(solanaAddress)}`,
    );
  }

  return { privyWalletId, solanaAddress, candidateCount: candidates.length };
}
