import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  ACTION_TOKEN_TTL_MS,
  TAB_SESSION_TTL_MS,
  assertTokenActive,
  assertTokenType,
  generateOpaqueToken,
  hashSessionToken,
  isTokenExpired,
  type SessionSubjectKind,
  type SessionTokenType,
} from "./sessionTokenSync";
import { isCheckFresh } from "./telegramMembership";
import { tabOrigin } from "./tabOrigin";

export type MintSessionTokenInput = {
  tokenType: SessionTokenType;
  subjectKind: SessionSubjectKind;
  subjectId: string;
  groupId: Id<"groups">;
  now?: number;
};

export type MintSessionTokenResult = {
  token: string;
  tokenId: Id<"sessionTokens">;
  expiresAt: number;
};

/** Mints an opaque session token and persists its hash (Story 1.9 AC1). */
export async function mintSessionToken(
  ctx: MutationCtx,
  input: MintSessionTokenInput,
): Promise<MintSessionTokenResult> {
  const now = input.now ?? Date.now();
  const token = generateOpaqueToken();
  const tokenHash = hashSessionToken(token);
  const ttl = input.tokenType === "tab_session" ? TAB_SESSION_TTL_MS : ACTION_TOKEN_TTL_MS;
  const expiresAt = now + ttl;

  const tokenId = await ctx.db.insert("sessionTokens", {
    tokenHash,
    tokenType: input.tokenType,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    groupId: input.groupId,
    status: "active",
    expiresAt,
    createdAt: now,
  });

  return { token, tokenId, expiresAt };
}

export type ResolvedSessionToken = {
  tokenId: Id<"sessionTokens">;
  tokenType: SessionTokenType;
  subjectKind: SessionSubjectKind;
  subjectId: string;
  groupId: Id<"groups">;
  expiresAt: number;
};

/** Resolves a presented token to exactly one session subject (Story 1.9 AC2). */
export async function resolveSessionTokenByValue(
  ctx: MutationCtx,
  token: string,
  expectedType: SessionTokenType,
  now = Date.now(),
): Promise<ResolvedSessionToken> {
  if (!token || token.trim().length === 0) {
    throw new Error("TOKEN_INVALID");
  }

  const tokenHash = hashSessionToken(token.trim());
  const record = await ctx.db
    .query("sessionTokens")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .unique();

  if (!record) {
    throw new Error("TOKEN_NOT_FOUND");
  }

  assertTokenType(record.tokenType, expectedType);
  assertTokenActive(record.status, record.expiresAt, now);

  return {
    tokenId: record._id,
    tokenType: record.tokenType,
    subjectKind: record.subjectKind,
    subjectId: record.subjectId,
    groupId: record.groupId,
    expiresAt: record.expiresAt,
  };
}

/** Revokes a token immediately with no grace window (Story 1.9 AC4). */
export async function revokeSessionToken(
  ctx: MutationCtx,
  tokenId: Id<"sessionTokens">,
  now = Date.now(),
): Promise<void> {
  const record = await ctx.db.get(tokenId);
  if (!record || record.status !== "active") {
    return;
  }
  await ctx.db.patch(tokenId, {
    status: "revoked",
    revokedAt: now,
  });
}

/** Marks a single-use action token consumed (Story 1.9 AC6). */
export async function consumeActionToken(
  ctx: MutationCtx,
  tokenId: Id<"sessionTokens">,
  now = Date.now(),
): Promise<void> {
  const record = await ctx.db.get(tokenId);
  if (!record || record.tokenType !== "action_token") {
    throw new Error("TOKEN_TYPE_MISMATCH");
  }
  assertTokenActive(record.status, record.expiresAt, now);
  await ctx.db.patch(tokenId, {
    status: "consumed",
    consumedAt: now,
  });
}

/** Sweeps expired active tokens to expired status (Story 1.9 AC5). */
export async function sweepExpiredSessionTokens(
  ctx: MutationCtx,
  now = Date.now(),
): Promise<number> {
  const expired = await ctx.db
    .query("sessionTokens")
    .withIndex("by_status_and_expires", (q) =>
      q.eq("status", "active").lte("expiresAt", now),
    )
    .collect();

  await Promise.all(
    expired.map((row) =>
      ctx.db.patch(row._id, {
        status: "expired",
      }),
    ),
  );

  return expired.length;
}

