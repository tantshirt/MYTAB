import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { CANONICAL_ADJUSTMENT_ORDER } from "../lib/domain/bill";
import { computeBillBreakdown } from "../lib/domain/bill";
import { fiatMinorFromInteger } from "../lib/domain/money";
import { formatCurrencyMinor } from "../lib/domain/format";
import { AuthError, getCurrentUser, requireGroupMember, UNAUTHORIZED } from "./lib/auth";
import { isPersonalOrigin } from "./lib/tabOrigin";
import { NOT_TAB_PARTICIPANT } from "./lib/tabAuth";
import { createPersonalTabForUser, requirePersonalTabCreator } from "./lib/personalTab";
import { buildTelegramDeepLink } from "./lib/telegramDeepLink";
import {
  RuntimeGuardError,
} from "../lib/solana/runtimeGuard";
import { resolveFxSnapshotIdForCurrency, usdcAtomicFromSnapshot } from "./lib/fxSnapshotSync";
import {
  assertRecipientWalletReady,
  listTabAdjustments,
  listTabItems,
  recomputeTabTotals,
  toBillAdjustmentInputs,
} from "./lib/tabBillSync";
import { assertTabUnlocked, requireBillOrganizer } from "./lib/tabAuth";
import { getDefaultReceivingWalletForUser } from "./lib/walletSync";
import { startTabForGroup } from "./lib/tabCommandSync";
import { assertSupportedCurrency, currencyMinorDigits } from "../lib/domain/currency";
import { USDC_MINT } from "../lib/solana/constants";
import { resolveVerifiedReceiveAsset } from "./lib/receiveAsset";
import { readMembershipSnapshot } from "./lib/telegramMembership";
import { mintSessionToken, persistLiveInviteToken, reuseLiveTabSession } from "./lib/sessionTokenOps";

const adjustmentKindValidator = v.union(
  v.literal("service"),
  v.literal("tax"),
  v.literal("discount"),
  v.literal("group_tip"),
);

/** Returns open tabs for a group (Story 2.7 AC3). */
export const listOpenTabsForGroup = query({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    await requireGroupMember(ctx, args.groupId);

    const tabs = await ctx.db
      .query("tabs")
      .withIndex("by_group_id", (q) => q.eq("groupId", args.groupId))
      .collect();

    return tabs
      .filter((tab) => tab.status === "draft" || tab.status === "open")
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((tab) => ({
        _id: tab._id,
        name: tab.name,
        status: tab.status,
        updatedAt: tab.updatedAt,
        createdAt: tab.createdAt,
      }));
  },
});

/** Returns a tab by id for authorized participants. */
export const getTab = query({
  args: {
    tabId: v.id("tabs"),
  },
  handler: async (ctx, args) => {
    const tab = await ctx.db.get(args.tabId);
    if (!tab) {
      return null;
    }

    if (isPersonalOrigin(tab)) {
      const viewer = await getCurrentUser(ctx);
      if (!viewer) {
        throw new AuthError(UNAUTHORIZED);
      }
      const self = await ctx.db
        .query("tabParticipants")
        .withIndex("by_tab_and_user", (q) =>
          q.eq("tabId", args.tabId).eq("userId", viewer._id),
        )
        .unique();
      if (!self) {
        throw new AuthError(NOT_TAB_PARTICIPANT);
      }
    } else {
      await requireGroupMember(ctx, tab.groupId);
    }

    const participants = await ctx.db
      .query("tabParticipants")
      .withIndex("by_tab_id", (q) => q.eq("tabId", args.tabId))
      .collect();

    const { liveInviteToken: _hidden, ...publicTab } = tab;
    void _hidden;

    return {
      ...publicTab,
      participantCount: participants.length,
    };
  },
});

