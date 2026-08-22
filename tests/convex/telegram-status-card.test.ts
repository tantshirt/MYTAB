import { describe, expect, it } from "vitest";
import {
  BANNED_COPY_WORDS,
  OPEN_TAB_BUTTON_LABEL,
  TELEGRAM_POSTING_EVENTS,
  TELEGRAM_STATUS_EVENTS,
  UnsanctionedTelegramEventError,
  findBannedCopyWords,
  renderBotAdminRepairMessage,
  renderNotAMemberMessage,
  renderTabStatusCard,
  renderTipConfirmation,
  type TelegramStatusEvent,
} from "@/lib/telegram/messages";
import {
  classifyTelegramResponse,
  nextRetryDelayMs,
  TELEGRAM_MAX_ATTEMPTS,
} from "@/lib/telegram/api";
import {
  claimStatusDelivery,
  commitStatusDelivery,
  failStatusDelivery,
  recordTabStatusEvent,
  reserveStatusReplacement,
  STATUS_CLAIM_LEASE_MS,
} from "../../convex/lib/telegramStatusManager";
import { deliverTabStatus } from "../../convex/lib/telegramDeliveryCore";
import { createFakeCtx, type Row } from "../helpers/convexFakeDb";

const TAB_ID = "tabs:1" as never;

function seedTab(overrides: Partial<Row> = {}) {
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
    tabs: [
      {
        _id: "tabs:1",
        groupId: "groups:1",
        organizerTelegramUserId: "42",
        name: "Sukhumvit Dinner",
        status: "open",
        revision: 1,
        createdAt: 0,
        updatedAt: 0,
        ...overrides,
      },
    ],
    tabParticipants: [],
    items: [],
    allocations: [],
    obligations: [],
    sessionTokens: [],
    telegramStatusMessages: [],
  };
  return createFakeCtx(store);
}

// ---------------------------------------------------------------------------
// The copy
// ---------------------------------------------------------------------------

describe("the group card — exact copy", () => {
  const base = {
    tabName: "Sukhumvit Dinner",
    peopleCount: 5,
    billTotalMinor: 184_000,
    claimedItemCount: 4,
    totalItemCount: 5,
    settledShareCount: 3,
    totalShareCount: 5,
  };

  it("renders the tab-opened card", () => {
    expect(renderTabStatusCard({ ...base, event: "tab_opened" })).toBe(
      "🍜 Sukhumvit Dinner is open\n5 people · ฿1,840.00 total\n4 of 5 items claimed",
    );
  });

  it("renders the waiting state before any item exists", () => {
    expect(
      renderTabStatusCard({
        ...base,
        event: "tab_opened",
        peopleCount: 1,
        billTotalMinor: null,
        claimedItemCount: 0,
        totalItemCount: 0,
      }),
    ).toBe("🍜 Sukhumvit Dinner is open\n1 person\nNothing to claim yet.");
  });

  it("renders the bill-ready card", () => {
    expect(
      renderTabStatusCard({ ...base, event: "bill_ready", settledShareCount: 0 }),
    ).toBe("🍜 Sukhumvit Dinner is ready\n5 people · ฿1,840.00 total\n0 of 5 shares settled");
  });

  it("renders the payment-confirmed card with the same headline as bill-ready", () => {
    const ready = renderTabStatusCard({ ...base, event: "bill_ready" });
    const confirmed = renderTabStatusCard({ ...base, event: "payment_confirmed" });

    expect(confirmed).toBe(
      "🍜 Sukhumvit Dinner is ready\n5 people · ฿1,840.00 total\n3 of 5 shares settled",
    );
    // The headline must not change on a payment: the group learns that
    // progress happened, not who made it.
    expect(confirmed.split("\n")[0]).toBe(ready.split("\n")[0]);
  });

  it("renders the bill-completed card", () => {
    expect(
      renderTabStatusCard({ ...base, event: "bill_completed", settledShareCount: 5 }),
    ).toBe("🍜 Sukhumvit Dinner is all square\n5 people · ฿1,840.00 total\nAll 5 shares settled.");
  });

  it("renders the tip confirmation — the one message that names people", () => {
    expect(
      renderTipConfirmation({
        senderDisplayName: "Andre",
        recipientDisplayName: "Maya",
        displayAmountThbMinor: 10_000,
      }),
    ).toBe("Andre tipped Maya ฿100.00");
  });

  it("never rounds an amount", () => {
    expect(
      renderTabStatusCard({ ...base, event: "bill_ready", billTotalMinor: 29_174 }),
    ).toContain("฿291.74");
  });
});

