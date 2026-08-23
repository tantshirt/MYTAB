"use client";

import { useCreateWallet } from "@privy-io/react-auth/solana";
import { useCallback } from "react";

/**
 * Provisions a Privy embedded wallet only on an explicit tap (D-21).
 * WalletSyncGate then writes the Convex row once the wallet exists.
 */
export function useCreateMyTabWallet(): () => Promise<void> {
  const { createWallet } = useCreateWallet();

  return useCallback(async () => {
    await createWallet();
  }, [createWallet]);
}
