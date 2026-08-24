import { afterEach, describe, expect, it } from "vitest";
import { createChatTab } from "@/convex/tabCreation";
import * as tabs from "@/convex/tabs";
import { TOKEN_PROGRAM_ID } from "@/lib/solana/constants";
import { createFakeCtx, type Row } from "../helpers/convexFakeDb";

const run = (fn: unknown, ctx: unknown, args: unknown) =>
  (fn as { _handler: (c: unknown, a: unknown) => Promise<unknown> })._handler(ctx, args);

const args = {
  groupId: "groups:g1",
  name: "Dinner",
  merchantName: "Somtum Der",
  displayCurrency: "THB",
  payerUserId: "users:u1",
  idempotencyKey: "create-dinner-1",
};

describe("group Mini App creation action", () => {
  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it("refreshes stale member/admin evidence before the transactional create", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:test-token";
    const calls: string[] = [];
    const ctx = {
      runQuery: async () => ({
        chatId: "-1001",
        proofs: [
          { telegramUserId: "42", needsRefresh: true },
          { telegramUserId: "84", needsRefresh: true },
        ],
      }),
      runAction: async (_ref: unknown, refreshArgs: Record<string, unknown>) => {
        calls.push("refresh");
        expect(refreshArgs).toMatchObject({
          groupId: "groups:g1",
          chatId: "-1001",
          botId: "123",
        });
      },
      runMutation: async (_ref: unknown, mutationArgs: unknown) => {
        expect(mutationArgs).toEqual(args);
        if (!calls.includes("replay")) {
          calls.push("replay");
          return null;
        }
        calls.push("create");
        return { tabId: "tabs:t1", token: "opaque", duplicate: false };
      },
    };

    await expect(run(createChatTab, ctx, args)).resolves.toMatchObject({ tabId: "tabs:t1" });
    expect(calls).toEqual(["replay", "refresh", "refresh", "create"]);
  });

  it("skips network refresh when both cached facts are fresh", async () => {
    const calls: string[] = [];
    const ctx = {
      runQuery: async () => ({
        chatId: "-1001",
        proofs: [{ telegramUserId: "42", needsRefresh: false }],
      }),
      runAction: async () => { calls.push("refresh"); },
      runMutation: async () => {
        calls.push("create");
        return { tabId: "tabs:t1", token: "opaque", duplicate: true };
      },
    };
    await run(createChatTab, ctx, args);
    expect(calls).toEqual(["create"]);
  });

  it("persists the wrapper's non-default currency and verified receive asset", async () => {
    const now = Date.now();
    const receiveMint = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6A6zK8kU7wsc6EET";
    const store: Record<string, Row[]> = {
      users: [{
        _id: "users:u1",
        privyDid: "did:u1",
        telegramUserId: "42",
        displayName: "Ada",
      }],
      groups: [{
        _id: "groups:g1",
        telegramChatId: "-1001",
        displayName: "Dinner Crew",
        kind: "chat",
        botIsAdmin: true,
        botAdminCheckedAt: now,
        createdAt: now,
        updatedAt: now,
      }],
      groupMembers: [{
        _id: "groupMembers:m1",
        groupId: "groups:g1",
        telegramUserId: "42",
        membershipStatus: "active",
        verificationSource: "getChatMember",
        verifiedAt: now,
      }],
      tokenMetadata: [{
        _id: "tokenMetadata:bonk",
        cluster: "devnet",
        mint: receiveMint,
        symbol: "BONK",
        name: "Bonk",
        decimals: 5,
        verified: true,
        source: "jupiter",
        existsOnChain: true,
        fetchedAt: now,
        decimalsVerifiedAt: now,
        tokenProgramId: TOKEN_PROGRAM_ID,
        updatedAt: now,
      }],
      fxSnapshots: [],
      tabs: [],
      tabParticipants: [],
      tabCreationCounts: [],
      sessionTokens: [],
      telegramStatusMessages: [],
      items: [],
      allocations: [],
      obligations: [],
    };
    const inner = createFakeCtx(store, {
      subject: "did:u1",
      tokenIdentifier: "did:u1",
    });
    const configuredArgs = {
      ...args,
      displayCurrency: "USD",
      receiveMint,
    };
    const actionCtx = {
      runQuery: async () => ({
        chatId: "-1001",
        proofs: [{ telegramUserId: "42", needsRefresh: false }],
      }),
      runAction: async () => {
        throw new Error("fresh evidence must not refresh");
      },
      runMutation: (() => {
        let mutationCall = 0;
        return (_reference: unknown, mutationArgs: unknown) => {
          mutationCall += 1;
          if (mutationCall !== 2) {
            return run(tabs.replayChatTabCreationInternal, inner.ctx, mutationArgs);
          }
          return run(tabs.createChatTabInternal, inner.ctx, mutationArgs);
        };
      })(),
    };

    const result = await run(createChatTab, actionCtx, configuredArgs) as {
      tabId: string;
      token: string;
    };
    expect(result.token).toBeTruthy();
    expect(store.tabs).toHaveLength(1);
    expect(store.tabs![0]).toMatchObject({
      _id: result.tabId,
      defaultCurrency: "USD",
      defaultCurrencyMinorDigits: 2,
      payerUserId: "users:u1",
      recipientUserId: "users:u1",
      recipientAsset: "BONK",
      receiveMint,
      receiveDecimals: 5,
      receiveTokenProgramId: TOKEN_PROGRAM_ID,
    });
    expect(store.tabs![0]!.fxSnapshotId).toBeTruthy();
    expect(store.tabParticipants).toContainEqual(expect.objectContaining({
      tabId: result.tabId,
      userId: "users:u1",
    }));

    store.tabs![0]!.createdAt = now - 24 * 60 * 60 * 1_000;
    store.tokenMetadata = [];
    const replayed = await run(createChatTab, actionCtx, configuredArgs) as {
      tabId: string;
      duplicate: boolean;
    };
    expect(replayed).toMatchObject({ tabId: result.tabId, duplicate: true });
    expect(store.tabs).toHaveLength(1);

    await expect(run(createChatTab, actionCtx, {
      ...configuredArgs,
      name: "Changed configuration",
    })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
});
