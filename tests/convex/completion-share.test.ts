import { afterEach, describe, expect, it } from "vitest";
import { createFakeCtx, type Row } from "../helpers/convexFakeDb";
import * as completionShare from "@/convex/completionShare";
import {
  clampInlineResultId,
  savePreparedInlineMessage,
  PREPARED_INLINE_RESULT_ID_MAX_BYTES,
} from "@/lib/telegram/api";
import { findBannedCopyWords, renderCompletionShare } from "@/lib/telegram/messages";
import { USDC_MINT } from "@/lib/solana/constants";

/* eslint-disable @typescript-eslint/no-explicit-any */
const run = (fn: unknown, ctx: unknown, args: unknown = {}) =>
  (fn as { _handler: (c: unknown, a: unknown) => Promise<any> })._handler(ctx, args);

const DID = {
  maya: "did:privy:maya",
  andre: "did:privy:andre",
  /** In the group, on no tab — the case a group-membership check alone lets through. */
  tim: "did:privy:tim",
  /** In neither. Holds a tab id and nothing else. */
  bob: "did:privy:bob",
};

const identity = (did: string) => ({ subject: did, tokenIdentifier: did });

const FUTURE = Date.now() + 60 * 60 * 1000;

/**
 * One finished bill: Sukhumvit Dinner, ฿1,840.00, three people, both shares
 * settled. Plus the two people who must not be able to mint a share for it.
 */
function world(overrides: { settleSecondShare?: boolean } = {}): Record<string, Row[]> {
  const settled = overrides.settleSecondShare ?? true;

  return {
    users: [
      { _id: "users:maya", privyDid: DID.maya, telegramUserId: "2", displayName: "Maya" },
      { _id: "users:andre", privyDid: DID.andre, telegramUserId: "1", displayName: "Andre" },
      { _id: "users:tim", privyDid: DID.tim, telegramUserId: "3", displayName: "Tim" },
      { _id: "users:bob", privyDid: DID.bob, telegramUserId: "4", displayName: "Bob" },
    ],
    telegramContexts: [
      { _id: "telegramContexts:c1", privyDid: DID.maya, telegramUserId: "2", chatId: "-100", groupId: "groups:g1", initDataHash: "h1", expiresAt: FUTURE },
      { _id: "telegramContexts:c2", privyDid: DID.andre, telegramUserId: "1", chatId: "-100", groupId: "groups:g1", initDataHash: "h2", expiresAt: FUTURE },
      { _id: "telegramContexts:c3", privyDid: DID.tim, telegramUserId: "3", chatId: "-100", groupId: "groups:g1", initDataHash: "h3", expiresAt: FUTURE },
      { _id: "telegramContexts:c4", privyDid: DID.bob, telegramUserId: "4", chatId: "-200", groupId: "groups:g2", initDataHash: "h4", expiresAt: FUTURE },
    ],
    groups: [
      { _id: "groups:g1", telegramChatId: "-100", displayName: "Sukhumvit", botIsAdmin: true, createdAt: 1, updatedAt: 2 },
    ],
    groupMembers: [
      { _id: "groupMembers:m1", groupId: "groups:g1", telegramUserId: "2", displayName: "Maya", role: "creator", membershipStatus: "active", verificationSource: "webhook", verifiedAt: 1 },
      { _id: "groupMembers:m2", groupId: "groups:g1", telegramUserId: "1", displayName: "Andre", role: "member", membershipStatus: "active", verificationSource: "webhook", verifiedAt: 1 },
      // Tim is a group member but not on the tab.
      { _id: "groupMembers:m3", groupId: "groups:g1", telegramUserId: "3", displayName: "Tim", role: "member", membershipStatus: "active", verificationSource: "webhook", verifiedAt: 1 },
    ],
    tabs: [
      {
        _id: "tabs:t1",
        groupId: "groups:g1",
        organizerTelegramUserId: "2",
        name: "Sukhumvit Dinner",
        status: "locked",
        defaultCurrency: "THB",
        revision: 3,
        lockedRevision: 3,
        billTotalMinor: 184_000n,
        createdAt: 1,
        updatedAt: 20,
      },
    ],
    tabParticipants: [
      { _id: "tabParticipants:p1", tabId: "tabs:t1", userId: "users:maya", telegramUserId: "2", joinedAt: 1 },
      { _id: "tabParticipants:p2", tabId: "tabs:t1", userId: "users:andre", telegramUserId: "1", joinedAt: 1 },
      { _id: "tabParticipants:p3", tabId: "tabs:t1", userId: "users:noi", telegramUserId: "5", joinedAt: 1 },
    ],
    items: [
      { _id: "items:i1", tabId: "tabs:t1", name: "Pad thai", lineTotalMinor: 92_000n, quantity: 1, position: 0, createdAt: 1, updatedAt: 1 },
      { _id: "items:i2", tabId: "tabs:t1", name: "Som tam", lineTotalMinor: 92_000n, quantity: 1, position: 1, createdAt: 1, updatedAt: 1 },
    ],
    allocations: [
      { _id: "allocations:a1", tabId: "tabs:t1", itemId: "items:i1", userId: "users:andre", createdAt: 1, updatedAt: 1 },
      { _id: "allocations:a2", tabId: "tabs:t1", itemId: "items:i2", userId: "users:noi", createdAt: 1, updatedAt: 1 },
    ],
    obligations: [
      {
        _id: "obligations:o1",
        groupId: "groups:g1",
        tabId: "tabs:t1",
        tabRevision: 3,
        debtorUserId: "users:andre",
        creditorUserId: "users:maya",
        displayAmountThbMinor: 92_000n,
        billSnapshotHash: "hash-1",
        amountAtomic: 26_000_000n,
        outputMint: USDC_MINT,
        status: "settled",
        createdAt: 2,
        updatedAt: 5,
      },
      {
        _id: "obligations:o2",
        groupId: "groups:g1",
        tabId: "tabs:t1",
        tabRevision: 3,
        debtorUserId: "users:noi",
        creditorUserId: "users:maya",
        displayAmountThbMinor: 92_000n,
        billSnapshotHash: "hash-2",
        amountAtomic: 26_000_000n,
        outputMint: USDC_MINT,
        status: settled ? "settled" : "open",
        createdAt: 2,
        updatedAt: 5,
      },
    ],
    obligationLedgerEvents: [],
  };
}

