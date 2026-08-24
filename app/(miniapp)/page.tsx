"use client";

import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { useOffline } from "@/components/primitives/use-offline";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { useStartParamRoute } from "@/features/telegram/useStartParamRoute";
import { TabsHomeSurface } from "@/features/balances";
import { useTabsHomeData } from "@/features/balances/useTabsHomeData";
import { useRouter } from "next/navigation";
import { useQrScanner } from "@/features/telegram/useQrScanner";

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
  const router = useRouter();
  const scanner = useQrScanner(router.push);

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
        onScanInvite={scanner.available ? scanner.scan : undefined}
        scanInviteError={scanner.error}
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
