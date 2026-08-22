"use client";

import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { useOffline } from "@/components/primitives/use-offline";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { ActivitySurface, useActivityData } from "@/features/balances";

/** Prop wiring only — the surface owns the title, the rhythm and every state. */
function Activity() {
  const data = useActivityData();
  const offline = useOffline();
  const { isTelegramWebApp } = useTelegramRuntime();

  return (
    <AppShell>
      <ActivitySurface
        events={data.events}
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

export default function ActivityPage() {
  return (
    <AuthGate>
      <Activity />
    </AuthGate>
  );
}
