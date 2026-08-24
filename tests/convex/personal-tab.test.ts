import { describe, expect, it } from "vitest";
import { createPersonalTabForUser } from "../../convex/lib/personalTab";
import { admitToTabSession, TAB_ADMISSION_FAILURE } from "../../convex/lib/sessionTokenOps";
import { hashSessionToken } from "../../convex/lib/sessionTokenSync";
import { createFakeCtx, type Row } from "../helpers/convexFakeDb";
import type { Doc } from "../../convex/_generated/dataModel";

const NOW = 1_800_000_000_000;

function seed() {
  const store: Record<string, Row[]> = {
    users: [
      {
        _id: "users:1",
        privyDid: "did:privy:maya",
        telegramUserId: "100",
        displayName: "Maya",
      },
      {
        _id: "users:2",
        privyDid: "did:privy:andre",
        telegramUserId: "200",
        displayName: "Andre",
      },
    ],
    telegramContexts: [
      {
        _id: "telegramContexts:1",
        privyDid: "did:privy:maya",
        telegramUserId: "100",
        chatId: "100",
        groupId: "",
        initDataHash: "h",
        expiresAt: NOW + 60_000,
      },
      {
        _id: "telegramContexts:2",
        privyDid: "did:privy:andre",
        telegramUserId: "200",
        chatId: "200",
        groupId: "",
        initDataHash: "h2",
        expiresAt: NOW + 60_000,
      },
    ],
    groups: [],
    groupMembers: [],
    tabs: [],
    tabParticipants: [],
    sessionTokens: [],
    tabCreationCounts: [],
    telegramStatusMessages: [],
  };
  return createFakeCtx(store);
}

function userFrom(store: Record<string, Row[]>, id: string): Doc<"users"> {
  return store.users!.find((row) => row._id === id) as unknown as Doc<"users">;
}

describe("createPersonalTabForUser", () => {
  it("replays an exact committed create before the daily gate and rejects divergent reuse", async () => {
    const { ctx, store } = seed();
    const input = {
      user: userFrom(store, "users:1"),
      name: "Replay Dinner",
      seats: 4,
      idempotencyKey: "exact-create",
      now: NOW,
    };
    const first = await createPersonalTabForUser(ctx, input);
    store.tabs![0]!.status = "open";
    store.tabCreationCounts![0]!.count = 10;

    await expect(createPersonalTabForUser(ctx, input)).resolves.toMatchObject({
      tabId: first.tabId,
      token: first.token,
      duplicate: true,
    });
    await expect(createPersonalTabForUser(ctx, { ...input, seats: 5 }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(store.tabs).toHaveLength(1);
  });

  it("writes personal origin, fixed seats, organizer on the roster, one token", async () => {
    const { ctx, store } = seed();

    const created = await createPersonalTabForUser(ctx, {
      user: userFrom(store, "users:1"),
      name: "Sukhumvit Dinner",
      seats: 5,
      idempotencyKey: "personal-1",
      now: NOW,
    });

    expect(created.seats).toBe(5);
    expect(store.tabs).toHaveLength(1);
    expect(store.tabs![0]).toMatchObject({
      origin: "personal",
      seatPolicy: { kind: "fixed", seats: 5 },
      organizerTelegramUserId: "100",
      liveInviteToken: created.token,
    });
    expect(store.tabParticipants).toHaveLength(1);
    expect(store.tabParticipants![0]).toMatchObject({
      userId: "users:1",
      telegramUserId: "100",
    });
    expect(store.sessionTokens).toHaveLength(1);
    expect(store.sessionTokens![0]!.tokenHash).toBe(hashSessionToken(created.token));
    expect(store.groups![0]).toMatchObject({
      kind: "personal",
      telegramChatId: "100",
      botIsAdmin: false,
    });
    expect(store.telegramStatusMessages).toHaveLength(0);
  });

  it("refuses a seat count outside 2–20", async () => {
    const { ctx, store } = seed();
    await expect(
      createPersonalTabForUser(ctx, {
        user: userFrom(store, "users:1"),
        name: "Dinner",
        seats: 1,
        idempotencyKey: "invalid-seats",
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "INVALID_SEATS" });
    expect(store.tabs).toHaveLength(0);
  });

  it("enforces the per-user daily ceiling before inserting anything", async () => {
    const { ctx, store } = seed();
    store.tabCreationCounts!.push({
      _id: "tabCreationCounts:limit",
      scopeKind: "user",
      scopeKey: "100",
      dayKey: "2027-01-15",
      count: 10,
      updatedAt: NOW,
    });
    await expect(
      createPersonalTabForUser(ctx, {
        user: userFrom(store, "users:1"),
        name: "Dinner",
        seats: 2,
        idempotencyKey: "rate-limited",
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "TAB_RATE_LIMITED" });
    expect(store.tabs).toHaveLength(0);
    expect(store.groups).toHaveLength(0);
  });

  it("the invite token admits a second person and consumes a seat", async () => {
    const { ctx, store } = seed();
    const created = await createPersonalTabForUser(ctx, {
      user: userFrom(store, "users:1"),
      name: "Dinner",
      seats: 2,
      idempotencyKey: "personal-admission",
      now: NOW,
    });

    const joined = await admitToTabSession(ctx, {
      token: created.token,
      user: userFrom(store, "users:2"),
      now: NOW,
    });
    expect(joined).toMatchObject({ ok: true, joined: true });
    expect(store.tabParticipants).toHaveLength(2);

    // A third person loses the last seat.
    store.users!.push({
      _id: "users:3",
      privyDid: "did:privy:tim",
      telegramUserId: "300",
      displayName: "Tim",
    });
    store.telegramContexts!.push({
      _id: "telegramContexts:3",
      privyDid: "did:privy:tim",
      telegramUserId: "300",
      chatId: "300",
      groupId: "",
      initDataHash: "h3",
      expiresAt: NOW + 60_000,
    });

    const full = await admitToTabSession(ctx, {
      token: created.token,
      user: userFrom(store, "users:3"),
      now: NOW,
    });
    expect(full).toMatchObject({ ok: false, code: TAB_ADMISSION_FAILURE.TAB_FULL });
  });
});
