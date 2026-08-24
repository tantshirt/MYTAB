/** Immutable activity event kinds (Story 7.3 AC1). */
export const ACTIVITY_EVENT_TYPE = {
  CLAIM: "claim",
  CLAIM_RELEASE: "claim_release",
  ITEM_EDIT: "item_edit",
  TAB_LOCK: "tab_lock",
  PAYMENT: "payment",
  WAIVER: "waiver",
  CASH_PROPOSED: "cash_proposed",
  CASH_ACKNOWLEDGED: "cash_acknowledged",
  TAB_CREATED: "tab_created",
  RECEIPT_CONFIRMED: "receipt_confirmed",
} as const;

export type ActivityEventType =
  (typeof ACTIVITY_EVENT_TYPE)[keyof typeof ACTIVITY_EVENT_TYPE];

export type ActivityEventPayload = {
  summary: string;
  /** Exact persisted fiat minor units; string avoids bigint/JSON loss. */
  amountMinor?: string;
  currency?: string;
  amountLabel?: string;
  tabId?: string;
  billId?: string;
  transactionSignature?: string;
  detail?: string;
};

/** Icon tint by event type for 32px round icons (Story 7.3 AC4). */
export function activityIconTint(type: ActivityEventType): string {
  switch (type) {
    case ACTIVITY_EVENT_TYPE.PAYMENT:
      return "#0B7561";
    case ACTIVITY_EVENT_TYPE.WAIVER:
    case ACTIVITY_EVENT_TYPE.CASH_ACKNOWLEDGED:
      return "#1E51D2";
    case ACTIVITY_EVENT_TYPE.TAB_LOCK:
    case ACTIVITY_EVENT_TYPE.RECEIPT_CONFIRMED:
      return "#9A6209";
    case ACTIVITY_EVENT_TYPE.CASH_PROPOSED:
      return "#B32B44";
    default:
      return "#55677D";
  }
}
