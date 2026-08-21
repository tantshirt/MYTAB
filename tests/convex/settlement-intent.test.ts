import { describe, expect, it } from "vitest";
import {
  FIXTURE_PAYER_WALLET_ADDRESS,
  FIXTURE_RECIPIENT_WALLET_ADDRESS,
  FIXTURE_SPONSOR_WALLET_ADDRESS,
} from "../../lib/solana/constants";
import { requireIntentOwner, INTENT_NOT_OWNED } from "../../convex/lib/intentAuth";
import {
  TIP_FAILURE,
  createTipIntentCore,
} from "../../convex/lib/settlementIntentSync";
import { SETTLEMENT_STATUS } from "../../convex/lib/settlementState";
import { AuthError, TELEGRAM_CONTEXT_REQUIRED, UNAUTHORIZED } from "../../convex/lib/auth";

const PAYER_USER = {
  _id: "users:payer",
  privyDid: "did:privy:payer",
  telegramUserId: "100",
  displayName: "Payer",
};

const RECIPIENT_USER = {
  _id: "users:recipient",
  privyDid: "did:privy:recipient",
  telegramUserId: "200",
  displayName: "Recipient",
};

const GROUP_ID = "groups:1";
const RECIPIENT_WALLET = FIXTURE_RECIPIENT_WALLET_ADDRESS;

type Store = {
  users: typeof PAYER_USER[];
  telegramContexts: Array<{
    privyDid: string;
    expiresAt: number;
  }>;
  groupMembers: Array<{
    groupId: string;
    telegramUserId: string;
    membershipStatus: string;
  }>;
  wallets: Array<{
    _id: string;
    userId: string;
    solanaAddress: string;
    isDefaultReceiving: boolean;
  }>;
  tips: Array<Record<string, unknown>>;
  settlementIntents: Array<Record<string, unknown>>;
};

function createStore(): Store {
  return {
    users: [PAYER_USER, RECIPIENT_USER],
    telegramContexts: [
      { privyDid: PAYER_USER.privyDid, expiresAt: Date.now() + 60_000 },
    ],
    groupMembers: [
      {
        groupId: GROUP_ID,
        telegramUserId: PAYER_USER.telegramUserId,
        membershipStatus: "active",
      },
      {
        groupId: GROUP_ID,
        telegramUserId: RECIPIENT_USER.telegramUserId,
        membershipStatus: "active",
      },
    ],
    wallets: [
      {
        _id: "wallets:payer",
        userId: PAYER_USER._id,
        solanaAddress: FIXTURE_PAYER_WALLET_ADDRESS,
        isDefaultReceiving: true,
      },
      {
        _id: "wallets:recipient",
        userId: RECIPIENT_USER._id,
        solanaAddress: RECIPIENT_WALLET,
        isDefaultReceiving: true,
      },
    ],
    tips: [],
    settlementIntents: [],
  };
}

function createCtx(store: Store, authenticated = true) {
  let nextId = 1;

  return {
    auth: {
      getUserIdentity: async () =>
        authenticated
          ? { subject: PAYER_USER.privyDid, tokenIdentifier: PAYER_USER.privyDid }
          : null,
    },
    db: {
      get: async (id: string) => {
        if (id === RECIPIENT_USER._id) return RECIPIENT_USER;
        if (id === PAYER_USER._id) return PAYER_USER;
        const intent = store.settlementIntents.find((row) => row._id === id);
        if (intent) return intent;
        return null;
      },
      query: (table: string) => ({
        withIndex: (
          _index: string,
          builder: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
        ) => {
          const filters: Record<string, unknown> = {};
          const filterBuilder = {
            eq: (field: string, value: unknown) => {
              filters[field] = value;
              return filterBuilder;
            },
          };
          builder(filterBuilder);

          const rows = (store[table as keyof Store] as Array<Record<string, unknown>>).filter(
            (row) =>
              Object.entries(filters).every(([field, value]) => row[field] === value),
          );

          return {
            unique: async () => rows[0] ?? null,
            collect: async () => rows,
          };
        },
      }),
      insert: async (table: string, doc: Record<string, unknown>) => {
        const id = `${table}:${nextId++}`;
        (store[table as keyof Store] as Array<Record<string, unknown>>).push({
          _id: id,
          ...doc,
        });
        return id;
      },
      patch: async (id: string, patch: Record<string, unknown>) => {
        for (const table of ["tips", "settlementIntents"] as const) {
          const rows = store[table];
          const index = rows.findIndex((row) => row._id === id);
          if (index >= 0) {
            rows[index] = { ...rows[index]!, ...patch };
          }
        }
      },
    },
  };
}

