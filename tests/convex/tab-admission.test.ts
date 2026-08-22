/**
 * The ingress path's three holes, and the exploits they closed.
 *
 * Every test here is written from the attacker's side first: the thing that
 * used to work and must not, then the legitimate flow that must still work.
 */

import { describe, expect, it } from "vitest";
import {
  INVITE_MINT_FAILURE,
  TAB_ADMISSION_FAILURE,
  admitToTabSession,
  decideInviteMint,
  decideTabAdmission,
  mintTabInviteToken,
  readChatMembershipProof,
  seatAvailable,
} from "../../convex/lib/sessionTokenOps";
import { hashSessionToken } from "../../convex/lib/sessionTokenSync";
import { MEMBERSHIP_CACHE_TTL_MS } from "../../convex/lib/telegramMembership";
import { createFakeCtx, type Row } from "../helpers/convexFakeDb";
import type { Doc } from "../../convex/_generated/dataModel";

const NOW = 1_800_000_000_000;
const TAB_ID = "tabs:1";
const GROUP_ID = "groups:1";
const TOKEN = "opaque-invite-token-value";

type Options = {
  /** Token lifecycle. */
  tokenStatus?: "active" | "revoked" | "consumed" | "expired";
  tokenExpiresAt?: number;
  /** Tab lifecycle. */
  tabStatus?: "draft" | "open" | "locked" | "settled" | "closed";
  seatPolicy?: Doc<"tabs">["seatPolicy"];
  /** The arriving person. */
  onRoster?: boolean;
  hasTelegramContext?: boolean;
  /** The cached membership row for the arriving person. */
  memberVerificationSource?: "webhook" | "bootstrap" | "getChatMember";
  memberVerifiedAt?: number;
  membershipStatus?: "active" | "left" | "kicked" | "restricted";
  memberRowMissing?: boolean;
  /** The group's cached bot-admin fact. */
  botIsAdmin?: boolean;
  botAdminCheckedAt?: number;
  /** Extra roster rows, for seat pressure. */
  extraParticipants?: number;
};

/**
 * Maya organizes, Andre arrives. `users:2` is the caller in every test unless
 * the test says otherwise.
 */
