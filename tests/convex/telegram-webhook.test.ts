import { describe, expect, it } from "vitest";
import {
  FIXTURE_TELEGRAM_WEBHOOK_SECRET,
  extractBotIdFromToken,
  normalizeTelegramUpdate,
  verifyWebhookSecret,
} from "@/lib/telegram/webhook";
import {
  getTelegramWebhookSecret,
  isTelegramWebhookFixtureMode,
} from "../../convex/lib/telegramWebhook";
import { FixtureModeNotPermittedError } from "../../lib/solana/runtimeGuard";
import { resolveGroupFromChat } from "../../convex/lib/groupSync";
import { processTelegramUpdate } from "../../convex/lib/telegramUpdateSync";

const GROUP_CHAT = {
  id: -1001234567890,
  type: "supergroup",
  title: "Dinner Crew",
};

const TEST_USER = {
  id: 42,
  first_name: "Ada",
  username: "ada_test",
};

function restoreWebhookEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    (process.env as Record<string, string>)[key] = value;
  }
}

function buildMessageUpdate(overrides: Record<string, unknown> = {}) {
  const { message: messageOverrides, ...rest } = overrides;
  return {
    update_id: 9001,
    message: {
      message_id: 77,
      date: 1_700_000_000,
      chat: GROUP_CHAT,
      from: TEST_USER,
      text: "/tab",
      ...((messageOverrides as Record<string, unknown>) ?? {}),
    },
    ...rest,
  };
}

describe("Story 2.1 — webhook secret verification (AC1)", () => {
  it("accepts a matching secret token", () => {
    expect(
      verifyWebhookSecret(FIXTURE_TELEGRAM_WEBHOOK_SECRET, FIXTURE_TELEGRAM_WEBHOOK_SECRET),
    ).toBe(true);
  });

  it("rejects a missing secret header", () => {
    expect(verifyWebhookSecret(null, FIXTURE_TELEGRAM_WEBHOOK_SECRET)).toBe(false);
    expect(verifyWebhookSecret(undefined, FIXTURE_TELEGRAM_WEBHOOK_SECRET)).toBe(false);
  });

  it("rejects a wrong secret without accepting it", () => {
    expect(verifyWebhookSecret("wrong-secret", FIXTURE_TELEGRAM_WEBHOOK_SECRET)).toBe(false);
  });

  it("extracts bot id from a Telegram token prefix", () => {
    expect(extractBotIdFromToken("110201543:AAHdqTcvCH1vGWJxfSeofS0kBmgHdeDZ8mQ")).toBe(
      "110201543",
    );
    expect(extractBotIdFromToken("fixture-telegram-bot-token")).toBe("fixture-bot");
  });

  it("fixture mode activates only under the test runner, never on a deployment", () => {
    const original = process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    try {
      expect(isTelegramWebhookFixtureMode()).toBe(true);
      expect(getTelegramWebhookSecret()).toBe(FIXTURE_TELEGRAM_WEBHOOK_SECRET);
    } finally {
      if (original !== undefined) {
        process.env.TELEGRAM_WEBHOOK_SECRET = original;
      }
    }
  });

  it("refuses the fixture secret on a real deployment rather than substituting it", () => {
    // Substituting a published secret would make the webhook header guessable,
    // so every update in the world would authenticate.
    const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const originalCloud = process.env.CONVEX_CLOUD_URL;
    const originalVitest = process.env.VITEST;
    const originalWorker = process.env.VITEST_WORKER_ID;
    const originalNodeEnv = process.env.NODE_ENV;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.CONVEX_CLOUD_URL = "https://example-deployment.convex.cloud";
    delete process.env.VITEST;
    delete process.env.VITEST_WORKER_ID;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      expect(isTelegramWebhookFixtureMode()).toBe(false);
      expect(() => getTelegramWebhookSecret()).toThrow(FixtureModeNotPermittedError);
    } finally {
      restoreWebhookEnv("TELEGRAM_WEBHOOK_SECRET", originalSecret);
      restoreWebhookEnv("CONVEX_CLOUD_URL", originalCloud);
      restoreWebhookEnv("VITEST", originalVitest);
      restoreWebhookEnv("VITEST_WORKER_ID", originalWorker);
      restoreWebhookEnv("NODE_ENV", originalNodeEnv);
    }
  });
});

