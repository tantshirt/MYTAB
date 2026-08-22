"use client";

import { Theme } from "@astryxdesign/core";
import type { ReactNode } from "react";
import { MYTAB_FONT_VARIABLE_CSS } from "@/lib/theme/fonts";
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
 *
 * The one rule that cannot live there is the Thai font binding: it has to come
 * from `next/font`, which only resolves under the Next compiler, and
 * `globalStyles` is imported by plain unit tests. It is declared here instead —
 * server-rendered, so it is in the first HTML the browser parses, and later in
 * the cascade than the Latin stack it overrides.
 */
export function MyTabThemeProvider({ children }: MyTabThemeProviderProps) {
  return (
    <Theme theme={myTabTheme} mode="light">
      <style dangerouslySetInnerHTML={{ __html: MYTAB_FONT_VARIABLE_CSS }} />
      {children}
    </Theme>
  );
}
