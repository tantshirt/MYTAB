"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { useLiveQuery } from "@/features/convex/useConvexData";
import { isConvexAuthFixtureMode } from "@/lib/privy/config";
import { ConnectSheet } from "./ConnectSheet";
import {
  hasSkippedConnectGate,
  markConnectGateSkipped,
  shouldShowConnectGate,
} from "./connectGateState";
import { CONNECT_COPY } from "./connectCopy";
import { LaunchSurface } from "./LaunchSurface";
import { useWalletConnectFlow } from "./useWalletConnectFlow";
import {
  readWalletUlResumeStatus,
  WALLET_UL_RESUME_EVENT,
} from "./walletUlResumeStatus";

export { ConnectGateView, shouldShowConnectGate } from "./ConnectGateView";

type ConnectGateProps = {
  children: ReactNode;
};

function LiveConnectGate({ children }: ConnectGateProps) {
  const linked = useLiveQuery(api.wallets.hasLinkedWallet, {});
  const [skipped, setSkipped] = useState(hasSkippedConnectGate);
  const [resumeFailed, setResumeFailed] = useState(
    () => readWalletUlResumeStatus() === "failed",
  );
  const { status, errorMessage, connectNamed, useMyTabWallet } = useWalletConnectFlow();

  useEffect(() => {
    const onResume = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setResumeFailed(detail === "failed");
    };
    window.addEventListener(WALLET_UL_RESUME_EVENT, onResume);
    return () => window.removeEventListener(WALLET_UL_RESUME_EVENT, onResume);
  }, []);

  const showGate = shouldShowConnectGate({
    linked: linked.data?.linked === true,
    skipped,
  });

  const onSkip = useCallback(() => {
    markConnectGateSkipped();
    setSkipped(true);
  }, []);

  if (linked.error) {
    return <>{children}</>;
  }

  if (linked.loading || linked.data === undefined) {
    return <LaunchSurface />;
  }

  if (!showGate) {
    return <>{children}</>;
  }

  return (
    <ConnectSheet
      status={status === "idle" && resumeFailed ? "failed" : status}
      errorMessage={
        status === "failed" ? errorMessage : resumeFailed ? CONNECT_COPY.resumeFailed : undefined
      }
      onConnectNamed={(provider) => {
        void connectNamed(provider);
      }}
      onUseMyTabWallet={() => {
        void useMyTabWallet();
      }}
      onSkip={onSkip}
    />
  );
}

/**
 * After identity resolves: first-timers see the connect gate; a returning
 * person with a linked wallet passes through (D-25). Skip still reaches
 * the board (D-27). Fixture auth never prompts — smoke and sweep need the
 * real surfaces.
 */
export function ConnectGate({ children }: ConnectGateProps) {
  if (isConvexAuthFixtureMode()) {
    return <>{children}</>;
  }
  return <LiveConnectGate>{children}</LiveConnectGate>;
}