// ---------------------------------------------------------------------------
// Tab admission — INVITE-FLOW §5.6, "the token admits; the roster authorizes".
//
// The order below is the security model, not an implementation detail. Two
// rules carry the whole thing:
//
//   1. `tabParticipants` is checked **before** the token (§1.6). An existing
//      participant gets in on an expired, revoked, or seat-exhausted link; a
//      non-participant never gets in on a valid one without passing every gate
//      beneath.
//   2. A cached `groupMembers` row **never authorizes on its own** (§9.1,
//      amendment 2c). It authorizes only when its provenance is a real
//      `getChatMember` call and that call is younger than five minutes.
//      Anything else is reported as unproven so the caller refreshes it —
//      `resolveGroupFromChat` writes `active` rows straight off an unverified
//      webhook payload, and those must not admit anyone.
//
// Every party is read off a stored row. Nothing here trusts a request argument
// beyond using the presented token as a lookup key.
// ---------------------------------------------------------------------------

type ReadCtx = QueryCtx | MutationCtx;

/** Stable admission failure codes. Each maps to exactly one designed string. */
export const TAB_ADMISSION_FAILURE = {
  /** No such token, wrong class, or it points at nothing. §5.6 step 1. */
  LINK_NOT_FOUND: "LINK_NOT_FOUND",
  /** §7 row 6. */
  LINK_EXPIRED: "LINK_EXPIRED",
  /** §7 row 7 — same words as row 6, deliberately distinct internal code. */
  LINK_REVOKED: "LINK_REVOKED",
  /** §7 row 18. */
  TAB_CLOSED: "TAB_CLOSED",
  /** §7 row 10. */
  TAB_LOCKED_NO_ENTRY: "TAB_LOCKED_NO_ENTRY",
  /** §7 rows 9 and 20. */
  TAB_FULL: "TAB_FULL",
  /** §6.2 — live `getChatMember` says this person is not in the chat. */
  NOT_GROUP_MEMBER: "NOT_GROUP_MEMBER",
  /** Binding decision 2 — the bot is not an administrator of a chat-origin tab. */
  BOT_NOT_ADMIN: "BOT_NOT_ADMIN",
  /**
   * The cached membership is stale, or was written by an unverified webhook.
   * Never an admission: §7 row 21, "never silently admit".
   */
  MEMBERSHIP_UNPROVEN: "MEMBERSHIP_UNPROVEN",
  /** No verified Telegram launch context. §5.6 step 2. */
  OPEN_IN_TELEGRAM: "OPEN_IN_TELEGRAM",
} as const;

export type TabAdmissionFailureCode =
  (typeof TAB_ADMISSION_FAILURE)[keyof typeof TAB_ADMISSION_FAILURE];

/**
 * What a refused tapper is allowed to learn: tab name and people count, which
 * is strictly less than the bot's own `tab_opened` card already posts (§1.5,
 * NFR-7). No amounts, no items, no chat id, no roster.
 */
export type TabGroupFacts = {
  tabName: string;
  peopleCount: number;
  organizerName: string | null;
};

export type ChatMembershipProof = {
  groupExists: boolean;
  chatId: string | null;
  /**
   * True only for a `getChatMember` result younger than five minutes. A
   * `webhook` or `bootstrap` row is never proof, at any age.
   */
  proven: boolean;
  memberActive: boolean;
  botIsAdmin: boolean;
};

/** Reads the live-membership facts, and reports honestly when they are not live. */
export async function readChatMembershipProof(
  ctx: ReadCtx,
  input: { groupId: Id<"groups">; telegramUserId: string; now: number },
): Promise<ChatMembershipProof> {
  const group = await ctx.db.get(input.groupId);
  if (!group) {
    return {
      groupExists: false,
      chatId: null,
      proven: false,
      memberActive: false,
      botIsAdmin: false,
    };
  }

  const member = await ctx.db
    .query("groupMembers")
    .withIndex("by_group_and_telegram_user_id", (q) =>
      q.eq("groupId", input.groupId).eq("telegramUserId", input.telegramUserId),
    )
    .unique();

  const memberProven =
    member !== null &&
    member.verificationSource === "getChatMember" &&
    isCheckFresh(member.verifiedAt, input.now);
  const botProven = isCheckFresh(group.botAdminCheckedAt, input.now);

  return {
    groupExists: true,
    chatId: group.telegramChatId,
    proven: memberProven && botProven,
    memberActive: member?.membershipStatus === "active",
    botIsAdmin: group.botIsAdmin === true,
  };
}

