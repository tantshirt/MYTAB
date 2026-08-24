/**
 * The one-shot message queue.
 *
 * Durable one-shot Telegram messages use the same discipline as status cards:
 * a stable `dedupeKey` decides whether a message exists at all,
 * and a claim lease decides who is allowed to post it.
 *
 * ## Why enqueueing twice cannot produce two rows
 *
 * `enqueueOutboundMessage` reads `by_dedupe_key` and inserts in the same
 * transaction. Convex tracks that read; if a concurrent transaction inserts
 * the same key first, this one's read set is invalidated and it re-executes,
 * this time finding the row and returning it. Check-then-insert is atomic here
 * in a way it is not in a database where you would need a unique constraint.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { randomBase64Url } from "../../lib/crypto/convexCrypto";

/** Same lease as the status card, for the same reason: it outlives the work. */
export const OUTBOUND_CLAIM_LEASE_MS = 60_000;

export const OUTBOUND_MAX_ATTEMPTS = 5;

export type OutboundKind = Doc<"telegramOutboundMessages">["kind"];

function newClaimId(): string {
  return randomBase64Url(12);
}

export type EnqueueOutboundResult = {
  queued: boolean;
  messageId: Id<"telegramOutboundMessages">;
};

/** Inserts the row for a message if — and only if — it does not exist yet. */
export async function enqueueOutboundMessage(
  ctx: MutationCtx,
  input: {
    dedupeKey: string;
    kind: OutboundKind;
    groupId: Id<"groups">;
    messageText: string;
    tipId?: Id<"tips">;
    now?: number;
  },
): Promise<EnqueueOutboundResult> {
  const now = input.now ?? Date.now();

  const byKey = await ctx.db
    .query("telegramOutboundMessages")
    .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", input.dedupeKey))
    .unique();
  if (byKey) {
    return { queued: false, messageId: byKey._id };
  }

  // Rows written before `dedupeKey` existed are still keyed by tip id. Honour
  // that path so a redeploy mid-flight cannot duplicate a live group message.
  if (input.tipId) {
    const byTip = await ctx.db
      .query("telegramOutboundMessages")
      .withIndex("by_tip_id", (q) => q.eq("tipId", input.tipId))
      .unique();
    if (byTip) {
      if (byTip.dedupeKey === undefined) {
        await ctx.db.patch(byTip._id, { dedupeKey: input.dedupeKey, updatedAt: now });
      }
      return { queued: false, messageId: byTip._id };
    }
  }

  const messageId = await ctx.db.insert("telegramOutboundMessages", {
    dedupeKey: input.dedupeKey,
    kind: input.kind,
    groupId: input.groupId,
    ...(input.tipId ? { tipId: input.tipId } : {}),
    messageText: input.messageText,
    status: "queued",
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  return { queued: true, messageId };
}

export type OutboundWork = {
  claimId: string;
  chatId: string;
  messageText: string;
  attempt: number;
};

export type ClaimOutboundResult =
  | { claimed: true; work: OutboundWork }
  | {
      claimed: false;
      reason: "NOT_FOUND" | "ALREADY_POSTED" | "ALREADY_CLAIMED" | "BACKOFF" | "EXHAUSTED" | "CHAT_UNKNOWN";
    };

/** Takes exclusive ownership of one queued message. */
export async function claimOutboundMessage(
  ctx: MutationCtx,
  messageId: Id<"telegramOutboundMessages">,
  now: number = Date.now(),
): Promise<ClaimOutboundResult> {
  const row = await ctx.db.get(messageId);
  if (!row) {
    return { claimed: false, reason: "NOT_FOUND" };
  }
  if (row.status === "posted") {
    return { claimed: false, reason: "ALREADY_POSTED" };
  }
  if (row.status === "sending" && (row.claimExpiresAt ?? 0) > now) {
    return { claimed: false, reason: "ALREADY_CLAIMED" };
  }

  const attempt = row.attemptCount ?? 0;
  if (attempt >= OUTBOUND_MAX_ATTEMPTS) {
    return { claimed: false, reason: "EXHAUSTED" };
  }
  if ((row.nextAttemptAt ?? 0) > now) {
    return { claimed: false, reason: "BACKOFF" };
  }

  const group = await ctx.db.get(row.groupId);
  if (!group) {
    return { claimed: false, reason: "CHAT_UNKNOWN" };
  }

  const claimId = newClaimId();
  await ctx.db.patch(row._id, {
    status: "sending",
    claimId,
    claimExpiresAt: now + OUTBOUND_CLAIM_LEASE_MS,
    updatedAt: now,
  });

  return {
    claimed: true,
    work: {
      claimId,
      chatId: group.telegramChatId,
      messageText: row.messageText,
      attempt: attempt + 1,
    },
  };
}

export type CommitOutboundResult =
  | { committed: true }
  | { committed: false; reason: "NOT_FOUND" | "CLAIM_LOST" };

/**
 * Records that the message is now in the group.
 *
 * Fenced on `claimId` exactly as the status card is: a worker that lost its
 * claim is told so, and deletes the message it posted rather than leaving the
 * group with two.
 */
export async function commitOutboundPosted(
  ctx: MutationCtx,
  input: {
    messageId: Id<"telegramOutboundMessages">;
    claimId: string;
    telegramMessageId: number;
    now?: number;
  },
): Promise<CommitOutboundResult> {
  const now = input.now ?? Date.now();
  const row = await ctx.db.get(input.messageId);
  if (!row) {
    return { committed: false, reason: "NOT_FOUND" };
  }
  if (row.claimId !== input.claimId) {
    return { committed: false, reason: "CLAIM_LOST" };
  }

  await ctx.db.patch(row._id, {
    status: "posted",
    telegramMessageId: input.telegramMessageId,
    postedAt: now,
    claimId: undefined,
    claimExpiresAt: undefined,
    nextAttemptAt: undefined,
    lastError: undefined,
    updatedAt: now,
  });

  return { committed: true };
}

export type FailOutboundResult = {
  released: boolean;
  retryDelayMs: number | null;
  attempt: number;
};

/** Releases the claim and schedules — or abandons — another attempt. */
export async function failOutboundMessage(
  ctx: MutationCtx,
  input: {
    messageId: Id<"telegramOutboundMessages">;
    claimId: string;
    description: string;
    retryDelayMs: number | null;
    now?: number;
  },
): Promise<FailOutboundResult> {
  const now = input.now ?? Date.now();
  const row = await ctx.db.get(input.messageId);
  if (!row || row.claimId !== input.claimId) {
    return { released: false, retryDelayMs: null, attempt: row?.attemptCount ?? 0 };
  }

  const attempt = (row.attemptCount ?? 0) + 1;
  await ctx.db.patch(row._id, {
    status: input.retryDelayMs === null ? "failed" : "queued",
    claimId: undefined,
    claimExpiresAt: undefined,
    attemptCount: attempt,
    ...(input.retryDelayMs === null ? {} : { nextAttemptAt: now + input.retryDelayMs }),
    lastError: input.description.slice(0, 300),
    updatedAt: now,
  });

  return { released: true, retryDelayMs: input.retryDelayMs, attempt };
}

/** Reads one outbound row. Used by delivery and by tests. */
export async function getOutboundMessage(
  ctx: QueryCtx | MutationCtx,
  messageId: Id<"telegramOutboundMessages">,
): Promise<Doc<"telegramOutboundMessages"> | null> {
  return ctx.db.get(messageId);
}
