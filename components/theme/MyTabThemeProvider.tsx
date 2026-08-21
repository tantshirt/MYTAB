"use client";

import { Theme } from "@astryxdesign/core";
import { neutralTheme } from "@astryxdesign/theme-neutral";
import type { ReactNode } from "react";

/**
 * Astryx theme wrapper stub — Story 1.2 extends this with the full My Tab token set.
 */
export function MyTabThemeProvider({ children }: { children: ReactNode }) {
  return (
    <Theme theme={neutralTheme} mode="light">
      {children}
    </Theme>
  );
}
