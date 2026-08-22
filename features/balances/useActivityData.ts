"use client";

import { useCallback, useState } from "react";
import { useHasPainted } from "@/components/primitives/use-has-painted";
import type { ActivityRowData } from "./ActivityFeed";
import { FIXTURE_ACTIVITY } from "./fixture";

export type ActivityData = {
  status: "loading" | "ready" | "error";
  hasCachedData: boolean;
  events: ActivityRowData[];
  retry: () => void;
};

/**
 * The single prop-resolution seam for Activity.
 *
 * TODO(live-data): `const events = useQuery(api.activity.listForViewer, {})`;
 * `status` becomes `events === undefined ? "loading" : "ready"`.
 */
export function useActivityData(): ActivityData {
  const hasCachedData = useHasPainted("activity");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  void attempt;

  return { status: "ready", hasCachedData, events: FIXTURE_ACTIVITY, retry };
}
