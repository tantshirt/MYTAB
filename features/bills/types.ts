import type { AdjustmentKind } from "@/lib/domain/bill";

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

/**
 * Everything `BillAuthoringSurface` needs to render a draft.
 *
 * Resolved by `features/bills/useNewTabData.ts` from Convex. There is no
 * in-source fallback: with nothing to read the surface renders its own §4.1
 * first-paint skeleton and then §4.2's "Nobody in this group has opened My Tab
 * yet." rather than a cast of invented diners.
 */
export type BillAuthoringData = {
  tabId: string;
  title: string;
  merchantName: string;
  displayCurrency: string;
  /**
   * Group defaults that New Tab deliberately does **not** render. The recipient
   * is the payer and the receiving asset is always USDC, stated on the You
   * surface — POLISH-SPEC §1.4 deletes both controls from this screen. They stay
   * on the shape because they are part of `getGroupDefaults`, not of the form.
   */
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
