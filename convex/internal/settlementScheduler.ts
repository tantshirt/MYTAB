import { internalMutation } from "../_generated/server";
import { sweepExpiredIntents } from "../lib/intentExpiry";

/** Cron handler — expires stale quotes on schedule (Story 3.9 AC1–AC2). */
export const expireStaleIntents = internalMutation({
  args: {},
  handler: async (ctx) => {
    return sweepExpiredIntents(ctx);
  },
});
