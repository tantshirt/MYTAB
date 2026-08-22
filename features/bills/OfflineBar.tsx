"use client";

import { NoticeBar } from "@/components/primitives/notice-bar";
import { STATE_COPY } from "@/components/primitives/state-copy";

export type OfflineBarProps = {
  visible: boolean;
};

/**
 * Inline offline notice — cached state stays readable (Story 4.4 AC4).
 *
 * There used to be two implementations of this bar at two different font sizes
 * (`features/bills/OfflineBar.tsx` and `features/balances/LoadingStates.tsx`).
 * POLISH-SPEC §4.4 asks for one treatment everywhere, so the geometry and the
 * string now come from `components/primitives/notice-bar` and `STATE_COPY`, and
 * this file is only the name the bills surfaces already import.
 */
export function OfflineBar({ visible }: OfflineBarProps) {
  if (!visible) {
    return null;
  }

  return (
    <div data-testid="bill-offline-bar">
      <NoticeBar tone="warning" fullBleed>
        {STATE_COPY.offline}
      </NoticeBar>
    </div>
  );
}