/** Live authoring payload — items, adjustments, totals (Epic 4). */
export const getTabAuthoring = query({
  args: {
    tabId: v.id("tabs"),
  },
  handler: async (ctx, args) => {
    const tab = await ctx.db.get(args.tabId);
    if (!tab) {
      return null;
    }

    if (isPersonalOrigin(tab)) {
      const viewer = await getCurrentUser(ctx);
      if (!viewer) {
        throw new AuthError(UNAUTHORIZED);
      }
      const self = await ctx.db
        .query("tabParticipants")
        .withIndex("by_tab_and_user", (q) =>
          q.eq("tabId", args.tabId).eq("userId", viewer._id),
        )
        .unique();
      if (!self) {
        throw new AuthError(NOT_TAB_PARTICIPANT);
      }
    } else {
      await requireGroupMember(ctx, tab.groupId);
    }
    const viewer = await getCurrentUser(ctx);

    const items = await ctx.db
      .query("items")
      .withIndex("by_tab_and_sort", (q) => q.eq("tabId", args.tabId))
      .collect();

    const adjustments = await ctx.db
      .query("adjustments")
      .withIndex("by_tab_id", (q) => q.eq("tabId", args.tabId))
      .collect();

    const sortedItems = items.sort((a, b) => a.sortOrder - b.sortOrder);
    const sortedAdjustments = adjustments.sort((a, b) => a.position - b.position);

    let breakdown = null as ReturnType<typeof computeBillBreakdown> | null;
    if (sortedItems.length > 0) {
      try {
        breakdown = computeBillBreakdown(
          sortedItems.map((item) => ({
            lineTotalMinor: fiatMinorFromInteger(item.lineTotalMinor),
          })),
          toBillAdjustmentInputs(sortedAdjustments),
        );
      } catch {
        breakdown = null;
      }
    }

    const organizerMember = await ctx.db
      .query("groupMembers")
      .withIndex("by_group_and_telegram_user_id", (q) =>
        q.eq("groupId", tab.groupId).eq("telegramUserId", tab.organizerTelegramUserId),
      )
      .unique();

    const fxSnapshot = tab.fxSnapshotId ? await ctx.db.get(tab.fxSnapshotId) : null;
    const { liveInviteToken: _hiddenInvite, ...publicTab } = tab;
    void _hiddenInvite;

    return {
      tab: publicTab,
      items: sortedItems,
      adjustments: sortedAdjustments,
      breakdown,
      organizerDisplayName: organizerMember?.displayName ?? "Organizer",
      viewerUserId: viewer?._id ?? null,
      isOrganizer: viewer?.telegramUserId === tab.organizerTelegramUserId,
      fxSnapshot,
    };
  },
});

/** Group defaults for the Group surface (Story 2.7 AC1). */
export const getGroupDefaults = query({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    await requireGroupMember(ctx, args.groupId);

    const tabs = await ctx.db
      .query("tabs")
      .withIndex("by_group_id", (q) => q.eq("groupId", args.groupId))
      .collect();

    const sorted = tabs.sort((a, b) => b.createdAt - a.createdAt);
    const latest = sorted[0];
    return {
      defaultCurrency: latest?.defaultCurrency ?? "THB",
      recipientAsset: latest?.recipientAsset ?? "USDC",
    };
  },
});

/** Members eligible as payer or recipient on a new tab (Story 4.1 AC3). */
export const listTabMemberOptions = query({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    await requireGroupMember(ctx, args.groupId);

    const members = await ctx.db
      .query("groupMembers")
      .withIndex("by_group_id", (q) => q.eq("groupId", args.groupId))
      .collect();

    const active = members.filter((member) => member.membershipStatus === "active");
    const results = [];

    for (const member of active) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_telegram_user_id", (q) => q.eq("telegramUserId", member.telegramUserId))
        .unique();
      if (!user) {
        continue;
      }
      const wallet = await getDefaultReceivingWalletForUser(ctx, user._id);
      results.push({
        userId: user._id,
        displayName: member.displayName,
        telegramUserId: member.telegramUserId,
        walletReady: wallet !== null,
      });
    }

    return results;
  },
});

