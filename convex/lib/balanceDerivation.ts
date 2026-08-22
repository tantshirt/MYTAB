import type { GenericQueryCtx } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { FiatMinor } from "../../lib/domain/money";
import type { GroupBalanceSummary, UserNetPosition } from "../../lib/domain/balance";
import {
  deriveWithinGroupBalance,
  type LedgerOffset,
  type ObligationRecord,
} from "../../lib/domain/balance";

export type ObligationLedgerRow = {
  obligationId: string;
  tabId: string;
  billId: string;
  debtorUserId: string;
  creditorUserId: string;
  amountMinor: number;
  eventKind: string;
  confirmed: boolean;
};

/** Maps Convex ledger rows to domain inputs (Story 7.5). */
export function buildBalanceInputs(input: {
  obligations: Array<{
    id: string;
    tabId: string;
    billId: string;
    debtorUserId: string;
    creditorUserId: string;
    amountMinor: number;
    revision: number;
    superseded: boolean;
  }>;
  ledgerEvents: ObligationLedgerRow[];
}): { obligations: ObligationRecord[]; offsets: LedgerOffset[] } {
  const obligations: ObligationRecord[] = input.obligations.map((o) => ({
    id: o.id,
    tabId: o.tabId,
    billId: o.billId,
    debtorUserId: o.debtorUserId,
    creditorUserId: o.creditorUserId,
    amountMinor: o.amountMinor as FiatMinor,
    revision: o.revision,
    superseded: o.superseded,
  }));

  const offsets: LedgerOffset[] = input.ledgerEvents
    .filter((e) => e.eventKind !== "cash_proposed")
    .map((e) => ({
      obligationId: e.obligationId,
      tabId: e.tabId,
      billId: e.billId,
      debtorUserId: e.debtorUserId,
      creditorUserId: e.creditorUserId,
      amountMinor: e.amountMinor as FiatMinor,
      kind:
        e.eventKind === "waiver_offset"
          ? "waiver_offset"
          : e.eventKind === "cash_offset"
            ? "cash_offset"
            : "settlement_offset",
      confirmed: e.confirmed,
    }));

  return { obligations, offsets };
}

export { deriveWithinGroupBalance };

/* ------------------------------------------------------------------------- *
 * Viewer-level balance loading (Story 7.5, EXPERIENCE — Money Legibility)
 * ------------------------------------------------------------------------- */

type BalanceCtx = GenericQueryCtx<DataModel>;

/** Currency assumed when a tab predates `defaultCurrency` (schema stores THB minor). */
export const DEFAULT_BILL_CURRENCY = "THB";

export const BILL_ID_SEPARATOR = "#";

/**
 * A *bill* is a tab at one locked revision.
 *
 * `obligations` has no `billId` column, and `obligationLedgerEvents.billId` is a
 * free string, so this is the single place the identity is minted. Bill
 * completion (EXPERIENCE — "Bill complete and group net zero are different") is
 * scoped to this key, never to the tab alone.
 */
export function billIdForObligation(obligation: {
  tabId: string;
  tabRevision: number;
}): string {
  return `${obligation.tabId}${BILL_ID_SEPARATOR}${obligation.tabRevision}`;
}

export type LoadedGroupRows = {
  obligations: Doc<"obligations">[];
  ledgerEvents: Doc<"obligationLedgerEvents">[];
};

/** Indexed load of everything one group's balance is derived from. */
export async function loadGroupBalanceRows(
  ctx: BalanceCtx,
  groupId: Id<"groups">,
): Promise<LoadedGroupRows> {
  const [obligations, ledgerEvents] = await Promise.all([
    ctx.db
      .query("obligations")
      .withIndex("by_group_id", (q) => q.eq("groupId", groupId))
      .collect(),
    ctx.db
      .query("obligationLedgerEvents")
      .withIndex("by_group_id", (q) => q.eq("groupId", groupId))
      .collect(),
  ]);

  return { obligations, ledgerEvents };
}

/**
 * Confirmed fiat offset per obligation.
 *
 * "Progress counts confirmed money only" (EXPERIENCE): `cash_proposed` rows and
 * any row with `confirmed === false` are excluded here, and an in-flight
 * (`submitted` / `user_signed` / `unknown`) settlement intent contributes
 * nothing at all — only `obligations.status === "settled"`, which
 * `applySettlementOffset` sets from `applyConfirmedInternal`, counts as paid.
 */
export function confirmedOffsetMinorByObligation(
  ledgerEvents: ReadonlyArray<{
    obligationId: string;
    amountMinor: bigint;
    eventKind: string;
    confirmed: boolean;
  }>,
): Map<string, bigint> {
  const totals = new Map<string, bigint>();

  for (const event of ledgerEvents) {
    if (!event.confirmed || event.eventKind === "cash_proposed") {
      continue;
    }
    totals.set(
      event.obligationId,
      (totals.get(event.obligationId) ?? 0n) + event.amountMinor,
    );
  }

  return totals;
}

/**
 * Converts a bill-currency offset into the obligation's locked USDC atomic unit.
 *
 * Integer only. The offset floors, so the *remaining* atomic amount rounds up
 * and a debt is never understated. A full offset returns the whole locked
 * target exactly, which is the only case the product can currently produce —
 * waiver, cash and chain settlement all clear an obligation entirely.
 */
export function offsetAtomicForObligation(
  obligation: { displayAmountThbMinor: bigint; amountAtomic: bigint },
  offsetMinor: bigint,
): bigint {
  if (offsetMinor <= 0n || obligation.displayAmountThbMinor <= 0n) {
    return 0n;
  }
  if (offsetMinor >= obligation.displayAmountThbMinor) {
    return obligation.amountAtomic;
  }
  return (offsetMinor * obligation.amountAtomic) / obligation.displayAmountThbMinor;
}

