"use client";

import type { ReactNode } from "react";
import { useWalletSync } from "./useWalletSync";

type WalletSyncGateProps = {
  children: ReactNode;
};

/** Syncs the embedded Privy wallet to Convex once auth is established (Story 1.8). */
export function WalletSyncGate({ children }: WalletSyncGateProps) {
  useWalletSync();
  return <>{children}</>;
}
