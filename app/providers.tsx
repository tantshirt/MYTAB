"use client";

import type { ReactNode } from "react";

/**
 * Provider shell placeholder (AD-15).
 * TelegramRuntimeProvider → PrivyProvider → PrivyConvexProvider → theme
 * wired in Stories 1.4 and 1.5.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
