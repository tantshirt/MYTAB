"use client";

import { use } from "react";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppShell } from "@/components/layout/AppShell";
import { useOffline } from "@/components/primitives/use-offline";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { GroupSurface } from "@/features/groups/GroupSurface";
import { useGroupData } from "@/features/groups/useGroupData";
import { SettleSheetHost } from "@/features/settlement/SettleSheetHost";

/**
 * Prop wiring only. Every state the surface can be in is passed from here:
 * `loading` / `hasCachedData` (§2.9), `error` (§4.3), `offline` (§4.4) and
 * `inTelegram` (§4.5) — without them the skeleton, the error block and the
 * offline bar are all unreachable code.
 */
function GroupPageSurface({ groupId }: { groupId: string }) {
  const data = useGroupData(groupId);
  const offline = useOffline();
  const { isTelegramWebApp } = useTelegramRuntime();

  return (
    <AppShell>
      <GroupSurface
        {...data.content}
        loading={data.status === "loading"}
        hasCachedData={data.hasCachedData}
        error={data.status === "error" ? data.error ?? "query" : undefined}
        onRetry={data.retry}
        offline={offline}
        inTelegram={isTelegramWebApp}
      />
      <SettleSheetHost />
    </AppShell>
  );
}

type GroupPageProps = {
  params: Promise<{ groupId: string }>;
};

/** Group — `/groups/[groupId]` (POLISH-SPEC §1.3). */
export default function GroupPage({ params }: GroupPageProps) {
  const { groupId } = use(params);

  return (
    <AuthGate>
      <GroupPageSurface groupId={groupId} />
    </AuthGate>
  );
}