/** Creates or updates tab setup — title, merchant, currency, payer, recipient, FX (Story 4.1). */
export const saveTabSetup = mutation({
  args: {
    tabId: v.id("tabs"),
    title: v.string(),
    merchantName: v.optional(v.string()),
    displayCurrency: v.string(),
    recipientAsset: v.string(),
    receiveMint: v.optional(v.string()),
    payerUserId: v.id("users"),
    recipientUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { tab } = await requireBillOrganizer(ctx, args.tabId);
    assertTabUnlocked(tab);

    await assertRecipientWalletReady(ctx, args.recipientUserId);

    const title = args.title.trim();
    if (title.length < 1 || title.length > 120) {
      throw new Error("INVALID_TITLE");
    }

    const displayCurrency = assertSupportedCurrency(args.displayCurrency);
    const requestedMint = args.receiveMint?.trim() ||
      (args.recipientAsset.trim().toUpperCase() === "USDC" ? USDC_MINT : "");
    if (!requestedMint) {
      throw new Error("RECEIVE_MINT_REQUIRED");
    }
    const receive = await resolveVerifiedReceiveAsset(ctx, requestedMint, now);

    for (const [role, userId] of [
      ["PAYER", args.payerUserId],
      ["RECIPIENT", args.recipientUserId],
    ] as const) {
      const participant = await ctx.db
        .query("tabParticipants")
        .withIndex("by_tab_and_user", (q) =>
          q.eq("tabId", args.tabId).eq("userId", userId),
        )
        .unique();
      if (!participant) {
        throw new AuthError(`${role}_NOT_TAB_PARTICIPANT`);
      }
    }

    // A tab keeps the snapshot it was created with; it is never swapped for a
    // newer rate mid-authoring, and locking freezes it permanently.
    let fxSnapshotId = tab.fxSnapshotId;
    const currentFxSnapshot = fxSnapshotId ? await ctx.db.get(fxSnapshotId) : null;
    if (!currentFxSnapshot || currentFxSnapshot.baseCurrency !== displayCurrency) {
      fxSnapshotId = await resolveFxSnapshotIdForCurrency(ctx, displayCurrency, now);
    }

    await ctx.db.patch(args.tabId, {
      name: title,
      merchantName: args.merchantName?.trim() || undefined,
      defaultCurrency: displayCurrency,
      defaultCurrencyMinorDigits: currencyMinorDigits(displayCurrency),
      moneyPolicyVersion: "fiat-receive-v2",
      recipientAsset: receive.symbol,
      receiveMint: receive.mint,
      receiveDecimals: receive.decimals,
      receiveTokenProgramId: receive.tokenProgramId,
      receiveVerifiedAt: now,
      payerUserId: args.payerUserId,
      recipientUserId: args.recipientUserId,
      fxSnapshotId,
      adjustmentOrderPolicy: [...CANONICAL_ADJUSTMENT_ORDER],
      revision: (tab.revision ?? 0) + 1,
      updatedAt: now,
    });

    const breakdown = await recomputeTabTotals(ctx, args.tabId);
    const fxSnapshot = fxSnapshotId ? await ctx.db.get(fxSnapshotId) : null;

    return {
      tabId: args.tabId,
      fxSnapshotId,
      revision: (tab.revision ?? 0) + 1,
      breakdown: breakdown
        ? {
            totalMinor: breakdown.totalMinor,
            totalDisplay: formatCurrencyMinor(breakdown.totalMinor, displayCurrency),
            usdcAtomic:
              fxSnapshot
                ? usdcAtomicFromSnapshot(fxSnapshot, breakdown.totalMinor).toString()
                : null,
          }
        : null,
    };
  },
});

