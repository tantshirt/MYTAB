import { describe, expect, it, vi } from "vitest";
import bs58 from "bs58";
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
import {
  buildDflowSettlementHandler,
  loadLookupTablesForTransaction,
  readProvenPayerInputBalance,
  retryDflowBudgetSettlement,
} from "../../convex/internal/dflow";
import { TOKEN_PROGRAM_ID } from "../../lib/solana/constants";

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

describe("DFlow durable accounting recovery", () => {
  it("continues scheduling after the sixth transient settlement failure", async () => {
    const scheduled: Array<Record<string, unknown>> = [];
    const ctx = {
      runMutation: async () => { throw new Error("transient"); },
      scheduler: { runAfter: async (_delay: number, _ref: unknown, args: Record<string, unknown>) => {
        scheduled.push(args);
      } },
    };
    const handler = (retryDflowBudgetSettlement as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>;
    })._handler;
    await expect(handler(ctx, {
      intentId: "settlementIntents:i1",
      userId: "users:u1",
      groupId: "groups:g1",
      windowKey: "2026-08-24T19",
      reservedAttempts: 4,
      usedAttempts: 2,
      attempt: 6,
    })).resolves.toEqual({ ok: false, retrying: true });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({ attempt: 7, intentId: "settlementIntents:i1" });
  });
});

describe("DFlow payer cap — independently proven chain balance", () => {
  function tokenAccountData(input: {
    mint: string;
    owner: string;
    amount: bigint;
    state?: number;
  }): string {
    const bytes = new Uint8Array(165);
    bytes.set(bs58.decode(input.mint), 0);
    bytes.set(bs58.decode(input.owner), 32);
    new DataView(bytes.buffer).setBigUint64(64, input.amount, true);
    bytes[108] = input.state ?? 1;
    return Buffer.from(bytes).toString("base64");
  }

  it("uses confirmed native lamports for the wrapped-SOL router input", async () => {
    const balance = await readProvenPayerInputBalance({
      rpc: {
        getAccountInfo: async () => ({
          dataBase64: "",
          owner: "11111111111111111111111111111111",
          lamports: 987_654_321n,
          executable: false,
        }),
        getTokenAccountsByOwner: async () => {
          throw new Error("native proof must not read token accounts");
        },
      },
      payerAddress: KEYS.user,
      inputMint: WRAPPED_SOL_MINT,
    });
    expect(balance).toBe(987_654_321n);
  });

  it("sums only initialized payer-owned v1 SPL accounts for the input mint", async () => {
    const otherMint = MAINNET.usdcMint === WRAPPED_SOL_MINT
      ? KEYS.recipient
      : WRAPPED_SOL_MINT;
    const rows = [
      { mint: MAINNET.usdcMint, owner: KEYS.user, amount: 4n },
      { mint: MAINNET.usdcMint, owner: KEYS.user, amount: 6n },
      { mint: MAINNET.usdcMint, owner: KEYS.user, amount: 100n, state: 0 },
      { mint: MAINNET.usdcMint, owner: KEYS.recipient, amount: 100n },
      { mint: otherMint, owner: KEYS.user, amount: 100n },
    ];
    const balance = await readProvenPayerInputBalance({
      rpc: {
        getAccountInfo: async () => null,
        getTokenAccountsByOwner: async (_owner, programId) => {
          expect(programId).toBe(TOKEN_PROGRAM_ID);
          return rows.map((row, index) => ({
            address: `account-${index}`,
            dataBase64: tokenAccountData(row),
            owner: TOKEN_PROGRAM_ID,
            lamports: 0n,
            executable: false,
          }));
        },
      },
      payerAddress: KEYS.user,
      inputMint: MAINNET.usdcMint,
    });
    expect(balance).toBe(10n);
  });
});

