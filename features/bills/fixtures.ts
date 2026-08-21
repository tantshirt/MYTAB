import type { AdjustmentKind } from "@/lib/domain/bill";
import { formatFiatMinorThb } from "@/lib/domain/format";
import { thbMinorFromWholeBaht } from "@/lib/domain";

export type BillMemberOption = {
  userId: string;
  displayName: string;
  telegramUserId: string;
  walletReady: boolean;
};

export type BillItemView = {
  _id: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  source: "manual" | "receipt";
};

export type BillAdjustmentView = {
  kind: AdjustmentKind;
  calculation: "fixed" | "percentage";
  valueMinorOrBps: number;
  label: string;
  amountDisplay: string;
};

export type BillAuthoringFixture = {
  tabId: string;
  title: string;
  merchantName: string;
  displayCurrency: string;
  recipientAsset: string;
  organizerDisplayName: string;
  organizerUserId: string;
  payerUserId: string;
  recipientUserId: string;
  members: BillMemberOption[];
  items: BillItemView[];
  adjustments: BillAdjustmentView[];
  totalDisplay: string;
  fxFixtureBadge: string;
};

export const FIXTURE_BILL_MEMBERS: BillMemberOption[] = [
  {
    userId: "users:andre",
    displayName: "Andre",
    telegramUserId: "tg:andre",
    walletReady: true,
  },
  {
    userId: "users:maya",
    displayName: "Maya",
    telegramUserId: "tg:maya",
    walletReady: true,
  },
  {
    userId: "users:noi",
    displayName: "Noi",
    telegramUserId: "tg:noi",
    walletReady: false,
  },
];

export const FIXTURE_BILL_ITEMS: BillItemView[] = [
  {
    _id: "items:1",
    name: "Pad Thai",
    quantity: 2,
    unitPriceMinor: thbMinorFromWholeBaht(180),
    lineTotalMinor: thbMinorFromWholeBaht(360),
    source: "manual",
  },
  {
    _id: "items:2",
    name: "ส้มตำ",
    quantity: 1,
    unitPriceMinor: thbMinorFromWholeBaht(160),
    lineTotalMinor: thbMinorFromWholeBaht(160),
    source: "manual",
  },
];

export const FIXTURE_BILL_AUTHORING: BillAuthoringFixture = {
  tabId: "tabs:fixture",
  title: "Sukhumvit Dinner",
  merchantName: "Somtum Der",
  displayCurrency: "THB",
  recipientAsset: "USDC",
  organizerDisplayName: "Andre",
  organizerUserId: "users:andre",
  payerUserId: "users:andre",
  recipientUserId: "users:maya",
  members: FIXTURE_BILL_MEMBERS,
  items: FIXTURE_BILL_ITEMS,
  adjustments: [
    {
      kind: "service",
      calculation: "percentage",
      valueMinorOrBps: 1000,
      label: "Service charge",
      amountDisplay: formatFiatMinorThb(thbMinorFromWholeBaht(52)),
    },
    {
      kind: "tax",
      calculation: "percentage",
      valueMinorOrBps: 700,
      label: "Tax",
      amountDisplay: formatFiatMinorThb(thbMinorFromWholeBaht(29)),
    },
  ],
  totalDisplay: formatFiatMinorThb(thbMinorFromWholeBaht(601)),
  fxFixtureBadge: "Fixture rate",
};

export const FIXTURE_EMPTY_BILL: BillAuthoringFixture = {
  ...FIXTURE_BILL_AUTHORING,
  items: [],
  adjustments: [],
  totalDisplay: formatFiatMinorThb(thbMinorFromWholeBaht(0)),
};
