import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  renderBotAdminRepairMessage,
  renderNotAMemberMessage,
  renderRateLimitedMessage,
} from "../../lib/telegram/messages";
import { ensureOrganizerParticipant, mintSessionToken, persistLiveInviteToken } from "./sessionTokenOps";
import { publishTabOpenedCard } from "./telegramBot";
import {
  MEMBERSHIP_FAILURE,
  MembershipError,
  assertPrivilegedActionAllowed,
} from "./telegramMembership";
import { utcDayKey } from "./sessionTokenSync";

export const TAB_CREATION_DEDUP_MS = 60_000;
export const MAX_OPEN_TABS_PER_GROUP = 10;
export const MAX_TABS_PER_USER_PER_DAY = 10;
export const MAX_TABS_PER_GROUP_PER_DAY = 30;

export const TAB_RATE_LIMITED = "TAB_RATE_LIMITED";
export const NOT_GROUP_MEMBER = "NOT_GROUP_MEMBER";
export const BOT_NOT_ADMIN = "BOT_NOT_ADMIN";
export const GROUP_NOT_FOUND = "GROUP_NOT_FOUND";

export type TabCommandFailureCode =
  | typeof TAB_RATE_LIMITED
  | typeof NOT_GROUP_MEMBER
  | typeof BOT_NOT_ADMIN
  | typeof GROUP_NOT_FOUND;

export class TabCommandError extends Error {
  constructor(public readonly code: TabCommandFailureCode) {
    super(code);
    this.name = "TabCommandError";
  }
}

/**
 * What the group reads when a command cannot run.
 *
 * A membership or bot-admin failure leaves the tab readable and disables
 * mutations with a repair message (binding decision 2) — the reply names the
 * fix, never the internals. `null` means say nothing at all: a stranger typing
 * in a chat we do not manage gets silence, not a lecture.
 */
export function repairMessageForFailure(code: TabCommandFailureCode): string | null {
  switch (code) {
    case BOT_NOT_ADMIN:
      return renderBotAdminRepairMessage();
    case NOT_GROUP_MEMBER:
      return renderNotAMemberMessage();
    case TAB_RATE_LIMITED:
      return renderRateLimitedMessage();
    case GROUP_NOT_FOUND:
      return null;
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

/**
 * The privilege gate for every command that writes.
 *
 * Both halves of binding decision 2 are enforced here: the person must be an
 * active member, and the bot must be an administrator. The freshness half is
 * enforced one level up, in the command action, which proves both against
 * `getChatMember` before calling into this mutation when the cache has aged
 * past five minutes.
 */
async function assertActiveMember(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  telegramUserId: string,
  now?: number,
) {
  try {
    await assertPrivilegedActionAllowed(ctx, { groupId, telegramUserId, now });
  } catch (error) {
    if (error instanceof MembershipError) {
      switch (error.code) {
        case MEMBERSHIP_FAILURE.BOT_NOT_ADMIN:
          throw new TabCommandError(BOT_NOT_ADMIN);
        case MEMBERSHIP_FAILURE.GROUP_NOT_FOUND:
          throw new TabCommandError(GROUP_NOT_FOUND);
        default:
          throw new TabCommandError(NOT_GROUP_MEMBER);
      }
    }
    throw error;
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
  await assertActiveMember(ctx, input.groupId, input.organizerTelegramUserId, now);

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
    origin: "chat",
    seatPolicy: { kind: "chat" },
    defaultCurrency: "THB",
    recipientAsset: "USDC",
    revision: 0,
    createdAt: now,
    updatedAt: now,
  });

  await ensureOrganizerParticipant(ctx, {
    tabId,
    organizerTelegramUserId: input.organizerTelegramUserId,
    now,
  });

  const { token } = await mintSessionToken(ctx, {
    tokenType: "tab_session",
    subjectKind: "tab",
    subjectId: tabId,
    groupId: input.groupId,
    now,
  });
  await persistLiveInviteToken(ctx, tabId, token);

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
  await assertActiveMember(ctx, input.groupId, input.senderTelegramUserId, now);

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
  await assertActiveMember(ctx, input.groupId, input.senderTelegramUserId, now);

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
