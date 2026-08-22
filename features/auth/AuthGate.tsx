"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState, type ReactNode } from "react";
import { isPrivyFixtureMode } from "@/lib/privy/config";
import { TelegramBootstrapGate } from "@/features/telegram/TelegramBootstrapGate";
import { useFixtureAuth } from "./fixture-auth";
import { ConnectGate } from "./ConnectGate";
import { LaunchSurface } from "./LaunchSurface";
import { FirstRunCard, hasSeenFirstRun } from "@/features/onboarding/FirstRunCard";
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
        <WalletSyncGate>
          <ConnectGate>{children}</ConnectGate>
        </WalletSyncGate>
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

/**
 * First run sits INSIDE the gate, not around it — it must never delay
 * authentication, and it must never be the first thing a deep-linked
 * participant sees when they are two taps from settling a bill.
 */
function FirstRunGate({ children }: AuthGateProps) {
  const [showFirstRun, setShowFirstRun] = useState(false);

  useEffect(() => {
    // Deep links land people in a bill room on purpose. Never interrupt that.
    const deepLinked = window.location.pathname.startsWith("/tabs/");
    if (!deepLinked && !hasSeenFirstRun()) {
      setShowFirstRun(true);
    }
  }, []);

  return (
    <>
      {children}
      {showFirstRun ? <FirstRunCard onDismiss={() => setShowFirstRun(false)} /> : null}
    </>
  );
}

export function AuthGate({ children }: AuthGateProps) {
  const gated = isPrivyFixtureMode() ? (
    <FixtureAuthGate>{children}</FixtureAuthGate>
  ) : (
    <PrivyAuthGate>{children}</PrivyAuthGate>
  );

  return <FirstRunGate>{gated}</FirstRunGate>;
}
