"use client";

import { Theme } from "@astryxdesign/core";
import type { ReactNode } from "react";
import { MYTAB_GLOBAL_CSS } from "@/lib/theme/globalStyles";
import { myTabTheme } from "@/lib/theme/myTabTheme";

type MyTabThemeProviderProps = {
  children: ReactNode;
};

/**
 * Astryx theme wrapper with the full My Tab token set (Story 1.2).
 * Forces light mode — no dark variant (AC1).
 */
export function MyTabThemeProvider({ children }: MyTabThemeProviderProps) {
  return (
    <Theme theme={myTabTheme} mode="light">
      <style>{MYTAB_GLOBAL_CSS}</style>
      {children}
    </Theme>
  );
}
