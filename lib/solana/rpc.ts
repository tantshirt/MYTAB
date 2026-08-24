/**
 * Solana JSON-RPC client for the settlement path.
 *
 * Hand-rolled rather than `@solana/web3.js`'s `Connection` for three reasons
 * that all matter to money:
 *
 *  1. **Retry control per method.** `Connection` retries opaquely. Here the
 *     retry policy is declared per call, and `sendTransaction` is hard-wired to
 *     exactly one attempt so no transport-level retry can ever put a second
 *     broadcast on the wire.
 *  2. **Ambiguity is a first-class result.** A timeout on a broadcast is not a
 *     failure — it is "we do not know", which AD-11 maps to the persisted
 *     `unknown` state. A client that throws a generic `Error` erases that
 *     distinction.
 *  3. **No floats near an amount.** Every u64 the ledger depends on is read as a
 *     string or as a checked safe integer converted to BigInt, never as a
 *     JavaScript number that arithmetic then touches.
 *
 * The endpoint always comes from `SOLANA_RPC_URL` via
 * `assertClusterRpcAgreement()` — never a literal, never a default.
 */

import { assertClusterRpcAgreement } from "./cluster";

export const RPC_FAILURE = {
  /** SOLANA_RPC_URL absent, or it disagrees with SOLANA_CLUSTER. */
  NOT_CONFIGURED: "RPC_NOT_CONFIGURED",
  /** Request exceeded its deadline. For a read: retryable. For a send: ambiguous. */
  TIMEOUT: "RPC_TIMEOUT",
  /** Network failure or 5xx. */
  UNAVAILABLE: "RPC_UNAVAILABLE",
  /** HTTP 429, or a JSON-RPC rate-limit error. */
  RATE_LIMITED: "RPC_RATE_LIMITED",
  /** The node has not caught up to the slot we need (-32005 / minContextSlot). */
  NODE_BEHIND: "RPC_NODE_BEHIND",
  /** Response was not JSON, or not the shape the method promises. */
  MALFORMED: "RPC_MALFORMED_RESPONSE",
  /** A JSON-RPC error object that is none of the above. */
  METHOD_ERROR: "RPC_METHOD_ERROR",
  /** The cluster refused the transaction before it entered the network. */
  BROADCAST_REJECTED: "RPC_BROADCAST_REJECTED",
  /**
   * The broadcast may or may not have reached the network. NEVER a failure —
   * this is the input to the persisted `unknown` state (AD-11, decision 8).
   */
  BROADCAST_AMBIGUOUS: "RPC_BROADCAST_AMBIGUOUS",
} as const;

export type RpcFailureCode = (typeof RPC_FAILURE)[keyof typeof RPC_FAILURE];

export class SolanaRpcError extends Error {
  constructor(
    public readonly code: RpcFailureCode,
    detail?: string,
    /** Whether the same request may be sent again without risking a duplicate. */
    public readonly retryable = false,
    /** JSON-RPC error code, when the failure came from one. */
    public readonly rpcErrorCode?: number,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "SolanaRpcError";
  }
}

export type Commitment = "processed" | "confirmed" | "finalized";

export type SolanaFetch = typeof fetch;

export type RpcClientOptions = {
  url: string;
  fetchImpl?: SolanaFetch;
  /** Per-attempt deadline. */
  timeoutMs?: number;
  /** Attempts for retryable READ calls. Sends always get exactly one. */
  maxReadAttempts?: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_READ_ATTEMPTS = 3;

/** Deterministic backoff so tests can assert timing without wall-clock flake. */
export function rpcBackoffDelayMs(attempt: number, baseMs = 250, maxMs = 4_000): number {
  return Math.min(baseMs * 2 ** attempt, maxMs);
}

export function parseRpcRetryAfterMs(headerValue: string | null, maxMs = 10_000): number | null {
  if (!headerValue) {
    return null;
  }
  const seconds = Number(headerValue.trim());
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return Math.min(Math.round(seconds * 1000), maxMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A u64 that arrived as a JSON number.
 *
 * JSON.parse turns every number into a double. Anything above 2^53-1 has
 * already lost information by the time we can look at it, so a value outside
 * the safe-integer range is rejected rather than silently rounded into a
 * balance check. Inside the range the double is exact and BigInt() is lossless.
 */
export function safeU64FromJson(value: unknown, label: string): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "string") {
    if (!/^\d+$/.test(value)) {
      throw new SolanaRpcError(RPC_FAILURE.MALFORMED, `${label} is not a u64 string`);
    }
    return BigInt(value);
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new SolanaRpcError(
      RPC_FAILURE.MALFORMED,
      `${label} is not a lossless non-negative integer (${String(value)})`,
    );
  }
  return BigInt(value);
}

/** A JSON number used only as a slot/height counter — never as an amount. */
export function safeCounterFromJson(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new SolanaRpcError(
      RPC_FAILURE.MALFORMED,
      `${label} is not a non-negative safe integer (${String(value)})`,
    );
  }
  return value;
}

