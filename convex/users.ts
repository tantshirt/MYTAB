import { query } from "./_generated/server";
import { getViewerSubject } from "./lib/identity";

/** Authenticated viewer — returns Privy DID (`sub`) or null when unauthenticated. */
export const viewer = query({
  args: {},
  handler: async (ctx) => getViewerSubject(ctx),
});
