"use node";

import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  assertFixturePathAllowed,
  fixturePathAllowed,
} from "../../lib/solana/runtimeGuard";
import {
  PrivyWalletError,
  PrivyWalletErrorCode,
  backoffDelayMs,
  buildPrivyGetUserRequest,
  normalizeSolanaCluster,
  parseRetryAfterMs,
  privyErrorForStatus,
  selectEmbeddedSolanaWallet,
  solanaCaip2ForCluster,
  type PrivyUserResponse,
  type PrivyWalletSnapshot,
  type SolanaCluster,
} from "../../lib/privy/serverWallets";
import {
  PRIVY_SIGN_FAILURE,
  PrivySignError,
  buildPrivySignTransactionRequest,
  privySignErrorForStatus,
  readSignedTransaction,
  sponsorIdempotencyKey,
} from "../../lib/privy/signTransaction";
import {
  base58ToBytes,
  bytesToBase58,
  decodeTransactionBase64,
  isEmptySignature,
} from "../../lib/solana/decodeTransaction";
import { ed25519 } from "@noble/curves/ed25519.js";
import { verifyPartialSignedTransaction } from "../../lib/solana/verifyUserSignature";
import {
  validateBeforeSponsorCoSign,
  type SettlementIntentValidationContext,
} from "../../lib/solana/validateTransactionMessage";
import {
  RPC_FAILURE,
  SolanaRpcError,
  classifySendFailure,
  createSolanaRpcClient,
  type SolanaRpcClient,
} from "../../lib/solana/rpc";
import {
  FIXTURE_PRIVY_WALLET_ID,
  FIXTURE_SOLANA_ADDRESS,
  FIXTURE_SPONSOR_SIGNATURE,
} from "../../lib/privy/fixtures";
import { FIXTURE_TX_SIGNATURE } from "../../lib/solana/constants";

export {
  PrivyWalletError,
  PrivyWalletErrorCode,
} from "../../lib/privy/serverWallets";
export { PrivySignError } from "../../lib/privy/signTransaction";

// Fixture identifiers are imported, never re-exported: a deployed Convex module
// must not carry a FIXTURE_* symbol in its public surface. Every path that could
// return one runs through assertFixturePathAllowed first.

const PRIVY_REQUEST_TIMEOUT_MS = 10_000;
const PRIVY_MAX_ATTEMPTS = 3;

type PrivyCredentials = {
  appId: string;
  appSecret: string;
};

function readPrivyCredentials(): PrivyCredentials | null {
  const appId = process.env.PRIVY_APP_ID?.trim();
  const appSecret = process.env.PRIVY_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    return null;
  }
  return { appId, appSecret };
}

/**
 * True when Convex has no Privy app credentials.
 *
 * This is now only a *description* of the environment. It never by itself
 * authorises fixture data — {@link assertFixturePathAllowed} does that, and it
 * refuses on any real deployment, devnet included.
 */
export function isPrivyServerFixtureMode(): boolean {
  return readPrivyCredentials() === null;
}

/**
 * The Solana cluster this deployment settles on.
 *
 * Privy embedded Solana wallets are cluster-agnostic — the same keypair and the
 * same base58 address serve devnet and mainnet-beta — so wallet *resolution*
 * never reads this. It is exposed so signing/RPC call sites take the cluster
 * from configuration rather than a constant when they need a CAIP-2 id.
 */
export function resolveSolanaCluster(): SolanaCluster {
  return normalizeSolanaCluster(process.env.SOLANA_CLUSTER);
}

export function resolveSolanaCaip2(): string {
  return solanaCaip2ForCluster(resolveSolanaCluster());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readBodyExcerpt(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "<unreadable body>";
  }
}

export type PrivyFetch = typeof fetch;

/**
 * Fetches the Privy user and returns their embedded Solana wallet.
 *
 * `GET https://api.privy.io/v1/users/{did}` with HTTP Basic auth
 * (`PRIVY_APP_ID`:`PRIVY_APP_SECRET`) and the `privy-app-id` header.
 * Both secrets live in the Convex dashboard only (AD-19) — never on Vercel.
 *
 * Retries 429 / 5xx / network failures with bounded exponential backoff,
 * honouring `Retry-After` when Privy sends it. Every terminal condition raises
 * a named {@link PrivyWalletError}; none of them fall back to fixture data.
 */
