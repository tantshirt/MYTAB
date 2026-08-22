import {
  ACTIVITY_EVENT_TYPE,
  type ActivityEventPayload,
  type ActivityEventType,
} from "@/lib/domain/activityTypes";
import type { ActivityRowData } from "./ActivityFeed";

const KNOWN_TYPES = new Set<string>(Object.values(ACTIVITY_EVENT_TYPE));

/**
 * `activityEvents.payload` is `v.any()` server-side, so it is narrowed here.
 *
 * Lives outside `useActivityData` because it is a pure mapper shared by the
 * Activity surface and the Group surface, and because `useActivityData` is a
 * data seam the responsive sweep swaps out wholesale at build time.
 */
export function toActivityRow(event: {
  _id: string;
  type: string;
  payload: unknown;
  createdAt: number;
}): ActivityRowData {
  const payload = (event.payload ?? {}) as ActivityEventPayload;
  const signature = payload.transactionSignature;

  return {
    id: event._id,
    type: (KNOWN_TYPES.has(event.type)
      ? event.type
      : ACTIVITY_EVENT_TYPE.ITEM_EDIT) as ActivityEventType,
    summary: payload.summary ?? "",
    amountLabel: payload.amountLabel,
    createdAt: event.createdAt,
    detail: payload.detail,
    transactionSignature: signature,
    explorerUrl: signature ? `https://explorer.solana.com/tx/${signature}` : undefined,
  };
}
