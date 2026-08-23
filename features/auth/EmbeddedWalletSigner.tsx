"use client";

import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { resolveCluster } from "@/lib/solana/cluster";

export type EmbeddedTxSigner = (transaction: Uint8Array) => Promise<Uint8Array>;

const EmbeddedWalletSignerContext = createContext<EmbeddedTxSigner | null>(null);

export function EmbeddedWalletSignerProvider({ children }: { children: ReactNode }) {
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();

  const signer = useMemo<EmbeddedTxSigner | null>(() => {
    const wallet = wallets[0];
    if (!wallet) {
      return null;
    }
    const chain = resolveCluster() === "mainnet-beta" ? "solana:mainnet" : "solana:devnet";
    return async (transaction: Uint8Array) => {
      const result = await signTransaction({
        transaction,
        wallet,
        chain,
      });
      return result.signedTransaction;
    };
  }, [signTransaction, wallets]);

  return (
    <EmbeddedWalletSignerContext.Provider value={signer}>
      {children}
    </EmbeddedWalletSignerContext.Provider>
  );
}

export function useEmbeddedWalletSigner(): EmbeddedTxSigner | null {
  return useContext(EmbeddedWalletSignerContext);
}
