"use client";

import { isPrivyFixtureMode } from "@/lib/privy/config";
import { CONNECT_COPY } from "./connectCopy";
import { ConnectSheet } from "./ConnectSheet";
import { useWalletConnectFlow } from "./useWalletConnectFlow";

export type WalletConnectHostProps = {
  reason: "pay" | "lock" | "you";
  showEmbedded?: boolean;
  onLinked: () => void;
  onSkip: () => void;
};

/**
 * The same connect sheet as launch, reused at Pay, Lock, and You.
 */
export function WalletConnectHost(props: WalletConnectHostProps) {
  if (isPrivyFixtureMode()) {
    return null;
  }
  return <LiveWalletConnectHost {...props} />;
}

function LiveWalletConnectHost({
  reason,
  showEmbedded = true,
  onLinked,
  onSkip,
}: WalletConnectHostProps) {
  const { status, errorMessage, connectNamed, useMyTabWallet } = useWalletConnectFlow({
    onLinked,
  });

  return (
    <ConnectSheet
      status={status}
      errorMessage={errorMessage}
      onConnectNamed={(provider) => {
        void connectNamed(provider);
      }}
      onUseMyTabWallet={() => {
        void useMyTabWallet();
      }}
      onSkip={onSkip}
      showEmbedded={showEmbedded}
      skipLabel="Not now"
      skipHint={reason === "lock" ? CONNECT_COPY.lockNeedsWallet : CONNECT_COPY.payNeedsWallet}
    />
  );
}
