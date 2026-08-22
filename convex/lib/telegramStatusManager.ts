/**
 * One status message per tab, edited in place (FR-N4).
 *
 * ## Why this is a lease and not a function call
 *
 * The card lives in Telegram; the truth lives in Convex. Convex mutations
 * cannot call Telegram, and Telegram calls can fail halfway. So the row in
 * `telegramStatusMessages` is both the record of the card and a work queue of
 * one: domain code bumps `eventVersion`, and a Convex action claims the row,
 * talks to Telegram, and commits the result.
 *
 * ## The concurrency argument
 *
 * Convex mutations are serializable transactions with optimistic concurrency
 * control: a transaction whose read set was written by a committed
 * transaction is retried against fresh data rather than committed on stale
 * data. Everything below leans on exactly that.
 *
 * 1. **One claimant.** `claimStatusDelivery` reads the row and writes the row
 *    in the same transaction. Two concurrent claims therefore conflict; one
 *    commits, the other re-executes, re-reads `deliveryState === "claimed"`
 *    with a live lease, and declines. There is never a moment when two workers
 *    both believe they hold the card.
 * 2. **The lease outlives the work.** A claim is held for
 *    {@link STATUS_CLAIM_LEASE_MS}; a Telegram attempt is capped at
 *    `TELEGRAM_CALL_TIMEOUT_MS` and a delivery makes at most two calls (an
 *    edit, then one replacement post). The lease is more than the sum, so the
 *    normal path never has a second worker start while the first is in flight.
 * 3. **Recovery is reserved, once, per claim.** Before posting a replacement
 *    the worker calls `reserveStatusReplacement`, which is another
 *    read-modify-write on the same row. It fails if the worker no longer holds
 *    the claim, and it fails if this claim already reserved a replacement. A
 *    retry loop inside one claim therefore cannot post twice, and a second
 *    claim cannot exist while the first is live.
 * 4. **The commit is fenced.** `commitStatusDelivery` writes only if
 *    `row.claimId` still equals the claim the worker was given. A worker whose
 *    lease expired and was stolen cannot overwrite the new canonical
 *    `messageId` — it is told the claim was lost and deletes the message it
 *    just posted, so the group never keeps two cards.
 *
 * That is the whole argument: OCC gives mutual exclusion, the lease bounds the
 * window, the reservation bounds the posts, and the fence makes the loser
 * clean up after itself.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { randomBase64Url } from "../../lib/crypto/convexCrypto";
import {
  assertStatusEvent,
  renderTabStatusCard,
  type TabStatusFacts,
  type TelegramStatusEvent,
} from "../../lib/telegram/messages";
import { loadItemClaimRows } from "./allocationSync";
import { mintSessionToken } from "./sessionTokenOps";
import { buildTelegramDeepLink } from "./telegramDeepLink";

/**
 * How long one worker owns the card. Longer than the worst-case delivery
 * (two Telegram calls at 10s each plus mutation round-trips) so a lease can
 * only expire on a worker that has genuinely died.
 */
export const STATUS_CLAIM_LEASE_MS = 60_000;

/** Attempts before the card is parked. Matches the transport's ceiling. */
export const STATUS_MAX_ATTEMPTS = 5;

export type StatusDeliveryMode = "post" | "edit";

export type StatusDeliveryWork = {
  claimId: string;
  chatId: string;
  mode: StatusDeliveryMode;
  messageId?: number;
  text: string;
  /**
   * Minted fresh for this delivery and never persisted — raw tokens are never
   * stored (binding decision 4).
   */
  buttonUrl: string;
  targetVersion: number;
  attempt: number;
  /** Telegram file_id. Absent until U-8 decides what the photo depicts. */
  photoFileId?: string;
};

export type ClaimStatusDeliveryResult =
  | { claimed: true; work: StatusDeliveryWork }
  | {
      claimed: false;
      reason:
        | "NO_STATUS_MESSAGE"
        | "ALREADY_CLAIMED"
        | "UP_TO_DATE"
        | "BACKOFF"
        | "EXHAUSTED";
    };

function newClaimId(): string {
  return randomBase64Url(12);
}

/**
 * The group facts behind the card. Counts and totals only — deriving them
 * server-side is what keeps an individual amount from ever reaching the copy.
 */
