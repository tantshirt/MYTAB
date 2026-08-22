"use client";

import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { useOffline } from "@/components/primitives/use-offline";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { useStartParamRoute } from "@/features/telegram/useStartParamRoute";
import { TabsHomeSurface, useTabsHomeData } from "@/features/balances";

/**
 * Prop wiring only. Every state the surface can be in is passed from here:
 * `loading` / `hasCachedData` (first paint vs. tab switch, §2.9), `error`
 * (§4.3), `offline` (§4.4) and `inTelegram` (§4.5) — before this, `loading`
 * and `offline` were never passed, which left `TabsHomeSkeleton` and
 * `OfflineBar` unreachable.
 */
function TabsHome() {
  // A Telegram deep link lands here first; this sends it on to the Claim Board
  // it names (FR-N3). Before this, every [Open tab] tap opened the app home.
  useStartParamRoute();
  const data = useTabsHomeData();
  const offline = useOffline();
  const { isTelegramWebApp } = useTelegramRuntime();

  return (
    <AppShell>
      <TabsHomeSurface
        {...data.content}
        loading={data.status === "loading"}
        hasCachedData={data.hasCachedData}
        error={data.status === "error"}
        onRetry={data.retry}
        offline={offline}
        inTelegram={isTelegramWebApp}
      />
    </AppShell>
  );
}

export default function TabsHomePage() {
  return (
    <AuthGate>
      <TabsHome />
    </AuthGate>
  );
}