/** §1.5 — `{ kind: "chat" }` is bounded by the chat; `fixed` by a head count. */
export function seatAvailable(
  tab: Pick<Doc<"tabs">, "seatPolicy">,
  participantCount: number,
): boolean {
  const policy = tab.seatPolicy;
  if (!policy || policy.kind === "chat") {
    return true;
  }
  return participantCount < policy.seats;
}

export async function countParticipants(ctx: ReadCtx, tabId: Id<"tabs">): Promise<number> {
  const rows = await ctx.db
    .query("tabParticipants")
    .withIndex("by_tab_id", (q) => q.eq("tabId", tabId))
    .collect();
  return rows.length;
}

async function readTabFacts(ctx: ReadCtx, tab: Doc<"tabs">): Promise<TabGroupFacts> {
  const organizer = await ctx.db
    .query("users")
    .withIndex("by_telegram_user_id", (q) =>
      q.eq("telegramUserId", tab.organizerTelegramUserId),
    )
    .first();

  return {
    tabName: tab.name,
    peopleCount: await countParticipants(ctx, tab._id),
    organizerName: organizer?.displayName ?? null,
  };
}

/** Looks a `tab_session` up by hash without asserting it is still usable. */
async function findTabSessionRow(
  ctx: ReadCtx,
  token: string,
): Promise<Doc<"sessionTokens"> | null> {
  if (!token || token.trim().length === 0) {
    return null;
  }

  const record = await ctx.db
    .query("sessionTokens")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", hashSessionToken(token.trim())))
    .unique();

  if (!record || record.tokenType !== "tab_session" || record.subjectKind !== "tab") {
    return null;
  }
  return record;
}

export type TabAdmissionDecision =
  | { outcome: "admit"; tab: Doc<"tabs">; alreadyParticipant: boolean }
  | { outcome: "refuse"; code: TabAdmissionFailureCode; facts: TabGroupFacts | null }
  | {
      /**
       * Not a verdict. The cache could not prove membership, so the caller must
       * refresh `getChatMember` and decide again. Deny-by-default: an action
       * that cannot refresh must treat this as a refusal.
       */
      outcome: "needs_membership_proof";
      groupId: Id<"groups">;
      chatId: string;
      telegramUserId: string;
    };

/**
 * The §5.6 resolution order, read-only. Runs identically in the query that
 * plans a refresh and in the mutation that writes the roster row, so the two
 * can never drift.
 */