export async function fetchPrivyEmbeddedWalletSnapshot(
  privyDid: string,
  credentials: PrivyCredentials,
  fetchImpl: PrivyFetch = fetch,
): Promise<PrivyWalletSnapshot> {
  const request = buildPrivyGetUserRequest(
    credentials.appId,
    credentials.appSecret,
    privyDid,
  );

  let lastError: PrivyWalletError | null = null;
  // Per-call, never module state: concurrent lookups must not share a hint.
  let retryAfterHintMs = 0;

  for (let attempt = 0; attempt < PRIVY_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await sleep(Math.max(backoffDelayMs(attempt), retryAfterHintMs));
    }

    let response: Response;
    try {
      response = await fetchImpl(request.url, {
        method: request.method,
        headers: request.headers,
        signal: AbortSignal.timeout(PRIVY_REQUEST_TIMEOUT_MS),
      });
    } catch (cause) {
      lastError = new PrivyWalletError(
        PrivyWalletErrorCode.UNAVAILABLE,
        `Privy is unreachable: ${cause instanceof Error ? cause.message : String(cause)}`,
        true,
      );
      continue;
    }

    if (!response.ok) {
      const excerpt = await readBodyExcerpt(response);
      const error = privyErrorForStatus(response.status, excerpt);
      if (!error.retryable) {
        throw error;
      }
      retryAfterHintMs = parseRetryAfterMs(response.headers.get("retry-after")) ?? 0;
      lastError = error;
      continue;
    }

    return selectEmbeddedSolanaWallet(await parsePrivyUserBody(response));
  }

  throw (
    lastError ??
    new PrivyWalletError(
      PrivyWalletErrorCode.UNAVAILABLE,
      "Privy wallet lookup exhausted its retries",
      true,
    )
  );
}

