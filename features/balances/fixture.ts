import type { BalanceHeroState, GroupBalanceSummary } from "@/lib/domain/balance";
import { resolveBalanceHero } from "@/lib/domain/balance";
import { compressDebts, DEBT_COMPRESSION_DISCLAIMER } from "@/lib/domain/debtCompression";
import { formatFiatMinorThb } from "@/lib/domain/format";
import { thbMinorFromInteger } from "@/lib/domain/parse";
import { thbMinorToUsdcAtomicFixture } from "@/lib/domain/fxFixture";
import { ACTIVITY_EVENT_TYPE } from "@/lib/domain/activityTypes";
import type { ActivityRowData } from "./ActivityFeed";
import type { TabCardProps } from "./TabCard";

/** Demo protagonists (Story 7.10). */
export const FIXTURE_VIEWER_USER_ID = "user-andre";

export const FIXTURE_GROUP = {
  id: "groups:fixture-sukhumvit",
  name: "Sukhumvit Dinner",
  defaultCurrency: "THB",
  recipientAsset: "USDC",
};

export const FIXTURE_MEMBERS = [
  { userId: "user-maya", displayName: "Maya", walletReady: true },
  { userId: "user-andre", displayName: "Andre", walletReady: true },
  { userId: "user-noi", displayName: "Noi", walletReady: true },
  { userId: "user-ploy", displayName: "Ploy", walletReady: true },
  { userId: "user-tim", displayName: "Tim", walletReady: false },
];

export const FIXTURE_OBLIGATIONS = [
  {
    id: "obl-1",
    tabId: "tabs:fixture-primary",
    billId: "bill:fixture-primary",
    debtorUserId: "user-andre",
    creditorUserId: "user-maya",
    amountMinor: thbMinorFromInteger(29_174),
    revision: 1,
    superseded: false,
  },
  {
    id: "obl-2",
    tabId: "tabs:fixture-primary",
    billId: "bill:fixture-primary",
    debtorUserId: "user-tim",
    creditorUserId: "user-maya",
    amountMinor: thbMinorFromInteger(15_000),
    revision: 1,
    superseded: false,
  },
  {
    id: "obl-3",
    tabId: "tabs:fixture-secondary",
    billId: "bill:fixture-secondary",
    debtorUserId: "user-maya",
    creditorUserId: "user-andre",
    amountMinor: thbMinorFromInteger(8_000),
    revision: 1,
    superseded: false,
  },
];

export const FIXTURE_OFFSETS = [
  {
    obligationId: "obl-2",
    tabId: "tabs:fixture-primary",
    billId: "bill:fixture-primary",
    debtorUserId: "user-tim",
    creditorUserId: "user-maya",
    amountMinor: thbMinorFromInteger(15_000),
    kind: "settlement_offset" as const,
    confirmed: true,
  },
];

export const FIXTURE_GROUP_BALANCE: GroupBalanceSummary = {
  positions: [
    { userId: "user-andre", netMinor: thbMinorFromInteger(-21_174) },
    { userId: "user-maya", netMinor: thbMinorFromInteger(21_174) },
  ],
  isAllSquare: false,
  components: [
    {
      obligationId: "obl-1",
      tabId: "tabs:fixture-primary",
      billId: "bill:fixture-primary",
      amountMinor: thbMinorFromInteger(29_174),
      debtorUserId: "user-andre",
      creditorUserId: "user-maya",
    },
    {
      obligationId: "obl-3",
      tabId: "tabs:fixture-secondary",
      billId: "bill:fixture-secondary",
      amountMinor: thbMinorFromInteger(8_000),
      debtorUserId: "user-maya",
      creditorUserId: "user-andre",
    },
  ],
};

export const FIXTURE_BALANCE_HERO: BalanceHeroState = resolveBalanceHero({
  viewerUserId: FIXTURE_VIEWER_USER_ID,
  groupBalance: FIXTURE_GROUP_BALANCE,
  settledUsdcAtomic: thbMinorToUsdcAtomicFixture(thbMinorFromInteger(21_174)),
});

export const FIXTURE_OPEN_TABS: TabCardProps[] = [
  {
    tabId: "tabs:fixture-primary",
    name: "Sukhumvit Dinner",
    status: "open",
    settledCount: 1,
    totalCount: 2,
    submittedCount: 1,
    href: "/tabs/tabs:fixture-primary",
  },
  {
    tabId: "tabs:fixture-secondary",
    name: "After-dinner drinks",
    status: "locked",
    settledCount: 0,
    totalCount: 1,
    href: "/tabs/tabs:fixture-secondary",
  },
];

export const FIXTURE_ACTIVITY: ActivityRowData[] = [
  {
    id: "act-1",
    type: ACTIVITY_EVENT_TYPE.PAYMENT,
    summary: "Tim paid Maya",
    amountLabel: "42.10 USDC",
    createdAt: Date.now() - 5 * 60_000,
    detail: "Confirmed on chain",
    transactionSignature: "fixture-tx-001",
    explorerUrl: "https://explorer.solana.com/tx/fixture-tx-001",
  },
  {
    id: "act-2",
    type: ACTIVITY_EVENT_TYPE.CLAIM,
    summary: "Maya claimed Green Curry",
    amountLabel: "฿180.00",
    createdAt: Date.now() - 30 * 60_000,
  },
  {
    id: "act-3",
    type: ACTIVITY_EVENT_TYPE.TIP,
    summary: "Noi sent a tip to Ploy",
    amountLabel: "฿50.00",
    createdAt: Date.now() - 2 * 60 * 60_000,
  },
];

export const FIXTURE_COMPRESSED_TRANSFERS = compressDebts(FIXTURE_GROUP_BALANCE.positions);

export function formatCompressionLine(from: string, to: string, amountMinor: number): string {
  return `${from} → ${to}: ${formatFiatMinorThb(thbMinorFromInteger(amountMinor))}`;
}

export { DEBT_COMPRESSION_DISCLAIMER };
