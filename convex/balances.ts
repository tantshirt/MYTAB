import { v } from "convex/values";
import { query } from "./_generated/server";
import type { GenericQueryCtx } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import {
  DEFAULT_BILL_CURRENCY,
  billIdForObligation,
  confirmedOffsetMinorByObligation,
  deriveGroupBalance,
  loadGroupBalanceRows,
  offsetAtomicForObligation,
  type BalanceComponent,
  type GroupBalance,
} from "./lib/balanceDerivation";
import { requireGroupMember } from "./lib/auth";
import { loadDisplayNames, resolveViewerScope } from "./lib/viewerScope";
import { SETTLEMENT_STATUS } from "./lib/settlementState";

type BalancesCtx = GenericQueryCtx<DataModel>;

/**
 * Intent statuses that mean "money is moving but has not landed".
 *
 * EXPERIENCE — *Money Legibility*: "Progress counts confirmed money only.
 * A submitted transaction moves the stepper, never the group's progress."
 * These are surfaced as `submittedCount`, which the tab card renders as
 * "n submitted (not counted)" — deliberately outside the progress fraction.
 */
const IN_FLIGHT_INTENT_STATUSES: ReadonlySet<string> = new Set([
  SETTLEMENT_STATUS.USER_SIGNED,
  SETTLEMENT_STATUS.SUBMITTED,
  SETTLEMENT_STATUS.UNKNOWN,
]);

const TAB_OPEN_STATUSES: ReadonlySet<string> = new Set(["draft", "open", "locked"]);

/**
 * How many still-unclaimed items the live tab card names outright.
 *
 * The card shows them as chips on one line, so this is a layout bound, not a
 * data bound: `unclaimedCount` always reports the true total, and the surface
 * renders the remainder as `+n`. A bound that silently dropped the rest would
 * make a 20-item bill look nearly finished.
 */
const UNCLAIMED_PREVIEW_LIMIT = 3;

/** Loads the tabs referenced by a set of obligations, by primary key. */
async function loadTabsById(
  ctx: BalancesCtx,
  tabIds: Iterable<Id<"tabs">>,
): Promise<Map<string, Doc<"tabs">>> {
  const tabs = new Map<string, Doc<"tabs">>();

  for (const tabId of new Set(tabIds)) {
    if (tabs.has(tabId)) {
      continue;
    }
    const tab = await ctx.db.get(tabId);
    if (tab) {
      tabs.set(tabId, tab);
    }
  }

  return tabs;
}

function currencyForTab(tab: Doc<"tabs"> | undefined): string {
  return tab?.defaultCurrency ?? DEFAULT_BILL_CURRENCY;
}

/** Derives one group's balance from indexed rows. */
async function balanceForGroup(
  ctx: BalancesCtx,
  groupId: Id<"groups">,
): Promise<{ balance: GroupBalance; tabs: Map<string, Doc<"tabs">> }> {
  const rows = await loadGroupBalanceRows(ctx, groupId);
  const tabs = await loadTabsById(ctx, rows.obligations.map((o) => o.tabId));

  const currencyByTabId = new Map<string, string>();
  for (const [tabId, tab] of tabs) {
    currencyByTabId.set(tabId, currencyForTab(tab));
  }

  const balance = deriveGroupBalance({
    groupId,
    obligations: rows.obligations,
    ledgerEvents: rows.ledgerEvents,
    currencyByTabId,
  });

  return { balance, tabs };
}

type ViewerGroupBalance = {
  groupId: Id<"groups">;
  displayName: string;
  displayCurrency: string | null;
  isAllSquare: boolean;
  positions: Array<{ userId: string; netMinor: number }> | null;
  positionsAtomic: Array<{ userId: string; netAtomic: bigint }>;
};

type ViewerComponent = BalanceComponent & { direction: "owe" | "owed" };

export type ViewerBalance = {
  viewerUserId: Id<"users"> | null;
  displayCurrency: string | null;
  netMinor: number | null;
  netAtomic: bigint;
  isAllSquare: boolean;
  groups: ViewerGroupBalance[];
  components: ViewerComponent[];
  memberNames: Record<string, string>;
};