async function parsePrivyUserBody(response: Response): Promise<PrivyUserResponse> {
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (cause) {
    throw new PrivyWalletError(
      PrivyWalletErrorCode.MALFORMED_RESPONSE,
      `Privy returned a non-JSON body: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new PrivyWalletError(
      PrivyWalletErrorCode.MALFORMED_RESPONSE,
      "Privy user response was not an object",
    );
  }
  return parsed as PrivyUserResponse;
}

/**
 * Resolves the caller's embedded Solana wallet.
 *
 * With credentials configured this is a live Privy lookup. Without them it is a
 * hard failure everywhere except an explicitly opted-in non-production runtime,
 * where the fixture wallet is returned.
 */
export async function resolvePrivyEmbeddedWalletSnapshot(
  privyDid: string,
  fetchImpl: PrivyFetch = fetch,
): Promise<PrivyWalletSnapshot> {
  const credentials = readPrivyCredentials();

  if (!credentials) {
    // Named, loud failure — never a silent fixture wallet in a real deployment.
    assertFixturePathAllowed("privy.resolveEmbeddedWallet");
    return {
      privyWalletId: FIXTURE_PRIVY_WALLET_ID,
      solanaAddress: FIXTURE_SOLANA_ADDRESS,
      candidateCount: 1,
    };
  }

  return fetchPrivyEmbeddedWalletSnapshot(privyDid, credentials, fetchImpl);
}

/** Server-side Privy wallet sync (FR-W1, FR-W2). */
export const syncWalletFromPrivy = internalAction({
  args: {
    userId: v.id("users"),
    privyDid: v.string(),
  },
  handler: async (ctx, args): Promise<{ walletId: Id<"wallets">; created: boolean }> => {
    const snapshot = await resolvePrivyEmbeddedWalletSnapshot(args.privyDid);

    if (snapshot.candidateCount > 1) {
      console.warn(
        `privy.syncWalletFromPrivy: ${args.privyDid} has ${snapshot.candidateCount} embedded Solana wallets; ` +
          `deterministically selected ${snapshot.solanaAddress}`,
      );
    }

    return ctx.runMutation(internal.wallets.syncEmbeddedWalletInternal, {
      userId: args.userId,
      privyWalletId: snapshot.privyWalletId,
      solanaAddress: snapshot.solanaAddress,
    });
  },
});

export type SponsorCoSignPhase = "pre_sign" | "pre_broadcast";

/**
 * A co-sign attempt that provably never reached the network.
 *
 * `phase` is the whole point. AD-21 permits `user_signed -> failed` only with
 * "a proven pre-broadcast rejection with no sponsor signature or broadcast
 * possibility", and this error is that proof: it is thrown only from points
 * where nothing has been sent to the cluster. Anything ambiguous returns
 * normally with `broadcast: "ambiguous"` instead of throwing.
 */
export class SponsorCoSignError extends Error {
  constructor(
    public readonly code: string,
    public readonly phase: SponsorCoSignPhase,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "SponsorCoSignError";
  }
}

export type CoSignAndBroadcastInput = {
  intentId: string;
  partialSignedTxBase64: string;
  /** Hash persisted at ready_for_signature. Required on the live path. */
  messageHash?: string;
  /** Exact stored message bytes, base64. Required on the live path. */
  serializedMessageBase64?: string;
  /** Server-owned payer address. Required on the live path. */
  payerAddress?: string;
  /** Sponsor fee-payer address. Required on the live path. */
  sponsorAddress?: string;
  /** Blockhash expiry bound persisted with the quote. Required on the live path. */
  lastValidBlockHeight?: number;
  /**
   * The full AD-10 context. Re-run against the exact bytes about to be
   * broadcast — an earlier pass is never trusted.
   */
  validationContext?: Omit<SettlementIntentValidationContext, "gate">;
  /**
   * Durably records the derived transaction signature BEFORE the broadcast.
   *
   * This is what makes an ambiguous send recoverable: the signature of a fully
   * signed Solana transaction is just its first signature, so it is known
   * before anything is sent. Persisting it first means a crash mid-broadcast
   * leaves a row that reconciliation can look up on chain.
   */
  onSignatureDerived?: (evidence: {
    transactionSignature: string;
    fullySignedTxBase64: string;
  }) => Promise<void>;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  rpcClient?: SolanaRpcClient;
};

export type CoSignAndBroadcastResult = {
  signature: string;
  fullySignedTxBase64: string;
  /**
   * `sent` — the cluster acknowledged the transaction.
   * `ambiguous` — it may or may not have been received. AD-11 maps this to the
   * persisted `unknown` state; it is never a failure.
   */
  broadcast: "sent" | "ambiguous";
  ambiguityDetail?: string;
};

export const SPONSOR_COSIGN_NOT_IMPLEMENTED = "SPONSOR_COSIGN_NOT_IMPLEMENTED";

export const SPONSOR_COSIGN_FAILURE = {
  CONTEXT_INCOMPLETE: "SPONSOR_COSIGN_CONTEXT_INCOMPLETE",
  USER_SIGNATURE_INVALID: "SPONSOR_COSIGN_USER_SIGNATURE_INVALID",
  GATE_REJECTED: "SPONSOR_COSIGN_GATE_REJECTED",
  BLOCKHASH_EXPIRED: "BLOCKHASH_EXPIRED",
  SPONSOR_SIGNATURE_MISSING: "SPONSOR_SIGNATURE_MISSING",
  SPONSOR_SIGNATURE_INVALID: "SPONSOR_SIGNATURE_INVALID",
  MESSAGE_MUTATED_BY_SIGNER: "SPONSOR_MESSAGE_MUTATED_BY_SIGNER",
  USER_SIGNATURE_DROPPED: "SPONSOR_USER_SIGNATURE_DROPPED",
} as const;

const PRIVY_SIGN_TIMEOUT_MS = 20_000;
const PRIVY_SIGN_MAX_ATTEMPTS = 3;

function readSponsorWalletId(): string | null {
  return process.env.PRIVY_SPONSOR_WALLET_ID?.trim() || null;
}

/**
 * Asks Privy's server wallet to add the sponsor fee-payer signature.
 *
 * Retry note. Privy caches a response — 5xx included — against an idempotency
 * key for 24 hours, and tells callers to use a fresh key when retrying after a
 * server error. A fresh key would normally mean "risk a second operation", but
 * not here, for two independent reasons:
 *
 *   1. `signTransaction` does not broadcast. Nothing about calling it twice can
 *      move money.
 *   2. ed25519 (RFC 8032) is deterministic. The same key over the same message
 *      produces byte-identical signatures, so every attempt yields the same
 *      fully signed transaction and therefore the same transaction signature.
 *      There is no "second transaction" that a retry could create.
 *
 * The first attempt still uses the message-bound deterministic key, so an
 * ordinary retry of the whole action replays Privy's cached success instead of
 * re-signing.
 */
export async function requestSponsorSignature(input: {
  credentials: PrivyCredentials;
  walletId: string;
  intentId: string;
  messageHash: string;
  transactionBase64: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = input.fetchImpl ?? fetch;
  let lastError: PrivySignError | null = null;
  let retryAfterHintMs = 0;

  for (let attempt = 0; attempt < PRIVY_SIGN_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await sleep(Math.max(backoffDelayMs(attempt), retryAfterHintMs));
    }

    const request = buildPrivySignTransactionRequest({
      appId: input.credentials.appId,
      appSecret: input.credentials.appSecret,
      walletId: input.walletId,
      transactionBase64: input.transactionBase64,
      idempotencyKey: sponsorIdempotencyKey(input.intentId, input.messageHash, attempt),
      ...(process.env.PRIVY_AUTHORIZATION_SIGNATURE?.trim()
        ? { authorizationSignature: process.env.PRIVY_AUTHORIZATION_SIGNATURE.trim() }
        : {}),
    });

    let response: Response;
    try {
      response = await fetchImpl(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(PRIVY_SIGN_TIMEOUT_MS),
      });
    } catch (cause) {
      lastError = new PrivySignError(
        PRIVY_SIGN_FAILURE.UNAVAILABLE,
        `Privy signing is unreachable: ${cause instanceof Error ? cause.message : String(cause)}`,
        true,
      );
      continue;
    }

    if (!response.ok) {
      const excerpt = await readBodyExcerpt(response);
      const error = privySignErrorForStatus(response.status, excerpt);
      if (!error.retryable) {
        throw error;
      }
      retryAfterHintMs = parseRetryAfterMs(response.headers.get("retry-after")) ?? 0;
      lastError = error;
      continue;
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch (cause) {
      throw new PrivySignError(
        PRIVY_SIGN_FAILURE.MALFORMED_RESPONSE,
        `Privy returned a non-JSON signing body: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
    return readSignedTransaction(parsed);
  }

  throw (
    lastError ??
    new PrivySignError(
      PRIVY_SIGN_FAILURE.UNAVAILABLE,
      "Privy signing exhausted its retries",
      true,
    )
  );
}

/**
 * Verifies what Privy handed back before anything is broadcast.
 *
 * Privy is trusted to hold a key, not to be the last word on what got signed.
 * A server wallet that returned a *different* transaction — a different
 * recipient, a different amount, an extra instruction — would otherwise be
 * broadcast by us, with our fee payer, against a message our gate already
 * approved. So the returned bytes are re-decoded from scratch and compared to
 * the bytes we sent, field by field.
 */
export function verifySponsorCoSignedTransaction(input: {
  partialSignedTxBase64: string;
  fullySignedTxBase64: string;
  payerAddress: string;
  sponsorAddress: string;
}): { ok: true; transactionSignature: string } | { ok: false; failureCode: string; detail?: string } {
  let before: ReturnType<typeof decodeTransactionBase64>;
  let after: ReturnType<typeof decodeTransactionBase64>;
  try {
    before = decodeTransactionBase64(input.partialSignedTxBase64);
    after = decodeTransactionBase64(input.fullySignedTxBase64);
  } catch (error) {
    return {
      ok: false,
      failureCode: SPONSOR_COSIGN_FAILURE.MESSAGE_MUTATED_BY_SIGNER,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  // The message — every account, every instruction, the blockhash — must be
  // byte-identical. Signing changes only the signature array.
  if (!bytesEqual(before.message.serialized, after.message.serialized)) {
    return { ok: false, failureCode: SPONSOR_COSIGN_FAILURE.MESSAGE_MUTATED_BY_SIGNER };
  }

  const keys = after.message.staticAccountKeys;
  const sponsorIndex = keys.indexOf(input.sponsorAddress);
  const payerIndex = keys.indexOf(input.payerAddress);
  if (sponsorIndex !== 0) {
    return {
      ok: false,
      failureCode: SPONSOR_COSIGN_FAILURE.SPONSOR_SIGNATURE_MISSING,
      detail: "sponsor is not the fee payer of the returned transaction",
    };
  }
  if (payerIndex < 0 || payerIndex >= after.message.numRequiredSignatures) {
    return {
      ok: false,
      failureCode: SPONSOR_COSIGN_FAILURE.USER_SIGNATURE_DROPPED,
      detail: "payer is not a required signer of the returned transaction",
    };
  }

  const sponsorSignature = after.signatures[sponsorIndex];
  const payerSignature = after.signatures[payerIndex];
  if (!sponsorSignature || isEmptySignature(sponsorSignature)) {
    return { ok: false, failureCode: SPONSOR_COSIGN_FAILURE.SPONSOR_SIGNATURE_MISSING };
  }
  if (!payerSignature || isEmptySignature(payerSignature)) {
    return { ok: false, failureCode: SPONSOR_COSIGN_FAILURE.USER_SIGNATURE_DROPPED };
  }

  // The user's signature must be the one we already verified — Privy must not
  // have replaced it with a signature from some other key it also holds.
  const beforePayerSignature = before.signatures[payerIndex];
  if (!beforePayerSignature || !bytesEqual(beforePayerSignature, payerSignature)) {
    return { ok: false, failureCode: SPONSOR_COSIGN_FAILURE.USER_SIGNATURE_DROPPED };
  }

  const message = after.message.serialized;
  try {
    if (!ed25519.verify(sponsorSignature, message, base58ToBytes(input.sponsorAddress))) {
      return { ok: false, failureCode: SPONSOR_COSIGN_FAILURE.SPONSOR_SIGNATURE_INVALID };
    }
    if (!ed25519.verify(payerSignature, message, base58ToBytes(input.payerAddress))) {
      return { ok: false, failureCode: SPONSOR_COSIGN_FAILURE.USER_SIGNATURE_DROPPED };
    }
  } catch (error) {
    return {
      ok: false,
      failureCode: SPONSOR_COSIGN_FAILURE.SPONSOR_SIGNATURE_INVALID,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  // A Solana transaction's id IS its first signature. Deriving it here, before
  // the broadcast, is what makes an ambiguous send recoverable.
  return { ok: true, transactionSignature: bytesToBase58(sponsorSignature) };
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i]! ^ right[i]!;
  }
  return diff === 0;
}

/**
 * Sponsor co-sign + Convex broadcast (Story 3.5 AC3-AC4, AD-9, AD-11, AD-21).
 *
 * The live path, in order, with what each step prevents:
 *
 *   1. cluster/RPC agreement       — devnet bytes reaching a mainnet endpoint
 *   2. user signature re-verified  — co-signing something the user never signed
 *   3. blockhash still live        — spending a sponsor fee on a dead quote
 *   4. full AD-10 gate re-run      — trusting an earlier pass over stale bytes
 *   5. Privy adds the fee payer    — (idempotent; see requestSponsorSignature)
 *   6. returned bytes re-verified  — a signer that changed the message
 *   7. gate re-run on final bytes  — the same, from the policy's point of view
 *   8. signature derived + stored  — an ambiguous send with no way back
 *   9. exactly one broadcast       — a second payment
 *
 * Steps 1-8 throw {@link SponsorCoSignError} with `phase: "pre_sign"` or
 * `"pre_broadcast"`; both are proof that nothing was sent, which is what AD-21
 * requires before `user_signed -> failed`. Step 9 never throws: an unobservable
 * send returns `broadcast: "ambiguous"`.
 */
export async function coSignAndBroadcast(
  args: CoSignAndBroadcastInput,
): Promise<CoSignAndBroadcastResult> {
  const credentials = readPrivyCredentials();
  const walletId = readSponsorWalletId();

  if (!credentials || !walletId) {
    // Named, loud failure — never a fabricated signature on a real deployment.
    assertFixturePathAllowed("privy.coSignAndBroadcast");
    void args.intentId;
    return {
      signature: FIXTURE_TX_SIGNATURE,
      fullySignedTxBase64: `${args.partialSignedTxBase64}::sponsorSig=${FIXTURE_SPONSOR_SIGNATURE}`,
      broadcast: "sent",
    };
  }

  const { messageHash, payerAddress, sponsorAddress, validationContext } = args;
  if (!messageHash || !payerAddress || !sponsorAddress || !validationContext) {
    throw new SponsorCoSignError(
      SPONSOR_COSIGN_FAILURE.CONTEXT_INCOMPLETE,
      "pre_sign",
      "the live co-sign path requires messageHash, payerAddress, sponsorAddress and the validation context",
    );
  }

  // 1 — the RPC endpoint must demonstrably serve the configured cluster.
  const rpc = args.rpcClient ?? createSolanaRpcClient({ fetchImpl: args.fetchImpl });

  // 2 — the user's signature, over the exact stored message, under the
  //     server-held payer key. Also proves the sponsor slot is still empty.
  const userVerification = verifyPartialSignedTransaction({
    partialSignedTxBase64: args.partialSignedTxBase64,
    expectedMessageHash: messageHash,
    payerAddress,
    sponsorAddress,
    ...(args.serializedMessageBase64
      ? { expectedSerializedMessageBase64: args.serializedMessageBase64 }
      : {}),
  });
  if (!userVerification.ok) {
    throw new SponsorCoSignError(userVerification.failureCode, "pre_sign", userVerification.detail);
  }

  // 3 — the blockhash must still be able to land. An expired quote here has
  //     cost nothing: no sponsor signature exists and nothing was broadcast, so
  //     `user_signed -> failed` is safe. The observed height is then handed to
  //     the gate so it enforces the same bound rather than taking our word.
  let currentBlockHeight: number | undefined;
  if (args.lastValidBlockHeight !== undefined) {
    currentBlockHeight = await rpc.getBlockHeight("finalized");
    if (currentBlockHeight > args.lastValidBlockHeight) {
      throw new SponsorCoSignError(
        SPONSOR_COSIGN_FAILURE.BLOCKHASH_EXPIRED,
        "pre_sign",
        `finalized block height ${currentBlockHeight} > lastValidBlockHeight ${args.lastValidBlockHeight}`,
      );
    }
  }

  const gateContext =
    currentBlockHeight === undefined
      ? validationContext
      : { ...validationContext, currentBlockHeight };

  // 4 — the full manifest gate, over the exact bytes we are about to sign.
  const preGate = validateBeforeSponsorCoSign(args.partialSignedTxBase64, gateContext);
  if (!preGate.ok) {
    throw new SponsorCoSignError(preGate.code, "pre_sign", preGate.detail);
  }

  // 5 — the sponsor fee-payer signature.
  const fullySignedTxBase64 = await requestSponsorSignature({
    credentials,
    walletId,
    intentId: args.intentId,
    messageHash,
    transactionBase64: args.partialSignedTxBase64,
    ...(args.fetchImpl ? { fetchImpl: args.fetchImpl } : {}),
  });

  // 6 — what came back must be our message, with both signatures valid.
  const coSigned = verifySponsorCoSignedTransaction({
    partialSignedTxBase64: args.partialSignedTxBase64,
    fullySignedTxBase64,
    payerAddress,
    sponsorAddress,
  });
  if (!coSigned.ok) {
    throw new SponsorCoSignError(coSigned.failureCode, "pre_broadcast", coSigned.detail);
  }

  // 7 — the gate again, on the final bytes. Belt and braces: step 6 already
  //     proved the message is unchanged, but the gate is the thing that is
  //     allowed to say "these bytes may be sponsored", so it gets the last word
  //     on the artefact that actually goes to the cluster.
  const postGate = validateBeforeSponsorCoSign(fullySignedTxBase64, gateContext);
  if (!postGate.ok) {
    throw new SponsorCoSignError(postGate.code, "pre_broadcast", postGate.detail);
  }

  // 8 — durably record the signature BEFORE it can exist on chain.
  const transactionSignature = coSigned.transactionSignature;
  if (args.onSignatureDerived) {
    await args.onSignatureDerived({ transactionSignature, fullySignedTxBase64 });
  }

  // 9 — exactly one broadcast attempt, ever.
  try {
    const returned = await rpc.sendTransactionOnce(fullySignedTxBase64);
    if (returned !== transactionSignature) {
      // The cluster believes it sent something with a different id than the one
      // we derived. That should be impossible; treat it as unresolved rather
      // than claim either signature settled anything.
      return {
        signature: transactionSignature,
        fullySignedTxBase64,
        broadcast: "ambiguous",
        ambiguityDetail: `cluster returned signature ${returned}`,
      };
    }
    return { signature: transactionSignature, fullySignedTxBase64, broadcast: "sent" };
  } catch (error) {
    const rpcError = error instanceof SolanaRpcError ? error : classifySendFailure(error);
    if (rpcError.code === RPC_FAILURE.BROADCAST_REJECTED) {
      // The node refused it at preflight, so it never entered the network.
      // Proven pre-broadcast rejection — the one thing AD-21 lets us fail on.
      throw new SponsorCoSignError(rpcError.code, "pre_broadcast", rpcError.message);
    }
    return {
      signature: transactionSignature,
      fullySignedTxBase64,
      broadcast: "ambiguous",
      ambiguityDetail: `${rpcError.code}: ${rpcError.message}`,
    };
  }
}

/** True when this runtime would serve Privy fixture data (dev/test only). */
export function isPrivyFixtureActive(): boolean {
  return isPrivyServerFixtureMode() && fixturePathAllowed();
}
