"use client";

import { useCallback, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { useLiveQuery } from "@/features/convex/useConvexData";
import { isConvexAuthFixtureMode } from "@/lib/privy/config";
import type { NamedWalletProvider } from "@/lib/wallet/providers";
import { ConnectSheet, type ConnectSheetStatus } from "./ConnectSheet";
import {
  hasSkippedConnectGate,
  markConnectGateSkipped,
  shouldShowConnectGate,
} from "./connectGateState";
import { CONNECT_COPY } from "./connectCopy";
import { LaunchSurface } from "./LaunchSurface";
import { useCreateMyTabWallet } from "./useCreateMyTabWallet";
import { useLinkExternalWallet, WalletLinkClientError } from "./useLinkExternalWallet";

export { ConnectGateView, shouldShowConnectGate } from "./ConnectGateView";

type ConnectGateProps = {
  children: ReactNode;
};

function LiveConnectGate({ children }: ConnectGateProps) {
  const linked = useLiveQuery(api.wallets.hasLinkedWallet, {});
  const [skipped, setSkipped] = useState(hasSkippedConnectGate);
  const [status, setStatus] = useState<ConnectSheetStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const { linkNamed } = useLinkExternalWallet();
  const createMyTabWallet = useCreateMyTabWallet();

  const showGate = shouldShowConnectGate({
    linked: linked.data?.linked === true,
    skipped,
  });

  const onSkip = useCallback(() => {
    markConnectGateSkipped();
    setSkipped(true);
  }, []);

  const onConnectNamed = useCallback(
    async (provider: NamedWalletProvider) => {
      setStatus("linking");
      setErrorMessage(undefined);
      try {
        await linkNamed(provider);
        setStatus("idle");
      } catch (error) {
        setStatus("failed");
        setErrorMessage(
          error instanceof WalletLinkClientError ? error.message : CONNECT_COPY.failed,
        );
      }
    },
    [linkNamed],
  );

  const onUseMyTabWallet = useCallback(async () => {
    setStatus("linking");
    setErrorMessage(undefined);
    try {
      await createMyTabWallet();
      setStatus("idle");
    } catch {
      setStatus("failed");
      setErrorMessage(CONNECT_COPY.failed);
    }
  }, [createMyTabWallet]);

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
      status={status}
      errorMessage={errorMessage}
      onConnectNamed={(provider) => {
        void onConnectNamed(provider);
      }}
      onUseMyTabWallet={() => {
        void onUseMyTabWallet();
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

