"use client";

import { use, useMemo } from "react";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import {
  GroupSurface,
  FIXTURE_GROUP_SURFACE,
  type GroupSurfaceProps,
} from "@/features/groups/GroupSurface";
import { SettleSheetHost } from "@/features/settlement/SettleSheetHost";

type GroupPageProps = {
  params: Promise<{ groupId: string }>;
};

/**
 * Single prop-resolution point for the Group surface.
 *
 * TODO(live-data): replace the fixture with
 * `useQuery(api.groups.getGroup, { groupId })`,
 * `useQuery(api.tabs.listOpenTabsForGroup, { groupId })` and
 * `useQuery(api.activity.listForGroup, { groupId })`.
 */
function useGroupData(groupId: string): GroupSurfaceProps {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- groupId is the seam key.
  return useMemo(() => ({ ...FIXTURE_GROUP_SURFACE }), [groupId]);
}

function GroupPageSurface({ groupId }: { groupId: string }) {
  const group = useGroupData(groupId);

  return (
    <AppShell>
      <GroupSurface {...group} />
      <SettleSheetHost />
    </AppShell>
  );
}

/** Group — `/groups/[groupId]` (POLISH-SPEC §1.3). */
export default function GroupPage({ params }: GroupPageProps) {
  const { groupId } = use(params);

  return (
    <AuthGate>
      <GroupPageSurface groupId={groupId} />
    </AuthGate>
  );
}
