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

/**
 * Keeps cached token metadata inside its freshness window (see
 * `lib/tokens/policy.ts`). A safety net behind the on-demand refresh, so a mint
 * nobody happened to open for a week does not hit the expiry cliff and become
 * unpayable at the till. One bounded batch per run.
 */
crons.interval(
  "refresh stale token metadata",
  { hours: 1 },
  internal.tokens.refreshStaleTokens,
);

crons.interval(
  "recover receipt resources",
  { minutes: 1 },
  internal.receipts.sweepReceiptResources,
);

export default crons;