export async function deriveTabStatusFacts(
  ctx: QueryCtx | MutationCtx,
  tabId: Id<"tabs">,
  event: TelegramStatusEvent,
): Promise<TabStatusFacts | null> {
  const tab = await ctx.db.get(tabId);
  if (!tab) {
    return null;
  }

  const participants = await ctx.db
    .query("tabParticipants")
    .withIndex("by_tab_id", (q) => q.eq("tabId", tabId))
    .collect();

  const items = await ctx.db
    .query("items")
    .withIndex("by_tab_id", (q) => q.eq("tabId", tabId))
    .collect();

  const itemRows = await loadItemClaimRows(ctx, tabId, items);
  const claimedItemCount = itemRows.filter((row) => row.claims.length > 0).length;

  const obligations = await ctx.db
    .query("obligations")
    .withIndex("by_tab_id", (q) => q.eq("tabId", tabId))
    .collect();
  const activeObligations = obligations.filter((row) => row.status !== "superseded");

  return {
    tabName: tab.name,
    event,
    peopleCount: participants.length,
    billTotalMinor: tab.billTotalMinor === undefined ? null : Number(tab.billTotalMinor),
    claimedItemCount,
    totalItemCount: itemRows.length,
    settledShareCount: activeObligations.filter((row) => row.status === "settled").length,
    totalShareCount: activeObligations.length,
  };
}

async function resolveChatId(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">,
): Promise<string | null> {
  const group = await ctx.db.get(groupId);
  return group?.telegramChatId ?? null;
}

export type RecordTabStatusEventResult =
  | { recorded: false; reason: "TAB_NOT_FOUND" | "CHAT_UNKNOWN" | "UNCHANGED" }
  | { recorded: true; statusMessageId: Id<"telegramStatusMessages">; eventVersion: number };

/**
 * Records one of the four card events and leaves the row ready for delivery.
 *
 * Callers pass an event, not text. Rendering here is what guarantees that a
 * caller in the settlement path cannot accidentally put an individual amount
 * into a group message.
 */
export async function recordTabStatusEvent(
  ctx: MutationCtx,
  input: {
    tabId: Id<"tabs">;
    event: TelegramStatusEvent;
    now?: number;
    /** Reuse a token already minted for this tab instead of minting another. */
    initialToken?: string;
  },
): Promise<RecordTabStatusEventResult> {
  assertStatusEvent(input.event);
  const now = input.now ?? Date.now();

  const facts = await deriveTabStatusFacts(ctx, input.tabId, input.event);
  if (!facts) {
    return { recorded: false, reason: "TAB_NOT_FOUND" };
  }

  const tab = await ctx.db.get(input.tabId);
  if (!tab) {
    return { recorded: false, reason: "TAB_NOT_FOUND" };
  }

  const chatId = await resolveChatId(ctx, tab.groupId);
  if (!chatId) {
    return { recorded: false, reason: "CHAT_UNKNOWN" };
  }

  const renderedText = renderTabStatusCard(facts);

  const existing = await ctx.db
    .query("telegramStatusMessages")
    .withIndex("by_tab_id", (q) => q.eq("tabId", input.tabId))
    .unique();

  if (!existing) {
    const statusMessageId = await ctx.db.insert("telegramStatusMessages", {
      tabId: input.tabId,
      chatId,
      eventVersion: 1,
      event: input.event,
      renderedText,
      deliveredVersion: 0,
      deliveryState: "idle",
      attemptCount: 0,
      replacementCount: 0,
      peopleCount: facts.peopleCount,
      ...(facts.billTotalMinor === null ? {} : { billTotalMinor: BigInt(facts.billTotalMinor) }),
      claimedItemCount: facts.claimedItemCount,
      totalItemCount: facts.totalItemCount,
      settledObligationCount: facts.settledShareCount,
      totalObligationCount: facts.totalShareCount,
      lastEditedAt: now,
      ...(input.initialToken === undefined ? {} : { deepLinkToken: input.initialToken }),
    });

    return { recorded: true, statusMessageId, eventVersion: 1 };
  }

  // Nothing changed and the card is already showing it — do not spend a
  // Telegram call to write the same bytes.
  if (
    existing.renderedText === renderedText &&
    existing.deliveredText === renderedText &&
    existing.messageId !== undefined
  ) {
    return { recorded: false, reason: "UNCHANGED" };
  }

  const eventVersion = existing.eventVersion + 1;
  await ctx.db.patch(existing._id, {
    chatId,
    eventVersion,
    event: input.event,
    renderedText,
    peopleCount: facts.peopleCount,
    ...(facts.billTotalMinor === null ? {} : { billTotalMinor: BigInt(facts.billTotalMinor) }),
    claimedItemCount: facts.claimedItemCount,
    totalItemCount: facts.totalItemCount,
    settledObligationCount: facts.settledShareCount,
    totalObligationCount: facts.totalShareCount,
    // A new event clears a stale backoff: the previous failure was about the
    // previous text.
    attemptCount: 0,
    nextAttemptAt: undefined,
    lastEditedAt: now,
  });

  return { recorded: true, statusMessageId: existing._id, eventVersion };
}

