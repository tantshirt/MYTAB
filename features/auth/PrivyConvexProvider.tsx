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
 * Announces a Convex-less tree once, on the client, rather than failing open in
 * silence. Both branches below render an app that cannot read or write anything
 * — every `use*Data` seam falls back to its fixture — and a build that reaches
 * a user in that state is a misconfiguration, not a mode.
 */
function warnConvexless(reason: string) {
  if (typeof window === "undefined" || warnConvexless.warned) {
    return;
  }
  warnConvexless.warned = true;
  console.warn(
    `[my-tab] No Convex client mounted (${reason}). Every surface is running on ` +
      "fixtures: reads return demo data and all mutations are no-ops. Set " +
      "NEXT_PUBLIC_CONVEX_URL and NEXT_PUBLIC_PRIVY_APP_ID for live data.",
  );
}
warnConvexless.warned = false;

/**
 * Bridges Privy access tokens into Convex via ConvexProviderWithAuth (Story 1.5).
 * Skips the Convex client in fixture mode (no Privy app id or Convex URL).
 */
export function PrivyConvexProvider({ children }: PrivyConvexProviderProps) {
  if (isConvexAuthFixtureMode()) {
    warnConvexless("NEXT_PUBLIC_PRIVY_APP_ID or NEXT_PUBLIC_CONVEX_URL is unset");
    return <>{children}</>;
  }

  const convexUrl = getConvexUrl();
  if (!convexUrl) {
    warnConvexless("NEXT_PUBLIC_CONVEX_URL is unset");
    return <>{children}</>;
  }

  return (
    <LivePrivyConvexProvider convexUrl={convexUrl}>{children}</LivePrivyConvexProvider>
  );
}
