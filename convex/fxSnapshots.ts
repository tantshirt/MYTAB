import { v } from "convex/values";
import { query } from "./_generated/server";

/** Returns an FX snapshot by id for authorized tab viewers. */
export const getFxSnapshot = query({
  args: {
    fxSnapshotId: v.id("fxSnapshots"),
  },
  handler: async (ctx, args) => {
    const snapshot = await ctx.db.get(args.fxSnapshotId);
    if (!snapshot) {
      return null;
    }
    return snapshot;
  },
});
