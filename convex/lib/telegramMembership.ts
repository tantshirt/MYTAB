/**
 * Membership is live trust, not a link-possession check (binding decision 2).
 *
 * Two facts gate every privileged bot action:
 *
 * - the person who typed is an **active member** of this chat, and
 * - the bot is an **administrator** of this chat.
 *
 * Both are cached in Convex, and both go stale. A cached check older than
 * {@link MEMBERSHIP_CACHE_TTL_MS} is refreshed against `getChatMember` before
 * the action proceeds — which is why command handling runs in an action that
 * refreshes first and then calls the mutation, rather than in the webhook
 * mutation itself.
 *
 * A failure of either check leaves the tab readable and disables mutations,
 * with a repair message addressed to the organizer.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Five minutes, from the binding decision. */
export const MEMBERSHIP_CACHE_TTL_MS = 5 * 60 * 1000;

export type TelegramMemberRole = Doc<"groupMembers">["role"];
export type TelegramMembershipStatus = Doc<"groupMembers">["membershipStatus"];

export const MEMBERSHIP_FAILURE = {
  NOT_GROUP_MEMBER: "NOT_GROUP_MEMBER",
  BOT_NOT_ADMIN: "BOT_NOT_ADMIN",
  GROUP_NOT_FOUND: "GROUP_NOT_FOUND",
} as const;

export type MembershipFailureCode =
  (typeof MEMBERSHIP_FAILURE)[keyof typeof MEMBERSHIP_FAILURE];

export class MembershipError extends Error {
  constructor(readonly code: MembershipFailureCode) {
    super(code);
    this.name = "MembershipError";
  }
}

/** Maps a `getChatMember` status string onto the stored role and status. */
export function mapChatMemberStatus(
  status: string,
  isMember?: boolean,
): { role: TelegramMemberRole; membershipStatus: TelegramMembershipStatus } {
  switch (status) {
    case "creator":
      return { role: "creator", membershipStatus: "active" };
    case "administrator":
      return { role: "administrator", membershipStatus: "active" };
    case "member":
      return { role: "member", membershipStatus: "active" };
    case "restricted":
      return isMember
        ? { role: "restricted", membershipStatus: "active" }
        : { role: "restricted", membershipStatus: "restricted" };
    case "left":
      return { role: "left", membershipStatus: "left" };
    case "kicked":
      return { role: "kicked", membershipStatus: "kicked" };
    default:
      return { role: "unknown", membershipStatus: "left" };
  }
}

export function isCheckFresh(checkedAt: number | undefined, now: number): boolean {
  if (checkedAt === undefined) {
    return false;
  }
  return now - checkedAt < MEMBERSHIP_CACHE_TTL_MS;
}

export type MembershipSnapshot = {
  groupId: Id<"groups">;
  chatId: string;
  memberFresh: boolean;
  memberActive: boolean;
  botIsAdmin: boolean;
  botAdminFresh: boolean;
};

/** Reads the cached state and reports what still needs proving. */
export async function readMembershipSnapshot(
  ctx: QueryCtx | MutationCtx,
  input: { groupId: Id<"groups">; telegramUserId: string; now: number },
): Promise<MembershipSnapshot | null> {
  const group = await ctx.db.get(input.groupId);
  if (!group) {
    return null;
  }

  const member = await ctx.db
    .query("groupMembers")
    .withIndex("by_group_and_telegram_user_id", (q) =>
      q.eq("groupId", input.groupId).eq("telegramUserId", input.telegramUserId),
    )
    .unique();

  return {
    groupId: input.groupId,
    chatId: group.telegramChatId,
    memberFresh: isCheckFresh(member?.verifiedAt, input.now),
    memberActive: member?.membershipStatus === "active",
    botIsAdmin: group.botIsAdmin,
    botAdminFresh: isCheckFresh(group.botAdminCheckedAt, input.now),
  };
}

/** Writes a proven `getChatMember` result for a person. */
export async function applyChatMemberResult(
  ctx: MutationCtx,
  input: {
    groupId: Id<"groups">;
    telegramUserId: string;
    displayName?: string;
    username?: string;
    status: string;
    isMember?: boolean;
    now: number;
  },
): Promise<TelegramMembershipStatus> {
  const mapped = mapChatMemberStatus(input.status, input.isMember);

  const existing = await ctx.db
    .query("groupMembers")
    .withIndex("by_group_and_telegram_user_id", (q) =>
      q.eq("groupId", input.groupId).eq("telegramUserId", input.telegramUserId),
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      role: mapped.role,
      membershipStatus: mapped.membershipStatus,
      verificationSource: "getChatMember",
      verifiedAt: input.now,
      ...(input.displayName ? { displayName: input.displayName } : {}),
      ...(input.username ? { username: input.username } : {}),
    });
    return mapped.membershipStatus;
  }

  await ctx.db.insert("groupMembers", {
    groupId: input.groupId,
    telegramUserId: input.telegramUserId,
    displayName: input.displayName ?? "Someone",
    ...(input.username ? { username: input.username } : {}),
    role: mapped.role,
    membershipStatus: mapped.membershipStatus,
    verificationSource: "getChatMember",
    verifiedAt: input.now,
  });

  return mapped.membershipStatus;
}

/** Writes a proven bot-administrator result for a group. */
export async function applyBotAdminResult(
  ctx: MutationCtx,
  input: { groupId: Id<"groups">; botIsAdmin: boolean; now: number },
): Promise<void> {
  const group = await ctx.db.get(input.groupId);
  if (!group) {
    return;
  }
  await ctx.db.patch(input.groupId, {
    botIsAdmin: input.botIsAdmin,
    botAdminCheckedAt: input.now,
    updatedAt: input.now,
  });
}

/**
 * The gate every privileged command passes through.
 *
 * Throws rather than returning a flag, because there is no partial success
 * here: either the person and the bot are both currently trusted, or the tab
 * stays readable and nothing is written.
 */
export async function assertPrivilegedActionAllowed(
  ctx: QueryCtx | MutationCtx,
  input: { groupId: Id<"groups">; telegramUserId: string; now?: number },
): Promise<MembershipSnapshot> {
  const now = input.now ?? Date.now();
  const snapshot = await readMembershipSnapshot(ctx, {
    groupId: input.groupId,
    telegramUserId: input.telegramUserId,
    now,
  });

  if (!snapshot) {
    throw new MembershipError(MEMBERSHIP_FAILURE.GROUP_NOT_FOUND);
  }
  if (!snapshot.memberActive) {
    throw new MembershipError(MEMBERSHIP_FAILURE.NOT_GROUP_MEMBER);
  }
  if (!snapshot.memberFresh) {
    throw new MembershipError(MEMBERSHIP_FAILURE.NOT_GROUP_MEMBER);
  }
  if (!snapshot.botIsAdmin) {
    throw new MembershipError(MEMBERSHIP_FAILURE.BOT_NOT_ADMIN);
  }
  if (!snapshot.botAdminFresh) {
    throw new MembershipError(MEMBERSHIP_FAILURE.BOT_NOT_ADMIN);
  }

  return snapshot;
}
