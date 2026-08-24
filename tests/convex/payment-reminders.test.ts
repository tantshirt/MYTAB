import { afterEach, describe, expect, it, vi } from "vitest";
import * as obligations from "@/convex/obligations";
import * as telegramCommands from "@/convex/internal/telegramCommands";
import { createFakeCtx, type Row } from "../helpers/convexFakeDb";

const run = (fn: unknown, ctx: unknown, args: unknown) =>
  (fn as { _handler: (c: unknown, a: unknown) => Promise<unknown> })._handler(ctx, args);

const identity = (subject: string) => ({ subject, tokenIdentifier: subject });

function world(): Record<string, Row[]> {
  return {
    users: [
      { _id: "users:debtor", privyDid: "did:debtor", telegramUserId: "1", displayName: "Debtor" },
      { _id: "users:creditor", privyDid: "did:creditor", telegramUserId: "2", displayName: "Creditor" },
    ],
    tabs: [
      {
        _id: "tabs:t1",
        groupId: "groups:g1",
        organizerTelegramUserId: "2",
        name: "Dinner",
        status: "locked",
        defaultCurrency: "THB",
        lockedRevision: 1,
      },
    ],
    obligations: [
      {
        _id: "obligations:o1",
        groupId: "groups:g1",
        tabId: "tabs:t1",
        tabRevision: 1,
        debtorUserId: "users:debtor",
        creditorUserId: "users:creditor",
        displayAmountThbMinor: 1000n,
        amountAtomic: 300_000n,
        outputMint: "mint",
        billSnapshotHash: "hash",
        status: "open",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    obligationLedgerEvents: [],
    paymentReminders: [],
  };
}

describe("private payment reminders", () => {
  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.ENVIRONMENT;
    vi.unstubAllGlobals();
  });
  it("queues only for the stored creditor and schedules private delivery", async () => {
    const store = world();
    const { ctx, scheduled } = createFakeCtx(store, identity("did:creditor"));
    const result = await run(obligations.requestPaymentReminder, ctx, {
      obligationId: "obligations:o1",
    });
    expect(result).toMatchObject({ queued: true });
    expect(store.paymentReminders).toHaveLength(1);
    expect(scheduled).toHaveLength(1);
  });

  it("denies the debtor and rate-limits a repeated reminder", async () => {
    const store = world();
    const debtor = createFakeCtx(store, identity("did:debtor"));
    await expect(
      run(obligations.requestPaymentReminder, debtor.ctx, {
        obligationId: "obligations:o1",
      }),
    ).rejects.toMatchObject({ code: "REMINDER_NOT_AUTHORIZED" });

    const creditor = createFakeCtx(store, identity("did:creditor"));
    await run(obligations.requestPaymentReminder, creditor.ctx, {
      obligationId: "obligations:o1",
    });
    await expect(
      run(obligations.requestPaymentReminder, creditor.ctx, {
        obligationId: "obligations:o1",
      }),
    ).rejects.toMatchObject({ code: "REMINDER_RATE_LIMITED" });
  });

  it("lists the reciprocal creditor view without a live group-membership dependency", async () => {
    const { ctx } = createFakeCtx(world(), identity("did:creditor"));
    const rows = (await run(obligations.listOwedToViewer, ctx, {
      status: "open",
    })) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ debtorDisplayName: "Debtor", remainingMinor: 1000 });
  });

  it("delivers to the stored debtor private Telegram id and records sent", async () => {
    const store = world();
    store.paymentReminders!.push({
      _id: "paymentReminders:r1",
      obligationId: "obligations:o1",
      tabId: "tabs:t1",
      senderUserId: "users:creditor",
      recipientUserId: "users:debtor",
      status: "queued",
      createdAt: 1,
      updatedAt: 1,
    });
    const { ctx } = createFakeCtx(store);
    process.env.TELEGRAM_BOT_TOKEN = "123:test-token";
    process.env.ENVIRONMENT = "production";
    let sentBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const actionCtx = {
      runQuery: (_ref: unknown, args: unknown) =>
        run(telegramCommands.paymentReminderForDelivery, ctx, args),
      runMutation: (_ref: unknown, args: Record<string, unknown>) =>
        run(
          "status" in args
            ? telegramCommands.markPaymentReminderDelivery
            : telegramCommands.claimPaymentReminderDelivery,
          ctx,
          args,
        ),
    };
    await expect(run(telegramCommands.paymentReminderForDelivery, ctx, {
      reminderId: "paymentReminders:r1",
    })).resolves.toMatchObject({ telegramUserId: "1" });
    await expect(run(telegramCommands.deliverPaymentReminder, actionCtx, {
      reminderId: "paymentReminders:r1",
    })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sentBody).toMatchObject({ chat_id: "1" });
    expect(store.paymentReminders![0]!.status).toBe("sent");

    await expect(run(telegramCommands.deliverPaymentReminder, actionCtx, {
      reminderId: "paymentReminders:r1",
    })).resolves.toEqual({ ok: true, replayed: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(store.paymentReminders![0]!.status).toBe("sent");
  });

  it("atomically admits one delivery claimant and makes concurrent replay a no-op", async () => {
    const store = world();
    store.paymentReminders!.push({
      _id: "paymentReminders:r1",
      obligationId: "obligations:o1",
      tabId: "tabs:t1",
      senderUserId: "users:creditor",
      recipientUserId: "users:debtor",
      status: "queued",
      createdAt: 1,
      updatedAt: 1,
    });
    const { ctx } = createFakeCtx(store);
    await expect(run(telegramCommands.claimPaymentReminderDelivery, ctx, {
      reminderId: "paymentReminders:r1",
      claimId: "claim-one",
    })).resolves.toMatchObject({ telegramUserId: "1" });
    await expect(run(telegramCommands.claimPaymentReminderDelivery, ctx, {
      reminderId: "paymentReminders:r1",
      claimId: "claim-two",
    })).resolves.toEqual({ inFlight: true });
    expect(store.paymentReminders![0]).toMatchObject({
      status: "claimed",
      claimId: "claim-one",
    });
  });

  it("does not deliver after the obligation closes", async () => {
    const store = world();
    store.obligations![0]!.status = "settled";
    store.paymentReminders!.push({
      _id: "paymentReminders:r1",
      obligationId: "obligations:o1",
      tabId: "tabs:t1",
      senderUserId: "users:creditor",
      recipientUserId: "users:debtor",
      status: "queued",
      createdAt: 1,
      updatedAt: 1,
    });
    const { ctx } = createFakeCtx(store);
    const actionCtx = {
      runQuery: (_ref: unknown, args: unknown) =>
        run(telegramCommands.paymentReminderForDelivery, ctx, args),
      runMutation: (_ref: unknown, args: Record<string, unknown>) =>
        run(
          "status" in args
            ? telegramCommands.markPaymentReminderDelivery
            : telegramCommands.claimPaymentReminderDelivery,
          ctx,
          args,
        ),
    };
    await expect(run(telegramCommands.deliverPaymentReminder, actionCtx, {
      reminderId: "paymentReminders:r1",
    })).resolves.toEqual({ ok: false });
    expect(store.paymentReminders![0]!.status).toBe("failed");
  });

  it("records unknown when Telegram transport is ambiguous and consumes cooldown", async () => {
    const store = world();
    store.paymentReminders!.push({
      _id: "paymentReminders:r1",
      obligationId: "obligations:o1",
      tabId: "tabs:t1",
      senderUserId: "users:creditor",
      recipientUserId: "users:debtor",
      status: "queued",
      createdAt: 1,
      updatedAt: 1,
    });
    const { ctx } = createFakeCtx(store);
    process.env.TELEGRAM_BOT_TOKEN = "123:test-token";
    process.env.ENVIRONMENT = "production";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const actionCtx = {
      runQuery: (_ref: unknown, args: unknown) =>
        run(telegramCommands.paymentReminderForDelivery, ctx, args),
      runMutation: (_ref: unknown, args: Record<string, unknown>) =>
        run(
          "status" in args
            ? telegramCommands.markPaymentReminderDelivery
            : telegramCommands.claimPaymentReminderDelivery,
          ctx,
          args,
        ),
    };
    await expect(run(telegramCommands.deliverPaymentReminder, actionCtx, {
      reminderId: "paymentReminders:r1",
    })).resolves.toEqual({ ok: false });
    expect(store.paymentReminders![0]!.status).toBe("unknown");

    const creditor = createFakeCtx(store, identity("did:creditor"));
    await expect(run(obligations.requestPaymentReminder, creditor.ctx, {
      obligationId: "obligations:o1",
    })).rejects.toThrow("REMINDER_RATE_LIMITED");
  });

  it("never marks failed after Telegram accepts when sent persistence is unavailable", async () => {
    const store = world();
    store.paymentReminders!.push({
      _id: "paymentReminders:r1",
      obligationId: "obligations:o1",
      tabId: "tabs:t1",
      senderUserId: "users:creditor",
      recipientUserId: "users:debtor",
      status: "queued",
      createdAt: 1,
      updatedAt: 1,
    });
    const { ctx } = createFakeCtx(store);
    process.env.TELEGRAM_BOT_TOKEN = "123:test-token";
    process.env.ENVIRONMENT = "production";
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, result: { message_id: 8 } }), { status: 200 })));
    const scheduled: Array<Record<string, unknown>> = [];
    let rejectedPersistence = 0;
    const actionCtx = {
      runMutation: (_ref: unknown, args: Record<string, unknown>) => {
        if ("status" in args && rejectedPersistence < 2) {
          rejectedPersistence += 1;
          throw new Error("convex unavailable");
        }
        return run(
          "status" in args
            ? telegramCommands.markPaymentReminderDelivery
            : telegramCommands.claimPaymentReminderDelivery,
          ctx,
          args,
        );
      },
      scheduler: { runAfter: async (_delay: number, _ref: unknown, args: Record<string, unknown>) => {
        scheduled.push(args);
      } },
    };
    await expect(run(telegramCommands.deliverPaymentReminder, actionCtx, {
      reminderId: "paymentReminders:r1",
    })).resolves.toEqual({ ok: true });
    expect(store.paymentReminders![0]!.status).toBe("claimed");
    expect(scheduled.at(-1)).toMatchObject({ reminderId: "paymentReminders:r1", attempt: 1 });

    await run(telegramCommands.recoverAcceptedPaymentReminder, actionCtx, scheduled.at(-1));
    expect(store.paymentReminders![0]!.status).toBe("unknown");
  });
});
