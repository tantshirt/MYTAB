"use client";

import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLiveQuery } from "@/features/convex/useConvexData";
import type { ClaimBoardProps } from "./ClaimBoard";

export type ClaimBoardData = {
  status: "loading" | "ready" | "error";
  board: ClaimBoardProps;
};

/** Real geometry, no fabricated money. Used for first paint and for errors. */
export const EMPTY_CLAIM_BOARD: ClaimBoardProps = {
  tabName: "",
  revision: 0,
  isLocked: false,
  isOrganizer: false,
  viewerUserId: "",
  organizerDisplayName: "Organizer",
  participants: [],
  items: [],
  unassignedCount: 0,
  viewerSubtotalMinor: 0,
  viewerHasClaims: false,
};

/** `getClaimBoard` returns participants and the organizer's Telegram id, not a name. */
function organizerNameFor(view: {
  participants: Array<{ telegramUserId: string; displayName: string }>;
  tab: { organizerTelegramUserId: string };
}): string {
  return (
    view.participants.find(
      (participant) => participant.telegramUserId === view.tab.organizerTelegramUserId,
    )?.displayName ?? "Organizer"
  );
}

/**
 * Single prop-resolution point for the deep-linked Claim Board.
 *
 * Live read: `api.allocations.getClaimBoard({ tabId })` — one reactive
 * subscription, so someone else's claim arrives in place and the board corrects
 * itself after a stale write with no reload (EXPERIENCE, *Concurrency and
 * Revision*).
 *
 * With nothing to read the board is empty, which the surface renders as §4.2's
 * "Add what you ordered." (organizer) or "{Organizer} is adding the bill."
 * (participant). It is never filled in with a dinner nobody ate.
 */
export function useClaimBoardData(
  tabId: string | null,
  tabName: string | null,
): ClaimBoardData {
  const result = useLiveQuery(
    api.allocations.getClaimBoard,
    tabId ? { tabId: tabId as Id<"tabs"> } : "skip",
  );

  const board = useMemo<ClaimBoardProps | null>(() => {
    const view = result.data;
    if (!view) {
      return null;
    }

    return {
      tabName: view.tab.name,
      revision: view.tab.revision,
      isLocked: view.isLocked,
      isOrganizer: view.isOrganizer,
      viewerUserId: view.viewerUserId,
      organizerDisplayName: organizerNameFor(view),
      participants: view.participants.map((participant) => ({
        userId: participant.userId,
        displayName: participant.displayName,
        avatarUrl: participant.avatarUrl,
      })),
      items: view.items.map((item) => ({
        id: item._id,
        name: item.name,
        lineTotalMinor: item.lineTotalMinor,
        claimantIds: item.claimantIds,
        viewerOwns: item.viewerOwns,
        unassigned: item.unassigned,
      })),
      unassignedCount: view.unassignedCount,
      viewerSubtotalMinor: view.viewerSubtotalMinor,
      viewerHasClaims: view.viewerHasClaims,
    };
  }, [result.data]);

  if (result.error) {
    // §9.11 B5 — an error state renders an error state. Never a stand-in
    // board: fabricated money on screen behind a failure is worse than a
    // failure.
    return { status: "error", board: EMPTY_CLAIM_BOARD };
  }

  if (!board) {
    // First paint: the board renders its own empty geometry rather than a
    // spinner over nothing (EXPERIENCE, *State Patterns*).
    return {
      status: result.loading ? "loading" : "ready",
      board: { ...EMPTY_CLAIM_BOARD, tabName: tabName ?? "" },
    };
  }

  return { status: "ready", board };
}
