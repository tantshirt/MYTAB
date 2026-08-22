"use client";

import { useHasPainted } from "@/components/primitives/use-has-painted";
import { useRetryNonce } from "@/features/convex/useConvexData";
import type { GroupContent, GroupData } from "../../features/groups/useGroupData";
import { FIXTURE_GROUP_SURFACE } from "@/tests/fixtures/groups";
import { FIXTURE_ACTIVITY } from "@/tests/fixtures/balances";

export type { GroupContent, GroupData };

/** Sweep stand-in — see `tests/sweep/README.md`. */
export function useGroupData(groupId: string): GroupData {
  const hasCachedData = useHasPainted(`group:${groupId}`);
  const { retry } = useRetryNonce();

  return {
    status: "ready",
    hasCachedData,
    retry,
    content: { ...FIXTURE_GROUP_SURFACE, groupId, activity: FIXTURE_ACTIVITY },
  };
}
