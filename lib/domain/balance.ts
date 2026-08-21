import { addFiatMinor, fiatMinorFromInteger, mulFiatMinorByInt, subFiatMinor, type FiatMinor } from "./money";
import { formatFiatMinorThb } from "./format";
import { formatCryptoAmountDisplay, usdcAmountFromAtomicString } from "./crypto";

/** Balance hero display state (Story 7.1 AC1). */
export type BalanceHeroState =
  | { kind: "owed"; amountMinor: FiatMinor }
  | { kind: "settled"; amountAtomic: bigint; tokenLabel: string }
  | { kind: "all_square" };

export type LedgerOffsetKind =
  | "settlement_offset"
  | "waiver_offset"
  | "cash_offset";

/** Immutable ledger offset applied to an obligation (Story 7.5 AC1). */
export type LedgerOffset = {
  obligationId: string;
  tabId: string;
  billId: string;
  debtorUserId: string;
  creditorUserId: string;
  amountMinor: FiatMinor;
  kind: LedgerOffsetKind;
  confirmed: boolean;
};

export type ObligationRecord = {
  id: string;
  tabId: string;
  billId: string;
  debtorUserId: string;
  creditorUserId: string;
  amountMinor: FiatMinor;
  revision: number;
  superseded: boolean;
};

export type UserNetPosition = {
  userId: string;
  netMinor: FiatMinor;
};

export type GroupBalanceSummary = {
  positions: UserNetPosition[];
  isAllSquare: boolean;
  components: Array<{
    obligationId: string;
    tabId: string;
    billId: string;
    amountMinor: FiatMinor;
    debtorUserId: string;
    creditorUserId: string;
  }>;
};

/** Derives net positions within one group from immutable ledger events (Story 7.5). */
export function deriveWithinGroupBalance(input: {
  obligations: ObligationRecord[];
  offsets: LedgerOffset[];
}): GroupBalanceSummary {
  const activeObligations = input.obligations.filter((o) => !o.superseded);
  const confirmedOffsets = input.offsets.filter((o) => o.confirmed);

  const components: GroupBalanceSummary["components"] = [];
  const netByUser = new Map<string, FiatMinor>();

  const addNet = (userId: string, delta: FiatMinor) => {
    netByUser.set(userId, addFiatMinor(netByUser.get(userId) ?? fiatMinorFromInteger(0), delta));
  };

  for (const obligation of activeObligations) {
    const offsetTotal = confirmedOffsets
      .filter((o) => o.obligationId === obligation.id)
      .reduce((sum, o) => addFiatMinor(sum, o.amountMinor), fiatMinorFromInteger(0));

    const remaining = subFiatMinor(obligation.amountMinor, offsetTotal);
    if (remaining === fiatMinorFromInteger(0)) {
      continue;
    }

    components.push({
      obligationId: obligation.id,
      tabId: obligation.tabId,
      billId: obligation.billId,
      amountMinor: remaining,
      debtorUserId: obligation.debtorUserId,
      creditorUserId: obligation.creditorUserId,
    });

    addNet(obligation.debtorUserId, mulFiatMinorByInt(remaining, -1));
    addNet(obligation.creditorUserId, remaining);
  }

  const zero = fiatMinorFromInteger(0);
  const positions = [...netByUser.entries()]
    .filter(([, net]) => net !== zero)
    .map(([userId, netMinor]) => ({ userId, netMinor }));

  const isAllSquare = positions.length === 0;

  return { positions, isAllSquare, components };
}

/** Resolves balance hero copy from a viewer's net position (Story 7.1). */
export function resolveBalanceHero(input: {
  viewerUserId: string;
  groupBalance: GroupBalanceSummary;
  settledUsdcAtomic?: bigint;
}): BalanceHeroState {
  const viewerPosition = input.groupBalance.positions.find(
    (p) => p.userId === input.viewerUserId,
  );

  if (!viewerPosition || viewerPosition.netMinor === fiatMinorFromInteger(0)) {
    return { kind: "all_square" };
  }

  if (viewerPosition.netMinor < fiatMinorFromInteger(0)) {
    return { kind: "owed", amountMinor: Math.abs(viewerPosition.netMinor) as FiatMinor };
  }

  const atomic = input.settledUsdcAtomic ?? 0n;
  return {
    kind: "settled",
    amountAtomic: atomic,
    tokenLabel: "USDC",
  };
}

/** Formats balance hero headline text (Story 7.1 AC1, AC3). */
export function formatBalanceHeroText(state: BalanceHeroState): string {
  switch (state.kind) {
    case "owed":
      return `You owe ${formatFiatMinorThb(state.amountMinor)}`;
    case "settled": {
      const display = formatCryptoAmountDisplay(
        usdcAmountFromAtomicString(state.amountAtomic.toString()),
      );
      return `You are owed ${display} ${state.tokenLabel}`;
    }
    case "all_square":
      return "All square";
  }
}

/** Whether a bill is complete from confirmed offsets (Story 7.5 AC5). */
export function isBillComplete(input: {
  obligations: ObligationRecord[];
  offsets: LedgerOffset[];
  billId: string;
  revision: number;
}): boolean {
  const billObligations = input.obligations.filter(
    (o) => o.billId === input.billId && o.revision === input.revision && !o.superseded,
  );

  if (billObligations.length === 0) {
    return false;
  }

  return billObligations.every((obligation) => {
    const offsetTotal = input.offsets
      .filter((o) => o.obligationId === obligation.id && o.confirmed)
      .reduce((sum, o) => addFiatMinor(sum, o.amountMinor), fiatMinorFromInteger(0));
    return offsetTotal >= obligation.amountMinor;
  });
}
