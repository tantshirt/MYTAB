import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireGroupMember } from "./lib/auth";

/** UX protagonists for demo seed (Story 7.10 AC1). */
export const DEMO_PROTAGONISTS = [
  { telegramUserId: "user-maya", displayName: "Maya" },
  { telegramUserId: "user-andre", displayName: "Andre" },
  { telegramUserId: "user-noi", displayName: "Noi" },
  { telegramUserId: "user-ploy", displayName: "Ploy" },
  { telegramUserId: "user-tim", displayName: "Tim" },
] as const;

/** Resets demo data marker — fixture mode returns known state (Story 7.10 AC1). */
export const resetDemoData = mutation({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    await requireGroupMember(ctx, args.groupId);
    return {
      resetAt: Date.now(),
      protagonists: DEMO_PROTAGONISTS,
      tabName: "Sukhumvit Dinner",
      status: "fixture_reset_complete",
    };
  },
});
