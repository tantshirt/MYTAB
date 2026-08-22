"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLiveQuery } from "@/features/convex/useConvexData";
import { hasSeenAllSquare, markAllSquareSeen } from "./AllSquareCard";

export type AllSquareMoment = {
  tabId: string;
  /** The identity the guard is keyed on — one bill, i.e. a tab at one revision. */
  billKey: string;
  settledCount: number;
  totalCount: number;
};

/**
 * The completion trigger, and the three separate reasons it cannot replay.
 *
 * WHAT IT LISTENS TO. `balances.billCompletion({ tabId })`, and nothing else.
 * EXPERIENCE, *Money Legibility*: "Bill complete and group net zero are
 * different… The once-per-bill completion card listens to bill completion,
 * never group net zero." `balances.forViewer().isAllSquare` and
 * `lib/domain/balance.ts:isAllSquare` are the cross-bill net position — a
 * person can be net zero across a group while three bills are still open, and
 * can owe money the instant after a bill completes. Neither is this event.
 *
 * WHY IT CANNOT REPLAY. Three locks, each sufficient on its own:
 *
 *   1. **It is an edge, not a level.** `seenCompleteRef` records the FIRST
 *      value the live subscription reports and fires nothing for it. Only a
 *      false → true edge on a subscription this client already held is a
 *      completion. Opening the app onto an already-complete bill therefore
 *      reports `true` as a first observation and is swallowed — which is also
 *      exactly EXPERIENCE's "only for people present in the app at that
 *      moment", since only a present client holds the subscription that can see
 *      the edge.
 *   2. **`localStorage['mytab.allsquare.<billKey>']`**, written the moment the
 *      card is handed out. Durable across reloads, tabs and sessions, so
 *      "never replayed on revisit" outlives the session that saw it. The old
 *      guard was `sessionStorage`, which meant every new session replayed the
 *      moment — the precise defect this replaces. `sessionStorage` is still
 *      written as a fallback for browsers refusing durable storage.
 *   3. **No route.** The card is a transition with no URL (§1.0), so there is
 *      no address a person or a link can navigate back to.
 *
 * The key is the *bill*, not the tab: a tab that is re-opened and re-locked is
 * a new bill at a new revision and gets its own moment, which is correct — that
 * is a second dinner, not a replay of the first.
 */
/**
 * The identity the guard is keyed on: a bill is a tab at ONE locked revision.
 * `billId` is null before any obligation exists, so the tab/revision pair is
 * the fallback — and a re-opened, re-locked tab lands on a different revision,
 * which is a second dinner and correctly earns its own moment.
 */
export function billKeyFor(completion: {
  tabId: string;
  billId: string | null;
  revision: number;
}): string {
  return completion.billId ?? `${completion.tabId}:${completion.revision}`;
}

/**
 * Lock 1, on its own so it can be read and tested without a Convex client.
 *
 * Only a false → true edge on a subscription this client ALREADY held is a
 * completion. `undefined` is the first value the subscription reports, which is
 * a level, not an edge — that single line is what stops the card firing on
 * mount over an already-complete bill, and is also what makes it fire "only for
 * people present in the app at that moment" (EXPERIENCE).
 */
export function isCompletionEdge(
  previousComplete: boolean | undefined,
  complete: boolean,
): boolean {
  return previousComplete === false && complete;
}

export function useAllSquareTrigger(tabId: string | null): {
  moment: AllSquareMoment | null;
  dismiss: () => void;
} {
  const completion = useLiveQuery(
    api.balances.billCompletion,
    tabId ? { tabId: tabId as Id<"tabs"> } : "skip",
  );

  const seenCompleteRef = useRef<Map<string, boolean>>(new Map());
  const [moment, setMoment] = useState<AllSquareMoment | null>(null);
  const dismiss = useCallback(() => setMoment(null), []);

  const data = completion.data;

  useEffect(() => {
    if (!data) {
      return;
    }

    const billKey = billKeyFor(data);
    const previous = seenCompleteRef.current.get(billKey);
    seenCompleteRef.current.set(billKey, data.complete);

    // Lock 1 — the first value this client sees is a level, never an edge.
    if (!isCompletionEdge(previous, data.complete)) {
      return;
    }

    // Lock 2 — durable, and claimed before the card is handed out so two
    // subscriptions resolving in the same tick cannot both fire.
    if (hasSeenAllSquare(billKey)) {
      return;
    }
    markAllSquareSeen(billKey);

    setMoment({
      tabId: data.tabId,
      billKey,
      settledCount: data.settledCount,
      totalCount: data.totalCount,
    });
  }, [data]);

  return { moment, dismiss };
}