export async function decideTabAdmission(
  ctx: ReadCtx,
  input: { token: string; user: Doc<"users">; now: number },
): Promise<TabAdmissionDecision> {
  const refuse = (
    code: TabAdmissionFailureCode,
    facts: TabGroupFacts | null,
  ): TabAdmissionDecision => ({ outcome: "refuse", code, facts });

  // 1 — the token resolves to a subject, or nothing else happens.
  const record = await findTabSessionRow(ctx, input.token);
  if (!record) {
    return refuse(TAB_ADMISSION_FAILURE.LINK_NOT_FOUND, null);
  }

  const tabId = record.subjectId as Id<"tabs">;
  const tab = await ctx.db.get(tabId);
  if (!tab) {
    return refuse(TAB_ADMISSION_FAILURE.LINK_NOT_FOUND, null);
  }

  const facts = await readTabFacts(ctx, tab);

  // 3 — the tab exists and is not closed.
  if (tab.status === "closed") {
    return refuse(TAB_ADMISSION_FAILURE.TAB_CLOSED, facts);
  }

  // 4 — THE ROSTER AUTHORIZES. Above the token on purpose (§1.6): an existing
  // participant is admitted regardless of expiry, revocation, seats, or lock.
  const participant = await ctx.db
    .query("tabParticipants")
    .withIndex("by_tab_and_user", (q) => q.eq("tabId", tabId).eq("userId", input.user._id))
    .unique();
  if (participant) {
    return { outcome: "admit", tab, alreadyParticipant: true };
  }

  // Everything below recruits a new person onto a bill, so it needs a verified
  // Telegram launch and not merely a Privy session.
  const context = await ctx.db
    .query("telegramContexts")
    .withIndex("by_privy_did", (q) => q.eq("privyDid", input.user.privyDid))
    .unique();
  if (
    !context ||
    context.expiresAt <= input.now ||
    context.telegramUserId !== input.user.telegramUserId
  ) {
    return refuse(TAB_ADMISSION_FAILURE.OPEN_IN_TELEGRAM, facts);
  }

  // 5 — only now does the token's own status matter.
  if (record.status === "revoked" || record.status === "consumed") {
    return refuse(TAB_ADMISSION_FAILURE.LINK_REVOKED, facts);
  }
  if (record.status === "expired" || isTokenExpired(record.expiresAt, input.now)) {
    return refuse(TAB_ADMISSION_FAILURE.LINK_EXPIRED, facts);
  }

  // 6 — binding decision 2, verbatim, on the chat-origin tabs it was written
  // for. A personal-origin tab has no chat to prove membership against (D-06):
  // the token admits, the seat bound holds, BOT_NOT_ADMIN does not fire.
  // Missing origin is `"chat"` so every existing row keeps the admin gate.
  if (tabOrigin(tab) === "chat") {
    const proof = await readChatMembershipProof(ctx, {
      groupId: tab.groupId,
      telegramUserId: input.user.telegramUserId,
      now: input.now,
    });
    if (!proof.groupExists || proof.chatId === null) {
      return refuse(TAB_ADMISSION_FAILURE.LINK_NOT_FOUND, facts);
    }
    if (!proof.proven) {
      return {
        outcome: "needs_membership_proof",
        groupId: tab.groupId,
        chatId: proof.chatId,
        telegramUserId: input.user.telegramUserId,
      };
    }
    if (!proof.memberActive) {
      return refuse(TAB_ADMISSION_FAILURE.NOT_GROUP_MEMBER, facts);
    }
    if (!proof.botIsAdmin) {
      return refuse(TAB_ADMISSION_FAILURE.BOT_NOT_ADMIN, facts);
    }
  }

  // 7 — a locked or settled bill admits nobody new.
  if (tab.status === "locked") {
    return refuse(TAB_ADMISSION_FAILURE.TAB_LOCKED_NO_ENTRY, facts);
  }
  if (tab.status === "settled") {
    return refuse(TAB_ADMISSION_FAILURE.TAB_CLOSED, facts);
  }

  // 8 — a seat, under the tab's own policy.
  if (!seatAvailable(tab, facts.peopleCount)) {
    return refuse(TAB_ADMISSION_FAILURE.TAB_FULL, facts);
  }

  return { outcome: "admit", tab, alreadyParticipant: false };
}

export type TabAdmissionResult =
  | {
      ok: true;
      tabId: Id<"tabs">;
      groupId: Id<"groups">;
      tabName: string;
      status: Doc<"tabs">["status"];
      joined: boolean;
    }
  | { ok: false; code: TabAdmissionFailureCode; facts: TabGroupFacts | null };

/** Step 9 — consume the seat and write the roster row, in one transaction. */
export async function admitToTabSession(
  ctx: MutationCtx,
  input: { token: string; user: Doc<"users">; now?: number },
): Promise<TabAdmissionResult> {
  const now = input.now ?? Date.now();
  const decision = await decideTabAdmission(ctx, {
    token: input.token,
    user: input.user,
    now,
  });

  if (decision.outcome === "refuse") {
    return { ok: false, code: decision.code, facts: decision.facts };
  }

  if (decision.outcome === "needs_membership_proof") {
    // A mutation cannot call Telegram, so it cannot turn this into a yes.
    // It refuses rather than falling back to the cache.
    return { ok: false, code: TAB_ADMISSION_FAILURE.MEMBERSHIP_UNPROVEN, facts: null };
  }

  const { tab } = decision;

  if (!decision.alreadyParticipant) {
    // Re-counted inside the writing transaction, which is what makes two people
    // taking the last seat at the same instant resolve to one winner (§6.2).
    const count = await countParticipants(ctx, tab._id);
    if (!seatAvailable(tab, count)) {
      return {
        ok: false,
        code: TAB_ADMISSION_FAILURE.TAB_FULL,
        facts: await readTabFacts(ctx, tab),
      };
    }

    await ensureTabParticipant(ctx, {
      tabId: tab._id,
      user: input.user,
      now,
    });
  }

  return {
    ok: true,
    tabId: tab._id,
    groupId: tab.groupId,
    tabName: tab.name,
    status: tab.status,
    joined: !decision.alreadyParticipant,
  };
}