/** Marks setup complete and moves to item entry (Story 4.1 AC5). */
export const beginItemEntry = mutation({
  args: {
    tabId: v.id("tabs"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { tab } = await requireBillOrganizer(ctx, args.tabId);
    assertTabUnlocked(tab);

    if (!tab.payerUserId || !tab.recipientUserId || !tab.fxSnapshotId) {
      throw new Error("TAB_SETUP_INCOMPLETE");
    }

    await ctx.db.patch(args.tabId, {
      status: tab.status === "draft" ? "open" : tab.status,
      updatedAt: now,
    });

    return { tabId: args.tabId, status: "open" as const };
  },
});

/**
 * Mini App New Tab with no group (INVITE-FLOW §4). Personal origin, organizer
 * on the roster, one invite token. The deep link is built here so the client
 * never has to know the bot username.
 */
export const createPersonalTab = mutation({
  args: {
    name: v.string(),
    seats: v.number(),
    merchantName: v.optional(v.string()),
    displayCurrency: v.optional(v.string()),
    receiveMint: v.optional(v.string()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requirePersonalTabCreator(ctx);
    const created = await createPersonalTabForUser(ctx, {
      user,
      name: args.name,
      seats: args.seats,
      merchantName: args.merchantName,
      displayCurrency: args.displayCurrency,
      receiveMint: args.receiveMint,
      idempotencyKey: args.idempotencyKey,
    });

    let deepLinkUrl: string | null = null;
    try {
      deepLinkUrl = buildTelegramDeepLink(created.token);
    } catch (error) {
      if (!(error instanceof RuntimeGuardError)) {
        throw error;
      }
    }

    return {
      tabId: created.tabId,
      token: created.token,
      expiresAt: created.expiresAt,
      seats: created.seats,
      duplicate: created.duplicate,
      deepLinkUrl,
    };
  },
});

const createChatTabArgs = {
  groupId: v.id("groups"),
  name: v.string(),
  merchantName: v.optional(v.string()),
  displayCurrency: v.string(),
  payerUserId: v.id("users"),
  receiveMint: v.optional(v.string()),
  idempotencyKey: v.string(),
};

async function replayChatTabCreation(ctx: MutationCtx, args: {
  groupId: Id<"groups">;
  name: string;
  merchantName?: string;
  displayCurrency: string;
  payerUserId: Id<"users">;
  receiveMint?: string;
  idempotencyKey: string;
}) {
  const user = await getCurrentUser(ctx);
  if (!user) throw new AuthError(UNAUTHORIZED);
  const idempotencyKey = args.idempotencyKey.trim();
  if (!idempotencyKey) throw new AuthError("IDEMPOTENCY_KEY_REQUIRED");
  const existing = await ctx.db
    .query("tabs")
    .withIndex("by_organizer_and_creation_key", (q) =>
      q.eq("organizerTelegramUserId", user.telegramUserId)
        .eq("creationIdempotencyKey", idempotencyKey),
    )
    .unique();
  if (!existing) return null;
  const normalizedCurrency = args.displayCurrency.trim().toUpperCase();
  const exact =
    existing.origin === "chat" &&
    existing.groupId === args.groupId &&
    existing.name === args.name.trim() &&
    (existing.merchantName ?? "") === (args.merchantName?.trim() ?? "") &&
    (existing.defaultCurrency ?? "THB") === normalizedCurrency &&
    existing.receiveMint === (args.receiveMint?.trim() || USDC_MINT) &&
    existing.payerUserId === args.payerUserId &&
    existing.recipientUserId === args.payerUserId;
  if (!exact) throw new AuthError("IDEMPOTENCY_CONFLICT");
  const now = Date.now();
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
  return { tabId: existing._id, token: invite.token, duplicate: true as const };
}

/** Durable response-loss replay, intentionally before Telegram/provider refresh work. */
export const replayChatTabCreationInternal = internalMutation({
  args: createChatTabArgs,
  handler: replayChatTabCreation,
});

/** Server-owned identity and trust facts for the group-create action wrapper. */
export const chatTabCreationContext = internalQuery({
  args: {
    groupId: v.id("groups"),
    payerUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new AuthError(UNAUTHORIZED);
    const group = await ctx.db.get(args.groupId);
    if (!group || group.kind === "personal") throw new AuthError("GROUP_NOT_FOUND");
    const payer = await ctx.db.get(args.payerUserId);
    if (!payer) throw new AuthError("PAYER_NOT_FOUND");
    const telegramUserIds = [...new Set([user.telegramUserId, payer.telegramUserId])];
    const now = Date.now();
    const proofs = [];
    for (const telegramUserId of telegramUserIds) {
      const snapshot = await readMembershipSnapshot(ctx, {
        groupId: args.groupId,
        telegramUserId,
        now,
      });
      proofs.push({
        telegramUserId,
        needsRefresh: !snapshot || !snapshot.memberFresh || !snapshot.botAdminFresh,
      });
    }
    return {
      chatId: group.telegramChatId,
      proofs,
    };
  },
});

/** Transactional half; the public action proves stale Telegram facts first. */
export const createChatTabInternal = internalMutation({
  args: createChatTabArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new AuthError(UNAUTHORIZED);
    }
    const title = args.name.trim();
    if (title.length < 1 || title.length > 120) {
      throw new AuthError("INVALID_TITLE");
    }
    const currency = assertSupportedCurrency(args.displayCurrency);
    const replay = await replayChatTabCreation(ctx, args);
    if (replay) return replay;
    const now = Date.now();
    const receive = await resolveVerifiedReceiveAsset(ctx, args.receiveMint, now);
    const payer = await ctx.db.get(args.payerUserId);
    if (!payer) throw new AuthError("PAYER_NOT_FOUND");
    const payerMember = await ctx.db
      .query("groupMembers")
      .withIndex("by_group_and_telegram_user_id", (q) =>
        q.eq("groupId", args.groupId).eq("telegramUserId", payer.telegramUserId),
      )
      .unique();
    if (!payerMember || payerMember.membershipStatus !== "active") {
      throw new AuthError("PAYER_NOT_IN_GROUP");
    }
    const group = await ctx.db.get(args.groupId);
    if (!group || group.kind === "personal") {
      throw new AuthError("GROUP_NOT_FOUND");
    }

    const fxSnapshotId = await resolveFxSnapshotIdForCurrency(ctx, currency, now);
    return startTabForGroup(ctx, {
      groupId: args.groupId,
      chatId: group.telegramChatId,
      organizerTelegramUserId: user.telegramUserId,
      tabName: title,
      merchantName: args.merchantName,
      displayCurrency: currency,
      payerUserId: args.payerUserId,
      recipientUserId: args.payerUserId,
      recipientAsset: receive.symbol,
      receiveMint: receive.mint,
      receiveDecimals: receive.decimals,
      receiveTokenProgramId: receive.tokenProgramId,
      receiveVerifiedAt: now,
      fxSnapshotId,
      creationIdempotencyKey: args.idempotencyKey.trim(),
      now,
    });
  },
});
