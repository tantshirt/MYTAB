import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type GroupMemberRole =
  | "creator"
  | "administrator"
  | "member"
  | "restricted"
  | "left"
  | "kicked"
  | "unknown";

type GroupMemberStatus = "active" | "left" | "kicked" | "restricted";

type NormalizedUpdate =
  | {
      kind: "message";
      updateId: number;
      chatId: string;
      fromId: string;
      messageId: number;
      command: string | null;
      chatTitle?: string;
      fromDisplayName: string;
      fromUsername?: string;
      fromAvatarUrl?: string;
    }
  | {
      kind: "chat_member";
      updateId: number;
      chatId: string;
      userId: string;
      chatTitle?: string;
      displayName: string;
      username?: string;
      avatarUrl?: string;
      role: GroupMemberRole;
      membershipStatus: GroupMemberStatus;
    }
  | {
      kind: "my_chat_member";
      updateId: number;
      chatId: string;
      chatTitle?: string;
      botIsAdmin: boolean;
    }
  | {
      kind: "unsupported";
      updateId: number;
    };

async function upsertGroup(
  ctx: MutationCtx,
  chatId: string,
  displayName: string,
  now: number,
  patch?: { botIsAdmin?: boolean },
): Promise<Id<"groups">> {
  const existing = await ctx.db
    .query("groups")
    .withIndex("by_telegram_chat_id", (q) => q.eq("telegramChatId", chatId))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      displayName,
      updatedAt: now,
      ...(patch?.botIsAdmin !== undefined ? { botIsAdmin: patch.botIsAdmin } : {}),
    });
    return existing._id;
  }

  return ctx.db.insert("groups", {
    telegramChatId: chatId,
    displayName,
    botIsAdmin: patch?.botIsAdmin ?? false,
    createdAt: now,
    updatedAt: now,
  });
}

async function upsertGroupMember(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  member: {
    telegramUserId: string;
    displayName: string;
    username?: string;
    avatarUrl?: string;
    role: GroupMemberRole;
    membershipStatus: GroupMemberStatus;
  },
  now: number,
) {
  const existing = await ctx.db
    .query("groupMembers")
    .withIndex("by_group_and_telegram_user_id", (q) =>
      q.eq("groupId", groupId).eq("telegramUserId", member.telegramUserId),
    )
    .unique();

  const fields = {
    groupId,
    telegramUserId: member.telegramUserId,
    displayName: member.displayName,
    username: member.username,
    avatarUrl: member.avatarUrl,
    role: member.role,
    membershipStatus: member.membershipStatus,
    verificationSource: "webhook" as const,
    verifiedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return existing._id;
  }

  return ctx.db.insert("groupMembers", fields);
}

/** Creates or updates a group and member records from a verified webhook update. */
export async function resolveGroupFromChat(
  ctx: MutationCtx,
  update: NormalizedUpdate,
  now: number,
): Promise<{ groupId: Id<"groups"> | null }> {
  switch (update.kind) {
    case "message": {
      const groupId = await upsertGroup(
        ctx,
        update.chatId,
        update.chatTitle?.trim() || "Telegram Group",
        now,
      );
      await upsertGroupMember(ctx, groupId, {
        telegramUserId: update.fromId,
        displayName: update.fromDisplayName,
        username: update.fromUsername,
        avatarUrl: update.fromAvatarUrl,
        role: "member",
        membershipStatus: "active",
      }, now);
      return { groupId };
    }
    case "chat_member": {
      const groupId = await upsertGroup(
        ctx,
        update.chatId,
        update.chatTitle?.trim() || "Telegram Group",
        now,
      );
      await upsertGroupMember(ctx, groupId, {
        telegramUserId: update.userId,
        displayName: update.displayName,
        username: update.username,
        avatarUrl: update.avatarUrl,
        role: update.role,
        membershipStatus: update.membershipStatus,
      }, now);
      return { groupId };
    }
    case "my_chat_member": {
      const groupId = await upsertGroup(
        ctx,
        update.chatId,
        update.chatTitle?.trim() || "Telegram Group",
        now,
        { botIsAdmin: update.botIsAdmin },
      );
      return { groupId };
    }
    default:
      return { groupId: null };
  }
}
