"use client";

import { use, useMemo } from "react";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { useHasPainted } from "@/components/primitives/use-has-painted";
import { useOffline } from "@/components/primitives/use-offline";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { useLiveQuery, useRetryNonce } from "@/features/convex/useConvexData";
import { toActivityRow } from "@/features/balances/useActivityData";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  GroupSurface,
  FIXTURE_GROUP_SURFACE,
  type GroupSurfaceProps,
} from "@/features/groups/GroupSurface";
import { SettleSheetHost } from "@/features/settlement/SettleSheetHost";

/** Everything the surface renders. The state props are wired by the page. */
type GroupContent = Pick<
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

type GroupData = {
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
 * net balance and no Convex query exposes obligations or the ledger. The card
 * is hidden when the prop is absent, which is honest; asserting "All square"
 * from data we do not have would not be.
 *
 * `peopleCount` / `totalLabel` / `settledCount` on a tab card are omitted for
 * the same reason — `listOpenTabsForGroup` returns id, name, status and
 * timestamps only.
 */
function useGroupData(groupId: string): GroupData {
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

  const content = useMemo<GroupContent>(() => {
    if (group.fixture) {
      return { ...FIXTURE_GROUP_SURFACE, groupId };
    }

    return {
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
    };
  }, [group.fixture, group.data, defaults.data, openTabs.data, activity.data, groupId]);

  if (group.fixture) {
    return { status: "ready", hasCachedData, retry, content };
  }

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

/**
 * Prop wiring only. Every state the surface can be in is passed from here:
 * `loading` / `hasCachedData` (§2.9), `error` (§4.3), `offline` (§4.4) and
 * `inTelegram` (§4.5) — without them the skeleton, the error block and the
 * offline bar are all unreachable code.
 */
function GroupPageSurface({ groupId }: { groupId: string }) {
  const data = useGroupData(groupId);
  const offline = useOffline();
  const { isTelegramWebApp } = useTelegramRuntime();

  return (
    <AppShell>
      <GroupSurface
        {...data.content}
        loading={data.status === "loading"}
        hasCachedData={data.hasCachedData}
        error={data.status === "error" ? data.error ?? "query" : undefined}
        onRetry={data.retry}
        offline={offline}
        inTelegram={isTelegramWebApp}
      />
      <SettleSheetHost />
    </AppShell>
  );
}

type GroupPageProps = {
  params: Promise<{ groupId: string }>;
};

/** Group — `/groups/[groupId]` (POLISH-SPEC §1.3). */
export default function GroupPage({ params }: GroupPageProps) {
  const { groupId } = use(params);

  return (
    <AuthGate>
      <GroupPageSurface groupId={groupId} />
    </AuthGate>
  );
}