/** No viewer — nothing to show, and nothing disclosed. */
function emptyViewerBalance(): ViewerBalance {
  return {
    viewerUserId: null,
    displayCurrency: null,
    netMinor: null,
    netAtomic: 0n,
    isAllSquare: true,
    groups: [],
    components: [],
    memberNames: {},
  };
}

/**
 * The viewer's net position and the components it is made of (Story 7.1, 7.5).
 *
 * Authorization: scope comes from `resolveViewerScope` — the caller's own
 * active `groupMembers` rows, or a single `groupId` re-verified through
 * `requireGroupMember`. Nothing here is reachable by guessing an id.
 *
 * Units. `netAtomic` is the canonical figure: group netting uses USDC atomic
 * units only (brief, decision 5). `netMinor` is the bill-currency display
 * figure and is **null** whenever the scope spans more than one bill currency,
 * because cross-currency fiat figures are never summed. `components` carry both
 * plus their own `currency`, so a single component is always safe to render.
 *
 * Netting is per group. Two people who share no group are never netted against
 * each other, so `groups[].positions` — not a flattened list — is what debt
 * compression must be run over.
 */
export const forViewer = query({
  args: {
    groupId: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    const scope = await resolveViewerScope(ctx, args.groupId);
    if (!scope) {
      return emptyViewerBalance();
    }

    const groups: ViewerGroupBalance[] = [];
    const components: ViewerComponent[] = [];
    const currencies = new Set<string>();

    let netAtomic = 0n;
    let netMinor = 0;

    for (const groupId of scope.groupIds) {
      const { balance } = await balanceForGroup(ctx, groupId);
      const group = await ctx.db.get(groupId);

      groups.push({
        groupId,
        displayName: group?.displayName ?? "Group",
        displayCurrency: balance.displayCurrency,
        isAllSquare: balance.isAllSquare,
        positions: balance.positions,
        positionsAtomic: balance.positionsAtomic,
      });

      for (const component of balance.components) {
        currencies.add(component.currency);

        if (component.debtorUserId === scope.user._id) {
          components.push({ ...component, direction: "owe" });
        } else if (component.creditorUserId === scope.user._id) {
          components.push({ ...component, direction: "owed" });
        }
      }

      const viewerAtomic = balance.positionsAtomic.find(
        (position) => position.userId === scope.user._id,
      );
      netAtomic += viewerAtomic?.netAtomic ?? 0n;

      const viewerMinor = balance.positions?.find(
        (position) => position.userId === scope.user._id,
      );
      netMinor += viewerMinor?.netMinor ?? 0;
    }

    // One currency across the whole scope, or no fiat figure at all. A hero
    // that sums baht and dollars is exactly the trust defect this forbids.
    const displayCurrency = currencies.size <= 1 ? [...currencies][0] ?? null : null;

    const memberNames = await loadDisplayNames(
      ctx,
      groups
        .flatMap((group) => [
          ...(group.positions ?? []).map((position) => position.userId),
          ...group.positionsAtomic.map((position) => position.userId),
        ])
        .concat(components.flatMap((c) => [c.debtorUserId, c.creditorUserId]))
        .map((userId) => userId as Id<"users">),
    );

    const result: ViewerBalance = {
      viewerUserId: scope.user._id,
      displayCurrency,
      netMinor: displayCurrency === null ? null : netMinor,
      netAtomic,
      isAllSquare: netAtomic === 0n,
      groups,
      components,
      memberNames,
    };

    return result;
  },
});

/**
 * Open tabs across every group the viewer belongs to, with per-tab progress.
 *
 * Lives here rather than on `tabs` because every field beyond the name is a
 * balance fact: the progress fraction is confirmed obligations, and the amount
 * column is the viewer's own position on that tab.
 *
 * `settledCount` counts obligations cleared by *confirmed* money only —
 * confirmed chain settlement, recipient waiver, or dual-acknowledged cash.
 * `submittedCount` is reported separately and never folded into it.
 */
