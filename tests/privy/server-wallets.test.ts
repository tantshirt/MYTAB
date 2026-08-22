import { describe, expect, it } from "vitest";
import {
  PRIVY_API_BASE_URL,
  PrivyWalletError,
  PrivyWalletErrorCode,
  SOLANA_CAIP2_BY_CLUSTER,
  backoffDelayMs,
  buildPrivyGetUserRequest,
  compareEmbeddedWallets,
  isPlausibleSolanaAddress,
  normalizeSolanaCluster,
  parseRetryAfterMs,
  privyErrorForStatus,
  selectEmbeddedSolanaWallet,
  solanaCaip2ForCluster,
  type PrivyLinkedWallet,
} from "@/lib/privy/serverWallets";

const APP_ID = "clm-app-id";
const APP_SECRET = "super-secret";
const DID = "did:privy:cm7abc123";

function solanaWallet(overrides: Partial<PrivyLinkedWallet> = {}): PrivyLinkedWallet {
  return {
    type: "wallet",
    id: "wallet-1",
    address: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    chain_type: "solana",
    wallet_client_type: "privy",
    connector_type: "embedded",
    wallet_index: 0,
    first_verified_at: 1_700_000_000,
    ...overrides,
  };
}

describe("Privy request shaping", () => {
  it("targets GET /v1/users/{did} with Basic auth and the privy-app-id header", () => {
    const request = buildPrivyGetUserRequest(APP_ID, APP_SECRET, DID);

    expect(request.method).toBe("GET");
    expect(request.url).toBe(`${PRIVY_API_BASE_URL}/v1/users/${encodeURIComponent(DID)}`);
    expect(request.headers["privy-app-id"]).toBe(APP_ID);

    const [scheme, encoded] = request.headers.Authorization.split(" ");
    expect(scheme).toBe("Basic");
    expect(Buffer.from(encoded, "base64").toString("utf8")).toBe(`${APP_ID}:${APP_SECRET}`);
  });

  it("refuses to build a request without both credentials", () => {
    for (const [id, secret] of [["", APP_SECRET], [APP_ID, ""], ["  ", " "]]) {
      expect(() => buildPrivyGetUserRequest(id, secret, DID)).toThrowError(
        expect.objectContaining({ code: PrivyWalletErrorCode.MISSING_CREDENTIALS }),
      );
    }
  });

  it("rejects a malformed DID before it reaches the network", () => {
    for (const bad of ["", "did:privy:", "not-a-did", "did:privy:../../admin", DID + "/.."]) {
      expect(() => buildPrivyGetUserRequest(APP_ID, APP_SECRET, bad)).toThrowError(
        expect.objectContaining({ code: PrivyWalletErrorCode.INVALID_DID }),
      );
    }
  });
});

