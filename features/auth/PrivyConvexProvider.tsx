"use client";

import type { ReactNode } from "react";

type PrivyConvexProviderProps = {
  children: ReactNode;
};

/**
 * Passthrough stub for Story 1.5.
 * TODO(1.5): Wrap ConvexProviderWithAuth and adapt Privy getAccessToken() to Convex auth.
 */
export function PrivyConvexProvider({ children }: PrivyConvexProviderProps) {
  return <>{children}</>;
}
