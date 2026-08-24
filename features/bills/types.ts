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
  /** False until every server-owned setup dependency has resolved. */
  setupReady?: boolean;
  /** Named terminal read failure; retrySetup re-subscribes all setup reads. */
  setupError?: string;
  retrySetup?: () => void;
  tabId: string;
  groupId?: string;
  title: string;
  merchantName: string;
  displayCurrency: string;
  /** Display label for the last/default verified receive asset. */
  recipientAsset: string;
  receiveMint?: string;
  receiveAssetOptions?: Array<{ mint: string; symbol: string; name: string }>;
  organizerDisplayName: string;
  organizerUserId: string;
  payerUserId: string;
  recipientUserId: string;
  members: BillMemberOption[];
  items: BillItemView[];
  adjustments: BillAdjustmentView[];
  totalDisplay: string;
  fxFixtureBadge: string;
  /**
   * INVITE-FLOW §4 — head count for a personal tab. Absent on a group-origin
   * form, where the chat bounds the roster.
   */
  seats?: number;
  /** No `?group=` means the invite door. */
  origin?: "chat" | "personal";
};