// ---------------------------------------------------------------------------
// Invite minting — INVITE-FLOW §1.4.
//
// "The number of people who can enlarge a tab is exactly one, and it is the
// person who is owed the money."
// ---------------------------------------------------------------------------

export const INVITE_MINT_FAILURE = {
  UNAUTHORIZED: "UNAUTHORIZED",
  TAB_NOT_FOUND: "TAB_NOT_FOUND",
  NOT_BILL_ORGANIZER: "NOT_BILL_ORGANIZER",
  TAB_CLOSED: "TAB_CLOSED",
  NOT_GROUP_MEMBER: "NOT_GROUP_MEMBER",
  BOT_NOT_ADMIN: "BOT_NOT_ADMIN",
  MEMBERSHIP_UNPROVEN: "MEMBERSHIP_UNPROVEN",
  OPEN_IN_TELEGRAM: "OPEN_IN_TELEGRAM",
} as const;

export type InviteMintFailureCode =
  (typeof INVITE_MINT_FAILURE)[keyof typeof INVITE_MINT_FAILURE];

export type InviteMintDecision =
  | { outcome: "allow"; tab: Doc<"tabs"> }
  | { outcome: "refuse"; code: InviteMintFailureCode }
  | {
      outcome: "needs_membership_proof";
      groupId: Id<"groups">;
      chatId: string;
      telegramUserId: string;
    };

/**
 * Decides whether this caller may mint an invite for this tab.
 *
 * Read-only, and every party comes off a stored row: the tab from `tabs`, the
 * organizer from `tabs.organizerTelegramUserId`, the group from `tabs.groupId`,
 * the caller from `users` by the Privy DID on the verified JWT. The request
 * supplies a tab id and nothing else; supplying a group id would be supplying
 * half the answer.
 */
export async function decideInviteMint(
  ctx: ReadCtx,
  input: { tabId: Id<"tabs">; user: Doc<"users">; now: number },
): Promise<InviteMintDecision> {
  const tab = await ctx.db.get(input.tabId);
  if (!tab) {
    return { outcome: "refuse", code: INVITE_MINT_FAILURE.TAB_NOT_FOUND };
  }

  // §1.4 — only the organizer may enlarge a tab. A participant gets nothing.
  if (tab.organizerTelegramUserId !== input.user.telegramUserId) {
    return { outcome: "refuse", code: INVITE_MINT_FAILURE.NOT_BILL_ORGANIZER };
  }

  if (tab.status === "closed" || tab.status === "settled") {
    return { outcome: "refuse", code: INVITE_MINT_FAILURE.TAB_CLOSED };
  }

  const context = await ctx.db
    .query("telegramContexts")
    .withIndex("by_privy_did", (q) => q.eq("privyDid", input.user.privyDid))
    .unique();
  if (
    !context ||
    context.expiresAt <= input.now ||
    context.telegramUserId !== input.user.telegramUserId
  ) {
    return { outcome: "refuse", code: INVITE_MINT_FAILURE.OPEN_IN_TELEGRAM };
  }

  // Chat-origin still requires a live admin bot. Personal-origin is the invite
  // door: the organizer is already on the roster and there is no chat to
  // administer. Missing origin is `"chat"`.
  if (tabOrigin(tab) === "chat") {
    const proof = await readChatMembershipProof(ctx, {
      groupId: tab.groupId,
      telegramUserId: input.user.telegramUserId,
      now: input.now,
    });
    if (!proof.groupExists || proof.chatId === null) {
      return { outcome: "refuse", code: INVITE_MINT_FAILURE.TAB_NOT_FOUND };
    }
    if (!proof.proven) {
      return {
        outcome: "needs_membership_proof",
        groupId: tab.groupId,
        chatId: proof.chatId,
        telegramUserId: input.user.telegramUserId,
      };
    }
    if (!proof.memberActive) {
      return { outcome: "refuse", code: INVITE_MINT_FAILURE.NOT_GROUP_MEMBER };
    }
    if (!proof.botIsAdmin) {
      return { outcome: "refuse", code: INVITE_MINT_FAILURE.BOT_NOT_ADMIN };
    }
  }

  return { outcome: "allow", tab };
}

