"use client";

import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { telegramUserIdFrom, useLiveQuery } from "@/features/convex/useConvexData";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import type { TipComposerMember } from "./TipComposer";

export type TipComposerData = {
  viewerUserId: string;
  members: TipComposerMember[];
};

/**
 * Single prop-resolution point for the Tip Composer.
 *
 * Live read: `api.groups.getGroup({ groupId })` — there is no
 * `groups.listTipRecipients`, and `getGroup` already returns exactly what the
 * composer filters on: `userId`, `displayName`, `membershipStatus` and
 * `walletReady`.
 *
 * The viewer is matched by Telegram id rather than `useViewer()`, which returns
 * the Privy DID and cannot be compared to a Convex `users` id.
 *
 * With no group and no client the list is empty, which the composer renders as
 * §4.2's "Nobody here has opened My Tab yet. Once they do, you can tip them."
 * Offering a tip to someone with no wallet would be an action that cannot
 * complete.
 */
export function useTipComposerData(groupId: string | null): TipComposerData {
  const { initDataUnsafe } = useTelegramRuntime();
  const viewerTelegramUserId = telegramUserIdFrom(initDataUnsafe);

  const group = useLiveQuery(
    api.groups.getGroup,
    groupId ? { groupId: groupId as Id<"groups"> } : "skip",
  );

  return useMemo<TipComposerData>(() => {
    const members = (group.data?.members ?? [])
      .filter((member) => member.userId !== null)
      .map((member) => ({
        userId: member.userId as string,
        displayName: member.displayName,
        membershipStatus: member.membershipStatus,
        walletReady: member.walletReady,
      }));

    const viewer = (group.data?.members ?? []).find(
      (member) => member.telegramUserId === viewerTelegramUserId,
    );

    return { viewerUserId: viewer?.userId ?? "", members };
  }, [group.data, viewerTelegramUserId]);
}
