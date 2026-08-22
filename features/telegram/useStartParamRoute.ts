"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTelegramRuntime } from "./TelegramRuntimeProvider";

/**
 * Module scope, deliberately. Telegram supplies `start_param` for the whole
 * launch, not just the first render — so a per-mount ref is not enough once the
 * tab bar lives in a layout and the home page remounts on every tab switch.
 * Without this, tapping "Tabs" would bounce straight back to the Claim Board.
 *
 * It resets on a real page load, which IS a new cold open, so a genuine relaunch
 * from the group chat routes again.
 */
let consumed = false;

/** Exposed for tests; never call from application code. */
export function resetStartParamConsumption(): void {
  consumed = false;
}

/**
 * Routes a Telegram deep link to the tab it names.
 *
 * The bot's one button is always `[Open tab]`, and EXPERIENCE.md is explicit
 * that it "always lands on the Claim Board for that specific tab, already
 * authenticated and scoped" (FR-N3). Telegram delivers the tab-session token as
 * `start_param`; before this hook nothing read it, so every deep link opened the
 * app home instead — the person arrived in an app they had to navigate rather
 * than in the bill room.
 *
 * `replace`, not `push`: the home screen was never a place the person chose to
 * be, so it must not sit in the back stack. Telegram's back control then exits
 * the Mini App from the Claim Board, which is the intended exit.
 */
export function useStartParamRoute(): void {
  const { startParam, isTelegramWebApp } = useTelegramRuntime();
  const router = useRouter();
  const pathname = usePathname();
  const routed = useRef(false);

  useEffect(() => {
    if (consumed || routed.current || !isTelegramWebApp || !startParam) {
      return;
    }
    // Only act on a cold open at the root. A deep link that already resolved,
    // or any deeper surface, is left alone.
    if (pathname !== "/") {
      consumed = true;
      return;
    }
    // The token is opaque and server-resolved; we only guard the URL shape so a
    // malformed launch param cannot build a nonsense path.
    if (!/^[A-Za-z0-9_-]{8,256}$/.test(startParam)) {
      consumed = true;
      return;
    }

    routed.current = true;
    consumed = true;
    router.replace(`/tabs/${encodeURIComponent(startParam)}`);
  }, [startParam, isTelegramWebApp, pathname, router]);
}