/**
 * Takes exclusive ownership of a tab's card, or explains why it did not.
 *
 * Read-modify-write on the single `by_tab_id` row: OCC turns this into mutual
 * exclusion without a lock table.
 */
export async function claimStatusDelivery(
  ctx: MutationCtx,
  tabId: Id<"tabs">,
  now: number = Date.now(),
): Promise<ClaimStatusDeliveryResult> {
  const row = await ctx.db
    .query("telegramStatusMessages")
    .withIndex("by_tab_id", (q) => q.eq("tabId", tabId))
    .unique();

  if (!row) {
    return { claimed: false, reason: "NO_STATUS_MESSAGE" };
  }

  const leaseIsLive = row.deliveryState === "claimed" && (row.claimExpiresAt ?? 0) > now;
  if (leaseIsLive) {
    return { claimed: false, reason: "ALREADY_CLAIMED" };
  }

  const upToDate = (row.deliveredVersion ?? 0) >= row.eventVersion && row.messageId !== undefined;
  if (upToDate) {
    return { claimed: false, reason: "UP_TO_DATE" };
  }

  const attempt = row.attemptCount ?? 0;
  if (attempt >= STATUS_MAX_ATTEMPTS) {
    return { claimed: false, reason: "EXHAUSTED" };
  }

  if ((row.nextAttemptAt ?? 0) > now) {
    return { claimed: false, reason: "BACKOFF" };
  }

  const claimId = newClaimId();
  await ctx.db.patch(row._id, {
    deliveryState: "claimed",
    claimId,
    claimExpiresAt: now + STATUS_CLAIM_LEASE_MS,
  });

  const tab = await ctx.db.get(tabId);
  if (!tab) {
    return { claimed: false, reason: "NO_STATUS_MESSAGE" };
  }

  // Reuse the token minted at tab creation. A fresh mint on every edit is how
  // the Open tab button silently lost the token it was handed (INVITE-FLOW B8).
  let token = row.deepLinkToken;
  if (!token) {
    const minted = await mintSessionToken(ctx, {
      tokenType: "tab_session",
      subjectKind: "tab",
      subjectId: tabId,
      groupId: tab.groupId,
      now,
    });
    token = minted.token;
    await ctx.db.patch(row._id, { deepLinkToken: token });
  }

  return {
    claimed: true,
    work: {
      claimId,
      chatId: row.chatId,
      mode: row.messageId === undefined ? "post" : "edit",
      ...(row.messageId === undefined ? {} : { messageId: row.messageId }),
      text: row.renderedText ?? renderTabStatusCard({
        tabName: tab.name,
        event: row.event ?? "tab_opened",
        peopleCount: row.peopleCount ?? 1,
        billTotalMinor: row.billTotalMinor === undefined ? null : Number(row.billTotalMinor),
        claimedItemCount: row.claimedItemCount ?? 0,
        totalItemCount: row.totalItemCount ?? 0,
        settledShareCount: row.settledObligationCount ?? 0,
        totalShareCount: row.totalObligationCount ?? 0,
      }),
      buttonUrl: buildTelegramDeepLink(token),
      targetVersion: row.eventVersion,
      attempt: attempt + 1,
      ...(row.photoFileId ? { photoFileId: row.photoFileId } : {}),
    },
  };
}

export type ReserveReplacementResult =
  | { reserved: true }
  | { reserved: false; reason: "NO_STATUS_MESSAGE" | "CLAIM_LOST" | "ALREADY_RESERVED" };

/**
 * Permission to post exactly one replacement for a card Telegram says is gone.
 *
 * Refused if this worker no longer holds the claim, and refused a second time
 * within the same claim. Both refusals are decided inside one transaction on
 * the same row the claim lives on, so a concurrent retry cannot slip between
 * the check and the write.
 */
