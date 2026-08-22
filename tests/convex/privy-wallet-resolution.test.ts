import { afterEach, describe, expect, it } from "vitest";
import {
  FIXTURE_PRIVY_WALLET_ID,
  FIXTURE_SOLANA_ADDRESS,
  coSignAndBroadcast,
  fetchPrivyEmbeddedWalletSnapshot,
  isPrivyFixtureActive,
  isPrivyServerFixtureMode,
  resolvePrivyEmbeddedWalletSnapshot,
  resolveSolanaCaip2,
  resolveSolanaCluster,
} from "@/convex/internal/privy";
import {
  PrivyWalletError,
  PrivyWalletErrorCode,
  SOLANA_CAIP2_BY_CLUSTER,
  type PrivyLinkedWallet,
} from "@/lib/privy/serverWallets";
import { FIXTURE_MODE_NOT_PERMITTED } from "@/lib/solana/runtimeGuard";

const DID = "did:privy:cm7abc123";
const CREDENTIALS = { appId: "app-id", appSecret: "app-secret" };
const ADDRESS_A = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const ADDRESS_B = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1";

function solanaWallet(overrides: Partial<PrivyLinkedWallet> = {}): PrivyLinkedWallet {
  return {
    type: "wallet",
    id: "wallet-1",
    address: ADDRESS_A,
    chain_type: "solana",
    wallet_client_type: "privy",
    connector_type: "embedded",
    wallet_index: 0,
    first_verified_at: 1_700_000_000,
    ...overrides,
  };
}

function userBody(accounts: unknown[]): Response {
  return new Response(JSON.stringify({ id: DID, linked_accounts: accounts }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Records every call so retry counts and headers can be asserted. */
function recordingFetch(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let index = 0;
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (next instanceof Error) {
      throw next;
    }
    return next.clone();
  }) as unknown as typeof fetch;
  return { impl, calls: calls as ReadonlyArray<{ url: string; init: RequestInit }> };
}

const savedEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, savedEnv);
});

function withPrivyCredentials(): void {
  process.env.PRIVY_APP_ID = CREDENTIALS.appId;
  process.env.PRIVY_APP_SECRET = CREDENTIALS.appSecret;
}

function withoutPrivyCredentials(): void {
  delete process.env.PRIVY_APP_ID;
  delete process.env.PRIVY_APP_SECRET;
}

function simulateProductionDeployment(): void {
  process.env.ENVIRONMENT = "production";
  process.env.CONVEX_DEPLOYMENT = "prod:mytab-prod";
}

function simulateDeployedDevnet(): void {
  delete process.env.ENVIRONMENT;
  delete process.env.VERCEL_ENV;
  process.env.CONVEX_DEPLOYMENT = "dev:mytab-devnet";
  process.env.CONVEX_CLOUD_URL = "https://mytab-devnet.convex.cloud";
}

// ---------------------------------------------------------------------------

