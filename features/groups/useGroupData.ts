"use client";

import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useHasPainted } from "@/components/primitives/use-has-painted";
import { useLiveQuery, useRetryNonce } from "@/features/convex/useConvexData";
import { toActivityRow } from "@/features/balances/activityRow";
import type { GroupSurfaceProps } from "./GroupSurface";

/** Everything the surface renders. The state props are wired by the page. */
export type GroupContent = Pick<
  GroupSurfaceProps,
  | "groupId"
  | "groupName"
  | "defaultCurrency"
  | "recipientAsset"
  | "members"
  | "openTabs"
  | "activity"
  | "position"
>;

export type GroupData = {
  status: "loading" | "ready" | "error";
  /** Two different §4.3 rows, and only one of them offers a retry. */
  error?: "not-a-member" | "query";
  /** This surface has painted with data before — suppresses the skeleton (§2.9). */
  hasCachedData: boolean;
  content: GroupContent;
  retry: () => void;
};

/**
 * The single prop-resolution seam for the Group surface, mirroring
 * `features/balances/useTabsHomeData`.
 *
 * Live reads:
 *   `api.groups.getGroup({ groupId })`             — name, members, wallet readiness
 *   `api.tabs.listOpenTabsForGroup({ groupId })`   — draft + open tabs
 *   `api.tabs.getGroupDefaults({ groupId })`       — display currency, recipient asset
 *   `api.activity.listForGroup({ groupId })`       — the feed
 *
 * `position` (the group `balance-hero`) is deliberately left undefined: it is a
 * net balance, and asserting one from data this seam has not read would not be
 * honest. The card is hidden when the prop is absent.
 *
 * With no Convex client every read is empty and the surface renders §4.2's "No
 * tabs yet." and "No one else has opened this tab yet." — never a cast of
 * invented members.
 */
export function useGroupData(groupId: string): GroupData {
  const hasCachedData = useHasPainted(`group:${groupId}`);
  const { nonce, retry } = useRetryNonce();
  const id = groupId as Id<"groups">;

  const group = useLiveQuery(api.groups.getGroup, { groupId: id }, nonce);
  const openTabs = useLiveQuery(api.tabs.listOpenTabsForGroup, { groupId: id }, nonce);
  const defaults = useLiveQuery(api.tabs.getGroupDefaults, { groupId: id }, nonce);
  const activity = useLiveQuery(
    api.activity.listForGroup,
    { groupId: id, limit: 50 },
    nonce,
  );

  const content = useMemo<GroupContent>(
    () => ({
      groupId,
      groupName: group.data?.displayName ?? "",
      defaultCurrency: defaults.data?.defaultCurrency ?? "THB",
      recipientAsset: defaults.data?.recipientAsset ?? "USDC",
      members: (group.data?.members ?? [])
        .filter((member) => member.membershipStatus === "active")
        .map((member) => ({
          telegramUserId: member.telegramUserId,
          displayName: member.displayName,
          username: member.username,
          avatarUrl: member.avatarUrl,
          walletReady: member.walletReady,
        })),
      openTabs: (openTabs.data ?? []).map((tab) => ({
        _id: tab._id,
        name: tab.name,
        status: tab.status,
        updatedAt: tab.updatedAt,
      })),
      activity: (activity.data ?? []).map(toActivityRow),
    }),
    [group.data, defaults.data, openTabs.data, activity.data, groupId],
  );

  /*
   * `getGroup` throws through `requireGroupMember` when the viewer is not in the
   * group, and returns `null` when the group is gone. Both read as
   * "You're not in this group any more." — the one §4.3 row without a retry.
   */
  if (group.error || group.data === null) {
    return { status: "error", error: "not-a-member", hasCachedData, retry, content };
  }

  if (openTabs.error || defaults.error || activity.error) {
    return { status: "error", error: "query", hasCachedData, retry, content };
  }

  if (group.loading || openTabs.loading || defaults.loading || activity.loading) {
    return { status: "loading", hasCachedData, retry, content };
  }

  return { status: "ready", hasCachedData, retry, content };
}
