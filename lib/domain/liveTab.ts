/**
 * Which open tab, if any, owns the Tabs home screen — and how far its claiming
 * has got.
 *
 * Tabs home used to render every open tab as one card in a stack of equal
 * cards, which meant the one tab that people were actively claiming on, right
 * now, looked exactly like a tab that had been sitting locked for two days.
 * This module answers the question that distinction needs: *is anything
 * happening?*
 *
 * Pure. No Convex, no I/O, no formatting — it decides, it does not render.
 */

/** A person on a tab, with how many items they have taken so far. */
export type LiveTabParticipant = {
  userId: string;
  displayName: string;
  claimedCount: number;
};

/**
 * The subset of an open-tab row this module reasons about. Deliberately not the
 * whole card: nothing here is money, so no money type can be dragged in.
 */
export type LiveTabCandidate = {
  tabId: string;
  /** Raw tab status from the data layer. */
  status: string;
  itemCount: number;
  claimedItemCount: number;
  unclaimedCount: number;
  participants: readonly LiveTabParticipant[];
  updatedAt: number;
};

/**
 * The statuses where claiming is still the thing people are doing.
 *
 * `locked` is deliberately absent. A locked tab is in settlement — its members
 * are paying, not choosing — and it belongs in the quiet list below the hero
 * rather than presented as a room people are still in. `draft` IS included:
 * the organizer is building the bill and the invite may already be out, which
 * is exactly the "waiting for people" moment.
 */
const LIVE_TAB_STATUSES: ReadonlySet<string> = new Set(["draft", "open"]);

export function isLiveTab(candidate: Pick<LiveTabCandidate, "status">): boolean {
  return LIVE_TAB_STATUSES.has(candidate.status);
}

/**
 * The one tab that takes over the screen, or `null` when nothing is live.
 *
 * Exactly one, never a list: the whole point is that a live tab stops
 * competing for attention with everything else on the surface. Most recently
 * touched wins, which is the same order the surface already sorted by, so the
 * hero never disagrees with the list it was lifted out of.
 */
export function pickLiveTab<T extends LiveTabCandidate>(tabs: readonly T[]): T | null {
  let best: T | null = null;

  for (const tab of tabs) {
    if (!isLiveTab(tab)) {
      continue;
    }
    if (best === null || tab.updatedAt > best.updatedAt) {
      best = tab;
    }
  }

  return best;
}

/**
 * How far the claiming has got, as a fraction, or `null` when there is nothing
 * to claim yet.
 *
 * `null` rather than `0` is load-bearing: a bill with no items is a draft
 * nobody can claim on, and drawing an empty progress bar over it asserts "0%
 * done" about work that has not started. The surface omits the bar instead.
 */
export function claimProgress(
  candidate: Pick<LiveTabCandidate, "itemCount" | "claimedItemCount">,
): number | null {
  if (candidate.itemCount <= 0) {
    return null;
  }
  const clamped = Math.min(Math.max(candidate.claimedItemCount, 0), candidate.itemCount);
  return clamped / candidate.itemCount;
}

/**
 * How many people on the tab have taken nothing yet.
 *
 * Includes the viewer. "3 still choosing" when one of the three is you is
 * true, and the primary action right underneath already says what to do about
 * it — subtracting yourself would make the number disagree with the faces
 * beside it.
 */
export function stillChoosingCount(
  participants: readonly LiveTabParticipant[],
): number {
  return participants.filter((participant) => participant.claimedCount === 0).length;
}