export type InviteMintResult =
  | { ok: true; token: string; expiresAt: number }
  | { ok: false; code: InviteMintFailureCode };

/** Mints one `tab_session` for the organizer. Only the hash is ever stored. */
export async function mintTabInviteToken(
  ctx: MutationCtx,
  input: { tabId: Id<"tabs">; user: Doc<"users">; now?: number },
): Promise<InviteMintResult> {
  const now = input.now ?? Date.now();
  const decision = await decideInviteMint(ctx, {
    tabId: input.tabId,
    user: input.user,
    now,
  });

  if (decision.outcome === "refuse") {
    return { ok: false, code: decision.code };
  }
  if (decision.outcome === "needs_membership_proof") {
    return { ok: false, code: INVITE_MINT_FAILURE.MEMBERSHIP_UNPROVEN };
  }

  const reused = await reuseLiveTabSession(ctx, decision.tab, now);
  if (reused) {
    return { ok: true, token: reused.token, expiresAt: reused.expiresAt };
  }

  const minted = await mintSessionToken(ctx, {
    tokenType: "tab_session",
    subjectKind: "tab",
    subjectId: decision.tab._id,
    // Read off the stored tab, never off the request.
    groupId: decision.tab.groupId,
    now,
  });
  await persistLiveInviteToken(ctx, decision.tab._id, minted.token);

  return { ok: true, token: minted.token, expiresAt: minted.expiresAt };
}

/**
 * INVITE-FLOW B7 — the organizer is on the roster from the moment the tab
 * exists, on both doors. Join is no longer the only insert.
 */
export async function ensureTabParticipant(
  ctx: MutationCtx,
  input: { tabId: Id<"tabs">; user: Doc<"users">; now: number },
): Promise<{ inserted: boolean }> {
  const existing = await ctx.db
    .query("tabParticipants")
    .withIndex("by_tab_and_user", (q) =>
      q.eq("tabId", input.tabId).eq("userId", input.user._id),
    )
    .unique();
  if (existing) {
    return { inserted: false };
  }

  await ctx.db.insert("tabParticipants", {
    tabId: input.tabId,
    userId: input.user._id,
    telegramUserId: input.user.telegramUserId,
    joinedAt: input.now,
  });
  return { inserted: true };
}

/**
 * Looks the organizer up by the telegram id on the stored tab and inserts them
 * if that user row exists. A `/tab` typed by someone who has never opened the
 * Mini App has no `users` row yet — there is nothing to insert, and they still
 * join by tapping Open tab.
 */
export async function ensureOrganizerParticipant(
  ctx: MutationCtx,
  input: { tabId: Id<"tabs">; organizerTelegramUserId: string; now: number },
): Promise<{ inserted: boolean }> {
  const organizer = await ctx.db
    .query("users")
    .withIndex("by_telegram_user_id", (q) =>
      q.eq("telegramUserId", input.organizerTelegramUserId),
    )
    .first();
  if (!organizer) {
    return { inserted: false };
  }
  return ensureTabParticipant(ctx, {
    tabId: input.tabId,
    user: organizer,
    now: input.now,
  });
}

export async function listLiveTabSessions(
  ctx: ReadCtx,
  tabId: Id<"tabs">,
  now: number,
): Promise<Doc<"sessionTokens">[]> {
  const rows = await ctx.db
    .query("sessionTokens")
    .withIndex("by_subject", (q) => q.eq("subjectKind", "tab").eq("subjectId", tabId))
    .collect();

  return rows.filter(
    (row) =>
      row.tokenType === "tab_session" &&
      row.status === "active" &&
      !isTokenExpired(row.expiresAt, now),
  );
}

async function readLiveInvitePlaintext(
  ctx: ReadCtx,
  tabId: Id<"tabs">,
): Promise<string | null> {
  const tab = await ctx.db.get(tabId);
  if (tab?.liveInviteToken) {
    return tab.liveInviteToken;
  }

  const status = await ctx.db
    .query("telegramStatusMessages")
    .withIndex("by_tab_id", (q) => q.eq("tabId", tabId))
    .unique();
  return status?.deepLinkToken ?? null;
}

