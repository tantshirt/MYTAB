import { query } from "./_generated/server";
import { getViewerSubject } from "./lib/identity";
import { getCurrentUser } from "./lib/auth";

/** Authenticated viewer — returns Privy DID (`sub`) or null when unauthenticated. */
export const viewer = query({
  args: {},
  handler: async (ctx) => getViewerSubject(ctx),
});

/**
 * The viewer as this database knows them.
 *
 * `viewer` returns the Privy DID, which joins to nothing: every `userId` coming
 * back from a group, tab or obligation read is a Convex `users` id, so a client
 * holding only the DID has to fall back to matching people by
 * `telegramUserId` out of Telegram launch params — an identity the client
 * supplies to itself. This resolves the same subject server-side, through the
 * `by_privy_did` index, and hands back the id the rest of the API speaks.
 *
 * `null` when unauthenticated, and `userId: null` when authenticated before the
 * `users` row exists — those are different states and the client must be able
 * to tell them apart.
 */
export const viewerIdentity = query({
  args: {},
  handler: async (ctx) => {
    const privyDid = await getViewerSubject(ctx);
    if (!privyDid) {
      return null;
    }

    const user = await getCurrentUser(ctx);

    return {
      privyDid,
      userId: user?._id ?? null,
      telegramUserId: user?.telegramUserId ?? null,
      displayName: user?.displayName ?? null,
      username: user?.username ?? null,
      avatarUrl: user?.avatarUrl ?? null,
    };
  },
});
