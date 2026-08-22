"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { BillAuthoringSurface } from "@/features/bills/BillAuthoringSurface";
import { FIXTURE_BILL_AUTHORING, type BillAuthoringFixture } from "@/features/bills/fixtures";
import { isConvexAuthFixtureMode } from "@/lib/privy/config";

/**
 * Single prop-resolution point for New Tab.
 *
 * TODO(live-data): replace the fixture with
 * `useQuery(api.tabs.getGroupDefaults, { groupId })` +
 * `useQuery(api.tabs.listTabMemberOptions, { groupId })`.
 */
function useNewTabData(groupId: string | null): BillAuthoringFixture {
  return useMemo(
    () => ({
      ...FIXTURE_BILL_AUTHORING,
      tabId: groupId ? `tabs:new:${groupId}` : "tabs:new",
      title: "New tab",
      items: [],
      adjustments: [],
    }),
    [groupId],
  );
}

function NewTabSurface() {
  const searchParams = useSearchParams();
  const groupId = searchParams.get("group");
  const fixture = useNewTabData(groupId);

  return (
    <BillAuthoringSurface
      tabId={fixture.tabId}
      tabTitle={fixture.title}
      viewerUserId={isConvexAuthFixtureMode() ? fixture.organizerUserId : undefined}
      fixture={fixture}
    />
  );
}

/** New Tab — the bill authoring surface (POLISH-SPEC §1.4). Accepts `?group=<id>`. */
export default function NewTabPage() {
  return (
    <AuthGate>
      <Suspense fallback={null}>
        <NewTabSurface />
      </Suspense>
    </AuthGate>
  );
}