describe("NFR-7 — a group message carries group facts only", () => {
  const everyCard = TELEGRAM_STATUS_EVENTS.map((event) =>
    renderTabStatusCard({
      tabName: "Sukhumvit Dinner",
      event,
      peopleCount: 5,
      billTotalMinor: 184_000,
      claimedItemCount: 4,
      totalItemCount: 5,
      settledShareCount: 3,
      totalShareCount: 5,
    }),
  );

  const everyGroupString = [
    ...everyCard,
    renderBotAdminRepairMessage(),
    renderNotAMemberMessage(),
    OPEN_TAB_BUTTON_LABEL,
  ];

  it("names nobody on the card", () => {
    for (const card of everyCard) {
      expect(card).not.toMatch(/Andre|Maya|owes|paid by/i);
    }
  });

  it("carries no address, link, or explorer reference", () => {
    for (const text of everyGroupString) {
      expect(text).not.toMatch(/https?:\/\/|solscan|explorer|0x|[1-9A-HJ-NP-Za-km-z]{32,}/);
    }
  });

  it("uses none of the banned words", () => {
    for (const text of everyGroupString) {
      expect(findBannedCopyWords(text)).toEqual([]);
    }
    // Guard the guard: the matcher must actually catch something.
    expect(findBannedCopyWords("we will broadcast the transaction")).toEqual(
      expect.arrayContaining(["broadcast", "transaction"]),
    );
    expect(BANNED_COPY_WORDS.length).toBeGreaterThan(10);
  });

  it("always promises the same button", () => {
    expect(OPEN_TAB_BUTTON_LABEL).toBe("Open tab");
  });
});

describe("exactly five events may post", () => {
  it("names five and only five", () => {
    expect(TELEGRAM_POSTING_EVENTS).toEqual([
      "tab_opened",
      "bill_ready",
      "payment_confirmed",
      "bill_completed",
      "tip_confirmed",
    ]);
  });

  it("refuses to render a sixth", () => {
    expect(() =>
      renderTabStatusCard({
        tabName: "Sukhumvit Dinner",
        event: "item_claimed" as unknown as TelegramStatusEvent,
        peopleCount: 2,
        billTotalMinor: null,
        claimedItemCount: 0,
        totalItemCount: 0,
        settledShareCount: 0,
        totalShareCount: 0,
      }),
    ).toThrow(UnsanctionedTelegramEventError);
  });

  it("refuses to record a sixth", async () => {
    const { ctx } = seedTab();
    await expect(
      recordTabStatusEvent(ctx, {
        tabId: TAB_ID,
        event: "member_joined" as unknown as TelegramStatusEvent,
      }),
    ).rejects.toThrow(/UNSUPPORTED_TELEGRAM_EVENT/);
  });
});

// ---------------------------------------------------------------------------
// One message per tab
// ---------------------------------------------------------------------------

