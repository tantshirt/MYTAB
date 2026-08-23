"use client";

import { OutsideTelegramBar } from "./LoadingStates";
import { ActivityFeed, type ActivityRowData } from "./ActivityFeed";
import type { LoadState } from "@/components/primitives/load-state";

export type ActivitySurfaceProps = LoadState & {
  events: ActivityRowData[];
  error?: boolean;
  onRetry?: () => void;
  offline?: boolean;
  inTelegram?: boolean;
};

/**
 * `/activity` — the title, the vertical rhythm, and the surface-level bars.
 *
 * The route used to render `<ActivityFeed>` raw with no title (POLISH-SPEC
 * §1.12). Activity is read-only, so the standalone-browser bar is the only
 * thing §4.5 adds here — there is nothing on this surface to disable.
 */
export function ActivitySurface({
  events,
  loading = false,
  hasCachedData = false,
  error = false,
  onRetry,
  offline = false,
  inTelegram = true,
}: ActivitySurfaceProps) {
  return (
    <main style={{ paddingBottom: "32px" }}>
      <OutsideTelegramBar visible={!inTelegram} />
      <h1 className="mytab-type-amount-md" style={{ margin: "24px 0 5px" }}>
        Activity
      </h1>
      {/*
        Tabs home now shows what is happening; this surface is the record of
        what happened. Saying so is what stops the two reading as the same list
        twice.
      */}
      <p className="mytab-type-meta" style={{ margin: "0 0 16px" }}>
        Every settled tab, with its receipt.
      </p>
      <ActivityFeed
        events={events}
        loading={loading}
        hasCachedData={hasCachedData}
        error={error}
        onRetry={onRetry}
        offline={offline}
      />
    </main>
  );
}
