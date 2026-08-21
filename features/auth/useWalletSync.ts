"use client";

import {
  getEmbeddedConnectedWallet,
  usePrivy,
  useWallets,
  type User,
  type WalletWithMetadata,
} from "@privy-io/react-auth";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";
import { isConvexAuthFixtureMode } from "@/lib/privy/config";

function findEmbeddedSolanaLinkedWallet(
  linkedAccounts: User["linkedAccounts"],
  address: string,
): WalletWithMetadata | undefined {
  return linkedAccounts.find(
    (account): account is WalletWithMetadata =>
      account.type === "wallet" &&
      account.chainType === "solana" &&
      (account.walletClientType === "privy" || account.walletClientType === "privy-v2") &&
      account.address === address,
  );
}

/**
 * Syncs the Privy embedded Solana wallet to Convex after authentication (Story 1.8).
 * Sends only wallet id and address — never private key material.
 */
export function useWalletSync(): void {
  const { ready, authenticated, user } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const syncEmbeddedWallet = useMutation(api.wallets.syncEmbeddedWallet);
  const lastSyncedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (isConvexAuthFixtureMode()) {
      return;
    }

    if (!ready || !authenticated || !walletsReady || !user) {
      return;
    }

    const embeddedWallet = getEmbeddedConnectedWallet(wallets);
    if (!embeddedWallet?.address) {
      return;
    }

    const linkedWallet = findEmbeddedSolanaLinkedWallet(user.linkedAccounts, embeddedWallet.address);
    const privyWalletId = linkedWallet?.id;
    if (!privyWalletId) {
      return;
    }

    const syncKey = `${privyWalletId}:${embeddedWallet.address}`;
    if (lastSyncedKeyRef.current === syncKey) {
      return;
    }

    let cancelled = false;

    const sync = async () => {
      try {
        await syncEmbeddedWallet({
          privyWalletId,
          solanaAddress: embeddedWallet.address,
        });
        if (!cancelled) {
          lastSyncedKeyRef.current = syncKey;
        }
      } catch {
        // Retries on the next auth / wallet change.
      }
    };

    void sync();

    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, walletsReady, wallets, user, syncEmbeddedWallet]);
}
