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

  /*
   * `onScanReceipt` is deliberately NOT passed.
   *
   * Receipt Review lives at `/tabs/[publicToken]/receipt`, and a tab only gets a
   * public token once the draft has been created server-side. In fixture mode
   * there is no token, so there is nowhere for the handler to go. Every scan
   * affordance on this surface is gated on the handler *and*
   * `isReceiptScanEnabled()`, so leaving it out means the capture card is
   * correctly absent rather than present and dead — which is the whole point of
   * that double gate (§1.4).
   *
   * TODO(live-data): once `api.tabs.createDraft` returns the tab's public token,
   * pass `onScanReceipt={() => router.push(`/tabs/${publicToken}/receipt`)}`.
   */
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
