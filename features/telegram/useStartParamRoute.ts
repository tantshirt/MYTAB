"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { parseWalletUlStartParam } from "@/lib/wallet/universalLinkParams";
import { useTelegramRuntime } from "./TelegramRuntimeProvider";

export type StartParamDestination =
  | { kind: "new-tab" }
  | { kind: "owe" }
  | { kind: "wallet-ul"; challengeId: string }
  | { kind: "tab-token"; token: string }
  | { kind: "ignore" };

/**
 * Reserved start params (`tab` / `owe` / `ulcb_*`) are handled before the
 * opaque tab-token shape. `tab` and `owe` are three characters so they would
 * otherwise be ignored; `ulcb_*` is long enough to look like a tab token.
 */
export function resolveStartParamDestination(startParam: string): StartParamDestination {
  if (startParam === "tab") {
    return { kind: "new-tab" };
  }
  if (startParam === "owe") {
    return { kind: "owe" };
  }
  const walletUl = parseWalletUlStartParam(startParam);
  if (walletUl) {
    return { kind: "wallet-ul", challengeId: walletUl };
  }
  if (/^[A-Za-z0-9_-]{8,256}$/.test(startParam)) {
    return { kind: "tab-token", token: startParam };
  }
  return { kind: "ignore" };
}

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
    const destination = resolveStartParamDestination(startParam);
    if (destination.kind === "ignore" || destination.kind === "wallet-ul") {
      consumed = true;
      return;
    }

    routed.current = true;
    consumed = true;
    if (destination.kind === "new-tab") {
      router.replace("/tabs/new");
      return;
    }
    if (destination.kind === "owe") {
      router.replace("/you");
      return;
    }
    router.replace(`/tabs/${encodeURIComponent(destination.token)}`);
  }, [startParam, isTelegramWebApp, pathname, router]);
}
