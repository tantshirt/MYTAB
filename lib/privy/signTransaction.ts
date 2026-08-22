/**
 * Pure request/response shaping for Privy's server-wallet Solana signing RPC.
 *
 * Endpoint:  POST https://api.privy.io/v1/wallets/{wallet_id}/rpc
 * Auth:      HTTP Basic (PRIVY_APP_ID:PRIVY_APP_SECRET) + `privy-app-id` header
 *            — the same scheme `serverWallets.ts` already uses for user lookup.
 * Body:      { "method": "signTransaction",
 *              "params": { "transaction": "<base64>", "encoding": "base64" } }
 * Response:  { "method": "signTransaction",
 *              "data": { "signed_transaction": "<base64>", "encoding": "base64" } }
 * Docs:      https://docs.privy.io/api-reference/wallets/solana/sign-transaction
 *            https://docs.privy.io/api-reference/idempotency-keys
 *
 * We deliberately use `signTransaction` and NOT `signAndSendTransaction`:
 * AD-9 requires Convex to own the broadcast, because the broadcast is the
 * moment the signature becomes a fact and Convex is the only place that can
 * record it durably before it happens. Handing the send to Privy would put the
 * one irreversible step outside the system that has to be idempotent about it.
 *
 * Nothing in this file reads the environment or performs I/O.
 */

export const PRIVY_SIGN_FAILURE = {
  MISSING_CREDENTIALS: "PRIVY_MISSING_CREDENTIALS",
  MISSING_WALLET_ID: "PRIVY_SPONSOR_WALLET_ID_MISSING",
  UNAUTHORIZED: "PRIVY_UNAUTHORIZED",
  RATE_LIMITED: "PRIVY_RATE_LIMITED",
  UNAVAILABLE: "PRIVY_UNAVAILABLE",
  REJECTED: "PRIVY_SIGN_REJECTED",
  MALFORMED_RESPONSE: "PRIVY_MALFORMED_RESPONSE",
} as const;

export type PrivySignFailureCode =
  (typeof PRIVY_SIGN_FAILURE)[keyof typeof PRIVY_SIGN_FAILURE];

export class PrivySignError extends Error {
  constructor(
    public readonly code: PrivySignFailureCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "PrivySignError";
  }
}

export const PRIVY_API_BASE_URL = "https://api.privy.io";

function base64(input: string): string {
  const globalBtoa = (globalThis as { btoa?: (value: string) => string }).btoa;
  if (typeof globalBtoa === "function") {
    return globalBtoa(input);
  }
  const nodeBuffer = (
    globalThis as { Buffer?: { from(v: string, e: string): { toString(e: string): string } } }
  ).Buffer;
  if (nodeBuffer) {
    return nodeBuffer.from(input, "utf8").toString("base64");
  }
  throw new PrivySignError(
    PRIVY_SIGN_FAILURE.UNAVAILABLE,
    "No base64 encoder available in this runtime",
  );
}

export type PrivySignRequest = {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
};

/**
 * Deterministic idempotency key for one intent's sponsor signature.
 *
 * Bound to the message hash, not just the intent id: if the message ever
 * changed, the key changes with it, so a cached signature can never be replayed
 * onto different bytes. `attempt` is appended only when a previous attempt
 * failed in a way Privy caches (see the retry note in `signSolanaTransaction`).
 */
export function sponsorIdempotencyKey(
  intentId: string,
  messageHash: string,
  attempt = 0,
): string {
  const base = `mytab-cosign-v1:${intentId}:${messageHash}`;
  return attempt === 0 ? base.slice(0, 256) : `${base}:a${attempt}`.slice(0, 256);
}

export function buildPrivySignTransactionRequest(input: {
  appId: string;
  appSecret: string;
  walletId: string;
  transactionBase64: string;
  idempotencyKey: string;
  /** Optional request authorization signature, when the app enforces one. */
  authorizationSignature?: string;
}): PrivySignRequest {
  const appId = input.appId.trim();
  const appSecret = input.appSecret.trim();
  if (!appId || !appSecret) {
    throw new PrivySignError(
      PRIVY_SIGN_FAILURE.MISSING_CREDENTIALS,
      "PRIVY_APP_ID and PRIVY_APP_SECRET are both required to reach the Privy signing API",
    );
  }

  const walletId = input.walletId.trim();
  if (!walletId) {
    throw new PrivySignError(
      PRIVY_SIGN_FAILURE.MISSING_WALLET_ID,
      "PRIVY_SPONSOR_WALLET_ID is required; the sponsor address alone cannot be signed with",
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Basic ${base64(`${appId}:${appSecret}`)}`,
    "privy-app-id": appId,
    "content-type": "application/json",
    accept: "application/json",
    "privy-idempotency-key": input.idempotencyKey,
  };
  if (input.authorizationSignature?.trim()) {
    headers["privy-authorization-signature"] = input.authorizationSignature.trim();
  }

  return {
    url: `${PRIVY_API_BASE_URL}/v1/wallets/${encodeURIComponent(walletId)}/rpc`,
    method: "POST",
    headers,
    body: JSON.stringify({
      method: "signTransaction",
      params: {
        transaction: input.transactionBase64,
        encoding: "base64",
      },
    }),
  };
}

/** Maps a Privy HTTP status onto a named, classified signing error. */
export function privySignErrorForStatus(status: number, bodyExcerpt: string): PrivySignError {
  if (status === 401 || status === 403) {
    return new PrivySignError(
      PRIVY_SIGN_FAILURE.UNAUTHORIZED,
      `Privy rejected the app credentials (${status}): ${bodyExcerpt}`,
    );
  }
  if (status === 429) {
    return new PrivySignError(
      PRIVY_SIGN_FAILURE.RATE_LIMITED,
      `Privy rate limited the sponsor signature (429): ${bodyExcerpt}`,
      true,
    );
  }
  if (status >= 500) {
    return new PrivySignError(
      PRIVY_SIGN_FAILURE.UNAVAILABLE,
      `Privy is unavailable (${status}): ${bodyExcerpt}`,
      true,
    );
  }
  // 400/404/422: Privy understood the request and refused it. Nothing was
  // signed, so the caller may safely fail the intent.
  return new PrivySignError(
    PRIVY_SIGN_FAILURE.REJECTED,
    `Privy refused to sign (${status}): ${bodyExcerpt}`,
  );
}

/**
 * Pulls the signed transaction out of the response body.
 * Accepts both the documented `data.signed_transaction` envelope and a
 * flattened `signed_transaction`, and refuses anything else.
 */
export function readSignedTransaction(body: unknown): string {
  if (typeof body !== "object" || body === null) {
    throw new PrivySignError(
      PRIVY_SIGN_FAILURE.MALFORMED_RESPONSE,
      "Privy signing response was not an object",
    );
  }
  const envelope = body as Record<string, unknown>;
  const data = (envelope.data ?? envelope) as Record<string, unknown>;
  const signed = data.signed_transaction ?? data.signedTransaction;
  if (typeof signed !== "string" || signed.length === 0) {
    throw new PrivySignError(
      PRIVY_SIGN_FAILURE.MALFORMED_RESPONSE,
      "Privy signing response carried no signed_transaction",
    );
  }
  const encoding = data.encoding;
  if (encoding !== undefined && encoding !== "base64") {
    throw new PrivySignError(
      PRIVY_SIGN_FAILURE.MALFORMED_RESPONSE,
      `Privy returned encoding ${String(encoding)}; only base64 is accepted`,
    );
  }
  return signed;
}
