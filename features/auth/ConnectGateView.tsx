import type { ReactNode } from "react";
import { ConnectSheet } from "./ConnectSheet";
import { shouldShowConnectGate } from "./connectGateState";
import type { NamedWalletProvider } from "@/lib/wallet/providers";

export { shouldShowConnectGate } from "./connectGateState";

/** Presentational gate for tests — skip still renders the children. */
export function ConnectGateView({
  linked,
  skipped,
  children,
  onSkip,
  onConnectNamed,
  onUseMyTabWallet,
}: {
  linked: boolean;
  skipped: boolean;
  children: ReactNode;
  onSkip?: () => void;
  onConnectNamed?: (provider: NamedWalletProvider) => void;
  onUseMyTabWallet?: () => void;
}) {
  if (!shouldShowConnectGate({ linked, skipped })) {
    return <>{children}</>;
  }
  return (
    <ConnectSheet
      onConnectNamed={onConnectNamed ?? (() => undefined)}
      onUseMyTabWallet={onUseMyTabWallet ?? (() => undefined)}
      onSkip={onSkip ?? (() => undefined)}
    />
  );
}
