import type { Doc } from "../_generated/dataModel";

/** D-06 — the two doors. Missing `origin` is every tab that exists today. */
export type TabOrigin = "chat" | "personal";

export const SEAT_MIN = 2;
export const SEAT_MAX = 20;
export const SEAT_DEFAULT = 2;

/** INVITE-FLOW §4 — the head count is bill data. */
export function clampSeatCount(seats: number): number | null {
  if (!Number.isInteger(seats) || seats < SEAT_MIN || seats > SEAT_MAX) {
    return null;
  }
  return seats;
}

export function tabOrigin(tab: Pick<Doc<"tabs">, "origin">): TabOrigin {
  return tab.origin === "personal" ? "personal" : "chat";
}

export function isPersonalOrigin(tab: Pick<Doc<"tabs">, "origin">): boolean {
  return tabOrigin(tab) === "personal";
}

export function seatsRemaining(
  tab: Pick<Doc<"tabs">, "seatPolicy">,
  participantCount: number,
): number | null {
  const policy = tab.seatPolicy;
  if (!policy || policy.kind !== "fixed") {
    return null;
  }
  return Math.max(0, policy.seats - participantCount);
}
