"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { MyTabThemeProvider } from "@/components/theme/MyTabThemeProvider";
import { FixtureAuthProvider } from "@/features/auth/fixture-auth";
import { LaunchSurface } from "@/features/auth/LaunchSurface";
import { PrivyConvexProvider } from "@/features/auth/PrivyConvexProvider";
import { AppViewportVars } from "@/features/telegram/AppViewportVars";
import { TelegramRuntimeProvider } from "@/features/telegram/TelegramRuntimeProvider";
import { createPrivyConfig, getPrivyAppId, isPrivyFixtureMode } from "@/lib/privy/config";

/**
 * `PrivyProvider` is loaded on demand, not on the critical path.
 *
 * Importing it statically put ~460 kB gzipped on the root layout's entry —
 * Privy's modal/connector machinery plus viem, x402, WalletConnect, headlessui
 * and a slice of @solana/kit. None of it is reachable from the first thing a
 * user sees. Launch is a wordmark, a photograph and an indeterminate track.
 *
 * `ssr: false` is required, not cosmetic: PrivyProvider reads `window` during
 * initialisation. The `loading` fallback is `LaunchSurface`, which is *exactly*
 * what `AuthGate` renders while `usePrivy().ready` is false — so the deferral
 * is invisible. The user sees the same screen for the same reason; it simply
 * arrives sooner, from a much smaller bundle.
 *
 * Children are props of the dynamic component, so nothing under it mounts
 * before the chunk resolves. That is what keeps this safe: no descendant can
 * call `usePrivy()` outside a live provider.
 *
 * In fixture mode (no NEXT_PUBLIC_PRIVY_APP_ID) the chunk is never requested
 * at all.
 */
const PrivyProvider = dynamic(
  () => import("@privy-io/react-auth").then((mod) => mod.PrivyProvider),
  { ssr: false, loading: () => <LaunchSurface /> },
);

function ProviderStack({ children }: { children: ReactNode }) {
  if (isPrivyFixtureMode()) {
    return (
      <FixtureAuthProvider>
        <PrivyConvexProvider>
          <MyTabThemeProvider>{children}</MyTabThemeProvider>
        </PrivyConvexProvider>
      </FixtureAuthProvider>
    );
  }

  return (
    <PrivyProvider appId={getPrivyAppId()!} config={createPrivyConfig()}>
      <PrivyConvexProvider>
        <MyTabThemeProvider>{children}</MyTabThemeProvider>
      </PrivyConvexProvider>
    </PrivyProvider>
  );
}

/**
 * Fixed provider order (AD-15):
 * TelegramRuntimeProvider → PrivyProvider → PrivyConvexProvider → theme
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <TelegramRuntimeProvider>
      <AppViewportVars />
      <ProviderStack>{children}</ProviderStack>
    </TelegramRuntimeProvider>
  );
}