export const listOpenTabsForViewer = query({
  args: {
    groupId: v.optional(v.id("groups")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await resolveViewerScope(ctx, args.groupId);
    if (!scope) {
      return [];
    }

    const limit = args.limit ?? 20;
    const cards: Array<{
      tabId: Id<"tabs">;
      groupId: Id<"groups">;
      name: string;
      status: string;
      currency: string;
      settledCount: number;
      totalCount: number;
      submittedCount: number;
      peopleCount: number;
      billTotalMinor: number | null;
      viewerAmountMinor: number | null;
      viewerAmountAtomic: bigint;
      viewerObligationId: Id<"obligations"> | null;
      amountTone: "owed" | "settled" | "neutral";
      updatedAt: number;
      /*
       * Everything below is what makes a tab READ as live rather than as a row
       * in a list: who is in the room, how far the claiming has got, and what
       * is still up for grabs. All of it is derived from `items`,
       * `allocations` and `tabParticipants` — no new table, and nothing here
       * is money, so none of it can drift from the obligation arithmetic
       * above.
       */
      participants: Array<{ userId: Id<"users">; claimedCount: number }>;
      itemCount: number;
      claimedItemCount: number;
      /** At most `UNCLAIMED_PREVIEW_LIMIT`, in the bill's own sort order. */
      unclaimedItems: Array<{ itemId: Id<"items">; name: string; lineTotalMinor: number }>;
      /** Every unclaimed item, including the ones the preview did not fit. */
      unclaimedCount: number;
      startedAt: number;
    }> = [];

    for (const groupId of scope.groupIds) {
      const tabs = await ctx.db
        .query("tabs")
        .withIndex("by_group_id", (q) => q.eq("groupId", groupId))
        .collect();

      const rows = await loadGroupBalanceRows(ctx, groupId);
      const offsets = confirmedOffsetMinorByObligation(rows.ledgerEvents);

      for (const tab of tabs) {
        if (!TAB_OPEN_STATUSES.has(tab.status)) {
          continue;
        }

        const obligations = rows.obligations.filter(
          (obligation) =>
            obligation.tabId === tab._id && obligation.status !== "superseded",
        );

        let settledCount = 0;
        let submittedCount = 0;
        let viewerAmountMinor = 0n;
        let viewerAmountAtomic = 0n;
        let viewerObligationId: Id<"obligations"> | null = null;
        let viewerIsCreditor = false;

        for (const obligation of obligations) {
          const offsetMinor = offsets.get(obligation._id) ?? 0n;
          const cleared =
            obligation.status === "settled" ||
            offsetMinor >= obligation.displayAmountThbMinor;

          if (cleared) {
            settledCount += 1;
          } else if (obligation.settlementIntentId) {
            const intent = await ctx.db.get(obligation.settlementIntentId);
            if (intent && IN_FLIGHT_INTENT_STATUSES.has(intent.status)) {
              submittedCount += 1;
            }
          }

          if (cleared) {
            continue;
          }

          const remainingMinor = obligation.displayAmountThbMinor - offsetMinor;
          const remainingAtomic =
            obligation.amountAtomic -
            offsetAtomicForObligation(obligation, offsetMinor);

          if (obligation.debtorUserId === scope.user._id) {
            viewerObligationId = obligation._id;
            viewerAmountMinor -= remainingMinor;
            viewerAmountAtomic -= remainingAtomic;
          } else if (obligation.creditorUserId === scope.user._id) {
            viewerIsCreditor = true;
            viewerAmountMinor += remainingMinor;
            viewerAmountAtomic += remainingAtomic;
          }
        }

        const participants = await ctx.db
          .query("tabParticipants")
          .withIndex("by_tab_id", (q) => q.eq("tabId", tab._id))
          .collect();

        /*
         * Claiming progress. `allocations` is read whole rather than per item
         * (the Claim Board's own per-item reads are fine there — it is showing
         * one tab; this query is showing every open tab the viewer is in).
         *
         * Allocation rows are replaced on re-claim rather than appended, which
         * is why there is no revision filter here and none on the Claim Board
         * either — the rows that exist ARE the current claims.
         */
        const items = await ctx.db
          .query("items")
          .withIndex("by_tab_and_sort", (q) => q.eq("tabId", tab._id))
          .collect();
        const allocations = await ctx.db
          .query("allocations")
          .withIndex("by_tab_id", (q) => q.eq("tabId", tab._id))
          .collect();

        const claimedItemIds = new Set<string>();
        const claimCountByUser = new Map<string, number>();
        for (const allocation of allocations) {
          claimedItemIds.add(allocation.itemId);
          claimCountByUser.set(
            allocation.userId,
            (claimCountByUser.get(allocation.userId) ?? 0) + 1,
          );
        }

        const unclaimed = items.filter((item) => !claimedItemIds.has(item._id));

        cards.push({
          tabId: tab._id,
          groupId,
          name: tab.name,
          status: tab.status,
          currency: currencyForTab(tab),
          settledCount,
          totalCount: obligations.length,
          submittedCount,
          peopleCount: participants.length,
          billTotalMinor:
            tab.billTotalMinor === undefined ? null : Number(tab.billTotalMinor),
          viewerAmountMinor: Number(
            viewerAmountMinor < 0n ? -viewerAmountMinor : viewerAmountMinor,
          ),
          viewerAmountAtomic:
            viewerAmountAtomic < 0n ? -viewerAmountAtomic : viewerAmountAtomic,
          viewerObligationId,
          amountTone:
            viewerAmountMinor < 0n || viewerAmountAtomic < 0n
              ? "owed"
              : viewerIsCreditor && viewerAmountAtomic > 0n
                ? "settled"
                : "neutral",
          updatedAt: tab.updatedAt,
          participants: participants.map((participant) => ({
            userId: participant.userId,
            claimedCount: claimCountByUser.get(participant.userId) ?? 0,
          })),
          itemCount: items.length,
          claimedItemCount: claimedItemIds.size,
          unclaimedItems: unclaimed
            .slice(0, UNCLAIMED_PREVIEW_LIMIT)
            .map((item) => ({
              itemId: item._id,
              name: item.name,
              lineTotalMinor: item.lineTotalMinor,
            })),
          unclaimedCount: unclaimed.length,
          startedAt: tab.createdAt,
        });
      }
    }

    const visible = cards.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);

    /*
     * Names are resolved AFTER the slice, so a viewer in many groups does not
     * pay to name people on tabs that never reach the screen.
     */
    const displayNames = await loadDisplayNames(
      ctx,
      visible.flatMap((card) => card.participants.map((one) => one.userId)),
    );

    return visible.map((card) => ({
      ...card,
      participants: card.participants.map((participant) => ({
        ...participant,
        displayName: displayNames[participant.userId] ?? "Someone",
      })),
    }));
  },
});

