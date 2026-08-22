import { describe, expect, it } from "vitest";
import {
  BOT_COMMANDS,
  BOT_NOT_ADMIN,
  NOT_GROUP_MEMBER,
  TabCommandError,
  normalizeBotCommand,
  repairMessageForFailure,
  routeBotCommand,
  startTabForGroup,
} from "../../convex/lib/tabCommandSync";
import {
  MEMBERSHIP_CACHE_TTL_MS,
  isCheckFresh,
  mapChatMemberStatus,
  readMembershipSnapshot,
} from "../../convex/lib/telegramMembership";
import { processTelegramUpdate } from "../../convex/lib/telegramUpdateSync";
import { normalizeTelegramUpdate } from "@/lib/telegram/webhook";
import { createFakeCtx, type Row } from "../helpers/convexFakeDb";

const GROUP_ID = "groups:1" as never;
const NOW = 1_000_000;

function seedGroup(options: { botIsAdmin?: boolean; membershipStatus?: string; verifiedAt?: number } = {}) {
  const store: Record<string, Row[]> = {
    groups: [
      {
        _id: "groups:1",
        telegramChatId: "-1001234567890",
        displayName: "Dinner Crew",
        botIsAdmin: options.botIsAdmin ?? true,
        botAdminCheckedAt: options.verifiedAt ?? NOW,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    groupMembers: [
      {
        _id: "groupMembers:1",
        groupId: "groups:1",
        telegramUserId: "42",
        displayName: "Ada",
        role: "member",
        membershipStatus: options.membershipStatus ?? "active",
        verificationSource: "webhook",
        verifiedAt: options.verifiedAt ?? NOW,
      },
    ],
    users: [
      {
        _id: "users:ada",
        privyDid: "did:privy:ada",
        telegramUserId: "42",
        displayName: "Ada",
      },
    ],
    tabs: [],
    tabParticipants: [],
    tabCreationCounts: [],
    sessionTokens: [],
    items: [],
    allocations: [],
    obligations: [],
    telegramStatusMessages: [],
  };
  return createFakeCtx(store);
}

describe("Story 2.5 — the four commands", () => {
  it("registers /tab, /splitbill, /tip and /balance", () => {
    expect(BOT_COMMANDS).toEqual(["tab", "splitbill", "tip", "balance"]);
  });

  it("routes /splitbill through the same handler as /tab", async () => {
    const { ctx, store } = seedGroup();

    const tab = await routeBotCommand(ctx, {
      command: "tab",
      groupId: GROUP_ID,
      chatId: "-1001234567890",
      fromId: "42",
      now: NOW,
    });
    const splitbill = await routeBotCommand(ctx, {
      command: "splitbill",
      groupId: GROUP_ID,
      chatId: "-1001234567890",
      fromId: "42",
      now: NOW + 120_000,
    });

    expect(tab.handled).toBe(true);
    expect(splitbill.handled).toBe(true);
    expect(store.tabs).toHaveLength(2);
    // One card per tab — never a second message for the same tab.
    expect(store.telegramStatusMessages).toHaveLength(2);
  });

  it("posts no group message for /balance", async () => {
    const { ctx, store } = seedGroup();

    await routeBotCommand(ctx, {
      command: "balance",
      groupId: GROUP_ID,
      chatId: "-1001234567890",
      fromId: "42",
      now: NOW,
    });

    expect(store.telegramStatusMessages).toHaveLength(0);
    expect(store.sessionTokens).toHaveLength(1);
    expect(store.sessionTokens[0]?.subjectKind).toBe("balance");
  });

  it("ignores commands it does not own", () => {
    expect(normalizeBotCommand("help")).toBeNull();
    expect(normalizeBotCommand("start")).toBeNull();
    expect(normalizeBotCommand(null)).toBeNull();
  });

  it("inserts the organizer into the roster when they already have a users row (B7)", async () => {
    const { ctx, store } = seedGroup();

    await startTabForGroup(ctx, {
      groupId: GROUP_ID,
      chatId: "-1001234567890",
      organizerTelegramUserId: "42",
      now: NOW,
    });

    expect(store.tabs![0]).toMatchObject({ origin: "chat", seatPolicy: { kind: "chat" } });
    expect(store.tabParticipants).toHaveLength(1);
    expect(store.tabParticipants![0]).toMatchObject({
      telegramUserId: "42",
      userId: "users:ada",
    });
    expect(typeof store.tabs![0]!.liveInviteToken).toBe("string");
  });
});

describe("binding decision 2 — membership is authoritative", () => {
  it("refuses to start a tab when the bot is not an administrator", async () => {
    const { ctx, store } = seedGroup({ botIsAdmin: false });

    await expect(
      startTabForGroup(ctx, {
        groupId: GROUP_ID,
        chatId: "-1001234567890",
        organizerTelegramUserId: "42",
        now: NOW,
      }),
    ).rejects.toThrow(TabCommandError);

    // Readable, not writable: nothing was created.
    expect(store.tabs).toHaveLength(0);
    expect(store.telegramStatusMessages).toHaveLength(0);
  });

  it("refuses a non-member and says so without naming internals", async () => {
    const { ctx } = seedGroup({ membershipStatus: "left" });

    await expect(
      startTabForGroup(ctx, {
        groupId: GROUP_ID,
        chatId: "-1001234567890",
        organizerTelegramUserId: "42",
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: NOT_GROUP_MEMBER });
  });

  it("offers the organizer a repair, never a stack trace", () => {
    const repair = repairMessageForFailure(BOT_NOT_ADMIN);
    expect(repair).toContain("admin");
    expect(repair).not.toMatch(/error|failed|BOT_NOT_ADMIN/i);
    expect(repairMessageForFailure(NOT_GROUP_MEMBER)).toBe(
      "Only people in this chat can start a tab here.",
    );
  });

  it("treats a check older than five minutes as stale", () => {
    expect(isCheckFresh(NOW, NOW + MEMBERSHIP_CACHE_TTL_MS - 1)).toBe(true);
    expect(isCheckFresh(NOW, NOW + MEMBERSHIP_CACHE_TTL_MS)).toBe(false);
    expect(isCheckFresh(undefined, NOW)).toBe(false);
  });

  it("reports which half of the cache has aged out", async () => {
    const { ctx } = seedGroup({ verifiedAt: NOW - MEMBERSHIP_CACHE_TTL_MS - 1 });
    const snapshot = await readMembershipSnapshot(ctx, {
      groupId: GROUP_ID,
      telegramUserId: "42",
      now: NOW,
    });

    expect(snapshot).toMatchObject({
      memberActive: true,
      memberFresh: false,
      botAdminFresh: false,
      chatId: "-1001234567890",
    });
  });

  it("maps every getChatMember status onto a membership decision", () => {
    expect(mapChatMemberStatus("creator").membershipStatus).toBe("active");
    expect(mapChatMemberStatus("administrator").membershipStatus).toBe("active");
    expect(mapChatMemberStatus("member").membershipStatus).toBe("active");
    expect(mapChatMemberStatus("restricted", true).membershipStatus).toBe("active");
    expect(mapChatMemberStatus("restricted", false).membershipStatus).toBe("restricted");
    expect(mapChatMemberStatus("left").membershipStatus).toBe("left");
    expect(mapChatMemberStatus("kicked").membershipStatus).toBe("kicked");
    expect(mapChatMemberStatus("nonsense").membershipStatus).toBe("left");
  });
});

describe("Story 2.1 — ingress schedules, it does not act", () => {
  function commandUpdate(updateId: number) {
    const normalized = normalizeTelegramUpdate({
      update_id: updateId,
      message: {
        message_id: 77,
        date: 1_700_000_000,
        chat: { id: -1001234567890, type: "supergroup", title: "Dinner Crew" },
        from: { id: 42, first_name: "Ada", username: "ada_test" },
        text: "/tab",
      },
    });
    if (!normalized.ok) {
      throw new Error("expected a normalized update");
    }
    return normalized.update;
  }

  it("hands the command to an action instead of writing a tab inline", async () => {
    const { ctx, store, scheduled } = seedGroup();

    const result = await processTelegramUpdate(ctx, "110201543", commandUpdate(9001), NOW);

    expect(result).toMatchObject({ duplicate: false, outcome: "processed", command: "tab" });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.args).toMatchObject({ command: "tab", fromId: "42" });
    // Nothing privileged happened in the ingress transaction.
    expect(store.tabs).toHaveLength(0);
  });

  it("schedules the command exactly once when Telegram redelivers", async () => {
    const { ctx, scheduled } = seedGroup();

    await processTelegramUpdate(ctx, "110201543", commandUpdate(9001), NOW);
    await processTelegramUpdate(ctx, "110201543", commandUpdate(9001), NOW + 500);

    expect(scheduled).toHaveLength(1);
  });

  it("schedules a private reply for a DM /start and does not invent a group", async () => {
    const { ctx, store, scheduled } = seedGroup();
    const normalized = normalizeTelegramUpdate({
      update_id: 9100,
      message: {
        message_id: 1,
        date: 1_700_000_000,
        chat: { id: 42, type: "private" },
        from: { id: 42, first_name: "Ada", username: "ada_test" },
        text: "/start",
      },
    });
    if (!normalized.ok) {
      throw new Error("expected a normalized update");
    }

    const result = await processTelegramUpdate(ctx, "110201543", normalized.update, NOW);

    expect(result).toMatchObject({ duplicate: false, outcome: "processed", command: "start" });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.args).toMatchObject({
      command: "start",
      commandArg: null,
      fromId: "42",
    });
    expect(store.groups).toHaveLength(1);
  });
});