describe("DFlow action orchestration — receive-asset pricing through persistence", () => {
  it("uses the stable-reference guarantee as the solver target and settles all provider usage", async () => {
    vi.stubEnv("SOLANA_CLUSTER", "mainnet-beta");
    const order = parseDflowOrderResponse(ORDER_JSON);
    const pricingReferenceMint = KEYS.recipient;
    const pricingReferenceAtomic = 9_500_000n;
    const provenInputBalance = 100_000_000n;
    const orderRequests: Array<Record<string, unknown>> = [];
    const mutations: Array<Record<string, unknown>> = [];
    const tableData = fixture.lookupTableAccounts as Record<
      string,
      { owner: string; dataBase64: string }
    >;

    const intent = {
      _id: "settlementIntents:orchestration",
      userId: "users:payer",
      walletId: "wallets:payer",
      groupId: "groups:dinner",
      tabId: "tabs:dinner",
      tabRevision: 4,
      status: "created",
      routingKind: "dflow_sync",
      inputMint: WRAPPED_SOL_MINT,
      outputMint: MAINNET.usdcMint,
      recipientAddress: KEYS.recipient,
      minimumOutputAtomic: 1n,
      maximumInputAtomic: 0n,
      pricingReferenceMint,
      pricingReferenceAtomic,
      expiresAt: Date.now() + 60_000,
    };
    const actionCtx = {
      runQuery: vi.fn(async (_reference: unknown, args: Record<string, unknown>) => {
        if ("walletId" in args) {
          return { _id: "wallets:payer", solanaAddress: KEYS.user };
        }
        if ("tabId" in args) {
          return { _id: "tabs:dinner", revision: 4, lockedRevision: 4 };
        }
        return intent;
      }),
      runMutation: vi.fn(async (_reference: unknown, args: Record<string, unknown>) => {
        mutations.push(args);
        if ("reservedAttempts" in args && "windowKey" in args) {
          return { ok: true };
        }
        if ("serializedMessage" in args) {
          return { ok: true, status: "ready_for_signature" };
        }
        if ("userId" in args && "groupId" in args && !("windowKey" in args)) {
          return { ok: true, windowKey: "hour:1", reservedAttempts: 5 };
        }
        return { ok: true };
      }),
    };

    const result = await buildDflowSettlementHandler(
      actionCtx as never,
      { intentId: intent._id as never },
      {
        isRoutingAvailable: () => true,
        resolveSponsorAddress: () => KEYS.sponsor,
        createRpc: () => ({
          getAccountInfo: async (address: string) => {
            if (address === KEYS.user) {
              return {
                dataBase64: "",
                owner: "11111111111111111111111111111111",
                lamports: provenInputBalance,
                executable: false,
              };
            }
            const table = tableData[address];
            return table
              ? { ...table, lamports: 0n, executable: false }
              : null;
          },
          getSlot: async () => fixture.order.contextSlot,
          getTokenAccountsByOwner: async () => [],
        }) as never,
        fetchOrder: async (params) => {
          orderRequests.push(params as unknown as Record<string, unknown>);
          return { ok: true, order, requestId: `request-${orderRequests.length}`, rawBodyLength: 1 };
        },
      },
    );

    expect(result).toMatchObject({
      ok: true,
      requestCount: 2,
      reservedAttempts: 5,
      guaranteedOutputAtomic: fixture.order.otherAmountThreshold,
    });
    expect(orderRequests).toHaveLength(2);
    expect(orderRequests[0]).toMatchObject({
      inputMint: pricingReferenceMint,
      outputMint: MAINNET.usdcMint,
      amount: pricingReferenceAtomic.toString(),
    });
    expect(orderRequests[1]).toMatchObject({
      inputMint: WRAPPED_SOL_MINT,
      outputMint: MAINNET.usdcMint,
      amount: provenInputBalance.toString(),
    });

    const applied = mutations.find((args) => "serializedMessage" in args);
    expect(applied).toMatchObject({
      minimumOutputAtomic: BigInt(fixture.order.otherAmountThreshold),
      pricingGuaranteedOutputAtomic: BigInt(fixture.order.otherAmountThreshold),
      pricingProvider: "dflow:stable-reference",
      maximumInputAtomic: provenInputBalance,
    });
    expect(applied?.pricingEvidenceHash).toMatch(/^[a-f0-9]{64}$/);

    const settled = mutations.find((args) => "windowKey" in args && "usedAttempts" in args);
    expect(settled).toMatchObject({
      reservedAttempts: 5,
      usedAttempts: 2,
    });
    vi.unstubAllEnvs();
  });

  it("refuses DFlow orders that omit a positive lastValidBlockHeight", async () => {
    vi.stubEnv("SOLANA_CLUSTER", "mainnet-beta");
    const order = parseDflowOrderResponse(ORDER_JSON);
    const invalidOrder = { ...order, lastValidBlockHeight: undefined };
    const mutations: Array<Record<string, unknown>> = [];
    const intent = {
      _id: "settlementIntents:missing-height",
      userId: "users:payer",
      walletId: "wallets:payer",
      groupId: "groups:dinner",
      tabId: "tabs:dinner",
      tabRevision: 4,
      status: "created",
      routingKind: "dflow_sync",
      inputMint: WRAPPED_SOL_MINT,
      outputMint: MAINNET.usdcMint,
      recipientAddress: KEYS.recipient,
      minimumOutputAtomic: 1n,
      maximumInputAtomic: 0n,
      expiresAt: Date.now() + 60_000,
    };
    const actionCtx = {
      runQuery: vi.fn(async (_reference: unknown, args: Record<string, unknown>) => {
        if ("walletId" in args) {
          return { _id: "wallets:payer", solanaAddress: KEYS.user };
        }
        if ("tabId" in args) {
          return { _id: "tabs:dinner", revision: 4, lockedRevision: 4 };
        }
        return intent;
      }),
      runMutation: vi.fn(async (_reference: unknown, args: Record<string, unknown>) => {
        mutations.push(args);
        if ("userId" in args && "groupId" in args && !("windowKey" in args)) {
          return { ok: true, windowKey: "hour:9", reservedAttempts: 5 };
        }
        return { ok: true };
      }),
    };
    const tableData = fixture.lookupTableAccounts as Record<string, { owner: string; dataBase64: string }>;
    const result = await buildDflowSettlementHandler(actionCtx as never, {
      intentId: intent._id as never,
    }, {
      isRoutingAvailable: () => true,
      resolveSponsorAddress: () => KEYS.sponsor,
      createRpc: () => ({
        getAccountInfo: async (address: string) => {
          if (address === KEYS.user) {
            return {
              dataBase64: "",
              owner: "11111111111111111111111111111111",
              lamports: 100_000_000n,
              executable: false,
            };
          }
          const table = tableData[address];
          return table
            ? { ...table, lamports: 0n, executable: false }
            : null;
        },
        getSlot: async () => fixture.order.contextSlot,
        getTokenAccountsByOwner: async () => [],
      }) as never,
      fetchOrder: async () => ({
        ok: true,
        order: invalidOrder,
        requestId: "request-invalid",
        rawBodyLength: 1,
      }),
      validateTransaction: () => ({
        ok: true,
        messageHash: "abc",
        computeUnits: 1,
        priorityFeeLamports: 1,
        ataCreates: 0,
        sponsorExposureLamports: 1,
      }),
    });
    expect(result).toMatchObject({
      ok: false,
      failureCode: "DFLOW_ORDER_INVALID",
    });
    expect(mutations.some((args) => args.failureCode === "DFLOW_ORDER_INVALID")).toBe(true);
    vi.unstubAllEnvs();
  });

  it("routes USDC input to a distinct receive mint through the production handler seam", async () => {
    vi.stubEnv("SOLANA_CLUSTER", "mainnet-beta");
    const order = parseDflowOrderResponse(ORDER_JSON);
    const outputMint = KEYS.recipient;
    const balanceAtomic = 90_000_000n;
    const bytes = new Uint8Array(165);
    bytes.set(bs58.decode(MAINNET.usdcMint), 0);
    bytes.set(bs58.decode(KEYS.user), 32);
    new DataView(bytes.buffer).setBigUint64(64, balanceAtomic, true);
    bytes[108] = 1;
    const requests: Array<Record<string, unknown>> = [];
    const mutations: Array<Record<string, unknown>> = [];
    const tableData = fixture.lookupTableAccounts as Record<string, { owner: string; dataBase64: string }>;
    const intent = {
      _id: "settlementIntents:usdc-to-receive",
      userId: "users:payer",
      walletId: "wallets:payer",
      groupId: "groups:dinner",
      tabId: "tabs:dinner",
      tabRevision: 4,
      status: "created",
      routingKind: "dflow_sync",
      inputMint: MAINNET.usdcMint,
      outputMint,
      recipientAddress: KEYS.recipient,
      minimumOutputAtomic: 1n,
      maximumInputAtomic: 0n,
      pricingReferenceMint: MAINNET.usdcMint,
      pricingReferenceAtomic: 9_500_000n,
      expiresAt: Date.now() + 60_000,
    };
    const actionCtx = {
      runQuery: vi.fn(async (_reference: unknown, args: Record<string, unknown>) => {
        if ("walletId" in args) return { _id: "wallets:payer", solanaAddress: KEYS.user };
        if ("tabId" in args) return { _id: "tabs:dinner", revision: 4, lockedRevision: 4 };
        return intent;
      }),
      runMutation: vi.fn(async (_reference: unknown, args: Record<string, unknown>) => {
        mutations.push(args);
        if ("serializedMessage" in args) return { ok: true, status: "ready_for_signature" };
        if ("userId" in args && "groupId" in args && !("windowKey" in args)) {
          return { ok: true, windowKey: "hour:2", reservedAttempts: 5 };
        }
        return { ok: true };
      }),
    };

    const result = await buildDflowSettlementHandler(actionCtx as never, {
      intentId: intent._id as never,
    }, {
      isRoutingAvailable: () => true,
      resolveSponsorAddress: () => KEYS.sponsor,
      validateTransaction: () => ({
        ok: true,
        messageHash: "validated-message",
        computeUnits: 100_000,
        priorityFeeLamports: 0,
        ataCreates: 0,
        sponsorExposureLamports: 1_000_000,
      }),
      createRpc: () => ({
        getAccountInfo: async (address: string) => {
          const table = tableData[address];
          return table ? { ...table, lamports: 0n, executable: false } : null;
        },
        getSlot: async () => fixture.order.contextSlot,
        getTokenAccountsByOwner: async () => [{
          address: "payer-usdc",
          dataBase64: Buffer.from(bytes).toString("base64"),
          owner: TOKEN_PROGRAM_ID,
          lamports: 0n,
          executable: false,
        }],
      }) as never,
      fetchOrder: async (request) => {
        requests.push(request as unknown as Record<string, unknown>);
        return { ok: true, order, requestId: `request-${requests.length}`, rawBodyLength: 1 };
      },
    });

    expect(result).toMatchObject({ ok: true, requestCount: 2 });
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      inputMint: MAINNET.usdcMint,
      outputMint,
      amount: "9500000",
    });
    expect(requests[1]).toMatchObject({
      inputMint: MAINNET.usdcMint,
      outputMint,
      amount: balanceAtomic.toString(),
    });
    expect(mutations.find((args) => "serializedMessage" in args)).toMatchObject({
      pricingProvider: "dflow:stable-reference",
      pricingGuaranteedOutputAtomic: BigInt(order.otherAmountThreshold),
    });
    vi.unstubAllEnvs();
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
      getAccountInfo: async (address: string, _commitment?: string, minContextSlot?: number) => {
        if (options.throwOn === "account") throw new Error("rpc down");
        if (address === options.missing) return null;
        return {
          dataBase64: DATA[address]!.dataBase64,
          owner: options.owner ?? DATA[address]!.owner,
          lamports: 0n,
          executable: false,
          contextSlot: options.slot ?? minContextSlot ?? fixture.order.contextSlot,
        };
      },
    };
  }

  it("reads every referenced table and stamps the slot it observed", async () => {
    const result = await loadLookupTablesForTransaction({
      rpc: rpc() as never,
      tableAddresses: ADDRESSES,
      contextSlot: fixture.order.contextSlot,
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
      contextSlot: fixture.order.contextSlot,
    });
    expect(result).toMatchObject({ ok: false, failureCode: "DFLOW_LOOKUP_TABLE_FETCH_FAILED" });
  });

  it("fails closed when the RPC is unavailable rather than proceeding blind", async () => {
    for (const throwOn of ["account"] as const) {
      const result = await loadLookupTablesForTransaction({
        rpc: rpc({ throwOn }) as never,
        tableAddresses: ADDRESSES,
        contextSlot: fixture.order.contextSlot,
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
      contextSlot: fixture.order.contextSlot,
    });
    expect(result).toMatchObject({ ok: false, failureCode: "ADDRESS_TABLE_OWNER_INVALID" });
  });

  it("does no RPC work when the transaction references no tables", async () => {
    const result = await loadLookupTablesForTransaction({
      rpc: rpc({ throwOn: "slot" }) as never,
      tableAddresses: [],
      contextSlot: fixture.order.contextSlot,
    });
    expect(result).toMatchObject({ ok: true, tables: [] });
  });
});
