import { describe, expect, it } from "vitest";
import {
  formatTipConfirmationMessage,
  queueTipConfirmationMessage,
} from "../../convex/lib/telegramNotify";
import {
  claimOutboundMessage,
  commitOutboundPosted,
  enqueueOutboundMessage,
  failOutboundMessage,
  tipConfirmationDedupeKey,
} from "../../convex/lib/telegramOutbox";
import { deliverOutboundMessage } from "../../convex/lib/telegramDeliveryCore";
import { createFakeCtx, type Row } from "../helpers/convexFakeDb";
import { thbMinorFromWholeBaht } from "@/lib/domain/parse";

const TIP_ID = "tips:1" as never;
const GROUP_ID = "groups:1" as never;

function seed() {
  const store: Record<string, Row[]> = {
    groups: [
      {
        _id: "groups:1",
        telegramChatId: "-1001234567890",
        displayName: "Dinner Crew",
        botIsAdmin: true,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    telegramOutboundMessages: [],
  };
  return createFakeCtx(store);
}

const payload = {
  tipId: TIP_ID,
  groupId: GROUP_ID,
  senderDisplayName: "Andre",
  recipientDisplayName: "Maya",
  displayAmountThbMinor: thbMinorFromWholeBaht(100),
};

describe("Story 3.10 — tip confirmation message", () => {
  it("names both people and the amount without leaking addresses", () => {
    const text = formatTipConfirmationMessage(payload);

    expect(text).toBe("Andre tipped Maya ฿100.00");
    expect(text).not.toMatch(/http|FixTure|wallet/i);
  });

  it("queues exactly one outbound message per tip", async () => {
    const { ctx, store, scheduled } = seed();

    const first = await queueTipConfirmationMessage(ctx, payload);
    const second = await queueTipConfirmationMessage(ctx, payload);

    expect(first.queued).toBe(true);
    expect(second.queued).toBe(false);
    expect(second.messageId).toBe(first.messageId);
    expect(store.telegramOutboundMessages).toHaveLength(1);
    expect(store.telegramOutboundMessages[0]?.status).toBe("queued");
    expect(store.telegramOutboundMessages[0]?.dedupeKey).toBe(
      tipConfirmationDedupeKey(TIP_ID),
    );
    // Both calls ask for delivery; the claim lease makes the second a no-op.
    expect(scheduled).toHaveLength(2);
  });

  it("adopts a pre-dedupeKey row rather than posting a second message", async () => {
    const { ctx, store } = seed();
    store.telegramOutboundMessages.push({
      _id: "telegramOutboundMessages:legacy",
      tipId: "tips:1",
      groupId: "groups:1",
      kind: "tip_confirmation",
      messageText: "Andre tipped Maya ฿100.00",
      status: "queued",
      createdAt: 0,
      updatedAt: 0,
    });

    const result = await enqueueOutboundMessage(ctx, {
      dedupeKey: tipConfirmationDedupeKey(TIP_ID),
      kind: "tip_confirmation",
      groupId: GROUP_ID,
      tipId: TIP_ID,
      messageText: "Andre tipped Maya ฿100.00",
    });

    expect(result.queued).toBe(false);
    expect(result.messageId).toBe("telegramOutboundMessages:legacy");
    expect(store.telegramOutboundMessages).toHaveLength(1);
  });
});

describe("outbound delivery — a retry never posts twice", () => {
  it("refuses a second claim while the first lease is live", async () => {
    const { ctx } = seed();
    const { messageId } = await enqueueOutboundMessage(ctx, {
      dedupeKey: "tip_confirmation:tips:1",
      kind: "tip_confirmation",
      groupId: GROUP_ID,
      tipId: TIP_ID,
      messageText: "Andre tipped Maya ฿100.00",
      now: 1_000,
    });

    const first = await claimOutboundMessage(ctx, messageId, 1_000);
    const second = await claimOutboundMessage(ctx, messageId, 2_000);

    expect(first.claimed).toBe(true);
    expect(second.claimed).toBe(false);
    if (!second.claimed) {
      expect(second.reason).toBe("ALREADY_CLAIMED");
    }
  });

  it("refuses to claim a message that is already posted", async () => {
    const { ctx } = seed();
    const { messageId } = await enqueueOutboundMessage(ctx, {
      dedupeKey: "tip_confirmation:tips:1",
      kind: "tip_confirmation",
      groupId: GROUP_ID,
      tipId: TIP_ID,
      messageText: "Andre tipped Maya ฿100.00",
      now: 1_000,
    });

    const claim = await claimOutboundMessage(ctx, messageId, 1_000);
    expect(claim.claimed).toBe(true);
    if (!claim.claimed) {
      return;
    }
    await commitOutboundPosted(ctx, {
      messageId,
      claimId: claim.work.claimId,
      telegramMessageId: 555,
      now: 1_100,
    });

    const replay = await claimOutboundMessage(ctx, messageId, 90_000);
    expect(replay.claimed).toBe(false);
    if (!replay.claimed) {
      expect(replay.reason).toBe("ALREADY_POSTED");
    }
  });

  it("deletes the message it posted when its claim was stolen mid-flight", async () => {
    const { ctx, store } = seed();
    const { messageId } = await enqueueOutboundMessage(ctx, {
      dedupeKey: "tip_confirmation:tips:1",
      kind: "tip_confirmation",
      groupId: GROUP_ID,
      tipId: TIP_ID,
      messageText: "Andre tipped Maya ฿100.00",
      now: 1_000,
    });

    const removed: Array<{ chatId: string; messageId: number }> = [];

    const outcome = await deliverOutboundMessage({
      fixture: false,
      port: {
        send: async () => {
          // While this worker was talking to Telegram, its lease expired and
          // another worker took the row.
          const row = store.telegramOutboundMessages[0]!;
          row.claimId = "someone-else";
          return { ok: true, result: { message_id: 777 } };
        },
        edit: async () => ({ ok: true, result: { message_id: 777 } }),
        remove: async (input) => {
          removed.push(input);
        },
      },
      claim: () => claimOutboundMessage(ctx, messageId, 1_000),
      commit: (input) =>
        commitOutboundPosted(ctx, { messageId, ...input, now: 1_100 }),
      fail: (input) => failOutboundMessage(ctx, { messageId, ...input, now: 1_100 }),
      reschedule: async () => undefined,
    });

    expect(outcome).toEqual({ delivered: false, reason: "CLAIM_LOST" });
    expect(removed).toEqual([{ chatId: "-1001234567890", messageId: 777 }]);
    expect(store.telegramOutboundMessages[0]?.status).not.toBe("posted");
  });

  it("backs off on a 429 and reschedules itself with Telegram's retry_after", async () => {
    const { ctx, store } = seed();
    const { messageId } = await enqueueOutboundMessage(ctx, {
      dedupeKey: "tip_confirmation:tips:1",
      kind: "tip_confirmation",
      groupId: GROUP_ID,
      tipId: TIP_ID,
      messageText: "Andre tipped Maya ฿100.00",
      now: 1_000,
    });

    const rescheduled: number[] = [];
    const outcome = await deliverOutboundMessage({
      fixture: false,
      port: {
        send: async () => ({
          ok: false,
          kind: "rate_limited",
          description: "Too Many Requests",
          retryAfterMs: 7_000,
        }),
        edit: async () => ({ ok: false, kind: "transient", description: "unused" }),
        remove: async () => undefined,
      },
      claim: () => claimOutboundMessage(ctx, messageId, 1_000),
      commit: (input) => commitOutboundPosted(ctx, { messageId, ...input, now: 1_100 }),
      fail: (input) => failOutboundMessage(ctx, { messageId, ...input, now: 1_100 }),
      reschedule: async (delayMs) => {
        rescheduled.push(delayMs);
      },
    });

    expect(outcome).toEqual({ delivered: false, reason: "rate_limited" });
    expect(rescheduled).toEqual([7_000]);
    expect(store.telegramOutboundMessages[0]?.status).toBe("queued");
    expect(store.telegramOutboundMessages[0]?.nextAttemptAt).toBe(1_100 + 7_000);
  });
});