export type BalanceComponent = {
  obligationId: string;
  groupId: string;
  tabId: string;
  tabRevision: number;
  billId: string;
  debtorUserId: string;
  creditorUserId: string;
  /** Remaining in the bill currency. Never summed across unlike currencies. */
  amountMinor: number;
  /** Remaining in the canonical net unit (USDC atomic). */
  amountAtomic: bigint;
  currency: string;
};

export type GroupBalance = {
  groupId: string;
  /** The one bill currency in play, or null when the group spans several. */
  displayCurrency: string | null;
  /**
   * Fiat net positions — **null when `displayCurrency` is null**, because
   * cross-currency fiat figures are never summed (brief, decision 5).
   */
  positions: UserNetPosition[] | null;
  /** Canonical net positions in USDC atomic units. Always present. */
  positionsAtomic: Array<{ userId: string; netAtomic: bigint }>;
  components: BalanceComponent[];
  isAllSquare: boolean;
};

/**
 * Derives one group's balance in both units from immutable rows.
 *
 * The fiat lane is `deriveWithinGroupBalance` unchanged — it decides which
 * obligations are still outstanding. The atomic lane nets over *that same*
 * component set, so the two can never disagree about who owes whom; they only
 * differ in unit. `isAllSquare` is taken from the canonical atomic lane.
 */
export function deriveGroupBalance(input: {
  groupId: string;
  obligations: ReadonlyArray<{
    _id: string;
    groupId: string;
    tabId: string;
    tabRevision: number;
    debtorUserId: string;
    creditorUserId: string;
    displayAmountThbMinor: bigint;
    amountAtomic: bigint;
    status: "open" | "settled" | "superseded";
  }>;
  ledgerEvents: ReadonlyArray<{
    obligationId: string;
    tabId: string;
    billId: string;
    debtorUserId: string;
    creditorUserId: string;
    amountMinor: bigint;
    eventKind: string;
    confirmed: boolean;
  }>;
  currencyByTabId: ReadonlyMap<string, string>;
}): GroupBalance {
  const active = input.obligations.filter((o) => o.status !== "superseded");
  const byId = new Map(active.map((o) => [o._id, o]));

  const currencies = new Set(
    active.map((o) => input.currencyByTabId.get(o.tabId) ?? DEFAULT_BILL_CURRENCY),
  );
  const displayCurrency = currencies.size === 1 ? [...currencies][0]! : null;

  // A confirmed on-chain settlement carries no amount of its own; it clears the
  // obligation outright, so it enters the ledger as a full offset.
  const syntheticOffsets = active
    .filter((o) => o.status === "settled")
    .map((o) => ({
      obligationId: o._id,
      tabId: o.tabId,
      billId: billIdForObligation(o),
      debtorUserId: o.debtorUserId,
      creditorUserId: o.creditorUserId,
      amountMinor: o.displayAmountThbMinor,
      eventKind: "settlement_offset",
      confirmed: true,
    }));

  const allEvents = [...input.ledgerEvents, ...syntheticOffsets];

  const derived: GroupBalanceSummary = deriveWithinGroupBalance(
    buildBalanceInputs({
      obligations: active.map((o) => ({
        id: o._id,
        tabId: o.tabId,
        billId: billIdForObligation(o),
        debtorUserId: o.debtorUserId,
        creditorUserId: o.creditorUserId,
        amountMinor: Number(o.displayAmountThbMinor),
        revision: o.tabRevision,
        superseded: false,
      })),
      ledgerEvents: allEvents.map((e) => ({
        obligationId: e.obligationId,
        tabId: e.tabId,
        billId: e.billId,
        debtorUserId: e.debtorUserId,
        creditorUserId: e.creditorUserId,
        amountMinor: Number(e.amountMinor),
        eventKind: e.eventKind,
        confirmed: e.confirmed,
      })),
    }),
  );

  const offsetMinor = confirmedOffsetMinorByObligation(allEvents);
  const netAtomic = new Map<string, bigint>();
  const addAtomic = (userId: string, delta: bigint) => {
    netAtomic.set(userId, (netAtomic.get(userId) ?? 0n) + delta);
  };

  const components: BalanceComponent[] = [];

  for (const component of derived.components) {
    const obligation = byId.get(component.obligationId);
    if (!obligation) {
      continue;
    }

    const remainingAtomic =
      obligation.amountAtomic -
      offsetAtomicForObligation(obligation, offsetMinor.get(obligation._id) ?? 0n);
    const amountAtomic = remainingAtomic > 0n ? remainingAtomic : 0n;

    components.push({
      obligationId: obligation._id,
      groupId: obligation.groupId,
      tabId: obligation.tabId,
      tabRevision: obligation.tabRevision,
      billId: component.billId,
      debtorUserId: obligation.debtorUserId,
      creditorUserId: obligation.creditorUserId,
      amountMinor: component.amountMinor,
      amountAtomic,
      currency: input.currencyByTabId.get(obligation.tabId) ?? DEFAULT_BILL_CURRENCY,
    });

    addAtomic(obligation.debtorUserId, -amountAtomic);
    addAtomic(obligation.creditorUserId, amountAtomic);
  }

  const positionsAtomic = [...netAtomic.entries()]
    .filter(([, net]) => net !== 0n)
    .map(([userId, net]) => ({ userId, netAtomic: net }));

  return {
    groupId: input.groupId,
    displayCurrency,
    positions: displayCurrency === null ? null : derived.positions,
    positionsAtomic,
    components,
    isAllSquare: positionsAtomic.length === 0,
  };
}
