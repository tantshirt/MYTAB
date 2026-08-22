"use client";

import { useHasPainted } from "@/components/primitives/use-has-painted";
import { useRetryNonce } from "@/features/convex/useConvexData";
import type { ActivityData } from "../../features/balances/useActivityData";
import { FIXTURE_ACTIVITY } from "@/tests/fixtures/balances";

export type { ActivityData };

/** Sweep stand-in — see `tests/sweep/README.md`. */
export function useActivityData(): ActivityData {
  const hasCachedData = useHasPainted("activity");
  const { retry } = useRetryNonce();
  return { status: "ready", hasCachedData, events: FIXTURE_ACTIVITY, retry };
}