describe("Story 3.2 — createTipIntentCore", () => {
  it("inserts a created intent with server-owned recipient address", async () => {
    const store = createStore();
    const ctx = createCtx(store);

    const result = await createTipIntentCore(ctx as never, {
      groupId: GROUP_ID as never,
      recipientUserId: RECIPIENT_USER._id as never,
      amountAtomic: 1_500_000n,
      idempotencyKey: "tip-key-1",
    });

    expect(result.created).toBe(true);
    expect(result.status).toBe(SETTLEMENT_STATUS.CREATED);
    expect(store.settlementIntents).toHaveLength(1);
    expect(store.settlementIntents[0]?.recipientAddress).toBe(RECIPIENT_WALLET);
    expect(store.settlementIntents[0]?.status).toBe(SETTLEMENT_STATUS.CREATED);
  });

  it("returns the same intent on idempotent retry", async () => {
    const store = createStore();
    const ctx = createCtx(store);

    const first = await createTipIntentCore(ctx as never, {
      groupId: GROUP_ID as never,
      recipientUserId: RECIPIENT_USER._id as never,
      amountAtomic: 1_500_000n,
      idempotencyKey: "tip-key-dup",
    });

    const second = await createTipIntentCore(ctx as never, {
      groupId: GROUP_ID as never,
      recipientUserId: RECIPIENT_USER._id as never,
      amountAtomic: 1_500_000n,
      idempotencyKey: "tip-key-dup",
    });

    expect(second.created).toBe(false);
    expect(second.intentId).toBe(first.intentId);
    expect(store.settlementIntents).toHaveLength(1);
  });

  it("requires telegram context for mutations", async () => {
    const store = createStore();
    store.telegramContexts = [];
    const ctx = createCtx(store);

    await expect(
      createTipIntentCore(ctx as never, {
        groupId: GROUP_ID as never,
        recipientUserId: RECIPIENT_USER._id as never,
        amountAtomic: 1_000_000n,
        idempotencyKey: "no-telegram",
      }),
    ).rejects.toMatchObject({ code: TELEGRAM_CONTEXT_REQUIRED });
  });

  it("rejects self-tips", async () => {
    const store = createStore();
    const ctx = createCtx(store);

    await expect(
      createTipIntentCore(ctx as never, {
        groupId: GROUP_ID as never,
        recipientUserId: PAYER_USER._id as never,
        amountAtomic: 1_000_000n,
        idempotencyKey: "self-tip",
      }),
    ).rejects.toMatchObject({ code: TIP_FAILURE.CANNOT_TIP_SELF });
  });
});

describe("Story 3.2 — requireIntentOwner", () => {
  it("returns the intent when the authenticated user owns it", async () => {
    const store = createStore();
    const ctx = createCtx(store);
    store.settlementIntents.push({
      _id: "settlementIntents:1",
      userId: PAYER_USER._id,
      status: SETTLEMENT_STATUS.CREATED,
    });

    const { intent } = await requireIntentOwner(ctx as never, "settlementIntents:1" as never);
    expect(intent._id).toBe("settlementIntents:1");
  });

  it("rejects a non-owner", async () => {
    const store = createStore();
    const ctx = createCtx(store);
    store.settlementIntents.push({
      _id: "settlementIntents:2",
      userId: "users:other",
      status: SETTLEMENT_STATUS.CREATED,
    });

    await expect(
      requireIntentOwner(ctx as never, "settlementIntents:2" as never),
    ).rejects.toMatchObject({ code: INTENT_NOT_OWNED });
  });

  it("requires authentication", async () => {
    const store = createStore();
    const ctx = createCtx(store, false);

    await expect(
      requireIntentOwner(ctx as never, "settlementIntents:1" as never),
    ).rejects.toMatchObject({ code: UNAUTHORIZED });
  });
});
