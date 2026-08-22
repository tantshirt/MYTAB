"use client";

import { useExportWallet } from "@privy-io/react-auth/solana";
import { useEffect, useState } from "react";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { isPrivyFixtureMode } from "@/lib/privy/config";
import { YouSurface } from "./YouSurface";
import type { YouSurfaceData } from "./types";
import { useYouSurfaceData } from "./useYouSurfaceData";

function useOffline(): boolean {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined") {
      return;
    }
    const sync = () => setOffline(navigator.onLine === false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return offline;
}

function PrivyYouSurface({
  data,
  inTelegram,
  offline,
}: {
  data: YouSurfaceData;
  inTelegram: boolean;
  offline: boolean;
}) {
  // Privy renders its own export modal; we render nothing over it (POLISH-SPEC §3.2).
  const { exportWallet } = useExportWallet();

  return (
    <YouSurface
      data={data}
      inTelegram={inTelegram}
      offline={offline}
      onExportWallet={() => {
        void exportWallet();
      }}
    />
  );
}

/**
 * Chooses the export binding once, the same way `app/providers.tsx` chooses the
 * provider stack: `useExportWallet` needs a `PrivyProvider` above it, and fixture
 * mode has none.
 */
export function YouSurfaceContainer() {
  const data = useYouSurfaceData();
  const { isTelegramWebApp } = useTelegramRuntime();
  const offline = useOffline();

  if (isPrivyFixtureMode()) {
    return <YouSurface data={data} inTelegram={isTelegramWebApp} offline={offline} />;
  }

  return <PrivyYouSurface data={data} inTelegram={isTelegramWebApp} offline={offline} />;
}