export async function reserveStatusReplacement(
  ctx: MutationCtx,
  input: { tabId: Id<"tabs">; claimId: string; now?: number },
): Promise<ReserveReplacementResult> {
  const now = input.now ?? Date.now();
  const row = await ctx.db
    .query("telegramStatusMessages")
    .withIndex("by_tab_id", (q) => q.eq("tabId", input.tabId))
    .unique();

  if (!row) {
    return { reserved: false, reason: "NO_STATUS_MESSAGE" };
  }
  if (row.claimId !== input.claimId) {
    return { reserved: false, reason: "CLAIM_LOST" };
  }
  if (row.replacementClaimId === input.claimId) {
    return { reserved: false, reason: "ALREADY_RESERVED" };
  }

  await ctx.db.patch(row._id, {
    replacementClaimId: input.claimId,
    replacementReservedAt: now,
    replacementCount: (row.replacementCount ?? 0) + 1,
    // The old id is provably dead; clearing it turns the next delivery into a
    // post rather than another doomed edit.
    messageId: undefined,
  });

  return { reserved: true };
}

export type CommitStatusDeliveryResult =
  | { committed: true; staleVersion: boolean }
  | { committed: false; reason: "NO_STATUS_MESSAGE" | "CLAIM_LOST" };

/**
 * Records the message id the group is now looking at.
 *
 * Fenced on `claimId`, deliberately **not** on the lease expiry: if the lease
 * lapsed but nobody took the card, this worker's result is still the truth.
 * Only a claim that has actually moved to another worker loses.
 */
export async function commitStatusDelivery(
  ctx: MutationCtx,
  input: {
    tabId: Id<"tabs">;
    claimId: string;
    messageId: number;
    deliveredVersion: number;
    now?: number;
  },
): Promise<CommitStatusDeliveryResult> {
  const now = input.now ?? Date.now();
  const row = await ctx.db
    .query("telegramStatusMessages")
    .withIndex("by_tab_id", (q) => q.eq("tabId", input.tabId))
    .unique();

  if (!row) {
    return { committed: false, reason: "NO_STATUS_MESSAGE" };
  }
  if (row.claimId !== input.claimId) {
    return { committed: false, reason: "CLAIM_LOST" };
  }

  await ctx.db.patch(row._id, {
    messageId: input.messageId,
    deliveredVersion: input.deliveredVersion,
    deliveredText: row.renderedText,
    deliveryState: "idle",
    claimId: undefined,
    claimExpiresAt: undefined,
    replacementClaimId: undefined,
    replacementReservedAt: undefined,
    attemptCount: 0,
    nextAttemptAt: undefined,
    lastError: undefined,
    lastEditedAt: now,
  });

  return { committed: true, staleVersion: row.eventVersion > input.deliveredVersion };
}

export type FailStatusDeliveryResult = {
  released: boolean;
  retryDelayMs: number | null;
  attempt: number;
};

/** Releases the claim and schedules — or gives up on — another attempt. */
export async function failStatusDelivery(
  ctx: MutationCtx,
  input: {
    tabId: Id<"tabs">;
    claimId: string;
    description: string;
    retryDelayMs: number | null;
    now?: number;
  },
): Promise<FailStatusDeliveryResult> {
  const now = input.now ?? Date.now();
  const row = await ctx.db
    .query("telegramStatusMessages")
    .withIndex("by_tab_id", (q) => q.eq("tabId", input.tabId))
    .unique();

  if (!row || row.claimId !== input.claimId) {
    return { released: false, retryDelayMs: null, attempt: row?.attemptCount ?? 0 };
  }

  const attempt = (row.attemptCount ?? 0) + 1;
  await ctx.db.patch(row._id, {
    deliveryState: "idle",
    claimId: undefined,
    claimExpiresAt: undefined,
    attemptCount: attempt,
    ...(input.retryDelayMs === null ? {} : { nextAttemptAt: now + input.retryDelayMs }),
    lastError: input.description.slice(0, 300),
    lastEditedAt: now,
  });

  return { released: true, retryDelayMs: input.retryDelayMs, attempt };
}

/** Reads a tab's status row. Used by delivery and by tests. */
export async function getStatusMessage(
  ctx: QueryCtx | MutationCtx,
  tabId: Id<"tabs">,
): Promise<Doc<"telegramStatusMessages"> | null> {
  return ctx.db
    .query("telegramStatusMessages")
    .withIndex("by_tab_id", (q) => q.eq("tabId", tabId))
    .unique();
}
