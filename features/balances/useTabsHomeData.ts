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
 * BLOCKED on Convex — this seam still returns the fixture, and deliberately so.
 *
 * Every element this surface is made of is a *viewer-level balance*:
 * `balanceHero` is a net position, `balanceComponents` and
 * `compressedTransfers` are obligation ledgers, and even `openTabs` needs
 * `settledCount` / `totalCount` / `amountTone` per tab. There is no Convex
 * function that returns any of it:
 *
 *   - `convex/obligations.ts` is a stub (`export {}`); nothing exposes the
 *     `obligations` or `obligationLedgerEvents` tables to a client.
 *   - `convex/lib/balanceDerivation.ts` has `buildBalanceInputs` +
 *     `deriveWithinGroupBalance` but is not called from any `query`.
 *   - There is no `groups.listForViewer` / `tabs.listOpenForViewer` /
 *     `activity.listForViewer`; every group read needs a `groupId` the client
 *     has no way to enumerate.
 *
 * Needed before this can be swapped: a `balances.forViewer` query (net position
 * + components), `tabs.listOpenForViewer` (with per-tab settled counts), and
 * `groups.listForViewer`. `activity.listForGroup` already exists and is wired in
 * `useActivityData`.
 *
 * Partially wiring this would be worse than not wiring it: `BalanceHeroState`
 * has no "unknown" variant, so any live path has to assert `owed`, `settled` or
 * `all_square` — and rendering "All square" over real debt is precisely the
 * trust defect EXPERIENCE's *Money Legibility* section exists to prevent.
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
