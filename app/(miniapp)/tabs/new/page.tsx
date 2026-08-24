"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGate } from "@/features/auth/AuthGate";
import { BillAuthoringSurface } from "@/features/bills/BillAuthoringSurface";
import { useNewTabData } from "@/features/bills/useNewTabData";
import { telegramUserIdFrom } from "@/features/convex/useConvexData";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { useReceiptScanEnabled } from "@/features/receipts/useReceiptScanEnabled";

function NewTabSurface() {
  const searchParams = useSearchParams();
  const groupId = searchParams.get("group");
  const data = useNewTabData(groupId);
  const { initDataUnsafe } = useTelegramRuntime();
  const viewerTelegramUserId = telegramUserIdFrom(initDataUnsafe);
  const scanEnabled = useReceiptScanEnabled();

  const viewerUserId = data.members.find(
    (member) => member.telegramUserId === viewerTelegramUserId,
  )?.userId;

  return (
    <BillAuthoringSurface
      tabId={data.tabId}
      tabTitle={data.title}
      viewerUserId={viewerUserId}
      data={data}
      receiptScanAvailable={scanEnabled}
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
