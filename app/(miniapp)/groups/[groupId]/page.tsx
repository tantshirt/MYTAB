"use client";

import { use, useCallback, useState } from "react";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { useHasPainted } from "@/components/primitives/use-has-painted";
import { useOffline } from "@/components/primitives/use-offline";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
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
 * TODO(live-data): replace the fixture with the live reads — this function is the
 * only thing that changes:
 *
 *   const group = useQuery(api.groups.getGroup, { groupId });
 *   const openTabs = useQuery(api.tabs.listOpenTabsForGroup, { groupId });
 *   const activity = useQuery(api.activity.listForGroup, { groupId });
 *   status: [group, openTabs, activity].some((r) => r === undefined) ? "loading" : "ready"
 *   error:  group === null ? "not-a-member" : undefined
 */
function useGroupData(groupId: string): GroupData {
  const hasCachedData = useHasPainted(`group:${groupId}`);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  // Re-read seam: a retry re-runs the live queries. The fixture is constant.
  void attempt;

  return {
    status: "ready",
    hasCachedData,
    retry,
    content: { ...FIXTURE_GROUP_SURFACE, groupId },
  };
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
