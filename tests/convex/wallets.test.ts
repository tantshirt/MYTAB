import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  isPrivyServerFixtureMode,
  resolvePrivyEmbeddedWalletSnapshot,
} from "../../convex/internal/privy";
import {
  FIXTURE_PRIVY_WALLET_ID,
  FIXTURE_SOLANA_ADDRESS,
} from "../../lib/privy/fixtures";
import {
  DUPLICATE_DEFAULT_RECEIVING,
  WalletError,
  getDefaultReceivingWalletForUser,
  setDefaultReceivingWallet,
  shouldNewEmbeddedWalletBeDefault,
  upsertEmbeddedWallet,
} from "../../convex/lib/walletSync";
import { fakeId } from "../helpers/convexFakeDb";

type WalletDoc = {
  _id: Id<"wallets">;
  userId: Id<"users">;
  privyWalletId: string;
  solanaAddress: string;
  isEmbedded: boolean;
  isDefaultReceiving: boolean;
  createdAt: number;
  updatedAt: number;
};

/**
 * Convex stamps `_creationTime` on every document, but this fake deliberately
 * does not: "stores only wallet id and address metadata" asserts the exact key
 * set an insert produced, and that assertion is about what the handler wrote.
 * `asWalletDocs` supplies the field only where a real `Doc<"wallets">` is
 * required — the helpers under test only read those copies, and every write
 * still goes through `ctx.db.patch` against the store itself.
 */
function asWalletDocs(rows: readonly WalletDoc[]): Array<Doc<"wallets">> {
  return rows.map((row) => ({ _creationTime: 0, ...row }));
}

function createWalletStore(initial: WalletDoc[] = []) {
  const wallets = [...initial];
  let nextId = wallets.length + 1;

  const ctx = {
    db: {
      query: (table: string) => ({
        withIndex: (
          index: string,
          builder: (q: {
            eq: (field: string, value: string | boolean) => unknown;
          }) => unknown,
        ) => {
          if (table !== "wallets") {
            return { collect: async () => [], unique: async () => null };
          }

          const filters: Record<string, string | boolean> = {};
          const filterBuilder = {
            eq: (field: string, value: string | boolean) => {
              filters[field] = value;
              return filterBuilder;
            },
          };
          builder(filterBuilder);

          const matches = wallets.filter((wallet) =>
            Object.entries(filters).every(([field, value]) => {
              return wallet[field as keyof WalletDoc] === value;
            }),
          );

          return {
            collect: async () => matches,
            unique: async () => matches[0] ?? null,
          };
        },
      }),
      insert: async (_table: string, doc: Omit<WalletDoc, "_id">) => {
        const id = fakeId<"wallets">(`wallets:${nextId++}`);
        wallets.push({ _id: id, ...doc });
        return id;
      },
      patch: async (id: string, patch: Partial<WalletDoc>) => {
        const index = wallets.findIndex((wallet) => wallet._id === id);
        if (index >= 0) {
          wallets[index] = { ...wallets[index]!, ...patch };
        }
      },
    },
  };

  return { ctx, wallets };
}

