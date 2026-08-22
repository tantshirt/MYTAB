import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sweep expired session tokens",
  { hours: 1 },
  internal.internal.sessionTokens.sweepExpiredTokens,
);

/** Expires stale settlement quotes every minute (Story 3.9 AC1). */
crons.interval(
  "expire stale settlement intents",
  { minutes: 1 },
  internal.internal.settlementScheduler.expireStaleIntents,
);

/** Refreshes the Bank of Thailand FX snapshot (binding decision 6). */
crons.interval(
  "refresh bank of thailand fx snapshot",
  { hours: 1 },
  internal.internal.fx.refreshFxSnapshot,
);

export default crons;
