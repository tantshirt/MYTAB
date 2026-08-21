import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mintSessionToken } from "./sessionTokenOps";
import { publishTabOpenedCard } from "./telegramBot";
import { utcDayKey } from "./sessionTokenSync";

export const TAB_CREATION_DEDUP_MS = 60_000;
export const MAX_OPEN_TABS_PER_GROUP = 10;
export const MAX_TABS_PER_USER_PER_DAY = 10;
export const MAX_TABS_PER_GROUP_PER_DAY = 30;

export const TAB_RATE_LIMITED = "TAB_RATE_LIMITED";
export const NOT_GROUP_MEMBER = "NOT_GROUP_MEMBER";

export type TabCommandFailureCode =
  | typeof TAB_RATE_LIMITED
  | typeof NOT_GROUP_MEMBER;

export class TabCommandError extends Error {
  constructor(public readonly code: TabCommandFailureCode) {
    super(code);
    this.name = "TabCommandError";
  }
}

async function countOpenTabsForGroup(ctx: MutationCtx, groupId: Id<"groups">) {
  const tabs = await ctx.db
    .query("tabs")
    .withIndex("by_group_id", (q) => q.eq("groupId", groupId))
    .collect();
  return tabs.filter((tab) => tab.status === "draft" || tab.status === "open").length;
}

async function countTabsCreatedToday(
  ctx: MutationCtx,
  filter: { groupId?: Id<"groups">; telegramUserId?: string },
  dayKey: string,
) {
  const rows = await ctx.db
    .query("tabCreationCounts")
    .withIndex("by_scope_day", (q) => {
      if (filter.groupId) {
        return q.eq("scopeKind", "group").eq("scopeKey", filter.groupId).eq("dayKey", dayKey);
      }
      return q
        .eq("scopeKind", "user")
        .eq("scopeKey", filter.telegramUserId!)
        .eq("dayKey", dayKey);
    })
    .unique();
  return rows?.count ?? 0;
}

async function incrementTabCreationCount(
  ctx: MutationCtx,
  scopeKind: "user" | "group",
  scopeKey: string,
  dayKey: string,
  now: number,
) {
  const existing = await ctx.db
    .query("tabCreationCounts")
    .withIndex("by_scope_day", (q) =>
      q.eq("scopeKind", scopeKind).eq("scopeKey", scopeKey).eq("dayKey", dayKey),
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      count: existing.count + 1,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("tabCreationCounts", {
    scopeKind,
    scopeKey,
    dayKey,
    count: 1,
    updatedAt: now,
  });
}

async function assertTabCreationAllowed(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  telegramUserId: string,
  now: number,
) {
  const dayKey = utcDayKey(now);
  const openCount = await countOpenTabsForGroup(ctx, groupId);
  if (openCount >= MAX_OPEN_TABS_PER_GROUP) {
    throw new TabCommandError(TAB_RATE_LIMITED);
  }

  const userDaily = await countTabsCreatedToday(ctx, { telegramUserId }, dayKey);
  if (userDaily >= MAX_TABS_PER_USER_PER_DAY) {
    throw new TabCommandError(TAB_RATE_LIMITED);
  }

  const groupDaily = await countTabsCreatedToday(ctx, { groupId }, dayKey);
  if (groupDaily >= MAX_TABS_PER_GROUP_PER_DAY) {
    throw new TabCommandError(TAB_RATE_LIMITED);
  }
}

async function assertActiveMember(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  telegramUserId: string,
) {
  const membership = await ctx.db
    .query("groupMembers")
    .withIndex("by_group_and_telegram_user_id", (q) =>
      q.eq("groupId", groupId).eq("telegramUserId", telegramUserId),
    )
    .unique();

  if (!membership || membership.membershipStatus !== "active") {
    throw new TabCommandError(NOT_GROUP_MEMBER);
  }
}

async function findRecentDuplicateTab(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  telegramUserId: string,
  now: number,
) {
  const recent = await ctx.db
    .query("tabs")
    .withIndex("by_group_and_organizer", (q) =>
      q.eq("groupId", groupId).eq("organizerTelegramUserId", telegramUserId),
    )
    .collect();

  const latest = recent.sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!latest) {
    return null;
  }
  if (now - latest.createdAt > TAB_CREATION_DEDUP_MS) {
    return null;
  }
  return latest;
}

export type StartTabResult = {
  tabId: Id<"tabs">;
  token: string;
  duplicate: boolean;
};

