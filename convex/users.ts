import { mutation, query } from "./_generated/server";
import { getViewerSubject } from "./lib/identity";
import { getCurrentUser, renewTelegramContextCore } from "./lib/auth";

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

/**
 * Extends an already-bound Telegram session without re-verifying initData.
 *
 * `initData` is fixed for the life of a Mini App launch, so the previous design
 * — re-post the same payload every few minutes — could only work for the first
 * TELEGRAM_INIT_DATA_MAX_AGE_MS after that launch. After it, every renewal was
 * rejected EXPIRED_AUTH_DATE, the context lapsed, and every mutation refused
 * with TELEGRAM_CONTEXT_REQUIRED with no way back short of relaunching the app.
 * Production logged eleven consecutive rejections before the client gave up.
 *
 * What this does NOT do is weaken the binding. Deciding which Telegram user a
 * Privy identity belongs to still requires a fresh, HMAC-verified payload and
 * is still replay-guarded by `initDataHash` — the same payload presented under
 * a different Privy identity is refused. This only carries a decision already
 * made, on a credential that is checked on every request anyway.
 *
 * Two bounds keep that honest: the context still expires on its own short TTL,
 * so an abandoned session goes cold; and renewal is refused once the *binding*
 * is older than TELEGRAM_SESSION_MAX_MS, measured from `boundAt` rather than
 * from `expiresAt` so renewing can never raise its own ceiling.
 */
export const renewTelegramContext = mutation({
  args: {},
  handler: async (ctx) => renewTelegramContextCore(ctx),
});
