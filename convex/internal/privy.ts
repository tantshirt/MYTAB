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

export {
  PrivyWalletError,
  PrivyWalletErrorCode,
} from "../../lib/privy/serverWallets";

/**
 * Fixture wallet for local dev and tests only.
 *
 * Returning this from a real deployment would mean settling to an address
 * nobody controls, so every path that could produce it now runs through
 * {@link assertFixturePathAllowed} first.
 */
export const FIXTURE_PRIVY_WALLET_ID = "privy-fixture-wallet-id";
export const FIXTURE_SOLANA_ADDRESS = "FixTure111111111111111111111111111111111";
export const FIXTURE_SPONSOR_SIGNATURE = "fixture-sponsor-signature-v1";
export const FIXTURE_TX_SIGNATURE =
  "FixTureSig1111111111111111111111111111111111111111";

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

export type CoSignAndBroadcastInput = {
  intentId: string;
  partialSignedTxBase64: string;
};

export type CoSignAndBroadcastResult = {
  signature: string;
  fullySignedTxBase64: string;
};

export const SPONSOR_COSIGN_NOT_IMPLEMENTED = "SPONSOR_COSIGN_NOT_IMPLEMENTED";

/**
 * Sponsor co-sign + Convex broadcast (Story 3.5 AC3–AC4).
 *
 * The live path is still unimplemented. It now *fails closed*: outside an
 * explicitly opted-in non-production runtime this throws instead of returning a
 * fabricated signature that would report a settlement as sent when nothing was
 * broadcast.
 */
export async function coSignAndBroadcast(
  args: CoSignAndBroadcastInput,
): Promise<CoSignAndBroadcastResult> {
  assertFixturePathAllowed("privy.coSignAndBroadcast");
  void args.intentId;
  return {
    signature: FIXTURE_TX_SIGNATURE,
    fullySignedTxBase64: `${args.partialSignedTxBase64}::sponsorSig=${FIXTURE_SPONSOR_SIGNATURE}`,
  };
}

/** True when this runtime would serve Privy fixture data (dev/test only). */
export function isPrivyFixtureActive(): boolean {
  return isPrivyServerFixtureMode() && fixturePathAllowed();
}
