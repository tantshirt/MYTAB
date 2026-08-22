"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { BillAuthoringSurface } from "@/features/bills/BillAuthoringSurface";
import { useNewTabData } from "@/features/bills/useNewTabData";
import { telegramUserIdFrom } from "@/features/convex/useConvexData";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";

function NewTabSurface() {
  const searchParams = useSearchParams();
  const groupId = searchParams.get("group");
  const data = useNewTabData(groupId);
  const { initDataUnsafe } = useTelegramRuntime();
  const viewerTelegramUserId = telegramUserIdFrom(initDataUnsafe);

  /*
   * `onScanReceipt` is deliberately NOT passed.
   *
   * Receipt Review lives at `/tabs/[publicToken]/receipt`, and a tab only gets a
   * public token once the draft exists server-side. There is no
   * `tabs.createDraft`, so there is nowhere for the handler to go. Every scan
   * affordance on this surface is gated on the handler *and*
   * `isReceiptScanEnabled()`, so leaving it out means the capture card is
   * correctly absent rather than present and dead — which is the whole point of
   * that double gate (§1.4).
   */
  const viewerUserId = data.members.find(
    (member) => member.telegramUserId === viewerTelegramUserId,
  )?.userId;

  return (
    <BillAuthoringSurface
      tabId={data.tabId}
      tabTitle={data.title}
      viewerUserId={viewerUserId}
      data={data}
    />
  );
}

/** New Tab — the bill authoring surface (POLISH-SPEC §1.4). Accepts `?group=<id>`. */
export default function NewTabPage() {
  return (
    <AuthGate>
      <Suspense fallback={null}>
        <NewTabSurface />
      </Suspense>
    </AuthGate>
  );
}