function seed(options: Options = {}) {
  const arriving: Row = {
    _id: "users:2",
    privyDid: "did:privy:andre",
    telegramUserId: "200",
    displayName: "Andre",
  };

  const participants: Row[] = options.onRoster
    ? [
        {
          _id: "tabParticipants:1",
          tabId: TAB_ID,
          userId: "users:2",
          telegramUserId: "200",
          joinedAt: NOW - 1000,
        },
      ]
    : [];

  for (let index = 0; index < (options.extraParticipants ?? 0); index += 1) {
    participants.push({
      _id: `tabParticipants:9${index}`,
      tabId: TAB_ID,
      userId: `users:9${index}`,
      telegramUserId: `90${index}`,
      joinedAt: NOW - 1000,
    });
  }

  const store: Record<string, Row[]> = {
    users: [
      {
        _id: "users:1",
        privyDid: "did:privy:maya",
        telegramUserId: "100",
        displayName: "Maya",
      },
      arriving,
      {
        _id: "users:3",
        privyDid: "did:privy:mallory",
        telegramUserId: "300",
        displayName: "Mallory",
      },
    ],
    telegramContexts:
      options.hasTelegramContext === false
        ? []
        : [
            {
              _id: "telegramContexts:1",
              privyDid: "did:privy:andre",
              telegramUserId: "200",
              chatId: "-1001",
              groupId: GROUP_ID,
              initDataHash: "hash",
              expiresAt: NOW + 60_000,
            },
            {
              _id: "telegramContexts:2",
              privyDid: "did:privy:maya",
              telegramUserId: "100",
              chatId: "-1001",
              groupId: GROUP_ID,
              initDataHash: "hash",
              expiresAt: NOW + 60_000,
            },
            {
              _id: "telegramContexts:3",
              privyDid: "did:privy:mallory",
              telegramUserId: "300",
              chatId: "-1001",
              groupId: GROUP_ID,
              initDataHash: "hash",
              expiresAt: NOW + 60_000,
            },
          ],
    groups: [
      {
        _id: GROUP_ID,
        telegramChatId: "-1001",
        displayName: "Sukhumvit Crew",
        botIsAdmin: options.botIsAdmin ?? true,
        botAdminCheckedAt: options.botAdminCheckedAt ?? NOW - 1000,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    groupMembers: options.memberRowMissing
      ? []
      : [
          {
            _id: "groupMembers:1",
            groupId: GROUP_ID,
            telegramUserId: "200",
            displayName: "Andre",
            role: "member",
            membershipStatus: options.membershipStatus ?? "active",
            verificationSource: options.memberVerificationSource ?? "getChatMember",
            verifiedAt: options.memberVerifiedAt ?? NOW - 1000,
          },
          {
            _id: "groupMembers:2",
            groupId: GROUP_ID,
            telegramUserId: "100",
            displayName: "Maya",
            role: "creator",
            membershipStatus: "active",
            verificationSource: options.memberVerificationSource ?? "getChatMember",
            verifiedAt: options.memberVerifiedAt ?? NOW - 1000,
          },
          {
            _id: "groupMembers:3",
            groupId: GROUP_ID,
            telegramUserId: "300",
            displayName: "Mallory",
            role: "member",
            membershipStatus: "active",
            verificationSource: "getChatMember",
            verifiedAt: NOW - 1000,
          },
        ],
    tabs: [
      {
        _id: TAB_ID,
        groupId: GROUP_ID,
        organizerTelegramUserId: "100",
        name: "Sukhumvit Dinner",
        status: options.tabStatus ?? "open",
        ...(options.seatPolicy ? { seatPolicy: options.seatPolicy } : {}),
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    tabParticipants: participants,
    sessionTokens: [
      {
        _id: "sessionTokens:1",
        tokenHash: hashSessionToken(TOKEN),
        tokenType: "tab_session",
        subjectKind: "tab",
        subjectId: TAB_ID,
        groupId: GROUP_ID,
        status: options.tokenStatus ?? "active",
        expiresAt: options.tokenExpiresAt ?? NOW + 60_000,
        createdAt: NOW - 10_000,
      },
    ],
  };

  const { ctx, store: live } = createFakeCtx(store);
  return { ctx, store: live, arriving: arriving as unknown as Doc<"users"> };
}

function userFrom(store: Record<string, Row[]>, id: string): Doc<"users"> {
  return store.users!.find((row) => row._id === id) as unknown as Doc<"users">;
}

// ---------------------------------------------------------------------------

describe("Hole 1 — POST /telegram/deep-link minted a token to anyone", () => {
  it("EXPLOIT: a signed-in stranger who can name the tab id gets nothing", async () => {
    const { ctx, store } = seed();

    // Mallory is a fully authenticated user and an active, freshly proven
    // member of the chat. Under the old `mintDeepLinkToken` that plus a tab id
    // and a matching group id was enough to be handed a raw `tab_session`.
    const result = await mintTabInviteToken(ctx, {
      tabId: TAB_ID as Doc<"tabs">["_id"],
      user: userFrom(store, "users:3"),
      now: NOW,
    });

    expect(result).toEqual({
      ok: false,
      code: INVITE_MINT_FAILURE.NOT_BILL_ORGANIZER,
    });
    // Nothing was minted. The token table is exactly as seeded.
    expect(store.sessionTokens).toHaveLength(1);
  });

  it("EXPLOIT: a participant on the tab still cannot enlarge it (§1.4)", async () => {
    const { ctx, store } = seed({ onRoster: true });

    const result = await mintTabInviteToken(ctx, {
      tabId: TAB_ID as Doc<"tabs">["_id"],
      user: userFrom(store, "users:2"),
      now: NOW,
    });

    expect(result).toEqual({
      ok: false,
      code: INVITE_MINT_FAILURE.NOT_BILL_ORGANIZER,
    });
    expect(store.sessionTokens).toHaveLength(1);
  });

  it("the organizer mints, and only the hash is stored (binding decision 4)", async () => {
    const { ctx, store } = seed();

    const result = await mintTabInviteToken(ctx, {
      tabId: TAB_ID as Doc<"tabs">["_id"],
      user: userFrom(store, "users:1"),
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(store.sessionTokens).toHaveLength(2);
    const minted = store.sessionTokens!.find((row) => row._id !== "sessionTokens:1")!;
    expect(minted.tokenHash).toBe(hashSessionToken(result.token));
    expect(minted.tokenHash).not.toBe(result.token);
    // The group is read off the stored tab, never off a request argument.
    expect(minted.groupId).toBe(GROUP_ID);
    expect(minted.subjectId).toBe(TAB_ID);
    expect(JSON.stringify(store.sessionTokens)).not.toContain(result.token);
  });

  it("refuses the organizer too when the chat check is stale, rather than trusting it", async () => {
    const { ctx, store } = seed({ memberVerifiedAt: NOW - MEMBERSHIP_CACHE_TTL_MS - 1 });

    const decision = await decideInviteMint(ctx, {
      tabId: TAB_ID as Doc<"tabs">["_id"],
      user: userFrom(store, "users:1"),
      now: NOW,
    });

    expect(decision.outcome).toBe("needs_membership_proof");

    // And a mutation, which cannot refresh, refuses instead of minting.
    const minted = await mintTabInviteToken(ctx, {
      tabId: TAB_ID as Doc<"tabs">["_id"],
      user: userFrom(store, "users:1"),
      now: NOW,
    });
    expect(minted).toEqual({
      ok: false,
      code: INVITE_MINT_FAILURE.MEMBERSHIP_UNPROVEN,
    });
    expect(store.sessionTokens).toHaveLength(1);
  });

  it("refuses a closed tab", async () => {
    const { ctx, store } = seed({ tabStatus: "closed" });
    const result = await mintTabInviteToken(ctx, {
      tabId: TAB_ID as Doc<"tabs">["_id"],
      user: userFrom(store, "users:1"),
      now: NOW,
    });
    expect(result).toEqual({ ok: false, code: INVITE_MINT_FAILURE.TAB_CLOSED });
  });
});

// ---------------------------------------------------------------------------

describe("Hole 2 — resolveTabSession trusted an unbounded, unverified cache", () => {
  it("EXPLOIT: a webhook-written membership row admits nobody, at any age", async () => {
    // `resolveGroupFromChat` upserts any message sender as
    // `membershipStatus: "active", verificationSource: "webhook"`. Posting once
    // in the chat used to be a permanent credential for opening any tab in it.
    const { ctx, store } = seed({
      memberVerificationSource: "webhook",
      memberVerifiedAt: NOW, // brand new, and still not proof
    });

    const proof = await readChatMembershipProof(ctx, {
      groupId: GROUP_ID as Doc<"groups">["_id"],
      telegramUserId: "200",
      now: NOW,
    });
    expect(proof.proven).toBe(false);

    const decision = await decideTabAdmission(ctx, {
      token: TOKEN,
      user: userFrom(store, "users:2"),
      now: NOW,
    });
    expect(decision.outcome).toBe("needs_membership_proof");

    // The writing path never falls back to the cache it could not prove.
    const result = await admitToTabSession(ctx, {
      token: TOKEN,
      user: userFrom(store, "users:2"),
      now: NOW,
    });
    expect(result).toEqual({
      ok: false,
      code: TAB_ADMISSION_FAILURE.MEMBERSHIP_UNPROVEN,
      facts: null,
    });
    expect(store.tabParticipants).toHaveLength(0);
  });

  it("EXPLOIT: a getChatMember row older than five minutes is refreshed, not trusted", async () => {
    const { ctx, store } = seed({ memberVerifiedAt: NOW - MEMBERSHIP_CACHE_TTL_MS - 1 });

    const decision = await decideTabAdmission(ctx, {
      token: TOKEN,
      user: userFrom(store, "users:2"),
      now: NOW,
    });

    expect(decision).toMatchObject({
      outcome: "needs_membership_proof",
      groupId: GROUP_ID,
      chatId: "-1001",
      telegramUserId: "200",
    });
  });

  it("a bot-admin fact older than five minutes is equally unproven", async () => {
    const { ctx, store } = seed({ botAdminCheckedAt: NOW - MEMBERSHIP_CACHE_TTL_MS - 1 });

    const decision = await decideTabAdmission(ctx, {
      token: TOKEN,
      user: userFrom(store, "users:2"),
      now: NOW,
    });
    expect(decision.outcome).toBe("needs_membership_proof");
  });

  it("admits a new person only on a fresh, proven, active membership", async () => {
    const { ctx, store } = seed();

    const result = await admitToTabSession(ctx, {
      token: TOKEN,
      user: userFrom(store, "users:2"),
      now: NOW,
    });

    expect(result).toMatchObject({ ok: true, tabId: TAB_ID, joined: true });
    expect(store.tabParticipants).toHaveLength(1);
    expect(store.tabParticipants![0]).toMatchObject({
      tabId: TAB_ID,
      userId: "users:2",
      telegramUserId: "200",
    });
  });

  it("refuses a proven non-member with the words designed for it", async () => {
    const { ctx, store } = seed({ membershipStatus: "left" });

    const result = await admitToTabSession(ctx, {
      token: TOKEN,
      user: userFrom(store, "users:2"),
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, code: TAB_ADMISSION_FAILURE.NOT_GROUP_MEMBER });
    expect(store.tabParticipants).toHaveLength(0);
  });

  it("refuses when the bot is not an administrator of a chat-origin tab", async () => {
    const { ctx, store } = seed({ botIsAdmin: false });

    const result = await admitToTabSession(ctx, {
      token: TOKEN,
      user: userFrom(store, "users:2"),
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, code: TAB_ADMISSION_FAILURE.BOT_NOT_ADMIN });
  });

  it("refuses a caller with no verified Telegram launch context", async () => {
    const { ctx, store } = seed({ hasTelegramContext: false });

    const result = await admitToTabSession(ctx, {
      token: TOKEN,
      user: userFrom(store, "users:2"),
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, code: TAB_ADMISSION_FAILURE.OPEN_IN_TELEGRAM });
    expect(store.tabParticipants).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe("§1.6 — the token admits; the roster authorizes", () => {
  const admittedOnRoster = [
    ["an expired token", { tokenStatus: "expired" as const }],
    ["a revoked token", { tokenStatus: "revoked" as const }],
    ["a token past its expiry timestamp", { tokenExpiresAt: NOW - 1 }],
    ["a locked bill", { tabStatus: "locked" as const }],
    ["a settled bill", { tabStatus: "settled" as const }],
    ["a full tab", { seatPolicy: { kind: "fixed" as const, seats: 1 } }],
    ["a membership cache that cannot be proven", { memberVerificationSource: "webhook" as const }],
    ["no Telegram context at all", { hasTelegramContext: false }],
  ];

  for (const [label, options] of admittedOnRoster) {
    it(`admits an existing participant on ${label}`, async () => {
      const { ctx, store } = seed({ ...(options as Options), onRoster: true });

      const result = await admitToTabSession(ctx, {
        token: TOKEN,
        user: userFrom(store, "users:2"),
        now: NOW,
      });

      expect(result).toMatchObject({ ok: true, tabId: TAB_ID, joined: false });
      // Re-entry consumes no seat and writes no second row.
      expect(store.tabParticipants).toHaveLength(1);
    });
  }

  it("does not admit a non-participant on a valid link once the roster is full", async () => {
    const { ctx, store } = seed({
      seatPolicy: { kind: "fixed", seats: 2 },
      extraParticipants: 2,
    });

    const result = await admitToTabSession(ctx, {
      token: TOKEN,
      user: userFrom(store, "users:2"),
      now: NOW,
    });

    expect(result).toMatchObject({
      ok: false,
      code: TAB_ADMISSION_FAILURE.TAB_FULL,
      facts: { tabName: "Sukhumvit Dinner", peopleCount: 2, organizerName: "Maya" },
    });
    expect(store.tabParticipants).toHaveLength(2);
  });

  it("the roster check runs before the token check, not after", async () => {
    // Same tab, same dead token, two people. The difference in outcome is the
    // roster row and nothing else — which is the whole rule.
    const onRoster = seed({ tokenStatus: "revoked", onRoster: true });
    const offRoster = seed({ tokenStatus: "revoked" });

    const admitted = await admitToTabSession(onRoster.ctx, {
      token: TOKEN,
      user: userFrom(onRoster.store, "users:2"),
      now: NOW,
    });
    const refused = await admitToTabSession(offRoster.ctx, {
      token: TOKEN,
      user: userFrom(offRoster.store, "users:2"),
      now: NOW,
    });

    expect(admitted.ok).toBe(true);
    expect(refused).toMatchObject({ ok: false, code: TAB_ADMISSION_FAILURE.LINK_REVOKED });
  });
});

// ---------------------------------------------------------------------------

describe("§5.6 — every refusal has its own cause", () => {
  it("distinguishes expired from revoked from missing", async () => {
    const expired = seed({ tokenExpiresAt: NOW - 1 });
    const revoked = seed({ tokenStatus: "revoked" });
    const missing = seed();

    expect(
      await admitToTabSession(expired.ctx, {
        token: TOKEN,
        user: userFrom(expired.store, "users:2"),
        now: NOW,
      }),
    ).toMatchObject({ ok: false, code: TAB_ADMISSION_FAILURE.LINK_EXPIRED });

    expect(
      await admitToTabSession(revoked.ctx, {
        token: TOKEN,
        user: userFrom(revoked.store, "users:2"),
        now: NOW,
      }),
    ).toMatchObject({ ok: false, code: TAB_ADMISSION_FAILURE.LINK_REVOKED });

    expect(
      await admitToTabSession(missing.ctx, {
        token: "a-token-nobody-ever-minted",
        user: userFrom(missing.store, "users:2"),
        now: NOW,
      }),
    ).toMatchObject({ ok: false, code: TAB_ADMISSION_FAILURE.LINK_NOT_FOUND, facts: null });
  });

  it("refuses a locked bill to someone who never claimed", async () => {
    const { ctx, store } = seed({ tabStatus: "locked" });
    expect(
      await admitToTabSession(ctx, {
        token: TOKEN,
        user: userFrom(store, "users:2"),
        now: NOW,
      }),
    ).toMatchObject({
      ok: false,
      code: TAB_ADMISSION_FAILURE.TAB_LOCKED_NO_ENTRY,
      facts: { tabName: "Sukhumvit Dinner" },
    });
  });

  it("refuses a closed tab before it looks at anything else", async () => {
    const { ctx, store } = seed({ tabStatus: "closed", onRoster: true });
    expect(
      await admitToTabSession(ctx, {
        token: TOKEN,
        user: userFrom(store, "users:2"),
        now: NOW,
      }),
    ).toMatchObject({ ok: false, code: TAB_ADMISSION_FAILURE.TAB_CLOSED });
  });

  it("refuses an action_token presented as a tab session", async () => {
    const { ctx, store } = seed();
    store.sessionTokens![0]!.tokenType = "action_token";

    expect(
      await admitToTabSession(ctx, {
        token: TOKEN,
        user: userFrom(store, "users:2"),
        now: NOW,
      }),
    ).toMatchObject({ ok: false, code: TAB_ADMISSION_FAILURE.LINK_NOT_FOUND });
  });

  it("refusal facts carry group facts only — never an amount", async () => {
    const { ctx, store } = seed({ tokenStatus: "revoked", extraParticipants: 3 });
    const result = await admitToTabSession(ctx, {
      token: TOKEN,
      user: userFrom(store, "users:2"),
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(Object.keys(result.facts ?? {}).sort()).toEqual([
      "organizerName",
      "peopleCount",
      "tabName",
    ]);
  });
});

describe("§1.5 — seats", () => {
  it("a chat-bounded tab has no seat limit", () => {
    expect(seatAvailable({ seatPolicy: undefined }, 500)).toBe(true);
    expect(seatAvailable({ seatPolicy: { kind: "chat" } }, 500)).toBe(true);
  });

  it("a fixed policy admits up to the head count and no further", () => {
    expect(seatAvailable({ seatPolicy: { kind: "fixed", seats: 5 } }, 4)).toBe(true);
    expect(seatAvailable({ seatPolicy: { kind: "fixed", seats: 5 } }, 5)).toBe(false);
  });
});
