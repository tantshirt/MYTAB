import type { GenericQueryCtx } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { getCurrentUser, requireGroupMember } from "./auth";

type ScopeCtx = GenericQueryCtx<DataModel>;

/**
 * The set of groups a viewer-scoped read is allowed to touch.
 *
 * This is the only way a viewer-level query learns which groups exist for it.
 * The list is *enumerated from the caller's own `groupMembers` rows* rather than
 * accepted from the client, so a viewer can never widen its own scope, and a
 * guessed `groupId` is rejected by `requireGroupMember` before any row is read.
 *
 * Returns `null` when there is no viewer at all (unauthenticated, or
 * authenticated before the `users` row exists). Viewer-scoped *list* queries
 * resolve that to an empty payload rather than an error: there is nothing to
 * show, which is the designed empty state, and a thrown error would put a whole
 * surface into §4.3 during auth bootstrap. Id-keyed reads still deny.
 */
export async function resolveViewerScope(
  ctx: ScopeCtx,
  groupId?: Id<"groups">,
): Promise<{
  user: Doc<"users">;
  groupIds: Id<"groups">[];
  /** Every tab whose stored roster still authorizes the viewer. */
  personalTabIds: Id<"tabs">[];
} | null> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    return null;
  }

  if (groupId !== undefined) {
    // Deny by default: membership is verified against groupMembers, and an
    // inactive membership is not membership.
    await requireGroupMember(ctx, groupId);
    return { user, groupIds: [groupId], personalTabIds: [] };
  }

  const memberships = await ctx.db
    .query("groupMembers")
    .withIndex("by_telegram_user_id", (q) => q.eq("telegramUserId", user.telegramUserId))
    .collect();

  const groupIds: Id<"groups">[] = [];
  for (const membership of memberships) {
    if (membership.membershipStatus !== "active") continue;
    const group = await ctx.db.get(membership.groupId);
    // A personal group belongs to its organizer and may hold many unrelated
    // invite tabs. Visibility is granted per tab below, never by that group.
    if (group?.kind !== "personal") groupIds.push(membership.groupId);
  }

  const participantRows = await ctx.db
    .query("tabParticipants")
    .withIndex("by_user_id", (q) => q.eq("userId", user._id))
    .collect();
  const personalTabIds: Id<"tabs">[] = [];
  for (const participant of participantRows) {
    const tab = await ctx.db.get(participant.tabId);
    if (!tab) continue;
    // A roster survives chat departure (D-07). Include chat-origin tabs too,
    // but avoid reading one twice while its group membership is still active.
    if (tab.origin === "personal" || !groupIds.includes(tab.groupId)) {
      personalTabIds.push(tab._id);
    }
  }

  return {
    user,
    groupIds: [...new Set(groupIds)],
    personalTabIds: [...new Set(personalTabIds)],
  };
}

/** Resolves display names for a bounded set of user ids by primary key. */
export async function loadDisplayNames(
  ctx: ScopeCtx,
  userIds: Iterable<Id<"users">>,
): Promise<Record<string, string>> {
  const names: Record<string, string> = {};

  for (const userId of new Set(userIds)) {
    if (names[userId] !== undefined) {
      continue;
    }
    const user = await ctx.db.get(userId);
    names[userId] = user?.displayName ?? "Someone";
  }

  return names;
}
