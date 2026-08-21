"use client";

import { usePrivy } from "@privy-io/react-auth";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useCallback, useMemo, type ReactNode } from "react";
import { createPrivyConvexAuthAdapter } from "@/lib/privy/convex-auth";
import {
  getConvexUrl,
  isConvexAuthFixtureMode,
} from "@/lib/privy/config";

type PrivyConvexProviderProps = {
  children: ReactNode;
};

function useAuthFromPrivy() {
  const { ready, authenticated, getAccessToken } = usePrivy();

  const fetchAccessToken = useCallback(
    createPrivyConvexAuthAdapter(getAccessToken),
    [getAccessToken],
  );

  return useMemo(
    () => ({
      isLoading: !ready,
      isAuthenticated: authenticated,
      fetchAccessToken,
    }),
    [ready, authenticated, fetchAccessToken],
  );
}

function LivePrivyConvexProvider({
  children,
  convexUrl,
}: {
  children: ReactNode;
  convexUrl: string;
}) {
  const client = useMemo(() => new ConvexReactClient(convexUrl), [convexUrl]);

  return (
    <ConvexProviderWithAuth client={client} useAuth={useAuthFromPrivy}>
      {children}
    </ConvexProviderWithAuth>
  );
}

/**
 * Bridges Privy access tokens into Convex via ConvexProviderWithAuth (Story 1.5).
 * Skips the Convex client in fixture mode (no Privy app id or Convex URL).
 */
export function PrivyConvexProvider({ children }: PrivyConvexProviderProps) {
  if (isConvexAuthFixtureMode()) {
    return <>{children}</>;
  }

  const convexUrl = getConvexUrl();
  if (!convexUrl) {
    return <>{children}</>;
  }

  return (
    <LivePrivyConvexProvider convexUrl={convexUrl}>{children}</LivePrivyConvexProvider>
  );
}
