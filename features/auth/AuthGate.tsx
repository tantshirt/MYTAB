"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState, type ReactNode } from "react";
import { isPrivyFixtureMode } from "@/lib/privy/config";
import { TelegramBootstrapGate } from "@/features/telegram/TelegramBootstrapGate";
import { useFixtureAuth } from "./fixture-auth";
import { LaunchSurface } from "./LaunchSurface";
import { WalletSyncGate } from "./WalletSyncGate";

type AuthGateProps = {
  children: ReactNode;
};

function ReconnectingBar() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        padding: "8px 16px",
        background: "#FBF1E0",
        color: "#9A6209",
        borderBottom: "1px solid #DFE7EF",
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
        fontWeight: 500,
        textAlign: "center",
      }}
    >
      Reconnecting…
    </div>
  );
}

function PrivyAuthGate({ children }: AuthGateProps) {
  const { ready, authenticated, error, getAccessToken } = usePrivy();
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    if (!ready || !authenticated) {
      setIsReconnecting(false);
      return;
    }

    let cancelled = false;

    const verifySession = async () => {
      try {
        const token = await getAccessToken();
        if (!cancelled) {
          setIsReconnecting(!token);
        }
      } catch {
        if (!cancelled) {
          setIsReconnecting(true);
        }
      }
    };

    void verifySession();
    const interval = setInterval(() => {
      void verifySession();
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ready, authenticated]);

  if (!ready || !authenticated) {
    return <LaunchSurface />;
  }

  return (
    <>
      {(isReconnecting || error) && <ReconnectingBar />}
      <TelegramBootstrapGate>
        <WalletSyncGate>{children}</WalletSyncGate>
      </TelegramBootstrapGate>
    </>
  );
}

function FixtureAuthGate({ children }: AuthGateProps) {
  const fixture = useFixtureAuth();
  if (!fixture?.authenticated) {
    return <LaunchSurface />;
  }
  return <>{children}</>;
}

export function AuthGate({ children }: AuthGateProps) {
  if (isPrivyFixtureMode()) {
    return <FixtureAuthGate>{children}</FixtureAuthGate>;
  }

  return <PrivyAuthGate>{children}</PrivyAuthGate>;
}
