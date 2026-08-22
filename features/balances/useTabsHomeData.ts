"use client";

import { useCallback, useState } from "react";
import { useHasPainted } from "@/components/primitives/use-has-painted";
import {
  FIXTURE_ACTIVITY,
  FIXTURE_BALANCE_HERO,
  FIXTURE_COMPRESSED_TRANSFERS,
  FIXTURE_GROUP,
  FIXTURE_GROUP_BALANCE,
  FIXTURE_MEMBERS,
  FIXTURE_OPEN_TABS,
  FIXTURE_VIEWER_USER_ID,
} from "./fixture";
import type { TabsHomeSurfaceProps } from "./TabsHomeSurface";

export type TabsHomeData = {
  status: "loading" | "ready" | "error";
  /** This surface has painted with data before — suppresses the skeleton. */
  hasCachedData: boolean;
  /** Everything the surface renders. State props are wired by the page. */
  content: Pick<
    TabsHomeSurfaceProps,
    | "balanceHero"
    | "openTabs"
    | "groups"
    | "recentActivity"
    | "balanceComponents"
    | "compressedTransfers"
    | "memberNames"
  >;
  retry: () => void;
};

/**
 * The single prop-resolution seam for Tabs home, mirroring
 * `features/you/useYouSurfaceData`.
 *
 * TODO(live-data): replace the fixture with the live reads — this function is
 * the only thing that changes:
 *
 *   const balances = useQuery(api.balances.forViewer, {});
 *   const openTabs = useQuery(api.tabs.listOpenForViewer, {});
 *   const activity = useQuery(api.activity.listForViewer, {});
 *   status: [balances, openTabs, activity].some((r) => r === undefined) ? "loading" : "ready"
 */
export function useTabsHomeData(): TabsHomeData {
  const hasCachedData = useHasPainted("tabs-home");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const memberNames = Object.fromEntries(
    FIXTURE_MEMBERS.map((member) => [member.userId, member.displayName]),
  );

  const viewerComponents = FIXTURE_GROUP_BALANCE.components.filter(
    (component) => component.debtorUserId === FIXTURE_VIEWER_USER_ID,
  );

  // Re-read seam: a retry re-runs the live queries. The fixture is constant.
  void attempt;

  return {
    status: "ready",
    hasCachedData,
    retry,
    content: {
      balanceHero: FIXTURE_BALANCE_HERO,
      openTabs: FIXTURE_OPEN_TABS,
      groups: [
        {
          id: FIXTURE_GROUP.id,
          name: FIXTURE_GROUP.name,
          memberCount: FIXTURE_MEMBERS.length,
        },
      ],
      recentActivity: FIXTURE_ACTIVITY,
      balanceComponents: viewerComponents.map((component) => ({
        label: `Owe ${memberNames[component.creditorUserId] ?? component.creditorUserId}`,
        amountMinor: component.amountMinor,
        tabId: component.tabId,
        billId: component.billId,
      })),
      compressedTransfers: FIXTURE_COMPRESSED_TRANSFERS,
      memberNames,
    },
  };
}