describe("Story 2.1 — update normalization (AC2, AC5)", () => {
  it("normalizes a group message with command fields", () => {
    const result = normalizeTelegramUpdate(buildMessageUpdate());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.update).toEqual({
        kind: "message",
        updateId: 9001,
        chatId: "-1001234567890",
        chatType: "supergroup",
        fromId: "42",
        messageId: 77,
        command: "tab",
        commandArg: null,
        chatTitle: "Dinner Crew",
        fromDisplayName: "Ada",
        fromUsername: "ada_test",
        fromAvatarUrl: undefined,
      });
    }
  });

  it("normalizes chat_member lifecycle updates", () => {
    const result = normalizeTelegramUpdate({
      update_id: 9002,
      chat_member: {
        chat: GROUP_CHAT,
        from: TEST_USER,
        date: 1_700_000_000,
        old_chat_member: { user: TEST_USER, status: "member" },
        new_chat_member: { user: TEST_USER, status: "left" },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.update.kind).toBe("chat_member");
      if (result.update.kind === "chat_member") {
        expect(result.update.membershipStatus).toBe("left");
        expect(result.update.role).toBe("left");
      }
    }
  });

  it("normalizes a private /start instead of dropping it", () => {
    const result = normalizeTelegramUpdate({
      update_id: 9100,
      message: {
        message_id: 1,
        date: 1_700_000_000,
        chat: { id: 42, type: "private" },
        from: TEST_USER,
        text: "/start",
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.update.kind === "message") {
      expect(result.update.chatType).toBe("private");
      expect(result.update.command).toBe("start");
      expect(result.update.commandArg).toBeNull();
    }
  });

  it("parses a /start payload for the recovery path", () => {
    const result = normalizeTelegramUpdate({
      update_id: 9101,
      message: {
        message_id: 2,
        date: 1_700_000_000,
        chat: { id: 42, type: "private" },
        from: TEST_USER,
        text: "/start opaque-token-1",
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.update.kind === "message") {
      expect(result.update.command).toBe("start");
      expect(result.update.commandArg).toBe("opaque-token-1");
    }
  });

  it("acknowledges unsupported updates without domain fields", () => {
    const result = normalizeTelegramUpdate({ update_id: 9003, edited_message: { message_id: 1 } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.update).toEqual({ kind: "unsupported", updateId: 9003 });
    }
  });

  it("rejects bodies without update_id", () => {
    expect(normalizeTelegramUpdate({ message: { message_id: 1 } })).toEqual({
      ok: false,
      code: "MISSING_UPDATE_ID",
    });
  });
});

describe("Story 2.1 — idempotency by update id (AC4)", () => {
  type TelegramUpdateDoc = {
    _id: string;
    botId: string;
    updateId: number;
    processedAt: number;
    outcome: "processed" | "ignored" | "duplicate";
  };

  type GroupDoc = {
    _id: string;
    telegramChatId: string;
    displayName: string;
    botIsAdmin: boolean;
    createdAt: number;
    updatedAt: number;
  };

  type GroupMemberDoc = {
    _id: string;
    groupId: string;
    telegramUserId: string;
    displayName: string;
    role: string;
    membershipStatus: string;
    verificationSource: string;
    verifiedAt: number;
  };

  function createProcessUpdateStore() {
    const telegramUpdates: TelegramUpdateDoc[] = [];
    const groups: GroupDoc[] = [];
    const groupMembers: GroupMemberDoc[] = [];
    let nextId = 1;

    const ctx = {
      scheduler: {
        runAfter: async () => "scheduled:1",
      },
      db: {
        query: (table: string) => ({
          withIndex: (
            _index: string,
            builder: (q: {
              eq: (field: string, value: string | number | boolean) => unknown;
            }) => unknown,
          ) => {
            const filters: Record<string, string | number | boolean> = {};
            const filterBuilder = {
              eq: (field: string, value: string | number | boolean) => {
                filters[field] = value;
                return filterBuilder;
              },
            };
            builder(filterBuilder);

            const matchTelegramUpdates = () =>
              telegramUpdates.filter((row) =>
                Object.entries(filters).every(([field, value]) => {
                  return row[field as keyof TelegramUpdateDoc] === value;
                }),
              );

            const matchGroups = () =>
              groups.filter((row) =>
                Object.entries(filters).every(([field, value]) => {
                  return row[field as keyof GroupDoc] === value;
                }),
              );

            const matchGroupMembers = () =>
              groupMembers.filter((row) =>
                Object.entries(filters).every(([field, value]) => {
                  return row[field as keyof GroupMemberDoc] === value;
                }),
              );

            const matches =
              table === "telegramUpdates"
                ? matchTelegramUpdates()
                : table === "groups"
                  ? matchGroups()
                  : table === "groupMembers"
                    ? matchGroupMembers()
                    : [];

            return {
              unique: async () => matches[0] ?? null,
              collect: async () => matches,
            };
          },
        }),
        insert: async (table: string, doc: Record<string, unknown>) => {
          const id = `${table}:${nextId++}`;
          if (table === "telegramUpdates") {
            telegramUpdates.push({ _id: id, ...(doc as Omit<TelegramUpdateDoc, "_id">) });
          } else if (table === "groups") {
            groups.push({ _id: id, ...(doc as Omit<GroupDoc, "_id">) });
          } else if (table === "groupMembers") {
            groupMembers.push({ _id: id, ...(doc as Omit<GroupMemberDoc, "_id">) });
          }
          return id;
        },
        patch: async (id: string, patch: Record<string, unknown>) => {
          const updateRow = <T extends { _id: string }>(rows: T[]) => {
            const index = rows.findIndex((row) => row._id === id);
            if (index >= 0) {
              rows[index] = { ...rows[index]!, ...patch } as T;
            }
          };
          updateRow(telegramUpdates);
          updateRow(groups);
          updateRow(groupMembers);
        },
        get: async (id: string) => groups.find((group) => group._id === id) ?? null,
      },
    };

    return { ctx, telegramUpdates, groups, groupMembers };
  }

  it("persists exactly one telegramUpdates row when the same payload is replayed", async () => {
    const { ctx, telegramUpdates, groups, groupMembers } = createProcessUpdateStore();
    const normalized = normalizeTelegramUpdate(
      buildMessageUpdate({ message: { text: "hello everyone" } }),
    );
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) {
      return;
    }

    const first = await processTelegramUpdate(ctx as never, "110201543", normalized.update, 1_000);
    const second = await processTelegramUpdate(ctx as never, "110201543", normalized.update, 2_000);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(telegramUpdates).toHaveLength(1);
    expect(groups).toHaveLength(1);
    expect(groupMembers).toHaveLength(1);
  });

  it("records ignored unsupported updates once without group writes", async () => {
    const { ctx, telegramUpdates, groups } = createProcessUpdateStore();
    const normalized = normalizeTelegramUpdate({ update_id: 4242, callback_query: { id: "1" } });
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) {
      return;
    }

    await processTelegramUpdate(ctx as never, "110201543", normalized.update);
    await processTelegramUpdate(ctx as never, "110201543", normalized.update);

    expect(telegramUpdates).toHaveLength(1);
    expect(telegramUpdates[0]?.outcome).toBe("ignored");
    expect(groups).toHaveLength(0);
  });
});

describe("Story 2.2 — resolveGroupFromChat (AC1, AC2)", () => {
  it("creates a group keyed by verified chat id and stores member profile fields", async () => {
    const groups: Array<Record<string, unknown>> = [];
    const groupMembers: Array<Record<string, unknown>> = [];
    let nextId = 1;

    const ctx = {
      db: {
        query: (table: string) => ({
          withIndex: (
            _index: string,
            builder: (q: { eq: (field: string, value: string) => unknown }) => unknown,
          ) => {
            const filters: Record<string, string> = {};
            const filterBuilder = {
              eq: (field: string, value: string) => {
                filters[field] = value;
                return filterBuilder;
              },
            };
            builder(filterBuilder);

            const rows = table === "groups" ? groups : groupMembers;
            const matches = rows.filter((row) =>
              Object.entries(filters).every(([field, value]) => row[field] === value),
            );

            return {
              unique: async () => matches[0] ?? null,
            };
          },
        }),
        insert: async (table: string, doc: Record<string, unknown>) => {
          const id = `${table}:${nextId++}`;
          if (table === "groups") {
            groups.push({ _id: id, ...doc });
          } else {
            groupMembers.push({ _id: id, ...doc });
          }
          return id;
        },
        patch: async (id: string, patch: Record<string, unknown>) => {
          const rows = [...groups, ...groupMembers];
          const row = rows.find((entry) => entry._id === id);
          if (row) {
            Object.assign(row, patch);
          }
        },
      },
    };

    const normalized = normalizeTelegramUpdate(buildMessageUpdate());
    expect(normalized.ok).toBe(true);
    if (!normalized.ok || normalized.update.kind !== "message") {
      return;
    }

    const result = await resolveGroupFromChat(ctx as never, normalized.update, 5_000);
    expect(result.groupId).toBe("groups:1");
    expect(groups[0]).toMatchObject({
      telegramChatId: "-1001234567890",
      displayName: "Dinner Crew",
    });
    expect(groupMembers[0]).toMatchObject({
      telegramUserId: "42",
      displayName: "Ada",
      membershipStatus: "active",
      verificationSource: "webhook",
    });
  });
});