describe("live Privy wallet resolution", () => {
  it("calls GET https://api.privy.io/v1/users/{did} with Basic auth and privy-app-id", async () => {
    const { impl, calls } = recordingFetch([userBody([solanaWallet()])]);

    const snapshot = await fetchPrivyEmbeddedWalletSnapshot(DID, CREDENTIALS, impl);

    expect(snapshot).toEqual({
      privyWalletId: "wallet-1",
      solanaAddress: ADDRESS_A,
      candidateCount: 1,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://api.privy.io/v1/users/${encodeURIComponent(DID)}`);
    expect(calls[0].init.method).toBe("GET");

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["privy-app-id"]).toBe(CREDENTIALS.appId);
    const [scheme, encoded] = headers.Authorization.split(" ");
    expect(scheme).toBe("Basic");
    expect(Buffer.from(encoded, "base64").toString("utf8")).toBe(
      `${CREDENTIALS.appId}:${CREDENTIALS.appSecret}`,
    );
  });

  it("never puts the app secret in the URL or a query string", async () => {
    const { impl, calls } = recordingFetch([userBody([solanaWallet()])]);
    await fetchPrivyEmbeddedWalletSnapshot(DID, CREDENTIALS, impl);
    expect(calls[0].url).not.toContain(CREDENTIALS.appSecret);
    expect(calls[0].url).not.toContain("?");
  });

  it("throws NO_SOLANA_WALLET when the user has no embedded wallet yet", async () => {
    const { impl } = recordingFetch([userBody([{ type: "telegram", subject: "1" }])]);
    await expect(fetchPrivyEmbeddedWalletSnapshot(DID, CREDENTIALS, impl)).rejects.toMatchObject({
      code: PrivyWalletErrorCode.NO_SOLANA_WALLET,
    });
  });

  it("picks deterministically when the user has multiple embedded Solana wallets", async () => {
    const wallets = [
      solanaWallet({ id: "w2", wallet_index: 2, address: ADDRESS_B }),
      solanaWallet({ id: "w0", wallet_index: 0, address: ADDRESS_A }),
    ];

    const forward = await fetchPrivyEmbeddedWalletSnapshot(
      DID,
      CREDENTIALS,
      recordingFetch([userBody(wallets)]).impl,
    );
    const reversed = await fetchPrivyEmbeddedWalletSnapshot(
      DID,
      CREDENTIALS,
      recordingFetch([userBody([...wallets].reverse())]).impl,
    );

    expect(forward).toEqual({
      privyWalletId: "w0",
      solanaAddress: ADDRESS_A,
      candidateCount: 2,
    });
    // Same input, same answer: a receiving address must not drift between syncs.
    expect(reversed).toEqual(forward);
  });

  it("does not retry a 404 — the user simply does not exist", async () => {
    const { impl, calls } = recordingFetch([new Response("{}", { status: 404 })]);
    await expect(fetchPrivyEmbeddedWalletSnapshot(DID, CREDENTIALS, impl)).rejects.toMatchObject({
      code: PrivyWalletErrorCode.USER_NOT_FOUND,
    });
    expect(calls).toHaveLength(1);
  });

  it("does not retry bad credentials", async () => {
    for (const status of [401, 403]) {
      const { impl, calls } = recordingFetch([new Response("{}", { status })]);
      await expect(
        fetchPrivyEmbeddedWalletSnapshot(DID, CREDENTIALS, impl),
      ).rejects.toMatchObject({ code: PrivyWalletErrorCode.UNAUTHORIZED });
      expect(calls).toHaveLength(1);
    }
  });

  it("retries a 429 and succeeds when Privy recovers", async () => {
    const { impl, calls } = recordingFetch([
      new Response("slow down", { status: 429, headers: { "retry-after": "0" } }),
      userBody([solanaWallet()]),
    ]);

    const snapshot = await fetchPrivyEmbeddedWalletSnapshot(DID, CREDENTIALS, impl);
    expect(snapshot.solanaAddress).toBe(ADDRESS_A);
    expect(calls).toHaveLength(2);
  });

  it("gives up after bounded retries on a persistent rate limit", async () => {
    const { impl, calls } = recordingFetch([
      new Response("slow down", { status: 429, headers: { "retry-after": "0" } }),
    ]);

    await expect(fetchPrivyEmbeddedWalletSnapshot(DID, CREDENTIALS, impl)).rejects.toMatchObject({
      code: PrivyWalletErrorCode.RATE_LIMITED,
    });
    expect(calls).toHaveLength(3);
  });

  it("retries a 5xx and then surfaces UNAVAILABLE", async () => {
    const { impl, calls } = recordingFetch([new Response("boom", { status: 503 })]);
    await expect(fetchPrivyEmbeddedWalletSnapshot(DID, CREDENTIALS, impl)).rejects.toMatchObject({
      code: PrivyWalletErrorCode.UNAVAILABLE,
    });
    expect(calls).toHaveLength(3);
  });

  it("treats an unreachable Privy as retryable and then fails, never as 'no wallet'", async () => {
    const { impl, calls } = recordingFetch([new Error("ECONNRESET")]);
    const error = await fetchPrivyEmbeddedWalletSnapshot(DID, CREDENTIALS, impl).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(PrivyWalletError);
    expect(error).toMatchObject({ code: PrivyWalletErrorCode.UNAVAILABLE });
    expect(calls).toHaveLength(3);
  });

  it("rejects a non-JSON body rather than guessing", async () => {
    const { impl } = recordingFetch([new Response("<html>nope</html>", { status: 200 })]);
    await expect(fetchPrivyEmbeddedWalletSnapshot(DID, CREDENTIALS, impl)).rejects.toMatchObject({
      code: PrivyWalletErrorCode.MALFORMED_RESPONSE,
    });
  });

  it("rejects a wallet Privy returned without a signable wallet id", async () => {
    const { impl } = recordingFetch([userBody([solanaWallet({ id: null })])]);
    await expect(fetchPrivyEmbeddedWalletSnapshot(DID, CREDENTIALS, impl)).rejects.toMatchObject({
      code: PrivyWalletErrorCode.WALLET_ID_MISSING,
    });
  });
});

describe("fixture mode is explicit and impossible on a real deployment", () => {
  it("returns the fixture wallet locally, under the test runner, with no credentials", async () => {
    withoutPrivyCredentials();
    expect(isPrivyServerFixtureMode()).toBe(true);
    expect(isPrivyFixtureActive()).toBe(true);

    await expect(resolvePrivyEmbeddedWalletSnapshot(DID)).resolves.toEqual({
      privyWalletId: FIXTURE_PRIVY_WALLET_ID,
      solanaAddress: FIXTURE_SOLANA_ADDRESS,
      candidateCount: 1,
    });
  });

  it("throws a named error instead of a fixture wallet in production", async () => {
    withoutPrivyCredentials();
    simulateProductionDeployment();

    const error = await resolvePrivyEmbeddedWalletSnapshot(DID).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ code: FIXTURE_MODE_NOT_PERMITTED });
    expect((error as Error).name).toBe("FixtureModeNotPermittedError");
    // The fixture address must not appear anywhere in the failure path.
    expect(JSON.stringify(error)).not.toContain(FIXTURE_SOLANA_ADDRESS);
    expect(isPrivyFixtureActive()).toBe(false);
  });

  it("throws on a deployed devnet too — devnet is a real deployment", async () => {
    withoutPrivyCredentials();
    simulateDeployedDevnet();

    await expect(resolvePrivyEmbeddedWalletSnapshot(DID)).rejects.toMatchObject({
      code: FIXTURE_MODE_NOT_PERMITTED,
    });
    expect(isPrivyFixtureActive()).toBe(false);
  });

  it("takes the live path whenever credentials are present, even locally", async () => {
    withPrivyCredentials();
    expect(isPrivyServerFixtureMode()).toBe(false);
    expect(isPrivyFixtureActive()).toBe(false);

    const { impl, calls } = recordingFetch([userBody([solanaWallet({ id: "live" })])]);
    const snapshot = await resolvePrivyEmbeddedWalletSnapshot(DID, impl);

    expect(snapshot.privyWalletId).toBe("live");
    expect(calls).toHaveLength(1);
  });

  it("surfaces a live failure rather than degrading to the fixture wallet", async () => {
    withPrivyCredentials();
    const { impl } = recordingFetch([new Response("{}", { status: 404 })]);

    const error = await resolvePrivyEmbeddedWalletSnapshot(DID, impl).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ code: PrivyWalletErrorCode.USER_NOT_FOUND });
  });

  it("fails closed on the sponsor co-sign stub outside local dev", async () => {
    simulateProductionDeployment();
    await expect(
      coSignAndBroadcast({ intentId: "i1", partialSignedTxBase64: "AAA=" }),
    ).rejects.toMatchObject({ code: FIXTURE_MODE_NOT_PERMITTED });

    simulateDeployedDevnet();
    await expect(
      coSignAndBroadcast({ intentId: "i1", partialSignedTxBase64: "AAA=" }),
    ).rejects.toMatchObject({ code: FIXTURE_MODE_NOT_PERMITTED });
  });
});