type JsonRpcErrorBody = { code?: number; message?: string; data?: unknown };

/** Maps a JSON-RPC error object onto a named, classified failure. */
export function classifyJsonRpcError(error: JsonRpcErrorBody): SolanaRpcError {
  const code = typeof error.code === "number" ? error.code : undefined;
  const message = error.message ?? "";

  // -32005: "Node is behind by N slots" / "Minimum context slot has not been reached".
  if (code === -32005 || /node is behind|minimum context slot/i.test(message)) {
    return new SolanaRpcError(RPC_FAILURE.NODE_BEHIND, message, true, code);
  }
  // -32429 is not standard, but several providers use 429-shaped JSON-RPC errors.
  if (code === -32429 || /rate.?limit|too many requests/i.test(message)) {
    return new SolanaRpcError(RPC_FAILURE.RATE_LIMITED, message, true, code);
  }
  // -32004 block not available yet, -32014 block cleanup — both transient.
  if (code === -32004 || code === -32014) {
    return new SolanaRpcError(RPC_FAILURE.UNAVAILABLE, message, true, code);
  }
  return new SolanaRpcError(RPC_FAILURE.METHOD_ERROR, message, false, code);
}

export type RpcAccountInfo = {
  /** base64 account data. */
  dataBase64: string;
  owner: string;
  lamports: bigint;
  executable: boolean;
  /** Actual slot carried by the RPC response, when the method returns context. */
  contextSlot?: number;
};

export type RpcOwnedTokenAccount = RpcAccountInfo & {
  address: string;
};

export type RpcLatestBlockhash = {
  blockhash: string;
  lastValidBlockHeight: number;
  contextSlot: number;
};

export type RpcSignatureStatus = {
  slot: number;
  confirmations: number | null;
  confirmationStatus: string | null;
  err: unknown;
};

/**
 * Raw `getTransaction` envelope, kept as `unknown`-typed JSON. The confirmation
 * parser is responsible for proving every field it reads, so nothing here
 * asserts a shape it has not checked.
 */
export type RpcTransactionResponse = {
  slot: number;
  blockTime: number | null;
  transactionBase64: string;
  meta: Record<string, unknown>;
};

export class SolanaRpcClient {
  readonly url: string;
  private readonly fetchImpl: SolanaFetch;
  private readonly timeoutMs: number;
  private readonly maxReadAttempts: number;
  private requestId = 0;

  constructor(options: RpcClientOptions) {
    this.url = options.url;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxReadAttempts = options.maxReadAttempts ?? DEFAULT_MAX_READ_ATTEMPTS;
  }