export async function persistLiveInviteToken(
  ctx: MutationCtx,
  tabId: Id<"tabs">,
  token: string,
): Promise<void> {
  await ctx.db.patch(tabId, { liveInviteToken: token });

  const status = await ctx.db
    .query("telegramStatusMessages")
    .withIndex("by_tab_id", (q) => q.eq("tabId", tabId))
    .unique();
  if (status) {
    await ctx.db.patch(status._id, { deepLinkToken: token });
  }
}

/**
 * One token per tab (INVITE-FLOW §5.1). Reuses the live `tab_session` when the
 * plaintext is still in hand — on the tab row, or on the status card Phase 0
 * already persists. Mints only when none is live.
 */
export async function reuseLiveTabSession(
  ctx: MutationCtx,
  tab: Doc<"tabs">,
  now: number,
): Promise<{ token: string; expiresAt: number; tokenId: Id<"sessionTokens"> } | null> {
  const live = await listLiveTabSessions(ctx, tab._id, now);
  const plaintext = await readLiveInvitePlaintext(ctx, tab._id);

  if (plaintext) {
    const hashed = hashSessionToken(plaintext);
    const match = live.find((row) => row.tokenHash === hashed);
    if (match) {
      if (tab.liveInviteToken !== plaintext) {
        await persistLiveInviteToken(ctx, tab._id, plaintext);
      }
      return { token: plaintext, expiresAt: match.expiresAt, tokenId: match._id };
    }
  }

  return null;
}

export const TOKEN_REVOKE_FAILURE = {
  UNAUTHORIZED: "UNAUTHORIZED",
} as const;

export type TokenRevokeDecision =
  | { outcome: "allow"; tokenId: Id<"sessionTokens">; tabId: Id<"tabs"> }
  | { outcome: "refuse"; code: typeof TOKEN_REVOKE_FAILURE.UNAUTHORIZED };

/**
 * U-9 / D-16 H7 — organizer-on-roster, parties from stored rows. A stranger
 * and a missing token are the same refusal, so the endpoint is not an oracle.
 */
export async function decideTokenRevoke(
  ctx: ReadCtx,
  input: { tokenId: Id<"sessionTokens">; user: Doc<"users"> },
): Promise<TokenRevokeDecision> {
  const refuse = (): TokenRevokeDecision => ({
    outcome: "refuse",
    code: TOKEN_REVOKE_FAILURE.UNAUTHORIZED,
  });

  const record = await ctx.db.get(input.tokenId);
  if (!record || record.tokenType !== "tab_session" || record.subjectKind !== "tab") {
    return refuse();
  }

  const tabId = record.subjectId as Id<"tabs">;
  const tab = await ctx.db.get(tabId);
  if (!tab) {
    return refuse();
  }

  if (tab.organizerTelegramUserId !== input.user.telegramUserId) {
    return refuse();
  }

  const participant = await ctx.db
    .query("tabParticipants")
    .withIndex("by_tab_and_user", (q) => q.eq("tabId", tabId).eq("userId", input.user._id))
    .unique();
  if (!participant) {
    return refuse();
  }

  return { outcome: "allow", tokenId: record._id, tabId };
}

export async function revokeTabInviteForOrganizer(
  ctx: MutationCtx,
  input: { tokenId: Id<"sessionTokens">; user: Doc<"users">; now?: number },
): Promise<{ ok: true } | { ok: false; code: typeof TOKEN_REVOKE_FAILURE.UNAUTHORIZED }> {
  const now = input.now ?? Date.now();
  const decision = await decideTokenRevoke(ctx, {
    tokenId: input.tokenId,
    user: input.user,
  });
  if (decision.outcome === "refuse") {
    return { ok: false, code: decision.code };
  }

  await revokeSessionToken(ctx, decision.tokenId, now);
  await ctx.db.patch(decision.tabId, { liveInviteToken: undefined });

  const status = await ctx.db
    .query("telegramStatusMessages")
    .withIndex("by_tab_id", (q) => q.eq("tabId", decision.tabId))
    .unique();
  if (status?.deepLinkToken) {
    await ctx.db.patch(status._id, { deepLinkToken: undefined });
  }

  return { ok: true };
}
