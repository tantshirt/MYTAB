import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  AuthError,
  NOT_GROUP_MEMBER,
  UNAUTHORIZED,
  getCurrentUser,
  requireGroupMember,
  requireTelegramContext,
} from "./auth";
import { isPersonalOrigin } from "./tabOrigin";

export const NOT_TAB_PARTICIPANT = "NOT_TAB_PARTICIPANT";
export const NOT_BILL_ORGANIZER = "NOT_BILL_ORGANIZER";
export const TAB_LOCKED = "TAB_LOCKED";
export const TAB_NOT_LOCKED = "TAB_NOT_LOCKED";
export const TAB_NOT_FOUND = "TAB_NOT_FOUND";

type AuthCtx = QueryCtx | MutationCtx;

/** Requires an active tab participant (Story 5.4 AC4). */
export async function requireTabParticipant(
  ctx: AuthCtx,
  tabId: Id<"tabs">,
): Promise<{ tab: Doc<"tabs">; user: Doc<"users">; participant: Doc<"tabParticipants"> }> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new AuthError(UNAUTHORIZED);
  }

  const tab = await ctx.db.get(tabId);
  if (!tab) {
    throw new AuthError(NOT_TAB_PARTICIPANT);
  }

  if (tab.status === "draft" || tab.status === "open") {
    await requireTelegramContext(ctx);
  }

  // Before lock, a chat-origin tab still follows the live Telegram roster.
  // Lock freezes the tab participant rows; from then on that immutable roster
  // is the authorization even if Telegram membership later changes (D-07).
  if (!isPersonalOrigin(tab) && (tab.status === "draft" || tab.status === "open")) {
    await requireGroupMember(ctx, tab.groupId);
  }

  const participant = await ctx.db
    .query("tabParticipants")
    .withIndex("by_tab_and_user", (q) => q.eq("tabId", tabId).eq("userId", user._id))
    .unique();

  if (!participant) {
    throw new AuthError(NOT_TAB_PARTICIPANT);
  }

  return { tab, user, participant };
}

/** Requires the tab organizer for authoring mutations (Stories 4.1–4.3, NFR-3). */
export async function requireBillOrganizer(
  ctx: AuthCtx,
  tabId: Id<"tabs">,
): Promise<{ tab: Doc<"tabs">; user: Doc<"users"> }> {
  await requireTelegramContext(ctx);
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new AuthError(UNAUTHORIZED);
  }

  const tab = await ctx.db.get(tabId);
  if (!tab) {
    throw new AuthError(TAB_NOT_FOUND);
  }

  if (!isPersonalOrigin(tab)) {
    await requireGroupMember(ctx, tab.groupId);
  }

  if (tab.organizerTelegramUserId !== user.telegramUserId) {
    throw new AuthError(NOT_BILL_ORGANIZER);
  }

  return { tab, user };
}

export function isTabUnlocked(tab: Pick<Doc<"tabs">, "status">): boolean {
  return tab.status === "draft" || tab.status === "open";
}

/** Rejects mutations against locked tabs unless explicitly allowed. */
export function assertTabUnlocked(tab: Pick<Doc<"tabs">, "status">): void {
  if (!isTabUnlocked(tab)) {
    throw new AuthError(TAB_LOCKED);
  }
}

/** Requires a locked tab for settlement paths. */
export function assertTabLocked(tab: Doc<"tabs">): void {
  if (tab.status !== "locked") {
    throw new AuthError(TAB_NOT_LOCKED);
  }
}

export function isOrganizer(tab: Doc<"tabs">, user: Doc<"users">): boolean {
  return tab.organizerTelegramUserId === user.telegramUserId;
}

/** Resolves tab revision with default of 0 for legacy rows. */
export function tabRevision(tab: Doc<"tabs">): number {
  return tab.revision ?? 0;
}

export { NOT_GROUP_MEMBER };
