"use client";

import { Theme } from "@astryxdesign/core";
import type { ReactNode } from "react";
import { myTabTheme } from "@/lib/theme/myTabTheme";

type MyTabThemeProviderProps = {
  children: ReactNode;
};

/**
 * Astryx theme wrapper with the full My Tab token set (Story 1.2).
 * Forces light mode — no dark variant (AC1); the app never follows Telegram's
 * dark theme.
 *
 * MYTAB_GLOBAL_CSS is no longer injected here — it is hoisted into <head> in
 * app/layout.tsx so it applies at first paint rather than after hydration
 * (POLISH-SPEC §2.2).
 */
export function MyTabThemeProvider({ children }: MyTabThemeProviderProps) {
  return (
    <Theme theme={myTabTheme} mode="light">
      {children}
    </Theme>
  );
}
