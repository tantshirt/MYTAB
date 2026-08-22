"use client";

import { useReducedMotion } from "@/components/primitives/use-reduced-motion";
import { AllSquareCard, type AllSquareMember } from "./AllSquareCard";
import { useAllSquareTrigger } from "./useAllSquareTrigger";

export type AllSquareWatchTab = {
  tabId: string;
  name: string;
  /** The bill total, already formatted. Absent until the bill is locked. */
  totalLabel?: string;
};

export type AllSquareWatcherProps = {
  tabs: AllSquareWatchTab[];
  members: AllSquareMember[];
  /** Posts the completion card to the group. Absent → the card offers only `Done`. */
  onShare?: () => void;
};

/**
 * Subscribes every open tab to `balances.billCompletion` and renders the
 * completion moment for whichever one crosses into complete while the person is
 * here (§1.10, §5.3).
 *
 * One subscription per tab rather than one for the group, because completion is
 * a property of a bill and there is no group-level completion event — the
 * group-level figure is the net position, which is explicitly NOT this trigger.
 *
 * It lives here, next to the surface, rather than in `app/`: the surface
 * already holds the open tabs and the cast, so no prop wiring is needed at the
 * route at all.
 */
export function AllSquareWatcher({ tabs, members, onShare }: AllSquareWatcherProps) {
  return (
    <>
      {tabs.map((tab) => (
        <BillCompletionWatch key={tab.tabId} tab={tab} members={members} onShare={onShare} />
      ))}
    </>
  );
}

/**
 * One tab, one subscription, one moment.
 *
 * Each watch owns its own card, so two bills completing in the same instant
 * produce two moments shown one after the other rather than one swallowing the
 * other. Two bills completed; two moments is the truthful count.
 */
function BillCompletionWatch({
  tab,
  members,
  onShare,
}: {
  tab: AllSquareWatchTab;
  members: AllSquareMember[];
  onShare?: () => void;
}) {
  const { moment, dismiss } = useAllSquareTrigger(tab.tabId);
  const reduceMotion = useReducedMotion();

  if (!moment) {
    return null;
  }

  return (
    <AllSquareCard
      billName={tab.name}
      amountLabel={tab.totalLabel}
      settledCount={moment.settledCount}
      totalCount={moment.totalCount}
      members={members}
      onShare={onShare}
      onDismiss={dismiss}
      reduceMotion={reduceMotion}
    />
  );
}
