"use client";

import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useHasPainted } from "@/components/primitives/use-has-painted";
import {
  useGroupScope,
  useLiveQuery,
  useRetryNonce,
} from "@/features/convex/useConvexData";
import {
  ACTIVITY_EVENT_TYPE,
  type ActivityEventPayload,
  type ActivityEventType,
} from "@/lib/domain/activityTypes";
import type { ActivityRowData } from "./ActivityFeed";
import { FIXTURE_ACTIVITY } from "./fixture";

export type ActivityData = {
  status: "loading" | "ready" | "error";
  hasCachedData: boolean;
  events: ActivityRowData[];
  retry: () => void;
};

const KNOWN_TYPES = new Set<string>(Object.values(ACTIVITY_EVENT_TYPE));

/** `activityEvents.payload` is `v.any()` server-side, so it is narrowed here. */
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

/**
 * The single prop-resolution seam for Activity.
 *
 * Live read: `api.activity.listForGroup({ groupId, limit })`, scoped by the
 * `?group=` key (`useGroupScope`).
 *
 * There is no `activity.listForViewer` on the backend — every activity read is
 * group-scoped. Launched without a group, this resolves `ready` with no events,
 * which is the designed §4.2 empty state rather than a permanent spinner.
 */
export function useActivityData(): ActivityData {
  const hasCachedData = useHasPainted("activity");
  const { nonce, retry } = useRetryNonce();
  const groupId = useGroupScope();

  const result = useLiveQuery(
    api.activity.listForGroup,
    groupId ? { groupId: groupId as Id<"groups">, limit: 50 } : "skip",
    nonce,
  );

  const events = useMemo(
    () => (result.data ?? []).map(toActivityRow),
    [result.data],
  );

  if (result.fixture) {
    return { status: "ready", hasCachedData, events: FIXTURE_ACTIVITY, retry };
  }

  if (result.error) {
    return { status: "error", hasCachedData, events: [], retry };
  }

  return {
    status: result.loading ? "loading" : "ready",
    hasCachedData,
    events,
    retry,
  };
}