/**
 * Whether one bill — a tab at one locked revision — is complete.
 *
 * "Bill complete and group net zero are different" (EXPERIENCE). This answers
 * the first; `forViewer().isAllSquare` answers the second. The once-per-bill
 * completion card listens to this one.
 */
export type BillCompletion = {
  tabId: Id<"tabs">;
  billId: string | null;
  revision: number;
  totalCount: number;
  settledCount: number;
  complete: boolean;
};

/**
 * The completion arithmetic, with no authorization of its own.
 *
 * Split out so that everything which needs to know "is this bill finished?"
 * asks the SAME question — the completion card's subscription and the share
 * authorization both land here, and neither can drift into a looser test than
 * the other.
 */
export async function computeBillCompletion(
  ctx: BalancesCtx,
  tab: Doc<"tabs">,
): Promise<BillCompletion> {
  const obligations = await ctx.db
    .query("obligations")
    .withIndex("by_tab_id", (q) => q.eq("tabId", tab._id))
    .collect();

  const rows = await loadGroupBalanceRows(ctx, tab.groupId);
  const offsets = confirmedOffsetMinorByObligation(rows.ledgerEvents);

  const active = obligations.filter((o) => o.status !== "superseded");
  const settled = active.filter(
    (o) =>
      o.status === "settled" ||
      (offsets.get(o._id) ?? 0n) >= o.displayAmountThbMinor,
  );

  return {
    tabId: tab._id,
    billId: active[0] ? billIdForObligation(active[0]) : null,
    revision: tab.lockedRevision ?? tab.revision ?? 0,
    totalCount: active.length,
    settledCount: settled.length,
    complete: active.length > 0 && settled.length === active.length,
  };
}

export const billCompletion = query({
  args: {
    tabId: v.id("tabs"),
  },
  handler: async (ctx, args): Promise<BillCompletion | null> => {
    const tab = await ctx.db.get(args.tabId);
    if (!tab) {
      return null;
    }

    // Id-keyed read: deny by default rather than degrade to an empty payload.
    await requireGroupMember(ctx, tab.groupId);

    return computeBillCompletion(ctx, tab);
  },
});