describe("cluster dependence", () => {
  it("resolves the CAIP-2 id from configuration, defaulting to devnet", () => {
    delete process.env.SOLANA_CLUSTER;
    expect(resolveSolanaCluster()).toBe("devnet");
    expect(resolveSolanaCaip2()).toBe(SOLANA_CAIP2_BY_CLUSTER.devnet);

    process.env.SOLANA_CLUSTER = "mainnet-beta";
    expect(resolveSolanaCluster()).toBe("mainnet-beta");
    expect(resolveSolanaCaip2()).toBe(SOLANA_CAIP2_BY_CLUSTER["mainnet-beta"]);
  });

  it("resolves the identical wallet on devnet and mainnet", async () => {
    withPrivyCredentials();

    process.env.SOLANA_CLUSTER = "devnet";
    const devnet = await resolvePrivyEmbeddedWalletSnapshot(
      DID,
      recordingFetch([userBody([solanaWallet()])]).impl,
    );

    process.env.SOLANA_CLUSTER = "mainnet-beta";
    const mainnet = await resolvePrivyEmbeddedWalletSnapshot(
      DID,
      recordingFetch([userBody([solanaWallet()])]).impl,
    );

    // Wallet resolution reads no cluster: one keypair, one address, both clusters.
    expect(devnet).toEqual(mainnet);
  });
});
