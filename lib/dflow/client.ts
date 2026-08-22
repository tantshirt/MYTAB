/**
 * The DFlow Trading API client. Convex-only: the Trading API serves no CORS, so
 * every call originates server-side and never from the browser.
 *
 * Order of operations is deliberate and non-negotiable:
 *
 *   1. cluster gate      — DFlow serves mainnet-beta only (see config.ts).
 *   2. fresh request id  — one per call, never reused.
 *   3. fetch             — with `x-sign-request: true`.
 *   4. VERIFY SIGNATURE  — over the raw bytes, before they are parsed.
 *   5. parse + validate  — sync-only, no platform fee, thresholds present.
 *
 * Step 4 happens before step 5 on purpose: parsing an unverified body and then
 * checking the signature means the parser has already run on attacker input.
 */

import {
  assertDflowRoutingAvailable,
  buildDflowRequestHeaders,
  resolveDflowEndpoint,
  type DflowEndpointConfig,
  type DflowEnv,
} from "./config";
import { buildOrderUrl, type DflowOrderRequestParams } from "./orderRequest";
import {
  dflowOrderErrorSchema,
  dflowOrderResponseSchema,
  type DflowOrderResponse,
} from "./schema";
import {
  verifyDflowResponseSignature,
  type ResponseSignatureFailureCode,
} from "./responseSignature";

export const DFLOW_CLIENT_FAILURE = {
  UNAVAILABLE_ON_CLUSTER: "DFLOW_UNAVAILABLE_ON_CLUSTER",
  TRANSPORT: "DFLOW_TRANSPORT_FAILED",
  TIMEOUT: "DFLOW_REQUEST_TIMEOUT",
  RATE_LIMITED: "DFLOW_RATE_LIMITED",
  ORDER_REJECTED: "DFLOW_ORDER_REJECTED",
  MALFORMED: "DFLOW_RESPONSE_MALFORMED",
  ASYNC_REJECTED: "DFLOW_ASYNC_EXECUTION_REJECTED",
} as const;

export type DflowClientFailureCode =
  | (typeof DFLOW_CLIENT_FAILURE)[keyof typeof DFLOW_CLIENT_FAILURE]
  | ResponseSignatureFailureCode;

export type DflowOrderOutcome =
  | {
      ok: true;
      order: DflowOrderResponse;
      requestId: string;
      /** Raw bytes the signature was verified over, for audit logging. */
      rawBodyLength: number;
    }
  | { ok: false; failureCode: DflowClientFailureCode; detail?: string };

export const DFLOW_REQUEST_TIMEOUT_MS = 4_000;

export type DflowClientOptions = {
  env?: DflowEnv;
  fetchImpl?: typeof fetch;
  /** Injectable so tests are deterministic; production uses crypto.randomUUID. */
  newRequestId?: () => string;
  timeoutMs?: number;
  nowSeconds?: () => number;
  config?: DflowEndpointConfig;
};

function defaultRequestId(): string {
  return `mytab-${crypto.randomUUID()}`;
}

/**
 * Fetches one order. Returns a failure code rather than throwing, because every
 * caller has to make a settlement-state decision from it.
 */
export async function fetchDflowOrder(
  params: DflowOrderRequestParams,
  options: DflowClientOptions = {},
): Promise<DflowOrderOutcome> {
  try {
    assertDflowRoutingAvailable(options.env);
  } catch (error) {
    return {
      ok: false,
      failureCode: DFLOW_CLIENT_FAILURE.UNAVAILABLE_ON_CLUSTER,
      detail: error instanceof Error ? error.message : undefined,
    };
  }

  const config = options.config ?? resolveDflowEndpoint(options.env);
  const requestId = (options.newRequestId ?? defaultRequestId)();
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(buildOrderUrl(config.baseUrl, params), {
      method: "GET",
      headers: buildDflowRequestHeaders({ config, requestId }),
      signal: AbortSignal.timeout(options.timeoutMs ?? DFLOW_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return {
      ok: false,
      failureCode:
        name === "TimeoutError" || name === "AbortError"
          ? DFLOW_CLIENT_FAILURE.TIMEOUT
          : DFLOW_CLIENT_FAILURE.TRANSPORT,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const body = new Uint8Array(await response.arrayBuffer());

  // Verified BEFORE parsing, and verified on error responses too: an injected
  // `route_not_found` is a cheap way to steer a solver, so the error path gets
  // the same authenticity guarantee as the success path.
  const verification = verifyDflowResponseSignature({
    status: response.status,
    headers: response.headers,
    body,
    expectedRequestId: requestId,
    nowSeconds: options.nowSeconds?.(),
  });
  if (!verification.ok) {
    return {
      ok: false,
      failureCode: verification.failureCode,
      detail: verification.detail,
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return { ok: false, failureCode: DFLOW_CLIENT_FAILURE.MALFORMED, detail: "json" };
  }

  if (response.status === 429) {
    return { ok: false, failureCode: DFLOW_CLIENT_FAILURE.RATE_LIMITED };
  }

  if (!response.ok) {
    const error = dflowOrderErrorSchema.safeParse(parsedJson);
    return {
      ok: false,
      failureCode: DFLOW_CLIENT_FAILURE.ORDER_REJECTED,
      detail: error.success ? error.data.code : `HTTP ${response.status}`,
    };
  }

  // An async response is rejected loudly rather than falling through the schema
  // as a shape mismatch, because `allowAsyncExec=false` was sent explicitly and
  // an async order coming back anyway means our request was not honoured.
  const mode = (parsedJson as { executionMode?: unknown } | null)?.executionMode;
  if (mode !== undefined && mode !== "sync") {
    return {
      ok: false,
      failureCode: DFLOW_CLIENT_FAILURE.ASYNC_REJECTED,
      detail: String(mode),
    };
  }

  const order = dflowOrderResponseSchema.safeParse(parsedJson);
  if (!order.success) {
    return {
      ok: false,
      failureCode: DFLOW_CLIENT_FAILURE.MALFORMED,
      detail: order.error.issues[0]?.path.join(".") ?? "shape",
    };
  }

  return {
    ok: true,
    order: order.data,
    requestId,
    rawBodyLength: body.length,
  };
}