  /** One HTTP attempt. Never retries — the caller owns the retry decision. */
  private async attempt(method: string, params: unknown[]): Promise<unknown> {
    this.requestId += 1;
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: this.requestId,
      method,
      params,
    });

    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      const isTimeout =
        cause instanceof Error &&
        (cause.name === "TimeoutError" || cause.name === "AbortError");
      throw new SolanaRpcError(
        isTimeout ? RPC_FAILURE.TIMEOUT : RPC_FAILURE.UNAVAILABLE,
        `${method}: ${detail}`,
        true,
      );
    }

    if (response.status === 429) {
      throw new SolanaRpcError(
        RPC_FAILURE.RATE_LIMITED,
        `${method}: ${await excerpt(response)}`,
        true,
      );
    }
    if (response.status >= 500) {
      throw new SolanaRpcError(
        RPC_FAILURE.UNAVAILABLE,
        `${method}: HTTP ${response.status} ${await excerpt(response)}`,
        true,
      );
    }
    if (!response.ok) {
      throw new SolanaRpcError(
        RPC_FAILURE.METHOD_ERROR,
        `${method}: HTTP ${response.status} ${await excerpt(response)}`,
        false,
      );
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch (cause) {
      throw new SolanaRpcError(
        RPC_FAILURE.MALFORMED,
        `${method}: non-JSON body (${cause instanceof Error ? cause.message : String(cause)})`,
        // A malformed body from a healthy-looking 200 is worth one more read.
        true,
      );
    }

    if (typeof parsed !== "object" || parsed === null) {
      throw new SolanaRpcError(RPC_FAILURE.MALFORMED, `${method}: body was not an object`, true);
    }

    const envelope = parsed as { result?: unknown; error?: JsonRpcErrorBody };
    if (envelope.error) {
      throw classifyJsonRpcError(envelope.error);
    }
    if (!("result" in envelope)) {
      throw new SolanaRpcError(RPC_FAILURE.MALFORMED, `${method}: no result field`, true);
    }
    return envelope.result;
  }

  /**
   * A read. Safe to retry by construction — none of these methods changes chain
   * state, so a duplicate costs latency and nothing else.
   */
  async read(method: string, params: unknown[] = []): Promise<unknown> {
    let last: SolanaRpcError | null = null;
    for (let attempt = 0; attempt < this.maxReadAttempts; attempt += 1) {
      if (attempt > 0) {
        await sleep(rpcBackoffDelayMs(attempt));
      }
      try {
        return await this.attempt(method, params);
      } catch (error) {
        if (!(error instanceof SolanaRpcError) || !error.retryable) {
          throw error;
        }
        last = error;
      }
    }
    throw last ?? new SolanaRpcError(RPC_FAILURE.UNAVAILABLE, `${method}: retries exhausted`, true);
  }

  /**
   * `sendTransaction`, exactly once.
   *
   * There is deliberately no retry here at any level. A duplicate broadcast of
   * a *byte-identical* transaction is in fact harmless on Solana (same
   * signature, deduplicated by the cluster), but the moment a retry loop exists
   * it is one refactor away from re-signing with a fresh blockhash, which is a
   * genuine second payment. The invariant is easier to keep than to audit, so
   * the send path simply cannot loop.
   *
   * Every failure is classified as either definitively rejected (nothing
   * entered the network) or ambiguous (it may have).
   */
  async sendTransactionOnce(
    signedTransactionBase64: string,
    options: { skipPreflight?: boolean; preflightCommitment?: Commitment } = {},
  ): Promise<string> {
    let result: unknown;
    try {
      result = await this.attempt("sendTransaction", [
        signedTransactionBase64,
        {
          encoding: "base64",
          skipPreflight: options.skipPreflight ?? false,
          preflightCommitment: options.preflightCommitment ?? "confirmed",
          // The cluster must not rebroadcast on our behalf either; Convex owns
          // resubmission policy, and it currently has none by design.
          maxRetries: 0,
        },
      ]);
    } catch (error) {
      throw classifySendFailure(error);
    }

    if (typeof result !== "string" || result.length === 0) {
      // The node accepted it but we cannot read the signature back. The
      // transaction may well be on the wire: ambiguous, never failed.
      throw new SolanaRpcError(
        RPC_FAILURE.BROADCAST_AMBIGUOUS,
        "sendTransaction returned no signature string",
      );
    }
    return result;
  }

  async getLatestBlockhash(commitment: Commitment = "finalized"): Promise<RpcLatestBlockhash> {
    const result = await this.read("getLatestBlockhash", [{ commitment }]);
    const envelope = result as { context?: { slot?: unknown }; value?: Record<string, unknown> };
    const value = envelope?.value;
    if (!value || typeof value.blockhash !== "string" || value.blockhash.length === 0) {
      throw new SolanaRpcError(RPC_FAILURE.MALFORMED, "getLatestBlockhash: no blockhash");
    }
    return {
      blockhash: value.blockhash,
      lastValidBlockHeight: safeCounterFromJson(
        value.lastValidBlockHeight,
        "lastValidBlockHeight",
      ),
      contextSlot: safeCounterFromJson(envelope.context?.slot ?? 0, "contextSlot"),
    };
  }

  async getBlockHeight(commitment: Commitment = "finalized"): Promise<number> {
    return safeCounterFromJson(
      await this.read("getBlockHeight", [{ commitment }]),
      "blockHeight",
    );
  }

  async getSlot(commitment: Commitment = "finalized"): Promise<number> {
    return safeCounterFromJson(await this.read("getSlot", [{ commitment }]), "slot");
  }

  async isBlockhashValid(
    blockhash: string,
    commitment: Commitment = "finalized",
  ): Promise<boolean> {
    const result = await this.read("isBlockhashValid", [blockhash, { commitment }]);
    const value = (result as { value?: unknown })?.value;
    if (typeof value !== "boolean") {
      throw new SolanaRpcError(RPC_FAILURE.MALFORMED, "isBlockhashValid: no boolean value");
    }
    return value;
  }

  async getMinimumBalanceForRentExemption(
    dataLength: number,
    commitment: Commitment = "finalized",
  ): Promise<bigint> {
    return safeU64FromJson(
      await this.read("getMinimumBalanceForRentExemption", [dataLength, { commitment }]),
      "rentExemptMinimum",
    );
  }

  async getAccountInfo(
    address: string,
    commitment: Commitment = "finalized",
    minContextSlot?: number,
  ): Promise<RpcAccountInfo | null> {
    const result = await this.read("getAccountInfo", [
      address,
      {
        commitment,
        encoding: "base64",
        ...(minContextSlot === undefined ? {} : { minContextSlot }),
      },
    ]);
    const envelope = result as { context?: { slot?: unknown }; value?: unknown };
    const value = envelope?.value;
    if (value === null || value === undefined) {
      return null;
    }
    const account = value as Record<string, unknown>;
    const data = account.data;
    if (!Array.isArray(data) || typeof data[0] !== "string") {
      throw new SolanaRpcError(RPC_FAILURE.MALFORMED, "getAccountInfo: unexpected data encoding");
    }
    if (typeof account.owner !== "string") {
      throw new SolanaRpcError(RPC_FAILURE.MALFORMED, "getAccountInfo: no owner");
    }
    return {
      dataBase64: data[0],
      owner: account.owner,
      lamports: safeU64FromJson(account.lamports, "account.lamports"),
      executable: account.executable === true,
      contextSlot: safeCounterFromJson(
        envelope.context?.slot ?? minContextSlot ?? 0,
        "getAccountInfo.contextSlot",
      ),
    };
  }

  /** All legacy SPL Token accounts owned by a wallet, with byte-exact data. */
  async getTokenAccountsByOwner(
    ownerAddress: string,
    tokenProgramId: string,
    commitment: Commitment = "confirmed",
  ): Promise<RpcOwnedTokenAccount[]> {
    const result = await this.read("getTokenAccountsByOwner", [
      ownerAddress,
      { programId: tokenProgramId },
      { commitment, encoding: "base64" },
    ]);
    const values = (result as { value?: unknown })?.value;
    if (!Array.isArray(values)) {
      throw new SolanaRpcError(RPC_FAILURE.MALFORMED, "getTokenAccountsByOwner: no value array");
    }
    return values.map((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        throw new SolanaRpcError(
          RPC_FAILURE.MALFORMED,
          `getTokenAccountsByOwner: value[${index}] is not an object`,
        );
      }
      const row = entry as Record<string, unknown>;
      const account = row.account as Record<string, unknown> | undefined;
      const data = account?.data;
      if (
        typeof row.pubkey !== "string" ||
        !Array.isArray(data) ||
        typeof data[0] !== "string" ||
        typeof account?.owner !== "string"
      ) {
        throw new SolanaRpcError(
          RPC_FAILURE.MALFORMED,
          `getTokenAccountsByOwner: malformed value[${index}]`,
        );
      }
      return {
        address: row.pubkey,
        dataBase64: data[0],
        owner: account.owner,
        lamports: safeU64FromJson(account.lamports, `tokenAccount[${index}].lamports`),
        executable: account.executable === true,
      };
    });
  }

  async getSignatureStatus(
    signature: string,
    searchTransactionHistory = true,
  ): Promise<RpcSignatureStatus | null> {
    const result = await this.read("getSignatureStatuses", [
      [signature],
      { searchTransactionHistory },
    ]);
    const values = (result as { value?: unknown })?.value;
    if (!Array.isArray(values)) {
      throw new SolanaRpcError(RPC_FAILURE.MALFORMED, "getSignatureStatuses: no value array");
    }
    const entry = values[0];
    if (entry === null || entry === undefined) {
      return null;
    }
    const status = entry as Record<string, unknown>;
    return {
      slot: safeCounterFromJson(status.slot, "signatureStatus.slot"),
      confirmations:
        status.confirmations === null || status.confirmations === undefined
          ? null
          : safeCounterFromJson(status.confirmations, "signatureStatus.confirmations"),
      confirmationStatus:
        typeof status.confirmationStatus === "string" ? status.confirmationStatus : null,
      err: status.err ?? null,
    };
  }

  /**
   * The finalized transaction, or null when the cluster has never seen it.
   *
   * Commitment is pinned to `finalized` by AD-11: `processed` and `confirmed`
   * can both be rolled back, and a rolled-back transfer that already moved the
   * ledger is an unrecoverable accounting error.
   */
  async getFinalizedTransaction(signature: string): Promise<RpcTransactionResponse | null> {
    const result = await this.read("getTransaction", [
      signature,
      {
        commitment: "finalized",
        encoding: "base64",
        maxSupportedTransactionVersion: 0,
      },
    ]);
    if (result === null || result === undefined) {
      return null;
    }
    const tx = result as Record<string, unknown>;
    const transaction = tx.transaction;
    if (!Array.isArray(transaction) || typeof transaction[0] !== "string") {
      throw new SolanaRpcError(RPC_FAILURE.MALFORMED, "getTransaction: unexpected tx encoding");
    }
    if (typeof tx.meta !== "object" || tx.meta === null) {
      throw new SolanaRpcError(RPC_FAILURE.MALFORMED, "getTransaction: no meta");
    }
    return {
      slot: safeCounterFromJson(tx.slot, "transaction.slot"),
      blockTime:
        typeof tx.blockTime === "number" && Number.isSafeInteger(tx.blockTime)
          ? tx.blockTime
          : null,
      transactionBase64: transaction[0],
      meta: tx.meta as Record<string, unknown>,
    };
  }
}

