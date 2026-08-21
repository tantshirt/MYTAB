import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireGroupMember } from "./lib/auth";

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