describe("Story 1.8 — wallet sync helpers", () => {
  it("returns fixture wallet data when Privy server credentials are absent", async () => {
    if (!isPrivyServerFixtureMode()) {
      return;
    }

    // Local/test runtime only — see tests/convex/privy-wallet-resolution.test.ts
    // for the deployment paths, where this throws instead.
    await expect(
      resolvePrivyEmbeddedWalletSnapshot("did:privy:test"),
    ).resolves.toEqual({
      privyWalletId: FIXTURE_PRIVY_WALLET_ID,
      solanaAddress: FIXTURE_SOLANA_ADDRESS,
      candidateCount: 1,
    });
  });

  it("AC1 — stores only wallet id and address metadata (no key material fields)", async () => {
    const { ctx, wallets } = createWalletStore();
    const now = Date.now();

    await upsertEmbeddedWallet(ctx as never, fakeId<"users">("users:1"), "wallet-1", "SolAddr1");

    expect(wallets).toHaveLength(1);
    expect(wallets[0]).toMatchObject({
      userId: fakeId("users:1"),
      privyWalletId: "wallet-1",
      solanaAddress: "SolAddr1",
      isEmbedded: true,
      isDefaultReceiving: true,
    });
    expect(Object.keys(wallets[0]!)).toEqual([
      "_id",
      "userId",
      "privyWalletId",
      "solanaAddress",
      "isEmbedded",
      "isDefaultReceiving",
      "createdAt",
      "updatedAt",
    ]);
    expect(wallets[0]!.createdAt).toBeLessThanOrEqual(Date.now());
    expect(wallets[0]!.updatedAt).toBeGreaterThanOrEqual(now - 5);
  });

  it("AC2 — marks the first embedded wallet as the sole default receiving wallet", async () => {
    const { ctx, wallets } = createWalletStore();

    await upsertEmbeddedWallet(ctx as never, fakeId<"users">("users:1"), "wallet-1", "SolAddr1");

    expect(wallets.filter((wallet) => wallet.isDefaultReceiving)).toHaveLength(1);
    expect(wallets[0]?.isEmbedded).toBe(true);
  });

  it("AC2 — keeps embedded vs external distinct and avoids a second default on insert", async () => {
    const { ctx, wallets } = createWalletStore([
      {
        _id: fakeId("wallets:1"),
        userId: fakeId("users:1"),
        privyWalletId: "external-1",
        solanaAddress: "ExternalAddr",
        isEmbedded: false,
        isDefaultReceiving: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    expect(shouldNewEmbeddedWalletBeDefault(wallets)).toBe(false);

    await upsertEmbeddedWallet(ctx as never, fakeId<"users">("users:1"), "wallet-1", "EmbeddedAddr");

    expect(wallets).toHaveLength(2);
    expect(wallets.find((wallet) => wallet.privyWalletId === "wallet-1")).toMatchObject({
      isEmbedded: true,
      isDefaultReceiving: false,
    });
    expect(wallets.filter((wallet) => wallet.isDefaultReceiving)).toHaveLength(1);
  });

  it("AC4 — reuses an existing wallet matched by Privy wallet id", async () => {
    const { ctx, wallets } = createWalletStore([
      {
        _id: fakeId("wallets:1"),
        userId: fakeId("users:1"),
        privyWalletId: "wallet-1",
        solanaAddress: "OldAddr",
        isEmbedded: true,
        isDefaultReceiving: true,
        createdAt: 100,
        updatedAt: 100,
      },
    ]);

    const result = await upsertEmbeddedWallet(
      ctx as never,
      fakeId<"users">("users:1"),
      "wallet-1",
      "NewAddr",
    );

    expect(result).toEqual({ walletId: "wallets:1", created: false });
    expect(wallets).toHaveLength(1);
    expect(wallets[0]?.solanaAddress).toBe("NewAddr");
    expect(wallets[0]?.isDefaultReceiving).toBe(true);
  });

  it("AC2 — rejects duplicate default receiving wallets in corrupted state", async () => {
    const { ctx, wallets } = createWalletStore([
      {
        _id: fakeId("wallets:1"),
        userId: fakeId("users:1"),
        privyWalletId: "wallet-1",
        solanaAddress: "Addr1",
        isEmbedded: true,
        isDefaultReceiving: true,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        _id: fakeId("wallets:2"),
        userId: fakeId("users:1"),
        privyWalletId: "wallet-2",
        solanaAddress: "Addr2",
        isEmbedded: false,
        isDefaultReceiving: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    await expect(
      getDefaultReceivingWalletForUser(ctx as never, fakeId<"users">("users:1")),
    ).rejects.toMatchObject({ code: DUPLICATE_DEFAULT_RECEIVING });

    await expect(
      setDefaultReceivingWallet(
        ctx as never,
        fakeId<"users">("users:1"),
        fakeId<"wallets">("wallets:1"),
        asWalletDocs(wallets),
      ),
    ).rejects.toBeInstanceOf(WalletError);
  });

  it("AC2 — atomically switches the default receiving wallet", async () => {
    const { ctx, wallets } = createWalletStore([
      {
        _id: fakeId("wallets:1"),
        userId: fakeId("users:1"),
        privyWalletId: "wallet-1",
        solanaAddress: "Addr1",
        isEmbedded: true,
        isDefaultReceiving: true,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        _id: fakeId("wallets:2"),
        userId: fakeId("users:1"),
        privyWalletId: "wallet-2",
        solanaAddress: "Addr2",
        isEmbedded: false,
        isDefaultReceiving: false,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    await setDefaultReceivingWallet(
      ctx as never,
      fakeId<"users">("users:1"),
      fakeId<"wallets">("wallets:2"),
      asWalletDocs(wallets),
    );

    expect(wallets.find((wallet) => wallet._id === "wallets:1")?.isDefaultReceiving).toBe(false);
    expect(wallets.find((wallet) => wallet._id === "wallets:2")?.isDefaultReceiving).toBe(true);
    expect(wallets.filter((wallet) => wallet.isDefaultReceiving)).toHaveLength(1);
  });
});
