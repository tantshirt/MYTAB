"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";
import { isConvexAuthFixtureMode } from "@/lib/privy/config";
import { getConvexSiteUrl } from "@/lib/telegram/client";
import { useTelegramRuntime } from "./TelegramRuntimeProvider";

/**
 * Posts raw Telegram initData to authenticated POST /telegram/bootstrap after Privy auth.
 * Never sends initDataUnsafe; never stores the Privy access token.
 */
export function useTelegramBootstrap(): void {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { initData, isTelegramWebApp } = useTelegramRuntime();
  const lastInitDataRef = useRef<string | null>(null);

  useEffect(() => {
    if (isConvexAuthFixtureMode()) {
      return;
    }

    if (!ready || !authenticated || !isTelegramWebApp || !initData) {
      return;
    }

    if (lastInitDataRef.current === initData) {
      return;
    }

    const siteUrl = getConvexSiteUrl();
    if (!siteUrl) {
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken || cancelled) {
          return;
        }

        const response = await fetch(`${siteUrl}/telegram/bootstrap`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ initData }),
        });

        if (response.ok) {
          lastInitDataRef.current = initData;
        }
      } catch {
        // Bootstrap retries on the next initData / auth change.
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, isTelegramWebApp, initData, getAccessToken]);
}
