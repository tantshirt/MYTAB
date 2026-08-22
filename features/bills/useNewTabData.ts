"use client";

import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLiveQuery, telegramUserIdFrom } from "@/features/convex/useConvexData";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { FX_FIXTURE_BADGE } from "@/features/bills/fxBadge";
import type { BillAuthoringData } from "./types";

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
 * `onScanReceipt` stays unpassed.
 *
 * With no group and no client the member list is empty, and §4.2's "Nobody in
 * this group has opened My Tab yet. Ask someone to tap the link." is what the
 * form renders. A payer chip for someone who has never opened the app would be
 * a lie the organizer could act on.
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

  return useMemo<BillAuthoringData>(() => {
    const tabId = groupId ? `tabs:new:${groupId}` : "tabs:new";

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
      fxFixtureBadge: FX_FIXTURE_BADGE,
    };
  }, [defaults.data, memberOptions.data, viewerTelegramUserId, groupId]);
}
