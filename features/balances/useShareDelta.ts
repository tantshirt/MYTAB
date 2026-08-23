"use client";

import { useEffect, useRef, useState } from "react";
import { formatFiatMinorThb } from "@/lib/domain/format";
import { fiatMinorFromInteger } from "@/lib/domain/money";
import type { ShareDelta } from "./LiveTabCard";
import type { ActivityRowData } from "./ActivityFeed";

type Observation = {
  tabId: string;
  shareMinor: number;
  tone: string;
  /** When this client last saw the figure. Bounds the attribution window. */
  observedAt: number;
};

export type UseShareDeltaArgs = {
  /** The live tab, or `null` when nothing is live. */
  tabId: string | null;
  /** The viewer's share of that tab, in integer minor units. */
  shareMinor: number | null;
  /** Owed / settled / neutral. A flip in tone is not a delta — see below. */
  tone: string | null;
  /** Recent activity across every group, already mapped. */
  activity: readonly ActivityRowData[];
};

/**
 * Why the viewer's share of the live tab just moved.
 *
 * This is the single most load-bearing sentence on Tabs home: it is the
 * difference between a number that is merely correct and a number the viewer
 * watched change. It is derived entirely on the client, from two observations
 * of a figure this session — the server is never asked to remember what a
 * particular phone last rendered.
 *
 * Three things it deliberately will not do:
 *
 * - **Attribute across tabs.** Only an event carrying this tab's id can name
 *   the cause. A right number beside a wrong sentence is worse than a right
 *   number with no sentence at all.
 * - **Attribute backwards.** The event must have happened after the previous
 *   observation, so a stale event from an hour ago can never be presented as
 *   the reason for a change that just occurred.
 * - **Report a tone flip as a movement.** `shareMinor` is an absolute value, so
 *   owing ฿40 and being owed ฿40 are the same number. When the tone changes
 *   the delta is dropped rather than computed from two figures that mean
 *   opposite things.
 *
 * On first observation there is nothing to compare against, so there is no
 * delta — correct, and the reason the line is absent on a cold open.
 */
export function useShareDelta({
  tabId,
  shareMinor,
  tone,
  activity,
}: UseShareDeltaArgs): ShareDelta | undefined {
  const previous = useRef<Observation | null>(null);
  const [delta, setDelta] = useState<ShareDelta | undefined>(undefined);

  useEffect(() => {
    if (tabId === null || shareMinor === null || tone === null) {
      previous.current = null;
      setDelta(undefined);
      return;
    }

    const last = previous.current;
    const now = Date.now();
    previous.current = { tabId, shareMinor, tone, observedAt: now };

    // A different tab took over the screen: its figure has no history here yet.
    if (last === null || last.tabId !== tabId) {
      setDelta(undefined);
      return;
    }

    if (last.shareMinor === shareMinor) {
      return;
    }

    if (last.tone !== tone) {
      setDelta(undefined);
      return;
    }

    const movedBy = Math.abs(shareMinor - last.shareMinor);
    const cause = activity.find(
      (row) => row.tabId === tabId && row.createdAt > last.observedAt,
    );

    setDelta({
      amountLabel: formatFiatMinorThb(fiatMinorFromInteger(movedBy)),
      direction: shareMinor < last.shareMinor ? "down" : "up",
      because: cause?.summary || undefined,
    });
  }, [tabId, shareMinor, tone, activity]);

  return delta;
}
