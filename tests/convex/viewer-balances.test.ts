import { beforeEach, describe, expect, it } from "vitest";
import { createFakeCtx, type Row } from "../helpers/convexFakeDb";
import * as balances from "@/convex/balances";
import * as obligations from "@/convex/obligations";
import * as activity from "@/convex/activity";
import * as groups from "@/convex/groups";
import * as receipts from "@/convex/receipts";
import * as users from "@/convex/users";
import { USDC_MINT } from "@/lib/solana/constants";

/* eslint-disable @typescript-eslint/no-explicit-any */
const run = (fn: unknown, ctx: unknown, args: unknown = {}) =>
  (fn as { _handler: (c: unknown, a: unknown) => Promise<any> })._handler(ctx, args);

const DID = {
  andre: "did:privy:andre",
  maya: "did:privy:maya",
  tim: "did:privy:tim",
  bob: "did:privy:bob",
};

const identity = (did: string) => ({ subject: did, tokenIdentifier: did });

/**
 * Two groups that share exactly one member.
 *
 * Andre is in `groups:g1` only. `groups:g2` exists so every read can be asked
 * the question that matters: does a viewer ever see a group they are not in?
 */
function world(): Record<string, Row[]> {
  return {
    users: [
      { _id: "users:andre", privyDid: DID.andre, telegramUserId: "1", displayName: "Andre" },
      { _id: "users:maya", privyDid: DID.maya, telegramUserId: "2", displayName: "Maya" },
      { _id: "users:tim", privyDid: DID.tim, telegramUserId: "3", displayName: "Tim" },
      { _id: "users:bob", privyDid: DID.bob, telegramUserId: "4", displayName: "Bob" },
    ],
    groups: [
      {
        _id: "groups:g1",
        telegramChatId: "-100",
        displayName: "Sukhumvit Dinner",
        botIsAdmin: true,
        createdAt: 1,
        updatedAt: 10,
      },
      {
        _id: "groups:g2",
        telegramChatId: "-200",
        displayName: "Somewhere Else",
        botIsAdmin: true,
        createdAt: 1,
        updatedAt: 5,
      },
    ],
    groupMembers: [
      { _id: "groupMembers:m1", groupId: "groups:g1", telegramUserId: "1", displayName: "Andre", role: "member", membershipStatus: "active", verificationSource: "webhook", verifiedAt: 1 },
      { _id: "groupMembers:m2", groupId: "groups:g1", telegramUserId: "2", displayName: "Maya", role: "creator", membershipStatus: "active", verificationSource: "webhook", verifiedAt: 1 },
      { _id: "groupMembers:m3", groupId: "groups:g1", telegramUserId: "3", displayName: "Tim", role: "member", membershipStatus: "active", verificationSource: "webhook", verifiedAt: 1 },
      { _id: "groupMembers:m4", groupId: "groups:g2", telegramUserId: "2", displayName: "Maya", role: "member", membershipStatus: "active", verificationSource: "webhook", verifiedAt: 1 },
      { _id: "groupMembers:m5", groupId: "groups:g2", telegramUserId: "4", displayName: "Bob", role: "creator", membershipStatus: "active", verificationSource: "webhook", verifiedAt: 1 },
    ],
    tabs: [
      {
        _id: "tabs:t1",
        groupId: "groups:g1",
        organizerTelegramUserId: "2",
        name: "Sukhumvit Dinner",
        status: "locked",
        defaultCurrency: "THB",
        revision: 1,
        lockedRevision: 1,
        billTotalMinor: 184_000n,
        createdAt: 1,
        updatedAt: 20,
      },
      {
        _id: "tabs:t2",
        groupId: "groups:g2",
        organizerTelegramUserId: "4",
        name: "Not Andre's Tab",
        status: "locked",
        defaultCurrency: "THB",
        revision: 1,
        lockedRevision: 1,
        createdAt: 1,
        updatedAt: 15,
      },
    ],
    tabParticipants: [
      { _id: "tabParticipants:p1", tabId: "tabs:t1", userId: "users:andre", telegramUserId: "1", joinedAt: 1 },
      { _id: "tabParticipants:p2", tabId: "tabs:t1", userId: "users:maya", telegramUserId: "2", joinedAt: 1 },
      { _id: "tabParticipants:p3", tabId: "tabs:t1", userId: "users:tim", telegramUserId: "3", joinedAt: 1 },
    ],
    obligations: [
      {
        _id: "obligations:o1",
        groupId: "groups:g1",
        tabId: "tabs:t1",
        tabRevision: 1,
        debtorUserId: "users:andre",
        creditorUserId: "users:maya",
        displayAmountThbMinor: 29_174n,
        billSnapshotHash: "hash-1",
        amountAtomic: 8_250_000n,
        outputMint: USDC_MINT,
        status: "open",
        createdAt: 3,
        updatedAt: 3,
      },
      {
        // Confirmed on chain — `applyConfirmedInternal` set this status.
        _id: "obligations:o2",
        groupId: "groups:g1",
        tabId: "tabs:t1",
        tabRevision: 1,
        debtorUserId: "users:tim",
        creditorUserId: "users:maya",
        displayAmountThbMinor: 15_000n,
        billSnapshotHash: "hash-2",
        amountAtomic: 4_242_000n,
        outputMint: USDC_MINT,
        status: "settled",
        createdAt: 2,
        updatedAt: 4,
      },
      {
        // Andre is not in g2 and must never see this row through any query.
        _id: "obligations:o3",
        groupId: "groups:g2",
        tabId: "tabs:t2",
        tabRevision: 1,
        debtorUserId: "users:maya",
        creditorUserId: "users:bob",
        displayAmountThbMinor: 8_000n,
        billSnapshotHash: "hash-3",
        amountAtomic: 2_262_000n,
        outputMint: USDC_MINT,
        status: "open",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    obligationLedgerEvents: [],
    settlementIntents: [],
    wallets: [
      { _id: "wallets:w1", userId: "users:maya", privyWalletId: "pw", solanaAddress: "MayaAddr", isEmbedded: true, isDefaultReceiving: true, createdAt: 1, updatedAt: 1 },
    ],
    activityEvents: [
      { _id: "activityEvents:a1", groupId: "groups:g1", type: "claim", payload: { summary: "Maya claimed Green Curry" }, createdAt: 100 },
      { _id: "activityEvents:a2", groupId: "groups:g2", type: "payment", payload: { summary: "Bob paid Maya" }, createdAt: 200 },
    ],
    receiptImports: [
      { _id: "receiptImports:r1", tabId: "tabs:t1", uploadedBy: "users:maya", status: "needs_review", warnings: [], createdAt: 10, updatedAt: 10 },
      { _id: "receiptImports:r2", tabId: "tabs:t1", uploadedBy: "users:maya", status: "deleted", warnings: [], createdAt: 20, updatedAt: 20 },
    ],
  };
}

describe("balances.forViewer — authorization", () => {
  let store: Record<string, Row[]>;

  beforeEach(() => {
    store = world();
  });

  it("scopes to the viewer's own active groups and never leaks another group", async () => {
    const { ctx } = createFakeCtx(store, identity(DID.andre));
    const result = await run(balances.forViewer, ctx);

    expect(result.groups.map((g: any) => g.groupId)).toEqual(["groups:g1"]);
    expect(
      result.components.some((c: any) => c.obligationId === "obligations:o3"),
    ).toBe(false);
  });

  it("rejects a guessed groupId the viewer is not a member of", async () => {
    const { ctx } = createFakeCtx(store, identity(DID.andre));
    await expect(
      run(balances.forViewer, ctx, { groupId: "groups:g2" }),
    ).rejects.toMatchObject({ code: "NOT_GROUP_MEMBER" });
  });

  it("rejects a viewer whose membership is no longer active", async () => {
    store.groupMembers![0]!.membershipStatus = "left";
    const { ctx } = createFakeCtx(store, identity(DID.andre));

    await expect(
      run(balances.forViewer, ctx, { groupId: "groups:g1" }),
    ).rejects.toMatchObject({ code: "NOT_GROUP_MEMBER" });

    const scoped = await run(balances.forViewer, ctx);
    expect(scoped.groups).toHaveLength(0);
  });

  it("discloses nothing to an unauthenticated caller", async () => {
    const { ctx } = createFakeCtx(store, null);
    const result = await run(balances.forViewer, ctx);

    expect(result).toMatchObject({
      viewerUserId: null,
      netAtomic: 0n,
      groups: [],
      components: [],
    });
  });
});

describe("balances.forViewer — money", () => {
  let store: Record<string, Row[]>;

  beforeEach(() => {
    store = world();
  });

  it("nets in USDC atomic units and reports the bill-currency figure alongside", async () => {
    const { ctx } = createFakeCtx(store, identity(DID.andre));
    const result = await run(balances.forViewer, ctx);

    expect(result.netAtomic).toBe(-8_250_000n);
    expect(result.netMinor).toBe(-29_174);
    expect(result.displayCurrency).toBe("THB");
    expect(result.isAllSquare).toBe(false);
    expect(typeof result.netAtomic).toBe("bigint");
  });

  it("never sums fiat across unlike bill currencies", async () => {
    store.tabs!.push({
      _id: "tabs:t3",
      groupId: "groups:g1",
      organizerTelegramUserId: "2",
      name: "Singapore Drinks",
      status: "locked",
      defaultCurrency: "SGD",
      revision: 1,
      lockedRevision: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    store.obligations!.push({
      _id: "obligations:o4",
      groupId: "groups:g1",
      tabId: "tabs:t3",
      tabRevision: 1,
      debtorUserId: "users:andre",
      creditorUserId: "users:maya",
      displayAmountThbMinor: 1_000n,
      billSnapshotHash: "hash-4",
      amountAtomic: 750_000n,
      outputMint: USDC_MINT,
      status: "open",
      createdAt: 5,
      updatedAt: 5,
    });

    const { ctx } = createFakeCtx(store, identity(DID.andre));
    const result = await run(balances.forViewer, ctx);

    // The canonical unit still nets; the fiat hero refuses to.
    expect(result.netAtomic).toBe(-9_000_000n);
    expect(result.netMinor).toBeNull();
    expect(result.displayCurrency).toBeNull();
    expect(result.groups[0].positions).toBeNull();
    // Each component is single-currency, so each stays renderable.
    expect(result.components.map((c: any) => c.currency).sort()).toEqual(["SGD", "THB"]);
  });

  it("drops obligations already settled on chain out of the balance", async () => {
    const { ctx } = createFakeCtx(store, identity(DID.maya));
    const result = await run(balances.forViewer, ctx, { groupId: "groups:g1" });

    // Only Andre's 8.25 USDC is still outstanding; Tim's settled row is gone.
    expect(result.netAtomic).toBe(8_250_000n);
    expect(result.components.map((c: any) => c.obligationId)).toEqual(["obligations:o1"]);
  });

  it("a submitted transaction does not move the balance", async () => {
    store.settlementIntents!.push({
      _id: "settlementIntents:i1",
      obligationId: "obligations:o1",
      status: "submitted",
      userId: "users:andre",
      groupId: "groups:g1",
    });
    store.obligations![0]!.settlementIntentId = "settlementIntents:i1";

    const { ctx } = createFakeCtx(store, identity(DID.andre));
    const result = await run(balances.forViewer, ctx);

    expect(result.netAtomic).toBe(-8_250_000n);
    expect(result.isAllSquare).toBe(false);
  });

  it("an unconfirmed cash proposal does not move the balance", async () => {
    store.obligationLedgerEvents!.push({
      _id: "obligationLedgerEvents:e1",
      groupId: "groups:g1",
      tabId: "tabs:t1",
      obligationId: "obligations:o1",
      billId: "tabs:t1#1",
      debtorUserId: "users:andre",
      creditorUserId: "users:maya",
      amountMinor: 29_174n,
      eventKind: "cash_proposed",
      confirmed: false,
      createdAt: 1,
    });

    const { ctx } = createFakeCtx(store, identity(DID.andre));
    const result = await run(balances.forViewer, ctx);
    expect(result.netAtomic).toBe(-8_250_000n);
  });
});

describe("balances.listOpenTabsForViewer", () => {
  let store: Record<string, Row[]>;

  beforeEach(() => {
    store = world();
  });

  it("counts confirmed money only and reports submitted separately", async () => {
    store.settlementIntents!.push({
      _id: "settlementIntents:i1",
      obligationId: "obligations:o1",
      status: "submitted",
      userId: "users:andre",
      groupId: "groups:g1",
    });
    store.obligations![0]!.settlementIntentId = "settlementIntents:i1";

    const { ctx } = createFakeCtx(store, identity(DID.andre));
    const cards = await run(balances.listOpenTabsForViewer, ctx);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      tabId: "tabs:t1",
      settledCount: 1,
      totalCount: 2,
      submittedCount: 1,
      peopleCount: 3,
      amountTone: "owed",
    });
    expect(cards[0].viewerObligationId).toBe("obligations:o1");
  });

  it("never returns a tab from a group the viewer is not in", async () => {
    const { ctx } = createFakeCtx(store, identity(DID.andre));
    const cards = await run(balances.listOpenTabsForViewer, ctx);
    expect(cards.map((c: any) => c.tabId)).not.toContain("tabs:t2");
  });

  it("marks the recipient's side as owed-to-them", async () => {
    const { ctx } = createFakeCtx(store, identity(DID.maya));
    const cards = await run(balances.listOpenTabsForViewer, ctx, { groupId: "groups:g1" });
    expect(cards[0]).toMatchObject({ amountTone: "settled" });
  });
});

describe("obligations reads — authorization", () => {
  let store: Record<string, Row[]>;

  beforeEach(() => {
    store = world();
  });

  it("lets the debtor read their own obligation", async () => {
    const { ctx } = createFakeCtx(store, identity(DID.andre));
    const result = await run(obligations.get, ctx, { obligationId: "obligations:o1" });

    expect(result).toMatchObject({
      viewerIsDebtor: true,
      displayAmountMinor: 29_174,
      amountAtomic: 8_250_000n,
      creditorDisplayName: "Maya",
      creditorWalletReady: true,
      settled: false,
      staleRevision: false,
      billId: "tabs:t1#1",
    });
  });

  it("lets another participant on the same tab read it", async () => {
    const { ctx } = createFakeCtx(store, identity(DID.tim));
    await expect(
      run(obligations.get, ctx, { obligationId: "obligations:o1" }),
    ).resolves.toMatchObject({ viewerIsDebtor: false });
  });

  it("denies someone who is neither a party nor a participant", async () => {
    const { ctx } = createFakeCtx(store, identity(DID.bob));
    await expect(
      run(obligations.get, ctx, { obligationId: "obligations:o1" }),
    ).rejects.toMatchObject({ code: "NOT_TAB_PARTICIPANT" });
  });

  it("denies an unauthenticated caller", async () => {
    const { ctx } = createFakeCtx(store, null);
    await expect(
      run(obligations.get, ctx, { obligationId: "obligations:o1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("flags a stale revision when the bill moved underneath", async () => {
    store.tabs![0]!.lockedRevision = 2;
    const { ctx } = createFakeCtx(store, identity(DID.andre));
    const result = await run(obligations.get, ctx, { obligationId: "obligations:o1" });
    expect(result.staleRevision).toBe(true);
  });

  it("forTab requires tab participation, then resolves the viewer's obligation id", async () => {
    const denied = createFakeCtx(store, identity(DID.bob));
    await expect(
      run(obligations.forTab, denied.ctx, { tabId: "tabs:t1" }),
    ).rejects.toMatchObject({ code: "NOT_TAB_PARTICIPANT" });

    const { ctx } = createFakeCtx(store, identity(DID.andre));
    const result = await run(obligations.forTab, ctx, { tabId: "tabs:t1" });

    expect(result.viewerObligationId).toBe("obligations:o1");
    expect(result).toMatchObject({ totalCount: 2, settledCount: 1, complete: false });
  });

  it("listForViewer returns only obligations the viewer owes", async () => {
    const { ctx } = createFakeCtx(store, identity(DID.maya));
    const rows = await run(obligations.listForViewer, ctx);

    // Maya owes Bob in g2, and is owed in g1 — only the debt is hers to list.
    expect(rows.map((r: any) => r._id)).toEqual(["obligations:o3"]);
  });
});

describe("off-chain offsets — authorization and money", () => {
  let store: Record<string, Row[]>;

  beforeEach(() => {
    store = world();
  });

  it("only the creditor may waive, and the row is proved server-side", async () => {
    const debtor = createFakeCtx(store, identity(DID.andre));
    await expect(
      run(activity.waiveObligation, debtor.ctx, { obligationId: "obligations:o1" }),
    ).rejects.toMatchObject({ code: "WAIVER_NOT_AUTHORIZED" });

    const outsider = createFakeCtx(store, identity(DID.tim));
    await expect(
      run(activity.waiveObligation, outsider.ctx, { obligationId: "obligations:o1" }),
    ).rejects.toMatchObject({ code: "NOT_OBLIGATION_PARTY" });

    const creditor = createFakeCtx(store, identity(DID.maya));
    await expect(
      run(activity.waiveObligation, creditor.ctx, { obligationId: "obligations:o1" }),
    ).resolves.toMatchObject({ ok: true });

    const viewer = createFakeCtx(store, identity(DID.andre));
    const result = await run(balances.forViewer, viewer.ctx);
    expect(result.netAtomic).toBe(0n);
    expect(result.isAllSquare).toBe(true);
  });

  it("refuses an offset while a settlement is in flight", async () => {
    store.settlementIntents!.push({
      _id: "settlementIntents:i1",
      obligationId: "obligations:o1",
      status: "submitted",
      userId: "users:andre",
      groupId: "groups:g1",
    });
    store.obligations![0]!.settlementIntentId = "settlementIntents:i1";

    const { ctx } = createFakeCtx(store, identity(DID.maya));
    await expect(
      run(activity.waiveObligation, ctx, { obligationId: "obligations:o1" }),
    ).rejects.toMatchObject({ code: "SETTLEMENT_IN_FLIGHT" });
  });

  it("cash needs both parties, and moves nothing until the second one acts", async () => {
    const debtor = createFakeCtx(store, identity(DID.andre));
    const proposal = await run(activity.proposeCashSettlement, debtor.ctx, {
      obligationId: "obligations:o1",
    });
    expect(proposal.created).toBe(true);

    // A proposal is not money.
    const pending = await run(balances.forViewer, debtor.ctx);
    expect(pending.netAtomic).toBe(-8_250_000n);

    await expect(
      run(activity.acknowledgeCashSettlement, debtor.ctx, {
        proposalId: proposal.proposalId,
      }),
    ).rejects.toMatchObject({ code: "CASH_SELF_ACKNOWLEDGE" });

    const outsider = createFakeCtx(store, identity(DID.tim));
    await expect(
      run(activity.acknowledgeCashSettlement, outsider.ctx, {
        proposalId: proposal.proposalId,
      }),
    ).rejects.toMatchObject({ code: "NOT_OBLIGATION_PARTY" });

    const creditor = createFakeCtx(store, identity(DID.maya));
    await expect(
      run(activity.acknowledgeCashSettlement, creditor.ctx, {
        proposalId: proposal.proposalId,
      }),
    ).resolves.toMatchObject({ ok: true });

    const settled = await run(balances.forViewer, debtor.ctx);
    expect(settled.netAtomic).toBe(0n);
    expect(settled.isAllSquare).toBe(true);
  });

  it("the offset amount comes off the obligation, not the caller", async () => {
    const creditor = createFakeCtx(store, identity(DID.maya));
    await run(activity.waiveObligation, creditor.ctx, { obligationId: "obligations:o1" });

    const event = store.obligationLedgerEvents!.find(
      (row) => row.eventKind === "waiver_offset",
    );
    expect(event).toMatchObject({
      amountMinor: 29_174n,
      billId: "tabs:t1#1",
      debtorUserId: "users:andre",
      creditorUserId: "users:maya",
      confirmed: true,
    });
  });
});

describe("viewer-scoped list queries", () => {
  let store: Record<string, Row[]>;

  beforeEach(() => {
    store = world();
  });

  it("activity.listForViewer merges only the viewer's groups", async () => {
    const { ctx } = createFakeCtx(store, identity(DID.andre));
    const events = await run(activity.listForViewer, ctx);

    expect(events.map((e: any) => e._id)).toEqual(["activityEvents:a1"]);
    expect(events[0].groupName).toBe("Sukhumvit Dinner");
  });

  it("activity.listForViewer discloses nothing without a viewer", async () => {
    const { ctx } = createFakeCtx(store, null);
    await expect(run(activity.listForViewer, ctx)).resolves.toEqual([]);
  });

  it("groups.listForViewer returns memberships, not all groups", async () => {
    const { ctx } = createFakeCtx(store, identity(DID.andre));
    const rows = await run(groups.listForViewer, ctx);

    expect(rows.map((g: any) => g._id)).toEqual(["groups:g1"]);
    expect(rows[0].memberCount).toBe(3);
  });

  it("groups.listForViewer drops a group the viewer has left", async () => {
    store.groupMembers![0]!.membershipStatus = "kicked";
    const { ctx } = createFakeCtx(store, identity(DID.andre));
    await expect(run(groups.listForViewer, ctx)).resolves.toEqual([]);
  });
});

describe("receipts.latestImportForTab", () => {
  let store: Record<string, Row[]>;

  beforeEach(() => {
    store = world();
  });

  it("resolves the newest live import for a tab", async () => {
    const { ctx } = createFakeCtx(store, identity(DID.maya));
    const result = await run(receipts.latestImportForTab, ctx, { tabId: "tabs:t1" });

    // r2 is newer but deleted; a discarded import is never resurrected.
    expect(result._id).toBe("receiptImports:r1");
  });

  it("denies a caller outside the tab's group", async () => {
    const { ctx } = createFakeCtx(store, identity(DID.bob));
    await expect(
      run(receipts.latestImportForTab, ctx, { tabId: "tabs:t1" }),
    ).rejects.toMatchObject({ code: "NOT_GROUP_MEMBER" });
  });
});

describe("users.viewerIdentity", () => {
  it("maps the Privy DID to the Convex users id the rest of the API speaks", async () => {
    const { ctx } = createFakeCtx(world(), identity(DID.andre));
    const result = await run(users.viewerIdentity, ctx);

    expect(result).toMatchObject({
      privyDid: DID.andre,
      userId: "users:andre",
      telegramUserId: "1",
      displayName: "Andre",
    });
  });

  it("is null when unauthenticated", async () => {
    const { ctx } = createFakeCtx(world(), null);
    await expect(run(users.viewerIdentity, ctx)).resolves.toBeNull();
  });
});