/** Handles /tab and /splitbill — creates tab, token, and status card (Story 2.3). */
export async function startTabForGroup(
  ctx: MutationCtx,
  input: {
    groupId: Id<"groups">;
    chatId: string;
    organizerTelegramUserId: string;
    tabName?: string;
    now?: number;
  },
): Promise<StartTabResult> {
  const now = input.now ?? Date.now();
  await assertActiveMember(ctx, input.groupId, input.organizerTelegramUserId);

  const duplicateTab = await findRecentDuplicateTab(
    ctx,
    input.groupId,
    input.organizerTelegramUserId,
    now,
  );
  if (duplicateTab) {
    return { tabId: duplicateTab._id, token: "", duplicate: true };
  }

  await assertTabCreationAllowed(ctx, input.groupId, input.organizerTelegramUserId, now);

  const tabName = input.tabName?.trim() || "New tab";
  const tabId = await ctx.db.insert("tabs", {
    groupId: input.groupId,
    organizerTelegramUserId: input.organizerTelegramUserId,
    name: tabName,
    status: "draft",
    defaultCurrency: "THB",
    recipientAsset: "USDC",
    createdAt: now,
    updatedAt: now,
  });

  const { token } = await mintSessionToken(ctx, {
    tokenType: "tab_session",
    subjectKind: "tab",
    subjectId: tabId,
    groupId: input.groupId,
    now,
  });

  await publishTabOpenedCard(ctx, {
    tabId,
    chatId: input.chatId,
    tabName,
    opaqueToken: token,
    now,
  });

  const dayKey = utcDayKey(now);
  await incrementTabCreationCount(ctx, "user", input.organizerTelegramUserId, dayKey, now);
  await incrementTabCreationCount(ctx, "group", input.groupId, dayKey, now);

  return { tabId, token, duplicate: false };
}

/** Handles /tip — mints scoped tip session token and posts card (Story 2.5 AC2). */
export async function startTipSessionForGroup(
  ctx: MutationCtx,
  input: {
    groupId: Id<"groups">;
    chatId: string;
    senderTelegramUserId: string;
    now?: number;
  },
): Promise<{ token: string }> {
  const now = input.now ?? Date.now();
  await assertActiveMember(ctx, input.groupId, input.senderTelegramUserId);

  const tipTabId = await ctx.db.insert("tabs", {
    groupId: input.groupId,
    organizerTelegramUserId: input.senderTelegramUserId,
    name: "Tip",
    status: "open",
    defaultCurrency: "THB",
    recipientAsset: "USDC",
    createdAt: now,
    updatedAt: now,
  });

  const { token } = await mintSessionToken(ctx, {
    tokenType: "action_token",
    subjectKind: "tip",
    subjectId: tipTabId,
    groupId: input.groupId,
    now,
  });

  await publishTabOpenedCard(ctx, {
    tabId: tipTabId,
    chatId: input.chatId,
    tabName: "Tip",
    opaqueToken: token,
    now,
  });

  return { token };
}

/** Handles /balance — scoped session, no group message (Story 2.5 AC3). */
export async function startBalanceSessionForGroup(
  ctx: MutationCtx,
  input: {
    groupId: Id<"groups">;
    senderTelegramUserId: string;
    now?: number;
  },
): Promise<{ token: string }> {
  const now = input.now ?? Date.now();
  await assertActiveMember(ctx, input.groupId, input.senderTelegramUserId);

  const subjectId = `balance:${input.groupId}:${input.senderTelegramUserId}`;
  const { token } = await mintSessionToken(ctx, {
    tokenType: "action_token",
    subjectKind: "balance",
    subjectId,
    groupId: input.groupId,
    now,
  });

  return { token };
}

export const BOT_COMMANDS = ["tab", "splitbill", "tip", "balance"] as const;
export type BotCommand = (typeof BOT_COMMANDS)[number];

export function normalizeBotCommand(command: string | null): BotCommand | null {
  if (!command) {
    return null;
  }
  const normalized = command.toLowerCase();
  if ((BOT_COMMANDS as readonly string[]).includes(normalized)) {
    return normalized as BotCommand;
  }
  return null;
}

/** Routes supported bot commands after group resolution (Stories 2.3, 2.5). */
export async function routeBotCommand(
  ctx: MutationCtx,
  input: {
    command: BotCommand;
    groupId: Id<"groups">;
    chatId: string;
    fromId: string;
    chatTitle?: string;
    now?: number;
  },
): Promise<{ handled: true; command: BotCommand } | { handled: false }> {
  const now = input.now ?? Date.now();

  switch (input.command) {
    case "tab":
    case "splitbill":
      await startTabForGroup(ctx, {
        groupId: input.groupId,
        chatId: input.chatId,
        organizerTelegramUserId: input.fromId,
        tabName: input.chatTitle ? `${input.chatTitle} tab` : undefined,
        now,
      });
      return { handled: true, command: input.command };
    case "tip":
      await startTipSessionForGroup(ctx, {
        groupId: input.groupId,
        chatId: input.chatId,
        senderTelegramUserId: input.fromId,
        now,
      });
      return { handled: true, command: "tip" };
    case "balance":
      await startBalanceSessionForGroup(ctx, {
        groupId: input.groupId,
        senderTelegramUserId: input.fromId,
        now,
      });
      return { handled: true, command: "balance" };
    default:
      return { handled: false };
  }
}
