/**
 * Joining a tab from a link.
 *
 * The shape here is the same one the bot-command path already uses and for the
 * same reason (see `convex/internal/telegramCommands.ts`): a mutation cannot
 * call Telegram, and binding decision 2 requires a `getChatMember` younger than
 * five minutes before a privileged action. So the **action** refreshes what has
 * gone stale and the **mutation** re-decides against the now-proven cache
 * inside the transaction that writes.
 *
 * The mutation never falls back to the cache when the refresh did not happen.
 * It refuses. §7 row 21: "never silently admit".
 */

import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  INVITE_MINT_FAILURE,
  TOKEN_REVOKE_FAILURE,
  admitToTabSession,
  consumeActionToken,
  decideInviteMint,
  decideTabAdmission,
  mintTabInviteToken,
  readChatMembershipProof,
  resolveSessionTokenByValue,
  revokeTabInviteForOrganizer,
  type InviteMintResult,
  type TabAdmissionResult,
} from "./lib/sessionTokenOps";
import { AuthError, NOT_GROUP_MEMBER, UNAUTHORIZED, getCurrentUser } from "./lib/auth";
import { getTelegramBotId } from "./lib/telegramWebhook";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";

const TOKEN_ERRORS = new Set([
  "TOKEN_EXPIRED",
  "TOKEN_REVOKED",
  "TOKEN_CONSUMED",
  "TOKEN_NOT_FOUND",
  "TOKEN_TYPE_MISMATCH",
  "TOKEN_INVALID",
]);

function mapTokenError(error: unknown): never {
  if (error instanceof Error && TOKEN_ERRORS.has(error.message)) {
    throw new Error(error.message);
  }
  throw error;
}

/**
 * Membership proven live, or nothing happens.
 *
 * `requireGroupMember` in `convex/lib/auth.ts` is a pure cache read over rows
 * that `resolveGroupFromChat` writes `active` from an **unverified webhook
 * payload**, with no expiry. Posting once in a chat would otherwise be a
 * permanent credential. This is the replacement for every session-token path.
 */
async function requireProvenGroupMember(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">,
  user: Doc<"users">,
): Promise<void> {
  const proof = await readChatMembershipProof(ctx, {
    groupId,
    telegramUserId: user.telegramUserId,
    now: Date.now(),
  });
  if (!proof.groupExists || !proof.proven || !proof.memberActive) {
    throw new AuthError(NOT_GROUP_MEMBER);
  }
}

/** Resolves the acting user, or refuses. Never reads a party off an argument. */
async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new AuthError(UNAUTHORIZED);
  }
  return user;
}

async function userForPrivyDid(
  ctx: QueryCtx | MutationCtx,
  privyDid: string,
): Promise<Doc<"users"> | null> {
  return ctx.db
    .query("users")
    .withIndex("by_privy_did", (q) => q.eq("privyDid", privyDid))
    .unique();
}

// ---------------------------------------------------------------------------
// Joining — §5.6.
// ---------------------------------------------------------------------------

/**
 * Resolves a `tab_session` and joins the caller (Stories 1.9, 2.6; §5.6).
 *
 * Returns a verdict rather than throwing, because every refusal in §7 has
 * designed copy and a distinct next action — and a thrown string on the wire is
 * how they all became unreachable in the first place.
 *
 * Called directly this cannot refresh `getChatMember`, so a stale cache comes
 * back `MEMBERSHIP_UNPROVEN`. `joinTabSession` is the entry point that refreshes
 * first.
 */
export const resolveTabSession = mutation({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<TabAdmissionResult> => {
    const user = await requireUser(ctx);
    return admitToTabSession(ctx, { token: args.token, user });
  },
});

/** Same decision, keyed by the DID on the caller's verified JWT. */
export const admitCaller = internalMutation({
  args: { token: v.string(), privyDid: v.string() },
  handler: async (ctx, args): Promise<TabAdmissionResult> => {
    const user = await userForPrivyDid(ctx, args.privyDid);
    if (!user) {
      throw new AuthError(UNAUTHORIZED);
    }
    return admitToTabSession(ctx, { token: args.token, user });
  },
});

export type TabAdmissionPlan =
  | { kind: "decided" }
  | { kind: "refresh"; groupId: Id<"groups">; chatId: string; telegramUserId: string };

/**
 * Reports whether the §5.6 order stalls on an unproven membership cache — the
 * one thing the mutation cannot resolve on its own.
 */
export const tabAdmissionPlan = internalQuery({
  args: { token: v.string(), privyDid: v.string() },
  handler: async (ctx, args): Promise<TabAdmissionPlan> => {
    const user = await userForPrivyDid(ctx, args.privyDid);
    if (!user) {
      return { kind: "decided" };
    }

    const decision = await decideTabAdmission(ctx, {
      token: args.token,
      user,
      now: Date.now(),
    });

    if (decision.outcome === "needs_membership_proof") {
      return {
        kind: "refresh",
        groupId: decision.groupId,
        chatId: decision.chatId,
        telegramUserId: decision.telegramUserId,
      };
    }
    return { kind: "decided" };
  },
});

