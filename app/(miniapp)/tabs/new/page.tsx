"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { BillAuthoringSurface } from "@/features/bills/BillAuthoringSurface";
import { FIXTURE_BILL_AUTHORING, type BillAuthoringFixture } from "@/features/bills/fixtures";
import { useLiveQuery, telegramUserIdFrom } from "@/features/convex/useConvexData";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { isConvexAuthFixtureMode } from "@/lib/privy/config";

/**
 * Single prop-resolution point for New Tab.
 *
 * Live reads:
 *   `api.tabs.getGroupDefaults({ groupId })`     — display currency, recipient asset
 *   `api.tabs.listTabMemberOptions({ groupId })` — payer/recipient candidates
 *
 * The viewer is matched by `telegramUserId`, not by `useViewer()`:
 * `api.users.viewer` returns the Privy DID, and nothing on the backend maps that
 * to a Convex `users` id for the client. `listTabMemberOptions` carries the
 * Telegram id, which Telegram's launch params also carry.
 *
 * BLOCKED: `tabId`. `api.tabs.saveTabSetup` patches an **existing** tab and
 * there is no `tabs.createDraft` — drafts are created by the bot
 * (`convex/lib/tabCommandSync.ts`), not from the Mini App. So this surface
 * still authors against a local id and cannot persist, which is also why
 * `onScanReceipt` stays unpassed (see below).
 */
function useNewTabData(groupId: string | null): BillAuthoringFixture {
  const { initDataUnsafe } = useTelegramRuntime();
  const viewerTelegramUserId = telegramUserIdFrom(initDataUnsafe);
  const id = groupId ? (groupId as Id<"groups">) : null;

  const defaults = useLiveQuery(
    api.tabs.getGroupDefaults,
    id ? { groupId: id } : "skip",
  );
  const memberOptions = useLiveQuery(
    api.tabs.listTabMemberOptions,
    id ? { groupId: id } : "skip",
  );

  return useMemo<BillAuthoringFixture>(() => {
    const tabId = groupId ? `tabs:new:${groupId}` : "tabs:new";

    if (defaults.fixture) {
      return {
        ...FIXTURE_BILL_AUTHORING,
        tabId,
        title: "New tab",
        items: [],
        adjustments: [],
      };
    }

    const members = (memberOptions.data ?? []).map((member) => ({
      userId: member.userId,
      displayName: member.displayName,
      telegramUserId: member.telegramUserId,
      walletReady: member.walletReady,
    }));
    const organizer =
      members.find((member) => member.telegramUserId === viewerTelegramUserId) ?? null;

    return {
      tabId,
      title: "New tab",
      merchantName: "",
      displayCurrency: defaults.data?.defaultCurrency ?? "THB",
      recipientAsset: defaults.data?.recipientAsset ?? "USDC",
      organizerDisplayName: organizer?.displayName ?? "Organizer",
      organizerUserId: organizer?.userId ?? "",
      payerUserId: organizer?.userId ?? "",
      recipientUserId: "",
      members,
      items: [],
      adjustments: [],
      totalDisplay: "฿0.00",
      fxFixtureBadge: FIXTURE_BILL_AUTHORING.fxFixtureBadge,
    };
  }, [defaults.fixture, defaults.data, memberOptions.data, viewerTelegramUserId, groupId]);
}

function NewTabSurface() {
  const searchParams = useSearchParams();
  const groupId = searchParams.get("group");
  const fixture = useNewTabData(groupId);
  const { initDataUnsafe } = useTelegramRuntime();
  const viewerTelegramUserId = telegramUserIdFrom(initDataUnsafe);

  /*
   * `onScanReceipt` is deliberately NOT passed.
   *
   * Receipt Review lives at `/tabs/[publicToken]/receipt`, and a tab only gets a
   * public token once the draft exists server-side. There is no
   * `tabs.createDraft`, so there is nowhere for the handler to go. Every scan
   * affordance on this surface is gated on the handler *and*
   * `isReceiptScanEnabled()`, so leaving it out means the capture card is
   * correctly absent rather than present and dead — which is the whole point of
   * that double gate (§1.4).
   */
  const viewerUserId = isConvexAuthFixtureMode()
    ? fixture.organizerUserId
    : fixture.members.find(
        (member) => member.telegramUserId === viewerTelegramUserId,
      )?.userId;

  return (
    <BillAuthoringSurface
      tabId={fixture.tabId}
      tabTitle={fixture.title}
      viewerUserId={viewerUserId}
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