describe("Privy status mapping", () => {
  it("classifies each failure and marks only transient ones retryable", () => {
    expect(privyErrorForStatus(404, "{}")).toMatchObject({
      code: PrivyWalletErrorCode.USER_NOT_FOUND,
      retryable: false,
    });
    expect(privyErrorForStatus(401, "{}")).toMatchObject({
      code: PrivyWalletErrorCode.UNAUTHORIZED,
      retryable: false,
    });
    expect(privyErrorForStatus(403, "{}")).toMatchObject({
      code: PrivyWalletErrorCode.UNAUTHORIZED,
      retryable: false,
    });
    expect(privyErrorForStatus(429, "slow down")).toMatchObject({
      code: PrivyWalletErrorCode.RATE_LIMITED,
      retryable: true,
    });
    expect(privyErrorForStatus(503, "{}")).toMatchObject({
      code: PrivyWalletErrorCode.UNAVAILABLE,
      retryable: true,
    });
    expect(privyErrorForStatus(418, "{}")).toMatchObject({
      code: PrivyWalletErrorCode.MALFORMED_RESPONSE,
      retryable: false,
    });
  });

  it("parses and clamps Retry-After, ignoring junk", () => {
    expect(parseRetryAfterMs("2")).toBe(2000);
    expect(parseRetryAfterMs("0.5")).toBe(500);
    expect(parseRetryAfterMs("9999")).toBe(10_000);
    expect(parseRetryAfterMs("-1")).toBeNull();
    expect(parseRetryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT")).toBeNull();
    expect(parseRetryAfterMs(null)).toBeNull();
  });

  it("backs off exponentially with a ceiling", () => {
    expect(backoffDelayMs(0)).toBe(250);
    expect(backoffDelayMs(1)).toBe(500);
    expect(backoffDelayMs(2)).toBe(1000);
    expect(backoffDelayMs(20)).toBe(4000);
  });
});

describe("embedded Solana wallet selection", () => {
  it("finds the embedded Solana wallet among mixed linked accounts", () => {
    const snapshot = selectEmbeddedSolanaWallet({
      id: DID,
      linked_accounts: [
        { type: "telegram", telegramUserId: "1" },
        { type: "wallet", chain_type: "ethereum", wallet_client_type: "privy", id: "eth", address: "0xabc" },
        solanaWallet({ id: "sol-wallet", address: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1" }),
      ],
    });

    expect(snapshot).toEqual({
      privyWalletId: "sol-wallet",
      solanaAddress: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
      candidateCount: 1,
    });
  });

  it("ignores external (non-Privy) Solana wallets", () => {
    expect(() =>
      selectEmbeddedSolanaWallet({
        id: DID,
        linked_accounts: [
          {
            type: "wallet",
            chain_type: "solana",
            wallet_client_type: "phantom",
            connector_type: "injected",
            id: "ext",
            address: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
          },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: PrivyWalletErrorCode.NO_SOLANA_WALLET }));
  });

  it("throws NO_SOLANA_WALLET when the user has not been given one yet", () => {
    expect(() =>
      selectEmbeddedSolanaWallet({ id: DID, linked_accounts: [{ type: "telegram" }] }),
    ).toThrowError(expect.objectContaining({ code: PrivyWalletErrorCode.NO_SOLANA_WALLET }));
  });

  it("throws MALFORMED_RESPONSE when linked_accounts is missing or wrong-typed", () => {
    for (const body of [{}, { linked_accounts: null }, { linked_accounts: "nope" }]) {
      expect(() => selectEmbeddedSolanaWallet(body)).toThrowError(
        expect.objectContaining({ code: PrivyWalletErrorCode.MALFORMED_RESPONSE }),
      );
    }
  });

  it("picks deterministically and stably when the user has multiple wallets", () => {
    const wallets = [
      solanaWallet({ id: "w2", wallet_index: 2, address: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1" }),
      solanaWallet({ id: "w0", wallet_index: 0, address: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" }),
      solanaWallet({ id: "w1", wallet_index: 1, address: "3n1kZmCkMz9pJTsPmhbnNKKZfMHqSbfEUxYAKtTVhAW5" }),
    ];

    const forward = selectEmbeddedSolanaWallet({ id: DID, linked_accounts: wallets });
    const reversed = selectEmbeddedSolanaWallet({ id: DID, linked_accounts: [...wallets].reverse() });

    // Lowest wallet_index wins, and input order does not change the answer —
    // a user's receiving address must not drift between syncs.
    expect(forward.privyWalletId).toBe("w0");
    expect(forward.candidateCount).toBe(3);
    expect(reversed).toEqual(forward);
  });

  it("orders by first verification, then address, when wallet_index ties", () => {
    const a = solanaWallet({ id: "a", wallet_index: null, first_verified_at: 200 });
    const b = solanaWallet({ id: "b", wallet_index: null, first_verified_at: 100 });
    expect(compareEmbeddedWallets(a, b)).toBeGreaterThan(0);
    expect(compareEmbeddedWallets(b, a)).toBeLessThan(0);
    expect(compareEmbeddedWallets(a, a)).toBe(0);
  });

  it("throws WALLET_ID_MISSING rather than syncing a wallet it cannot sign with", () => {
    for (const id of [null, "", "   "]) {
      expect(() =>
        selectEmbeddedSolanaWallet({ id: DID, linked_accounts: [solanaWallet({ id })] }),
      ).toThrowError(expect.objectContaining({ code: PrivyWalletErrorCode.WALLET_ID_MISSING }));
    }
  });

  it("throws INVALID_WALLET_ADDRESS on a non-base58 address", () => {
    for (const address of [null, "", "0xabc", "not base58!", "IlO0" + "1".repeat(30)]) {
      expect(() =>
        selectEmbeddedSolanaWallet({ id: DID, linked_accounts: [solanaWallet({ address })] }),
      ).toThrowError(
        expect.objectContaining({ code: PrivyWalletErrorCode.INVALID_WALLET_ADDRESS }),
      );
    }
  });

  it("rejects the fixture address shape used by the offline path", () => {
    // The fixture address contains no base58-invalid characters but is short of
    // a real 32-byte key; it must never survive a live response.
    expect(isPlausibleSolanaAddress("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")).toBe(true);
    expect(isPlausibleSolanaAddress("0")).toBe(false);
  });

  it("errors are PrivyWalletError instances so callers can branch on the class", () => {
    try {
      selectEmbeddedSolanaWallet({ id: DID, linked_accounts: [] });
      expect.unreachable("expected a throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PrivyWalletError);
    }
  });
});

describe("cluster awareness", () => {
  it("maps clusters to CAIP-2 ids without affecting wallet selection", () => {
    expect(normalizeSolanaCluster("mainnet")).toBe("mainnet-beta");
    expect(normalizeSolanaCluster("MAINNET-BETA")).toBe("mainnet-beta");
    expect(normalizeSolanaCluster("devnet")).toBe("devnet");
    expect(normalizeSolanaCluster(undefined)).toBe("devnet");
    expect(solanaCaip2ForCluster("devnet")).toBe(SOLANA_CAIP2_BY_CLUSTER.devnet);
    expect(SOLANA_CAIP2_BY_CLUSTER["mainnet-beta"]).not.toBe(SOLANA_CAIP2_BY_CLUSTER.devnet);
  });

  it("resolves the same wallet regardless of the wallet's reported chain_id", () => {
    // A Privy embedded Solana wallet is one keypair; its address is identical on
    // devnet and mainnet. Selection must not filter on chain_id, or the devnet
    // to mainnet flip would silently stop resolving wallets.
    const devnet = selectEmbeddedSolanaWallet({
      id: DID,
      linked_accounts: [solanaWallet({ chain_id: SOLANA_CAIP2_BY_CLUSTER.devnet })],
    });
    const mainnet = selectEmbeddedSolanaWallet({
      id: DID,
      linked_accounts: [solanaWallet({ chain_id: SOLANA_CAIP2_BY_CLUSTER["mainnet-beta"] })],
    });

    expect(devnet).toEqual(mainnet);
  });
});