describe("convex/completionShare — who may mint a share, and for what", () => {
  it("gives a participant on a finished bill the prepared-message facts", async () => {
    const { ctx } = createFakeCtx(world(), identity(DID.andre));
    const facts = await run(completionShare.completionShareFacts, ctx, {
      tabId: "tabs:t1",
    });

    expect(facts.telegramUserId).toBe("1");
    expect(facts.title).toBe("Sukhumvit Dinner is all square");
    expect(facts.description).toBe("3 people · ฿1,840.00 total");
    expect(facts.messageText).toBe(
      "🍜 Sukhumvit Dinner is all square\n3 people · ฿1,840.00 total\nAll 2 shares settled.",
    );
  });

  it("refuses a group member who is not on the tab", async () => {
    const { ctx } = createFakeCtx(world(), identity(DID.tim));
    await expect(
      run(completionShare.completionShareFacts, ctx, { tabId: "tabs:t1" }),
    ).rejects.toThrow("NOT_TAB_PARTICIPANT");
  });

  it("refuses a stranger holding the tab id", async () => {
    const { ctx } = createFakeCtx(world(), identity(DID.bob));
    await expect(
      run(completionShare.completionShareFacts, ctx, { tabId: "tabs:t1" }),
    ).rejects.toThrow(/NOT_GROUP_MEMBER|NOT_TAB_PARTICIPANT/);
  });

  it("refuses an unauthenticated caller", async () => {
    const { ctx } = createFakeCtx(world(), null);
    await expect(
      run(completionShare.completionShareFacts, ctx, { tabId: "tabs:t1" }),
    ).rejects.toThrow(/UNAUTHORIZED|TELEGRAM_CONTEXT_REQUIRED/);
  });

  it("refuses a participant whose bill is not finished", async () => {
    const { ctx } = createFakeCtx(
      world({ settleSecondShare: false }),
      identity(DID.andre),
    );
    await expect(
      run(completionShare.completionShareFacts, ctx, { tabId: "tabs:t1" }),
    ).rejects.toThrow(completionShare.BILL_NOT_COMPLETE);
  });

  it("keys the inline result on the bill — the tab at ONE locked revision", async () => {
    const { ctx } = createFakeCtx(world(), identity(DID.andre));
    const facts = await run(completionShare.completionShareFacts, ctx, {
      tabId: "tabs:t1",
    });

    expect(facts.resultId).toBe("allsquare:tabs:t1:3");
    expect(new TextEncoder().encode(facts.resultId).length).toBeLessThanOrEqual(
      PREPARED_INLINE_RESULT_ID_MAX_BYTES,
    );
  });
});

