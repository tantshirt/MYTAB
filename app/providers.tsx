"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";
import { MyTabThemeProvider } from "@/components/theme/MyTabThemeProvider";
import { FixtureAuthProvider } from "@/features/auth/fixture-auth";
import { PrivyConvexProvider } from "@/features/auth/PrivyConvexProvider";
import { TelegramRuntimeProvider } from "@/features/telegram/TelegramRuntimeProvider";
import { createPrivyConfig, getPrivyAppId, isPrivyFixtureMode } from "@/lib/privy/config";

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
      <ProviderStack>{children}</ProviderStack>
    </TelegramRuntimeProvider>
  );
}
