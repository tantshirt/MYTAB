"use client";

import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLiveQuery, telegramUserIdFrom } from "@/features/convex/useConvexData";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { FX_FIXTURE_BADGE } from "@/features/bills/fxBadge";
import { SEAT_DEFAULT } from "@/convex/lib/tabOrigin";
import type { BillAuthoringData } from "./types";

/**
 * Single prop-resolution point for New Tab.
 *
 * Live reads:
 *   `api.tabs.getGroupDefaults({ groupId })`     — display currency, recipient asset
 *   `api.tabs.listTabMemberOptions({ groupId })` — payer/recipient candidates
 *   `api.users.viewerIdentity`                   — the organizer, when there is no group
 *
 * With no group the form is the invite door (D-06): one member (you), a seat
 * stepper, and `createPersonalTab` persists the draft.
 */
export function useNewTabData(groupId: string | null): BillAuthoringData {
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
  const identity = useLiveQuery(api.users.viewerIdentity, groupId ? "skip" : {});

  return useMemo<BillAuthoringData>(() => {
    const tabId = groupId ? `tabs:new:${groupId}` : "tabs:new";
    const origin = groupId ? ("chat" as const) : ("personal" as const);

    const membersFromGroup = (memberOptions.data ?? []).map((member) => ({
      userId: member.userId,
      displayName: member.displayName,
      telegramUserId: member.telegramUserId,
      walletReady: member.walletReady,
    }));

    const viewerMember =
      identity.data?.userId && identity.data.telegramUserId
        ? {
            userId: identity.data.userId,
            displayName: identity.data.displayName ?? "You",
            telegramUserId: identity.data.telegramUserId,
            walletReady: false,
          }
        : null;

    const members = groupId
      ? membersFromGroup
      : viewerMember
        ? [viewerMember]
        : [];

    const organizer =
      members.find((member) => member.telegramUserId === viewerTelegramUserId) ??
      viewerMember ??
      null;

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
      fxFixtureBadge: FX_FIXTURE_BADGE,
      origin,
      seats: origin === "personal" ? SEAT_DEFAULT : undefined,
    };
  }, [defaults.data, memberOptions.data, identity.data, viewerTelegramUserId, groupId]);
}
