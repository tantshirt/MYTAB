"use client";

import { useCallback } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLiveMutation } from "@/features/convex/useConvexData";
import { submitExternalUserSignature } from "./submitExternalUserSignature";
import { detectStandardWallets, findNamedWallet } from "@/lib/wallet/standard";
import type { NamedWalletProvider } from "@/lib/wallet/providers";

function signerForProvider(
  provider: string | null,
): ((transaction: Uint8Array) => Promise<Uint8Array>) | null {
  const wallets = detectStandardWallets();
  if (provider === "phantom" || provider === "solflare" || provider === "backpack") {
    return findNamedWallet(wallets, provider as NamedWalletProvider)?.signTransaction ?? null;
  }
  return wallets[0]?.signTransaction ?? null;
}

/**
 * External wallets sign the server-prepared transaction, then
 * `recordUserSigned` runs the unchanged gate. Embedded stays on the
 * existing server path. A failed sign does not navigate.
 */
export function usePayObligation(): {
  pay: (input: {
    intentId: string;
    walletKind: "embedded" | "external" | null;
    walletProvider: string | null;
    preparedTxBase64: string | null;
  }) => Promise<{ ok: true } | { ok: false }>;
} {
  const recordUserSigned = useLiveMutation(api.settlements.recordUserSigned);

  const pay = useCallback(
    async (input: {
      intentId: string;
      walletKind: "embedded" | "external" | null;
      walletProvider: string | null;
      preparedTxBase64: string | null;
    }): Promise<{ ok: true } | { ok: false }> => {
      if (!input.intentId) {
        return { ok: false };
      }

      if (
        input.walletKind === "external" &&
        input.preparedTxBase64 &&
        recordUserSigned
      ) {
        const signTransaction = signerForProvider(input.walletProvider);
        if (!signTransaction) {
          return { ok: false };
        }
        try {
          await submitExternalUserSignature({
            intentId: input.intentId,
            preparedTxBase64: input.preparedTxBase64,
            signTransaction,
            recordUserSigned: (args) =>
              recordUserSigned({
                intentId: args.intentId as Id<"settlementIntents">,
                partialSignedTxBase64: args.partialSignedTxBase64,
              }),
          });
        } catch {
          return { ok: false };
        }
      }

      return { ok: true };
    },
    [recordUserSigned],
  );

  return { pay };
}