describe("NFR-7 — what a shared completion is allowed to say", () => {
  const copy = renderCompletionShare({
    tabName: "Sukhumvit Dinner",
    peopleCount: 5,
    billTotalMinor: 184_000,
    claimedItemCount: 8,
    totalItemCount: 8,
    settledShareCount: 5,
    totalShareCount: 5,
  });

  const everything = `${copy.title}\n${copy.description}\n${copy.messageText}`;

  it("is the group's own bill_completed card, word for word", () => {
    expect(copy.messageText).toBe(
      "🍜 Sukhumvit Dinner is all square\n5 people · ฿1,840.00 total\nAll 5 shares settled.",
    );
  });

  it("previews as the same two lines the message opens with", () => {
    expect(copy.title).toBe("Sukhumvit Dinner is all square");
    expect(copy.description).toBe("5 people · ฿1,840.00 total");
    expect(copy.messageText.startsWith(`🍜 ${copy.title}`)).toBe(true);
    expect(copy.messageText.split("\n")[1]).toBe(copy.description);
  });

  it("never rounds the total", () => {
    expect(everything).toContain("฿1,840.00");
    expect(everything).not.toContain("฿1,840 ");
    expect(everything).not.toMatch(/฿1\.8k/i);
  });

  it("names no person, no individual amount, no address and no link", () => {
    for (const name of ["Maya", "Andre", "Noi", "Tim"]) {
      expect(everything).not.toContain(name);
    }
    // The bill total is the ONLY figure in the message. ฿920.00 — one person's
    // share of it — appears nowhere.
    expect(copy.messageText.match(/฿/g)).toHaveLength(1);
    expect(everything).not.toContain("฿920.00");
    expect(everything).not.toMatch(/https?:\/\//);
    expect(everything).not.toMatch(/solscan|explorer/i);
    // A base58 address is 32-44 chars of that alphabet; nothing here is close.
    expect(everything).not.toMatch(/[1-9A-HJ-NP-Za-km-z]{32,}/);
  });

  it("uses none of the banned words", () => {
    expect(findBannedCopyWords(everything)).toEqual([]);
  });

  it("says 1 person, not 1 people", () => {
    const single = renderCompletionShare({
      tabName: "Solo Lunch",
      peopleCount: 1,
      billTotalMinor: 12_500,
      claimedItemCount: 1,
      totalItemCount: 1,
      settledShareCount: 1,
      totalShareCount: 1,
    });
    expect(single.description).toBe("1 person · ฿125.00 total");
  });
});

describe("Bot API 8.0 — savePreparedInlineMessage", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  async function capture(): Promise<{ url: string; body: Record<string, unknown> }> {
    let seen: { url: string; body: Record<string, unknown> } | null = null;

    const fetchImpl = (async (url: unknown, init: unknown) => {
      seen = {
        url: String(url),
        body: JSON.parse((init as { body: string }).body) as Record<string, unknown>,
      };
      return {
        status: 200,
        json: async () => ({
          ok: true,
          result: { id: "prepared-abc", expiration_date: 1_800_000_000 },
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const result = await savePreparedInlineMessage(
      "123:TOKEN",
      {
        userId: "42",
        result: {
          type: "article",
          id: "allsquare:tabs:t1:3",
          title: "Sukhumvit Dinner is all square",
          description: "5 people · ฿1,840.00 total",
          input_message_content: {
            message_text: "🍜 Sukhumvit Dinner is all square",
            link_preview_options: { is_disabled: true },
          },
        },
        allowUserChats: true,
        allowBotChats: false,
        allowGroupChats: true,
        allowChannelChats: false,
      },
      { fetchImpl, env: { ENVIRONMENT: "production" } },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.id).toBe("prepared-abc");
      expect(result.result.expiration_date).toBe(1_800_000_000);
    }

    return seen!;
  }

  it("calls the method by its exact Bot API name", async () => {
    const { url } = await capture();
    expect(url).toBe("https://api.telegram.org/bot123:TOKEN/savePreparedInlineMessage");
  });

  it("sends user_id as a number and the article as `result`", async () => {
    const { body } = await capture();
    expect(body.user_id).toBe(42);
    expect(body.result).toMatchObject({
      type: "article",
      id: "allsquare:tabs:t1:3",
      title: "Sukhumvit Dinner is all square",
    });
  });

  it("opens the sheet to groups and people, never to channels or bots", async () => {
    const { body } = await capture();
    expect(body.allow_group_chats).toBe(true);
    expect(body.allow_user_chats).toBe(true);
    expect(body.allow_channel_chats).toBe(false);
    expect(body.allow_bot_chats).toBe(false);
  });

  it("defaults every allow_* flag closed", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_url: unknown, init: unknown) => {
      body = JSON.parse((init as { body: string }).body) as Record<string, unknown>;
      return {
        status: 200,
        json: async () => ({ ok: true, result: { id: "x", expiration_date: 1 } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await savePreparedInlineMessage(
      "123:TOKEN",
      {
        userId: "42",
        result: {
          type: "article",
          id: "x",
          title: "t",
          input_message_content: { message_text: "m" },
        },
      },
      { fetchImpl, env: { ENVIRONMENT: "production" } },
    );

    expect(body.allow_user_chats).toBe(false);
    expect(body.allow_bot_chats).toBe(false);
    expect(body.allow_group_chats).toBe(false);
    expect(body.allow_channel_chats).toBe(false);
  });

  it("holds the inline result id to the Bot API's 64-byte ceiling", () => {
    const long = `allsquare:${"t".repeat(200)}`;
    const clamped = clampInlineResultId(long);
    expect(new TextEncoder().encode(clamped).length).toBe(
      PREPARED_INLINE_RESULT_ID_MAX_BYTES,
    );
    expect(clampInlineResultId("short")).toBe("short");
  });
});
