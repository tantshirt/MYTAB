import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireGroupMember } from "./lib/auth";
import { resolveViewerScope } from "./lib/viewerScope";

/**
 * The groups the viewer actually belongs to.
 *
 * Tabs home has no group id to start from, and there is no way to enumerate
 * groups other than through the caller's own active `groupMembers` rows — which
 * is exactly what this returns. A group the viewer has left or been removed
 * from does not appear, and no id is ever accepted from the client.
 */
export const listForViewer = query({
  args: {},
  handler: async (ctx) => {
    const scope = await resolveViewerScope(ctx);
    if (!scope) {
      return [];
    }

    const rows = [];
    for (const groupId of scope.groupIds) {
      const group = await ctx.db.get(groupId);
      if (!group) {
        continue;
      }

      const members = await ctx.db
        .query("groupMembers")
        .withIndex("by_group_id", (q) => q.eq("groupId", groupId))
        .collect();

      rows.push({
        _id: group._id,
        telegramChatId: group.telegramChatId,
        displayName: group.displayName,
        avatarUrl: group.avatarUrl,
        botIsAdmin: group.botIsAdmin,
        memberCount: members.filter((m) => m.membershipStatus === "active").length,
        updatedAt: group.updatedAt,
      });
    }

    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/** Returns a group with member profiles and wallet readiness for UI rendering. */
export const getGroup = query({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    await requireGroupMember(ctx, args.groupId);

    const group = await ctx.db.get(args.groupId);
    if (!group) {
      return null;
    }

    const members = await ctx.db
      .query("groupMembers")
      .withIndex("by_group_id", (q) => q.eq("groupId", args.groupId))
      .collect();

    const membersWithWalletReady = await Promise.all(
      members.map(async (member) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_telegram_user_id", (q) => q.eq("telegramUserId", member.telegramUserId))
          .unique();

        let walletReady = false;
        if (user) {
          const defaultWallet = await ctx.db
            .query("wallets")
            .withIndex("by_user_and_default", (q) =>
              q.eq("userId", user._id).eq("isDefaultReceiving", true),
            )
            .unique();
          walletReady = defaultWallet !== null;
        }

        return {
          telegramUserId: member.telegramUserId,
          userId: user?._id ?? null,
          displayName: member.displayName,
          username: member.username,
          avatarUrl: member.avatarUrl,
          role: member.role,
          membershipStatus: member.membershipStatus,
          walletReady,
        };
      }),
    );

    return {
      _id: group._id,
      telegramChatId: group.telegramChatId,
      displayName: group.displayName,
      avatarUrl: group.avatarUrl,
      botIsAdmin: group.botIsAdmin,
      members: membersWithWalletReady,
    };
  },
});
