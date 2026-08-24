import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { AuthError, UNAUTHORIZED, getCurrentUser, requireTelegramContext } from "./auth";
import {
  ensureTabParticipant,
  mintSessionToken,
  persistLiveInviteToken,
  reuseLiveTabSession,
} from "./sessionTokenOps";
import { utcDayKey } from "./sessionTokenSync";
import { clampSeatCount } from "./tabOrigin";
import { assertSupportedCurrency, currencyMinorDigits } from "../../lib/domain/currency";
import { resolveFxSnapshotIdForCurrency } from "./fxSnapshotSync";
import { resolveVerifiedReceiveAsset } from "./receiveAsset";
import { USDC_MINT } from "../../lib/solana/constants";

export const INVALID_TITLE = "INVALID_TITLE";
export const INVALID_SEATS = "INVALID_SEATS";
export const PERSONAL_TAB_RATE_LIMITED = "TAB_RATE_LIMITED";
export const MAX_PERSONAL_TABS_PER_USER_PER_DAY = 10;

export type CreatePersonalTabInput = {
  name: string;
  seats: number;
  merchantName?: string;
  displayCurrency?: string;
  receiveMint?: string;
  idempotencyKey: string;
  now?: number;
};

export type CreatePersonalTabResult = {
  tabId: Id<"tabs">;
  token: string;
  expiresAt: number;
  seats: number;
  duplicate: boolean;
};

/**
 * INVITE-FLOW §1.7 — a personal tab hangs off a `groups` row of `kind:
 * "personal"` whose `telegramChatId` is the organizer's private chat with the
 * bot (their Telegram user id). Reused if `/start` already wrote that row.
 */
