import { describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/dflow-order-mainnet.json";
import {
  buildDflowOrderRequestParams,
  toOrderQueryString,
} from "../../lib/dflow/orderRequest";
import { parseDflowOrderResponse, guaranteedOutputAtomic } from "../../lib/dflow/schema";
import {
  DFLOW_DEV_HOST,
  DFLOW_PROD_HOST,
  DFLOW_SUPPORTED_CLUSTER,
  assertDflowRoutingAvailable,
  buildDflowRequestHeaders,
  isDflowRoutingAvailable,
  resolveDflowEndpoint,
} from "../../lib/dflow/config";
import { fetchDflowOrder } from "../../lib/dflow/client";
import {
  DFLOW_ORDER_PARAMS,
  DFLOW_ROUTING_BOUNDS,
  WRAPPED_SOL_MINT,
} from "../../lib/dflow/constants";
import { getClusterConfig } from "../../lib/solana/cluster";
import { loadLookupTablesForTransaction } from "../../convex/internal/dflow";

const MAINNET = getClusterConfig("mainnet-beta");
const KEYS = fixture.keys;
const BODY = Buffer.from(fixture.response.bodyBase64, "base64");
const ORDER_JSON = JSON.parse(BODY.toString("utf8"));

function params(overrides: Partial<Parameters<typeof buildDflowOrderRequestParams>[0]> = {}) {
  return buildDflowOrderRequestParams({
    inputMint: WRAPPED_SOL_MINT,
    outputMint: MAINNET.usdcMint,
    inputAmountAtomic: 100_000_000n,
    payerAddress: KEYS.user,
    recipientAddress: KEYS.recipient,
    sponsorAddress: KEYS.sponsor,
    ...overrides,
  });
}

describe("DFlow /order request — every parameter is deliberate", () => {
  it("sends the sponsor as fee payer and routes output straight to the recipient", () => {
    const request = params();
    expect(request.sponsor).toBe(KEYS.sponsor);
    // One transaction, not swap-then-transfer.
    expect(request.destinationWallet).toBe(KEYS.recipient);
    expect(request).not.toHaveProperty("destinationTokenAccount");
  });

  it("pins sponsorExec=false so the sponsor never custodies funds mid-swap", () => {
    expect(params().sponsorExec).toBe(false);
    expect(DFLOW_ORDER_PARAMS.sponsorExec).toBe(false);
  });

  it("states allowAsyncExec=false EXPLICITLY, because the API default is true", () => {
    const request = params();
    expect(request.allowSyncExec).toBe(true);
    expect(request.allowAsyncExec).toBe(false);
    // The serialised query must carry it: omitting it inherits `true`.
    expect(toOrderQueryString(request)).toContain("allowAsyncExec=false");
    expect(toOrderQueryString(request)).toContain("allowSyncExec=true");
  });

  it("declares no platform fee, because there is no funded fee account", () => {
    const request = params();
    expect(request).not.toHaveProperty("platformFeeBps");
    expect(request).not.toHaveProperty("platformFeeMode");
    expect(request).not.toHaveProperty("feeAccount");
    // A declared fee is charged against the slippage budget, so declaring one
    // with nothing behind it spends the payer's price protection on nothing.
    expect(toOrderQueryString(request)).not.toContain("platformFee");
    expect(toOrderQueryString(request)).not.toContain("feeAccount");
  });

  it("claims no positive slippage — the upside is the payer's money", () => {
    const request = params();
    expect(request).not.toHaveProperty("positiveSlippageFeeAccount");
    expect(request).not.toHaveProperty("positiveSlippageLimitPct");
    expect(toOrderQueryString(request)).not.toContain("positiveSlippage");
  });

  it("bounds the account set so the resolved route stays validatable", () => {
    const request = params();
    expect(request.maxAccounts).toBe(DFLOW_ROUTING_BOUNDS.maxAccounts);
    expect(request.maxRouteLength).toBe(DFLOW_ROUTING_BOUNDS.maxRouteLength);
    expect(request.includeAddressLookupTables).toBe(true);
  });

  it("serialises booleans as true/false, which is what the API accepts", () => {
    const query = toOrderQueryString(params());
    for (const flag of [
      "allowSyncExec",
      "allowAsyncExec",
      "sponsorExec",
      "includeAddressLookupTables",
    ]) {
      expect(query).toMatch(new RegExp(`${flag}=(true|false)(&|$)`));
    }
  });
});

describe("DFlow /order response — boundary validation", () => {
  it("accepts the real captured response and reads the ENFORCED threshold", () => {
    const parsed = parseDflowOrderResponse(ORDER_JSON);
    expect(parsed.executionMode).toBe("sync");
    // `otherAmountThreshold` is the only figure the chain enforces; `outAmount`
    // is documented as an estimate and must never be the promised number.
    expect(guaranteedOutputAtomic(parsed).toString()).toBe(parsed.otherAmountThreshold);
    expect(BigInt(parsed.outAmount)).toBeGreaterThanOrEqual(guaranteedOutputAtomic(parsed));
  });

  it("treats minOutAmount and otherAmountThreshold as one number, or rejects", () => {
    expect(() =>
      parseDflowOrderResponse({ ...ORDER_JSON, minOutAmount: "1" }),
    ).toThrow();
  });

  it("rejects an async order at the boundary", () => {
    expect(() =>
      parseDflowOrderResponse({ ...ORDER_JSON, executionMode: "async" }),
    ).toThrow();
  });

  it("rejects an order that requires the recipient to sign", () => {
    expect(() =>
      parseDflowOrderResponse({ ...ORDER_JSON, destinationWalletMustSign: true }),
    ).toThrow();
  });

  it("tolerates destinationWalletMustSign being absent, as real orders are", () => {
    expect(ORDER_JSON.destinationWalletMustSign).toBeUndefined();
    expect(parseDflowOrderResponse(ORDER_JSON).destinationWalletMustSign).toBeUndefined();
  });

  it("rejects a platform fee appearing on a zero-fee order", () => {
    expect(() =>
      parseDflowOrderResponse({
        ...ORDER_JSON,
        platformFee: { amount: "1", feeBps: 1, mode: "outputMint" },
      }),
    ).toThrow();
  });
});

describe("DFlow endpoint configuration", () => {
  it("uses the keyless developer host when no API key is configured", () => {
    const config = resolveDflowEndpoint({});
    expect(config.baseUrl).toBe(DFLOW_DEV_HOST);
    expect(config.tier).toBe("developer");
    expect(config.apiKey).toBeUndefined();
  });

  it("switches to the production host and sends x-api-key on an env change alone", () => {
    const config = resolveDflowEndpoint({ DFLOW_API_KEY: "live-key" });
    expect(config.baseUrl).toBe(DFLOW_PROD_HOST);
    expect(config.tier).toBe("production");
    const headers = buildDflowRequestHeaders({ config, requestId: "req-1" });
    expect(headers["x-api-key"]).toBe("live-key");
  });

  it("always asks DFlow to sign the response and always sends our own id", () => {
    const headers = buildDflowRequestHeaders({
      config: resolveDflowEndpoint({}),
      requestId: "req-abc",
    });
    expect(headers["x-sign-request"]).toBe("true");
    expect(headers["x-request-id"]).toBe("req-abc");
  });

  it("refuses a non-https or path-bearing base URL override", () => {
    expect(() => resolveDflowEndpoint({ DFLOW_API_BASE_URL: "http://x.dflow.net" })).toThrow();
    expect(() =>
      resolveDflowEndpoint({ DFLOW_API_BASE_URL: "https://x.dflow.net/v2" }),
    ).toThrow();
  });
});

describe("DFlow cluster gate — the Trading API is mainnet-only", () => {
  it("names mainnet-beta as the only supported cluster", () => {
    expect(DFLOW_SUPPORTED_CLUSTER).toBe("mainnet-beta");
  });

  it("fails closed on devnet instead of routing nowhere", () => {
    expect(isDflowRoutingAvailable({ SOLANA_CLUSTER: "devnet" })).toBe(false);
    expect(() => assertDflowRoutingAvailable({ SOLANA_CLUSTER: "devnet" })).toThrow(
      /DFLOW_UNAVAILABLE_ON_CLUSTER/,
    );
  });

  it("enables routing on a cluster flip with no code change", () => {
    expect(isDflowRoutingAvailable({ SOLANA_CLUSTER: "mainnet-beta" })).toBe(true);
    expect(assertDflowRoutingAvailable({ SOLANA_CLUSTER: "mainnet-beta" })).toBe(
      "mainnet-beta",
    );
  });

  it("never sends an order from a cluster DFlow cannot route", async () => {
    const fetchImpl = vi.fn();
    const outcome = await fetchDflowOrder(params(), {
      env: { SOLANA_CLUSTER: "devnet" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(outcome).toMatchObject({ ok: false, failureCode: "DFLOW_UNAVAILABLE_ON_CLUSTER" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("DFlow client — signature verification gates the payload", () => {
  const env = { SOLANA_CLUSTER: "mainnet-beta" };

  function replayResponse(overrides: { body?: Buffer; status?: number } = {}) {
    return new Response(overrides.body ?? BODY, {
      status: overrides.status ?? fixture.response.status,
      headers: fixture.response.headers as Record<string, string>,
    });
  }

  it("accepts a genuine signed response and returns the parsed order", async () => {
    const outcome = await fetchDflowOrder(params(), {
      env,
      newRequestId: () => fixture.request.requestId,
      fetchImpl: (async () => replayResponse()) as unknown as typeof fetch,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.order.otherAmountThreshold).toBe(fixture.order.otherAmountThreshold);
      expect(outcome.rawBodyLength).toBe(BODY.length);
    }
  });

  it("rejects a body tampered with in transit, before parsing it", async () => {
    const tampered = Buffer.from(BODY);
    tampered[tampered.length - 3] ^= 0x02;
    const outcome = await fetchDflowOrder(params(), {
      env,
      newRequestId: () => fixture.request.requestId,
      fetchImpl: (async () =>
        replayResponse({ body: tampered })) as unknown as typeof fetch,
    });
    expect(outcome).toMatchObject({
      ok: false,
      failureCode: "DFLOW_CONTENT_DIGEST_MISMATCH",
    });
  });

  it("rejects a captured response replayed under a fresh request id", async () => {
    const outcome = await fetchDflowOrder(params(), {
      env,
      newRequestId: () => "a-different-request-id",
      fetchImpl: (async () => replayResponse()) as unknown as typeof fetch,
    });
    expect(outcome).toMatchObject({ ok: false, failureCode: "DFLOW_REQUEST_ID_MISMATCH" });
  });

  it("rejects an unsigned response rather than trusting it", async () => {
    const { signature: _s, "signature-input": _si, ...unsigned } =
      fixture.response.headers as Record<string, string>;
    const outcome = await fetchDflowOrder(params(), {
      env,
      newRequestId: () => fixture.request.requestId,
      fetchImpl: (async () =>
        new Response(BODY, { status: 200, headers: unsigned })) as unknown as typeof fetch,
    });
    expect(outcome).toMatchObject({
      ok: false,
      failureCode: "DFLOW_SIGNATURE_HEADER_MISSING",
    });
  });

  it("surfaces a router rejection by its DFlow error code", async () => {
    // The error body is signed too, so an injected `route_not_found` cannot be
    // used to steer the solver; here the signature is simply absent and the
    // request is refused before the code is ever read.
    const outcome = await fetchDflowOrder(params(), {
      env,
      newRequestId: () => "req-x",
      fetchImpl: (async () =>
        new Response(JSON.stringify({ code: "route_not_found", msg: "Route not found" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failureCode).toBe("DFLOW_SIGNATURE_HEADER_MISSING");
    }
  });
});

describe("lookup table loading — the bridge between the RPC and the gate", () => {
  const ADDRESSES = Object.keys(fixture.lookupTableAccounts);
  const DATA = fixture.lookupTableAccounts as Record<
    string,
    { owner: string; dataBase64: string }
  >;

  function rpc(options: {
    slot?: number;
    missing?: string;
    owner?: string;
    throwOn?: "slot" | "account";
  } = {}) {
    return {
      getSlot: async () => {
        if (options.throwOn === "slot") throw new Error("rpc down");
        return options.slot ?? fixture.order.contextSlot;
      },
      getAccountInfo: async (address: string) => {
        if (options.throwOn === "account") throw new Error("rpc down");
        if (address === options.missing) return null;
        return {
          dataBase64: DATA[address]!.dataBase64,
          owner: options.owner ?? DATA[address]!.owner,
          lamports: 0n,
          executable: false,
        };
      },
    };
  }

  it("reads every referenced table and stamps the slot it observed", async () => {
    const result = await loadLookupTablesForTransaction({
      rpc: rpc() as never,
      tableAddresses: ADDRESSES,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tables).toHaveLength(ADDRESSES.length);
      expect(result.tables[0]!.observedSlot).toBe(fixture.order.contextSlot);
      expect(result.tables[0]!.addresses.length).toBeGreaterThan(0);
    }
  });

  it("fails closed when a table cannot be found on chain", async () => {
    const result = await loadLookupTablesForTransaction({
      rpc: rpc({ missing: ADDRESSES[0] }) as never,
      tableAddresses: ADDRESSES,
    });
    expect(result).toMatchObject({ ok: false, failureCode: "DFLOW_LOOKUP_TABLE_FETCH_FAILED" });
  });

  it("fails closed when the RPC is unavailable rather than proceeding blind", async () => {
    for (const throwOn of ["slot", "account"] as const) {
      const result = await loadLookupTablesForTransaction({
        rpc: rpc({ throwOn }) as never,
        tableAddresses: ADDRESSES,
      });
      expect(result).toMatchObject({
        ok: false,
        failureCode: "DFLOW_LOOKUP_TABLE_FETCH_FAILED",
      });
    }
  });

  it("refuses an account that is not owned by the lookup-table program", async () => {
    const result = await loadLookupTablesForTransaction({
      rpc: rpc({ owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }) as never,
      tableAddresses: ADDRESSES,
    });
    expect(result).toMatchObject({ ok: false, failureCode: "ADDRESS_TABLE_OWNER_INVALID" });
  });

  it("does no RPC work when the transaction references no tables", async () => {
    const result = await loadLookupTablesForTransaction({
      rpc: rpc({ throwOn: "slot" }) as never,
      tableAddresses: [],
    });
    expect(result).toMatchObject({ ok: true, tables: [] });
  });
});
