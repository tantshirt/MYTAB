import { describe, expect, it } from "vitest";
import {
  formatTipConfirmationMessage,
  queueTipConfirmationMessage,
} from "../../convex/lib/telegramNotify";
import { thbMinorFromWholeBaht } from "@/lib/domain/parse";

type OutboundMessage = {
  _id: string;
  tipId: string;
  groupId: string;
  kind: string;
  messageText: string;
  status: string;
  createdAt: number;
  updatedAt: number;
};

function createNotifyStore() {
  const messages: OutboundMessage[] = [];
  let nextId = 1;

  const ctx = {
    db: {
      insert: async (_table: string, doc: Omit<OutboundMessage, "_id">) => {
        const id = `messages:${nextId++}`;
        messages.push({ _id: id, ...doc });
        return id;
      },
      query: (_table: string) => ({
        withIndex: (_index: string, filter: (q: { eq: (field: string, value: string) => unknown }) => unknown) => {
          const tipId = filter({
            eq: (_field: string, value: string) => value,
          }) as string;

          return {
            unique: async () => messages.find((row) => row.tipId === tipId) ?? null,
          };
        },
      }),
    },
  };

  return { ctx: ctx as never, messages };
}

describe("Story 3.10 — tip confirmation message", () => {
  it("names both people and the amount without leaking addresses", () => {
    const text = formatTipConfirmationMessage({
      tipId: "tips:1" as never,
      groupId: "groups:1" as never,
      senderDisplayName: "Andre",
      recipientDisplayName: "Maya",
      displayAmountThbMinor: thbMinorFromWholeBaht(100),
    });

    expect(text).toBe("Andre tipped Maya ฿100.00");
    expect(text).not.toMatch(/http|FixTure|wallet/i);
  });

  it("queues exactly one outbound message per tip", async () => {
    const { ctx, messages } = createNotifyStore();
    const payload = {
      tipId: "tips:1" as never,
      groupId: "groups:1" as never,
      senderDisplayName: "Andre",
      recipientDisplayName: "Maya",
      displayAmountThbMinor: 10_000,
    };

    const first = await queueTipConfirmationMessage(ctx, payload);
    const second = await queueTipConfirmationMessage(ctx, payload);

    expect(first.queued).toBe(true);
    expect(second.queued).toBe(false);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.status).toBe("queued");
  });
});