export async function findOrCreatePersonalGroup(
  ctx: MutationCtx,
  input: { user: Doc<"users">; now: number },
): Promise<Id<"groups">> {
  const chatId = input.user.telegramUserId;
  const existing = await ctx.db
    .query("groups")
    .withIndex("by_telegram_chat_id", (q) => q.eq("telegramChatId", chatId))
    .unique();

  let groupId = existing?._id;
  if (existing) {
    if (existing.kind !== "personal") {
      await ctx.db.patch(existing._id, {
        kind: "personal",
        botIsAdmin: false,
        updatedAt: input.now,
      });
    }
  } else {
    groupId = await ctx.db.insert("groups", {
      telegramChatId: chatId,
      displayName: input.user.displayName,
      botIsAdmin: false,
      kind: "personal",
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  const member = await ctx.db
    .query("groupMembers")
    .withIndex("by_group_and_telegram_user_id", (q) =>
      q.eq("groupId", groupId!).eq("telegramUserId", input.user.telegramUserId),
    )
    .unique();

  if (!member) {
    await ctx.db.insert("groupMembers", {
      groupId: groupId!,
      telegramUserId: input.user.telegramUserId,
      displayName: input.user.displayName,
      username: input.user.username,
      avatarUrl: input.user.avatarUrl,
      role: "creator",
      membershipStatus: "active",
      verificationSource: "bootstrap",
      verifiedAt: input.now,
    });
  } else if (member.membershipStatus !== "active") {
    await ctx.db.patch(member._id, {
      membershipStatus: "active",
      role: "creator",
      verifiedAt: input.now,
    });
  }

  return groupId!;
}

/**
 * Mini App "Start a tab" with no group. Personal origin, fixed seats, organizer
 * on the roster, one invite token. No status card — there is no chat to post to.
 */
export async function createPersonalTabForUser(
  ctx: MutationCtx,
  input: CreatePersonalTabInput & { user: Doc<"users"> },
): Promise<CreatePersonalTabResult> {
  const now = input.now ?? Date.now();
  const seats = clampSeatCount(input.seats);
  if (seats === null) {
    throw new AuthError(INVALID_SEATS);
  }

  const name = input.name.trim();
  if (name.length < 1 || name.length > 120) {
    throw new AuthError(INVALID_TITLE);
  }
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) throw new AuthError("IDEMPOTENCY_KEY_REQUIRED");

  const displayCurrency = assertSupportedCurrency(input.displayCurrency ?? "THB");
  const requestedReceiveMint = input.receiveMint?.trim() || USDC_MINT;

  const existing = await ctx.db
    .query("tabs")
    .withIndex("by_organizer_and_creation_key", (q) =>
      q
        .eq("organizerTelegramUserId", input.user.telegramUserId)
        .eq("creationIdempotencyKey", idempotencyKey),
    )
    .unique();
  if (existing) {
    const exact =
      existing.origin === "personal" &&
      existing.name === name &&
      (existing.merchantName ?? "") === (input.merchantName?.trim() ?? "") &&
      existing.defaultCurrency === displayCurrency &&
      existing.receiveMint === requestedReceiveMint &&
      existing.payerUserId === input.user._id &&
      existing.recipientUserId === input.user._id &&
      existing.seatPolicy?.kind === "fixed" &&
      existing.seatPolicy.seats === seats;
    if (!exact) throw new AuthError("IDEMPOTENCY_CONFLICT");
    let invite = await reuseLiveTabSession(ctx, existing, now);
    if (!invite) {
      invite = await mintSessionToken(ctx, {
        tokenType: "tab_session",
        subjectKind: "tab",
        subjectId: existing._id,
        groupId: existing.groupId,
        now,
      });
      await persistLiveInviteToken(ctx, existing._id, invite.token);
    }
    return {
      tabId: existing._id,
      token: invite.token,
      expiresAt: invite.expiresAt,
      seats,
      duplicate: true,
    };
  }

  // Mutable provider/token freshness is deliberately after durable replay.
  // A committed create whose response was lost must remain recoverable even
  // if today's FX or receive metadata is temporarily unavailable.
  const fxSnapshotId = await resolveFxSnapshotIdForCurrency(ctx, displayCurrency, now);
  const receive = await resolveVerifiedReceiveAsset(ctx, requestedReceiveMint, now);

  // Exact retries are resolved before the daily creation gate. A response that
  // was lost after commit must remain replayable even if that commit consumed
  // the caller's final slot for the day.
  const dayKey = utcDayKey(now);
  const daily = await ctx.db
    .query("tabCreationCounts")
    .withIndex("by_scope_day", (q) =>
      q
        .eq("scopeKind", "user")
        .eq("scopeKey", input.user.telegramUserId)
        .eq("dayKey", dayKey),
    )
    .unique();
  if ((daily?.count ?? 0) >= MAX_PERSONAL_TABS_PER_USER_PER_DAY) {
    throw new AuthError(PERSONAL_TAB_RATE_LIMITED);
  }

  const groupId = await findOrCreatePersonalGroup(ctx, { user: input.user, now });

  const tabId = await ctx.db.insert("tabs", {
    groupId,
    organizerTelegramUserId: input.user.telegramUserId,
    creationIdempotencyKey: idempotencyKey,
    name,
    merchantName: input.merchantName?.trim() || undefined,
    status: "draft",
    origin: "personal",
    seatPolicy: { kind: "fixed", seats },
    defaultCurrency: displayCurrency,
    defaultCurrencyMinorDigits: currencyMinorDigits(displayCurrency),
    moneyPolicyVersion: "fiat-receive-v2",
    recipientAsset: receive.symbol,
    receiveMint: receive.mint,
    receiveDecimals: receive.decimals,
    receiveTokenProgramId: receive.tokenProgramId,
    receiveVerifiedAt: now,
    payerUserId: input.user._id,
    recipientUserId: input.user._id,
    fxSnapshotId,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  });

  await ensureTabParticipant(ctx, { tabId, user: input.user, now, origin: "personal" });

  const minted = await mintSessionToken(ctx, {
    tokenType: "tab_session",
    subjectKind: "tab",
    subjectId: tabId,
    groupId,
    now,
  });
  await persistLiveInviteToken(ctx, tabId, minted.token);

  await incrementUserTabCount(ctx, input.user.telegramUserId, dayKey, now);

  return {
    tabId,
    token: minted.token,
    expiresAt: minted.expiresAt,
    seats,
    duplicate: false,
  };
}

async function incrementUserTabCount(
  ctx: MutationCtx,
  telegramUserId: string,
  dayKey: string,
  now: number,
): Promise<void> {
  const existing = await ctx.db
    .query("tabCreationCounts")
    .withIndex("by_scope_day", (q) =>
      q.eq("scopeKind", "user").eq("scopeKey", telegramUserId).eq("dayKey", dayKey),
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, { count: existing.count + 1, updatedAt: now });
    return;
  }

  await ctx.db.insert("tabCreationCounts", {
    scopeKind: "user",
    scopeKey: telegramUserId,
    dayKey,
    count: 1,
    updatedAt: now,
  });
}

/** The authenticated Mini App caller, with a fresh Telegram context. */
export async function requirePersonalTabCreator(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  await requireTelegramContext(ctx);
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new AuthError(UNAUTHORIZED);
  }
  return user;
}
