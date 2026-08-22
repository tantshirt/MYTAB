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
import { toActivityRow } from "@/features/balances/activityRow";
import type { ActivityRowData } from "./ActivityFeed";

export type ActivityData = {
  status: "loading" | "ready" | "error";
  hasCachedData: boolean;
  events: ActivityRowData[];
  retry: () => void;
};

/**
 * The single prop-resolution seam for Activity.
 *
 * Live read: `api.activity.listForGroup({ groupId, limit })`, scoped by the
 * `?group=` key (`useGroupScope`).
 *
 * There is no `activity.listForViewer` on the backend — every activity read is
 * group-scoped. Launched without a group, this resolves `ready` with no events,
 * which is the designed §4.2 empty state rather than a permanent spinner.
 *
 * With no Convex client at all there is nothing to read, and this resolves the
 * same way: `ready`, no events, "Nothing yet. Claims, tips and payments show up
 * here." An empty feed is the truth; a seeded one is not.
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