/**
 * Turns a send-path error into either "definitely not broadcast" or
 * "we cannot know". Only the first is ever allowed to fail an intent.
 */
export function classifySendFailure(error: unknown): SolanaRpcError {
  if (!(error instanceof SolanaRpcError)) {
    return new SolanaRpcError(
      RPC_FAILURE.BROADCAST_AMBIGUOUS,
      error instanceof Error ? error.message : String(error),
    );
  }

  // A JSON-RPC method error on sendTransaction is a preflight/simulation
  // rejection: the node refused it before gossiping, so nothing entered the
  // network and the intent may safely fail.
  if (error.code === RPC_FAILURE.METHOD_ERROR) {
    // "already processed" means the opposite of a rejection — the transaction
    // is on chain. The caller already knows the signature (it is derived from
    // the signed bytes), so this is a successful broadcast.
    if (/already (been )?processed/i.test(error.message)) {
      return new SolanaRpcError(
        RPC_FAILURE.BROADCAST_AMBIGUOUS,
        "node reports the transaction was already processed",
      );
    }
    return new SolanaRpcError(RPC_FAILURE.BROADCAST_REJECTED, error.message, false, error.rpcErrorCode);
  }

  // Timeout, 5xx, 429, network error, node-behind, malformed body: the request
  // may have been delivered. Never a failure.
  return new SolanaRpcError(RPC_FAILURE.BROADCAST_AMBIGUOUS, error.message, false, error.rpcErrorCode);
}

async function excerpt(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return "<unreadable body>";
  }
}

/**
 * Builds the client from configuration.
 *
 * `assertClusterRpcAgreement()` runs first, every time: it is the only thing
 * standing between a transaction validated against devnet mints and a mainnet
 * endpoint. It is cheap and it is never cached.
 */
export function createSolanaRpcClient(
  options: Omit<RpcClientOptions, "url"> & { env?: Record<string, string | undefined> } = {},
): SolanaRpcClient {
  const { env, ...rest } = options;
  const { rpcUrl } = assertClusterRpcAgreement(env ?? (process.env as Record<string, string | undefined>));
  return new SolanaRpcClient({ ...rest, url: rpcUrl });
}
