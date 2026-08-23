"use client";

import { useHasPainted } from "@/components/primitives/use-has-painted";
import { useRetryNonce } from "@/features/convex/useConvexData";
import type { TabsHomeData } from "../../features/balances/useTabsHomeData";
import {
  FIXTURE_ACTIVITY,
  FIXTURE_BALANCE_HERO,
  FIXTURE_COMPRESSED_TRANSFERS,
  FIXTURE_GROUP,
  FIXTURE_GROUP_BALANCE,
  FIXTURE_MEMBERS,
  FIXTURE_OPEN_TABS,
  FIXTURE_VIEWER_USER_ID,
} from "@/tests/fixtures/balances";

export type { TabsHomeData };

/** Sweep stand-in — see `tests/sweep/README.md`. */
export function useTabsHomeData(): TabsHomeData {
  const hasCachedData = useHasPainted("tabs-home");
  const { retry } = useRetryNonce();

  const memberNames = Object.fromEntries(
    FIXTURE_MEMBERS.map((member) => [member.userId, member.displayName]),
  );

  /*
   * Both sides, not just what the viewer owes. The People section renders an
   * "owes you" row in `colors/settled` as well as an "you owe" row in
   * `colors/owed`, and a sweep that only ever saw one of them would never
   * measure the other.
   */
  const viewerComponents = FIXTURE_GROUP_BALANCE.components.filter(
    (component) =>
      component.debtorUserId === FIXTURE_VIEWER_USER_ID ||
      component.creditorUserId === FIXTURE_VIEWER_USER_ID,
  );

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
      balanceComponents: viewerComponents.map((component) => {
        const owes = component.debtorUserId === FIXTURE_VIEWER_USER_ID;
        const counterpartyUserId = owes
          ? component.creditorUserId
          : component.debtorUserId;

        return {
          counterpartyUserId,
          counterpartyName: memberNames[counterpartyUserId] ?? counterpartyUserId,
          direction: (owes ? "owe" : "owed") as "owe" | "owed",
          amountMinor: component.amountMinor,
          tabId: component.tabId,
          billId: component.billId,
        };
      }),
      compressedTransfers: FIXTURE_COMPRESSED_TRANSFERS,
      memberNames,
    },
  };
}
