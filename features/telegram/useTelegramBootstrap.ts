"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";
import { isConvexAuthFixtureMode } from "@/lib/privy/config";
import { getConvexSiteUrl } from "@/lib/telegram/client";
import { TELEGRAM_CONTEXT_TTL_MS } from "@/lib/telegram/verify";
import { useTelegramRuntime } from "./TelegramRuntimeProvider";

/**
 * Re-post at 60% of the server TTL. The context is the thing every mutation is
 * checked against, so it must be renewed comfortably before it lapses, not at
 * the last moment — one failed request must not be able to strand the session.
 */
const REFRESH_INTERVAL_MS = Math.floor(TELEGRAM_CONTEXT_TTL_MS * 0.6);

/** Returning to a backgrounded app renews only if the context is half-spent. */
const STALE_ON_RESUME_MS = Math.floor(TELEGRAM_CONTEXT_TTL_MS * 0.5);

/** Failures back off rather than spin; capped well under the TTL. */
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 30_000;

/**
 * Posts raw Telegram initData to authenticated POST /telegram/bootstrap after
 * Privy auth, and KEEPS IT ALIVE for as long as the app is open.
 *
 * Never sends initDataUnsafe; never stores the Privy access token.
 *
 * The renewal is the point. The server context expires after
 * TELEGRAM_CONTEXT_TTL_MS (5 minutes), and every mutation is gated on it via
 * `requireTabParticipant`. This hook previously posted exactly once, guarded by
 * `lastInitData === initData` — but `initData` never changes for a launch, so
 * the guard was permanent and nothing ever re-posted. Five minutes into a meal,
 * every write began failing while reads kept working, which is the most
 * confusing failure this product can produce: the bill is on screen and
 * claiming an item silently does nothing.
 *
 * Re-posting on a timer fixed half of that and could not fix the other half.
 * `initData` never changing is exactly why: its `auth_date` never advances, so
 * once the payload is older than TELEGRAM_INIT_DATA_MAX_AGE_MS the server has
 * to reject it, and it will reject every later attempt too. Production logged
 * eleven consecutive EXPIRED_AUTH_DATE rejections before the backoff gave up —
 * the same dead session as before, arrived at more energetically.
 *
 * So renewal goes through `users.renewTelegramContext`, which extends a session
 * that is already bound and needs no payload. The initData POST is reserved for
 * what only it can do: bind the identity in the first place, and re-bind when
 * the server says nothing is bound.
 */
export function useTelegramBootstrap(): void {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { initData, isTelegramWebApp } = useTelegramRuntime();
  const renewContext = useMutation(api.users.renewTelegramContext);

  const lastPostedAtRef = useRef<number>(0);
  const inFlightRef = useRef(false);
  const failuresRef = useRef(0);
  /** True once the server has confirmed a binding this session can renew. */
  const boundRef = useRef(false);

  const active =
    !isConvexAuthFixtureMode() && ready && authenticated && isTelegramWebApp && Boolean(initData);

  const post = useCallback(
    async (signal: { cancelled: boolean }) => {
      if (inFlightRef.current || !initData) {
        return;
      }
      const siteUrl = getConvexSiteUrl();
      if (!siteUrl) {
        return;
      }

      inFlightRef.current = true;
      try {
        /*
         * Renew first once something is bound. The bind is the only step that
         * needs initData, and initData is the only thing that goes stale, so
         * every subsequent keep-alive avoids it entirely.
         */
        if (boundRef.current) {
          try {
            await renewContext({});
            if (!signal.cancelled) {
              lastPostedAtRef.current = Date.now();
              failuresRef.current = 0;
            }
            return;
          } catch {
            // TELEGRAM_CONTEXT_REQUIRED — nothing bound any more, or the
            // 12-hour ceiling is reached. Fall through and try to bind again;
            // that succeeds on a fresh launch and fails honestly otherwise.
            boundRef.current = false;
          }
        }

        const accessToken = await getAccessToken();
        if (!accessToken || signal.cancelled) {
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
          lastPostedAtRef.current = Date.now();
          failuresRef.current = 0;
          boundRef.current = true;
        } else {
          failuresRef.current += 1;
        }
      } catch {
        failuresRef.current += 1;
      } finally {
        inFlightRef.current = false;
      }
    },
    [initData, getAccessToken, renewContext],
  );

  useEffect(() => {
    if (!active) {
      return;
    }

    const signal = { cancelled: false };
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (signal.cancelled) {
        return;
      }
      const delay =
        failuresRef.current > 0
          ? Math.min(RETRY_BASE_MS * 2 ** (failuresRef.current - 1), RETRY_MAX_MS)
          : REFRESH_INTERVAL_MS;
      timer = setTimeout(run, delay);
    };

    const run = async () => {
      await post(signal);
      schedule();
    };

    void run();

    // A Mini App is routinely backgrounded mid-meal — someone answers a message
    // and comes back. Timers are throttled or frozen while hidden, so the
    // context can lapse even though the interval "ran".
    const onResume = () => {
      if (signal.cancelled || document.visibilityState !== "visible") {
        return;
      }
      if (Date.now() - lastPostedAtRef.current >= STALE_ON_RESUME_MS) {
        void post(signal);
      }
    };

    document.addEventListener("visibilitychange", onResume);
    const webApp = window.Telegram?.WebApp;
    webApp?.onEvent?.("activated", onResume);

    return () => {
      signal.cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
      document.removeEventListener("visibilitychange", onResume);
      webApp?.offEvent?.("activated", onResume);
    };
  }, [active, post]);
}