/**
 * The Mini App's join entry point.
 *
 * Refresh first, decide second. The refresh is the live `getChatMember` binding
 * decision 2 mandates and the Mini App join path never performed (§1.9,
 * amendment 2c) — a new enforcement point, not a relaxation.
 */
export const joinTabSession = action({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<TabAdmissionResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) {
      throw new AuthError(UNAUTHORIZED);
    }
    const privyDid = identity.subject;

    const plan: TabAdmissionPlan = await ctx.runQuery(
      internal.sessionTokens.tabAdmissionPlan,
      { token: args.token, privyDid },
    );

    if (plan.kind === "refresh") {
      await ctx.runAction(internal.internal.telegramDelivery.refreshMembership, {
        groupId: plan.groupId,
        chatId: plan.chatId,
        telegramUserId: plan.telegramUserId,
        botId: getTelegramBotId(),
      });
    }

    return ctx.runMutation(internal.sessionTokens.admitCaller, {
      token: args.token,
      privyDid,
    });
  },
});

// ---------------------------------------------------------------------------
// Minting an invite — §1.4, and the fix for §9.11 B1.
// ---------------------------------------------------------------------------

export type InviteMintPlan =
  | { kind: "decided" }
  | { kind: "refresh"; groupId: Id<"groups">; chatId: string; telegramUserId: string };

export const inviteMintPlan = internalQuery({
  args: { tabId: v.string(), privyDid: v.string() },
  handler: async (ctx, args): Promise<InviteMintPlan> => {
    const user = await userForPrivyDid(ctx, args.privyDid);
    if (!user) {
      return { kind: "decided" };
    }

    const tabId = ctx.db.normalizeId("tabs", args.tabId);
    if (!tabId) {
      return { kind: "decided" };
    }

    const decision = await decideInviteMint(ctx, { tabId, user, now: Date.now() });

    if (decision.outcome === "needs_membership_proof") {
      return {
        kind: "refresh",
        groupId: decision.groupId,
        chatId: decision.chatId,
        telegramUserId: decision.telegramUserId,
      };
    }
    return { kind: "decided" };
  },
});

/**
 * Mints one invite for a tab, for its organizer only.
 *
 * The old `mintDeepLinkToken` took a tab id and a group id off the request,
 * checked them against each other, and minted for anyone holding a Privy
 * session — the same confused-deputy shape as checking a caller against a value
 * the caller supplied. Here the tab, its organizer, and its group all come off
 * stored rows and the caller comes off the verified JWT.
 */
export const mintInvite = internalMutation({
  args: { tabId: v.string(), privyDid: v.string() },
  handler: async (ctx, args): Promise<InviteMintResult> => {
    const user = await userForPrivyDid(ctx, args.privyDid);
    if (!user) {
      return { ok: false as const, code: INVITE_MINT_FAILURE.UNAUTHORIZED };
    }

    // A malformed id is not a tab. It is refused with the same words as a tab
    // that does not exist, so the endpoint is not an id oracle.
    const tabId = ctx.db.normalizeId("tabs", args.tabId);
    if (!tabId) {
      return { ok: false as const, code: INVITE_MINT_FAILURE.TAB_NOT_FOUND };
    }

    return mintTabInviteToken(ctx, { tabId, user });
  },
});

// ---------------------------------------------------------------------------
// The other two token classes.
// ---------------------------------------------------------------------------

/**
 * U-9 — organizer-on-roster only. The tab, the organizer, and the roster row
 * all come off stored records (D-16 H7). A stranger and a missing token are
 * the same 403-equivalent refusal, so this is not an oracle.
 */
export const revokeToken = mutation({
  args: {
    tokenId: v.id("sessionTokens"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const result = await revokeTabInviteForOrganizer(ctx, {
      tokenId: args.tokenId,
      user,
    });
    if (!result.ok) {
      throw new AuthError(TOKEN_REVOKE_FAILURE.UNAUTHORIZED);
    }
    return { ok: true as const };
  },
});

/** Consumes a single-use action token (Story 1.9 AC6). */
export const consumeToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    let resolved;
    try {
      resolved = await resolveSessionTokenByValue(ctx, args.token, "action_token");
    } catch (error) {
      mapTokenError(error);
    }

    await requireProvenGroupMember(ctx, resolved.groupId, user);
    await consumeActionToken(ctx, resolved.tokenId);

    return {
      subjectKind: resolved.subjectKind,
      subjectId: resolved.subjectId,
      groupId: resolved.groupId,
    };
  },
});