describe("one status message per tab", () => {
  it("keeps a single row across every event", async () => {
    const { ctx, store } = seedTab();

    await recordTabStatusEvent(ctx, { tabId: TAB_ID, event: "tab_opened", now: 1_000 });
    await recordTabStatusEvent(ctx, { tabId: TAB_ID, event: "bill_ready", now: 2_000 });
    await recordTabStatusEvent(ctx, { tabId: TAB_ID, event: "payment_confirmed", now: 3_000 });
    await recordTabStatusEvent(ctx, { tabId: TAB_ID, event: "bill_completed", now: 4_000 });

    expect(store.telegramStatusMessages).toHaveLength(1);
    expect(store.telegramStatusMessages[0]?.eventVersion).toBe(4);
    expect(store.telegramStatusMessages[0]?.event).toBe("bill_completed");
  });

  it("does not spend a Telegram call when nothing changed", async () => {
    const { ctx, store } = seedTab();

    await recordTabStatusEvent(ctx, { tabId: TAB_ID, event: "tab_opened", now: 1_000 });
    // Pretend the first delivery landed.
    const row = store.telegramStatusMessages[0]!;
    row.messageId = 501;
    row.deliveredText = row.renderedText;
    row.deliveredVersion = row.eventVersion;

    const repeat = await recordTabStatusEvent(ctx, {
      tabId: TAB_ID,
      event: "tab_opened",
      now: 2_000,
    });

    expect(repeat).toEqual({ recorded: false, reason: "UNCHANGED" });
    expect(store.telegramStatusMessages[0]?.eventVersion).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The concurrency argument
// ---------------------------------------------------------------------------

describe("delivery claims are mutually exclusive", () => {
  it("gives the card to one worker and refuses the other", async () => {
    const { ctx } = seedTab();
    await recordTabStatusEvent(ctx, { tabId: TAB_ID, event: "tab_opened", now: 1_000 });

    const first = await claimStatusDelivery(ctx, TAB_ID, 1_000);
    const second = await claimStatusDelivery(ctx, TAB_ID, 1_001);

    expect(first.claimed).toBe(true);
    expect(second.claimed).toBe(false);
    if (!second.claimed) {
      expect(second.reason).toBe("ALREADY_CLAIMED");
    }
  });

  it("lets a later worker take over once the lease has expired", async () => {
    const { ctx } = seedTab();
    await recordTabStatusEvent(ctx, { tabId: TAB_ID, event: "tab_opened", now: 1_000 });

    const first = await claimStatusDelivery(ctx, TAB_ID, 1_000);
    const later = await claimStatusDelivery(ctx, TAB_ID, 1_000 + STATUS_CLAIM_LEASE_MS + 1);

    expect(first.claimed && later.claimed).toBe(true);
    if (first.claimed && later.claimed) {
      expect(later.work.claimId).not.toBe(first.work.claimId);
    }
  });

  it("refuses a commit from a worker whose claim was taken", async () => {
    const { ctx, store } = seedTab();
    await recordTabStatusEvent(ctx, { tabId: TAB_ID, event: "tab_opened", now: 1_000 });

    const stale = await claimStatusDelivery(ctx, TAB_ID, 1_000);
    expect(stale.claimed).toBe(true);
    if (!stale.claimed) {
      return;
    }

    const fresh = await claimStatusDelivery(ctx, TAB_ID, 1_000 + STATUS_CLAIM_LEASE_MS + 1);
    expect(fresh.claimed).toBe(true);
    if (!fresh.claimed) {
      return;
    }

    const staleCommit = await commitStatusDelivery(ctx, {
      tabId: TAB_ID,
      claimId: stale.work.claimId,
      messageId: 111,
      deliveredVersion: 1,
    });
    const freshCommit = await commitStatusDelivery(ctx, {
      tabId: TAB_ID,
      claimId: fresh.work.claimId,
      messageId: 222,
      deliveredVersion: 1,
    });

    expect(staleCommit).toEqual({ committed: false, reason: "CLAIM_LOST" });
    expect(freshCommit.committed).toBe(true);
    expect(store.telegramStatusMessages[0]?.messageId).toBe(222);
  });

  it("still commits when the lease lapsed but nobody else took the card", async () => {
    const { ctx } = seedTab();
    await recordTabStatusEvent(ctx, { tabId: TAB_ID, event: "tab_opened", now: 1_000 });
    const claim = await claimStatusDelivery(ctx, TAB_ID, 1_000);
    expect(claim.claimed).toBe(true);
    if (!claim.claimed) {
      return;
    }

    const commit = await commitStatusDelivery(ctx, {
      tabId: TAB_ID,
      claimId: claim.work.claimId,
      messageId: 333,
      deliveredVersion: 1,
      now: 1_000 + STATUS_CLAIM_LEASE_MS + 5_000,
    });

    expect(commit).toEqual({ committed: true, staleVersion: false });
  });
});

describe("deleted-message recovery posts exactly one replacement", () => {
  async function seedDelivered() {
    const { ctx, store } = seedTab();
    await recordTabStatusEvent(ctx, { tabId: TAB_ID, event: "tab_opened", now: 1_000 });
    const claim = await claimStatusDelivery(ctx, TAB_ID, 1_000);
    if (!claim.claimed) {
      throw new Error("expected a claim");
    }
    await commitStatusDelivery(ctx, {
      tabId: TAB_ID,
      claimId: claim.work.claimId,
      messageId: 900,
      deliveredVersion: 1,
      now: 1_100,
    });
    await recordTabStatusEvent(ctx, { tabId: TAB_ID, event: "bill_ready", now: 2_000 });
    return { ctx, store };
  }

  function missingThenSend(sent: number[], sendId = 901) {
    return {
      edit: async () => ({
        ok: false as const,
        kind: "message_missing" as const,
        description: "Bad Request: message to edit not found",
      }),
      send: async () => {
        sent.push(sendId);
        return { ok: true as const, result: { message_id: sendId } };
      },
      remove: async () => undefined,
    };
  }

  it("replaces a card the group deleted and resumes editing", async () => {
    const { ctx, store } = await seedDelivered();
    const sent: number[] = [];

    const outcome = await deliverTabStatus({
      fixture: false,
      port: missingThenSend(sent),
      claim: () => claimStatusDelivery(ctx, TAB_ID, 2_000),
      reserveReplacement: (claimId) =>
        reserveStatusReplacement(ctx, { tabId: TAB_ID, claimId, now: 2_000 }),
      commit: (input) => commitStatusDelivery(ctx, { tabId: TAB_ID, ...input, now: 2_100 }),
      fail: (input) => failStatusDelivery(ctx, { tabId: TAB_ID, ...input, now: 2_100 }),
      reschedule: async () => undefined,
    });

    expect(outcome).toEqual({ delivered: true, recovered: true });
    expect(sent).toEqual([901]);
    expect(store.telegramStatusMessages).toHaveLength(1);
    expect(store.telegramStatusMessages[0]?.messageId).toBe(901);
    expect(store.telegramStatusMessages[0]?.replacementCount).toBe(1);
  });

  it("refuses a second replacement inside the same claim", async () => {
    const { ctx } = await seedDelivered();
    const claim = await claimStatusDelivery(ctx, TAB_ID, 2_000);
    expect(claim.claimed).toBe(true);
    if (!claim.claimed) {
      return;
    }

    const first = await reserveStatusReplacement(ctx, {
      tabId: TAB_ID,
      claimId: claim.work.claimId,
      now: 2_000,
    });
    const second = await reserveStatusReplacement(ctx, {
      tabId: TAB_ID,
      claimId: claim.work.claimId,
      now: 2_001,
    });

    expect(first).toEqual({ reserved: true });
    expect(second).toEqual({ reserved: false, reason: "ALREADY_RESERVED" });
  });

  it("refuses a replacement from a worker that lost its claim", async () => {
    const { ctx } = await seedDelivered();
    const stale = await claimStatusDelivery(ctx, TAB_ID, 2_000);
    expect(stale.claimed).toBe(true);
    if (!stale.claimed) {
      return;
    }
    await claimStatusDelivery(ctx, TAB_ID, 2_000 + STATUS_CLAIM_LEASE_MS + 1);

    const reservation = await reserveStatusReplacement(ctx, {
      tabId: TAB_ID,
      claimId: stale.work.claimId,
      now: 2_000 + STATUS_CLAIM_LEASE_MS + 2,
    });

    expect(reservation).toEqual({ reserved: false, reason: "CLAIM_LOST" });
  });

  it("leaves exactly one card when two workers race a deleted message", async () => {
    const { ctx, store } = await seedDelivered();
    const sentA: number[] = [];
    const sentB: number[] = [];
    const removed: Array<{ chatId: string; messageId: number }> = [];

    // Worker A claims and starts talking to Telegram. Worker B arrives while
    // A is in flight and is refused the claim outright.
    const workerA = deliverTabStatus({
      fixture: false,
      port: {
        ...missingThenSend(sentA, 910),
        remove: async (input) => {
          removed.push(input);
        },
      },
      claim: () => claimStatusDelivery(ctx, TAB_ID, 2_000),
      reserveReplacement: (claimId) =>
        reserveStatusReplacement(ctx, { tabId: TAB_ID, claimId, now: 2_010 }),
      commit: (input) => commitStatusDelivery(ctx, { tabId: TAB_ID, ...input, now: 2_020 }),
      fail: (input) => failStatusDelivery(ctx, { tabId: TAB_ID, ...input, now: 2_020 }),
      reschedule: async () => undefined,
    });

    const workerB = deliverTabStatus({
      fixture: false,
      port: {
        ...missingThenSend(sentB, 920),
        remove: async (input) => {
          removed.push(input);
        },
      },
      claim: () => claimStatusDelivery(ctx, TAB_ID, 2_001),
      reserveReplacement: (claimId) =>
        reserveStatusReplacement(ctx, { tabId: TAB_ID, claimId, now: 2_011 }),
      commit: (input) => commitStatusDelivery(ctx, { tabId: TAB_ID, ...input, now: 2_021 }),
      fail: (input) => failStatusDelivery(ctx, { tabId: TAB_ID, ...input, now: 2_021 }),
      reschedule: async () => undefined,
    });

    const [a, b] = await Promise.all([workerA, workerB]);

    const delivered = [a, b].filter((outcome) => outcome.delivered);
    expect(delivered).toHaveLength(1);
    expect(sentA.length + sentB.length).toBe(1);
    expect(removed).toEqual([]);
    expect(store.telegramStatusMessages).toHaveLength(1);
  });

  it("deletes the replacement it posted if the claim moved on mid-flight", async () => {
    const { ctx, store } = await seedDelivered();
    const removed: Array<{ chatId: string; messageId: number }> = [];

    const outcome = await deliverTabStatus({
      fixture: false,
      port: {
        edit: async () => ({
          ok: false as const,
          kind: "message_missing" as const,
          description: "Bad Request: message to edit not found",
        }),
        send: async () => {
          // The lease lapsed and another worker claimed the row while this
          // send was in flight.
          store.telegramStatusMessages[0]!.claimId = "another-worker";
          return { ok: true as const, result: { message_id: 930 } };
        },
        remove: async (input) => {
          removed.push(input);
        },
      },
      claim: () => claimStatusDelivery(ctx, TAB_ID, 2_000),
      reserveReplacement: (claimId) =>
        reserveStatusReplacement(ctx, { tabId: TAB_ID, claimId, now: 2_010 }),
      commit: (input) => commitStatusDelivery(ctx, { tabId: TAB_ID, ...input, now: 2_020 }),
      fail: (input) => failStatusDelivery(ctx, { tabId: TAB_ID, ...input, now: 2_020 }),
      reschedule: async () => undefined,
    });

    expect(outcome).toEqual({ delivered: false, reason: "CLAIM_LOST" });
    expect(removed).toEqual([{ chatId: "-1001234567890", messageId: 930 }]);
    expect(store.telegramStatusMessages[0]?.messageId).not.toBe(930);
  });

  it("treats an unmodified edit as delivered rather than retrying forever", async () => {
    const { ctx, store } = await seedDelivered();

    const outcome = await deliverTabStatus({
      fixture: false,
      port: {
        edit: async () => ({
          ok: false as const,
          kind: "not_modified" as const,
          description: "Bad Request: message is not modified",
        }),
        send: async () => {
          throw new Error("must not post");
        },
        remove: async () => undefined,
      },
      claim: () => claimStatusDelivery(ctx, TAB_ID, 2_000),
      reserveReplacement: (claimId) =>
        reserveStatusReplacement(ctx, { tabId: TAB_ID, claimId, now: 2_010 }),
      commit: (input) => commitStatusDelivery(ctx, { tabId: TAB_ID, ...input, now: 2_020 }),
      fail: (input) => failStatusDelivery(ctx, { tabId: TAB_ID, ...input, now: 2_020 }),
      reschedule: async () => undefined,
    });

    expect(outcome).toEqual({ delivered: true, unchanged: true });
    expect(store.telegramStatusMessages[0]?.messageId).toBe(900);
  });
});

// ---------------------------------------------------------------------------
// Transport classification
// ---------------------------------------------------------------------------

describe("Telegram failures are classified before they are retried", () => {
  it("reads retry_after off a 429", () => {
    const result = classifyTelegramResponse(429, {
      ok: false,
      error_code: 429,
      description: "Too Many Requests: retry after 12",
      parameters: { retry_after: 12 },
    });
    expect(result).toMatchObject({ ok: false, kind: "rate_limited", retryAfterMs: 12_000 });
  });

  it("recognises a deleted message as recoverable, not permanent", () => {
    expect(
      classifyTelegramResponse(400, {
        ok: false,
        error_code: 400,
        description: "Bad Request: message to edit not found",
      }),
    ).toMatchObject({ kind: "message_missing" });
  });

  it("recognises an unchanged edit", () => {
    expect(
      classifyTelegramResponse(400, {
        ok: false,
        description: "Bad Request: message is not modified",
      }),
    ).toMatchObject({ kind: "not_modified" });
  });

  it("recognises a demoted bot as permanent", () => {
    expect(
      classifyTelegramResponse(400, {
        ok: false,
        error_code: 400,
        description: "Bad Request: not enough rights to send text messages to the chat",
      }),
    ).toMatchObject({ kind: "not_permitted" });
    expect(nextRetryDelayMs(1, "not_permitted")).toBeNull();
  });

  it("retries a 5xx and a socket failure, with a ceiling", () => {
    expect(classifyTelegramResponse(502, null)).toMatchObject({ kind: "transient" });
    expect(nextRetryDelayMs(1, "transient")).toBe(1_000);
    expect(nextRetryDelayMs(2, "transient")).toBe(4_000);
    expect(nextRetryDelayMs(3, "transient")).toBe(16_000);
    expect(nextRetryDelayMs(4, "transient")).toBe(30_000);
    expect(nextRetryDelayMs(TELEGRAM_MAX_ATTEMPTS, "transient")).toBeNull();
  });

  it("passes a successful body straight through", () => {
    expect(classifyTelegramResponse(200, { ok: true, result: { message_id: 7 } })).toEqual({
      ok: true,
      result: { message_id: 7 },
    });
  });
});
