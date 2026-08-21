import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireGroupMember, getCurrentUser } from "./lib/auth";
import { appendActivityEvent, ACTIVITY_EVENT_TYPE } from "./lib/activitySync";

/** Lists activity events for a group, reverse chronological (Story 7.3 AC4). */
export const listForGroup = query({
  args: {
    groupId: v.id("groups"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireGroupMember(ctx, args.groupId);
    const limit = args.limit ?? 50;

    const events = await ctx.db
      .query("activityEvents")
      .withIndex("by_group_id", (q) => q.eq("groupId", args.groupId))
      .order("desc")
      .take(limit);

    return events.map((event) => ({
      _id: event._id,
      type: event.type,
      payload: event.payload,
      tabId: event.tabId,
      createdAt: event.createdAt,
    }));
  },
});

/** Fixture seed — appends demo activity events (Story 7.10 AC1). */
export const seedFixtureEvents = mutation({
  args: {
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    await requireGroupMember(ctx, args.groupId);
    const user = await getCurrentUser(ctx);
    const now = Date.now();

    const fixtures = [
      {
        type: ACTIVITY_EVENT_TYPE.TAB_CREATED,
        payload: {
          summary: "Andre started Sukhumvit Dinner",
          tabId: "tabs:fixture-primary",
        },
      },
      {
        type: ACTIVITY_EVENT_TYPE.CLAIM,
        payload: {
          summary: "Maya claimed Green Curry",
          amountLabel: "฿180.00",
          tabId: "tabs:fixture-primary",
        },
      },
      {
        type: ACTIVITY_EVENT_TYPE.TIP,
        payload: {
          summary: "Noi sent a tip to Ploy",
          amountLabel: "฿50.00",
        },
      },
      {
        type: ACTIVITY_EVENT_TYPE.PAYMENT,
        payload: {
          summary: "Tim paid Maya",
          amountLabel: "42.10 USDC",
          transactionSignature: "fixture-tx-signature-001",
          detail: "Confirmed on chain",
        },
      },
    ];

    for (const [index, fixture] of fixtures.entries()) {
      await appendActivityEvent(ctx, {
        groupId: args.groupId,
        actorUserId: user?._id,
        type: fixture.type,
        payload: fixture.payload,
      });
      // Stagger timestamps for ordering tests
      const row = await ctx.db
        .query("activityEvents")
        .withIndex("by_group_id", (q) => q.eq("groupId", args.groupId))
        .order("desc")
        .first();
      if (row) {
        await ctx.db.patch(row._id, { createdAt: now - index * 60_000 });
      }
    }

    return { inserted: fixtures.length };
  },
});

/** Proposes a manual cash settlement — balance moves only after ack (Story 7.3 AC7). */
export const proposeCashSettlement = mutation({
  args: {
    groupId: v.id("groups"),
    tabId: v.id("tabs"),
    obligationId: v.string(),
    billId: v.string(),
    debtorUserId: v.id("users"),
    creditorUserId: v.id("users"),
    amountMinor: v.int64(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("UNAUTHORIZED");
    }
    await requireGroupMember(ctx, args.groupId);

    const proposalId = await ctx.db.insert("obligationLedgerEvents", {
      groupId: args.groupId,
      tabId: args.tabId,
      obligationId: args.obligationId,
      billId: args.billId,
      debtorUserId: args.debtorUserId,
      creditorUserId: args.creditorUserId,
      amountMinor: args.amountMinor,
      eventKind: "cash_proposed",
      confirmed: false,
      actorUserId: user._id,
      createdAt: Date.now(),
    });

    await appendActivityEvent(ctx, {
      groupId: args.groupId,
      tabId: args.tabId,
      actorUserId: user._id,
      type: ACTIVITY_EVENT_TYPE.CASH_PROPOSED,
      payload: {
        summary: "Cash settlement proposed",
        amountLabel: `${Number(args.amountMinor) / 100} baht pending acknowledgement`,
        tabId: args.tabId,
        billId: args.billId,
      },
    });

    return { proposalId };
  },
});

/** Acknowledges cash settlement — immutable offset (Story 7.3 AC7). */
export const acknowledgeCashSettlement = mutation({
  args: {
    groupId: v.id("groups"),
    proposalId: v.id("obligationLedgerEvents"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("UNAUTHORIZED");
    }
    await requireGroupMember(ctx, args.groupId);

    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.eventKind !== "cash_proposed" || proposal.confirmed) {
      throw new Error("INVALID_CASH_PROPOSAL");
    }

    const existingAck = await ctx.db
      .query("obligationLedgerEvents")
      .withIndex("by_obligation_id", (q) => q.eq("obligationId", proposal.obligationId))
      .collect();
    if (existingAck.some((e) => e.eventKind === "cash_offset" && e.linkedProposalId === args.proposalId)) {
      throw new Error("CASH_ALREADY_ACKNOWLEDGED");
    }

    await ctx.db.insert("obligationLedgerEvents", {
      groupId: proposal.groupId,
      tabId: proposal.tabId,
      obligationId: proposal.obligationId,
      billId: proposal.billId,
      debtorUserId: proposal.debtorUserId,
      creditorUserId: proposal.creditorUserId,
      amountMinor: proposal.amountMinor,
      eventKind: "cash_offset",
      confirmed: true,
      actorUserId: user._id,
      linkedProposalId: args.proposalId,
      createdAt: Date.now(),
    });

    await appendActivityEvent(ctx, {
      groupId: args.groupId,
      tabId: proposal.tabId,
      actorUserId: user._id,
      type: ACTIVITY_EVENT_TYPE.CASH_ACKNOWLEDGED,
      payload: {
        summary: "Cash settlement acknowledged",
        tabId: proposal.tabId,
        billId: proposal.billId,
      },
    });

    return { ok: true };
  },
});

/** Recipient-authorized waiver (Story 7.3 AC6). */
export const waiveObligation = mutation({
  args: {
    groupId: v.id("groups"),
    tabId: v.id("tabs"),
    obligationId: v.string(),
    billId: v.string(),
    debtorUserId: v.id("users"),
    creditorUserId: v.id("users"),
    amountMinor: v.int64(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user || user._id !== args.creditorUserId) {
      throw new Error("WAIVER_NOT_AUTHORIZED");
    }
    await requireGroupMember(ctx, args.groupId);

    await ctx.db.insert("obligationLedgerEvents", {
      groupId: args.groupId,
      tabId: args.tabId,
      obligationId: args.obligationId,
      billId: args.billId,
      debtorUserId: args.debtorUserId,
      creditorUserId: args.creditorUserId,
      amountMinor: args.amountMinor,
      eventKind: "waiver_offset",
      confirmed: true,
      actorUserId: user._id,
      reason: args.reason,
      createdAt: Date.now(),
    });

    await appendActivityEvent(ctx, {
      groupId: args.groupId,
      tabId: args.tabId,
      actorUserId: user._id,
      type: ACTIVITY_EVENT_TYPE.WAIVER,
      payload: {
        summary: "Obligation waived",
        tabId: args.tabId,
        billId: args.billId,
        detail: args.reason,
      },
    });

    return { ok: true };
  },
});
