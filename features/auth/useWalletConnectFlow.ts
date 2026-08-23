"use client";

import { useConvex } from "convex/react";
import { useCallback, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { NamedWalletProvider } from "@/lib/wallet/providers";
import { CONNECT_COPY } from "./connectCopy";
import { connectFailureMessage } from "./connectFailureMessage";
import type { ConnectSheetStatus } from "./ConnectSheet";
import { useCreateMyTabWallet } from "./useCreateMyTabWallet";
import { useLinkExternalWallet } from "./useLinkExternalWallet";

async function waitForLinkedWallet(
  query: () => Promise<{ linked?: boolean } | null>,
): Promise<boolean> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const row = await query();
    if (row?.linked === true) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

export function useWalletConnectFlow(input?: { onLinked?: () => void }): {
  status: ConnectSheetStatus;
  errorMessage: string | undefined;
  connectNamed: (provider: NamedWalletProvider) => Promise<void>;
  useMyTabWallet: () => Promise<void>;
} {
  const convex = useConvex();
  const { linkNamed } = useLinkExternalWallet();
  const createMyTabWallet = useCreateMyTabWallet();
  const [status, setStatus] = useState<ConnectSheetStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const onLinkedRef = useRef(input?.onLinked);
  onLinkedRef.current = input?.onLinked;

  const connectNamed = useCallback(
    async (provider: NamedWalletProvider) => {
      setStatus("linking");
      setErrorMessage(undefined);
      try {
        await linkNamed(provider);
        const linked = await waitForLinkedWallet(() =>
          convex.query(api.wallets.hasLinkedWallet, {}),
        );
        if (!linked) {
          setStatus("failed");
          setErrorMessage(CONNECT_COPY.syncFailed);
          return;
        }
        setStatus("idle");
        onLinkedRef.current?.();
      } catch (error) {
        setStatus("failed");
        setErrorMessage(connectFailureMessage(error, provider));
      }
    },
    [convex, linkNamed],
  );

  const useMyTabWallet = useCallback(async () => {
    setStatus("linking");
    setErrorMessage(undefined);
    try {
      await createMyTabWallet();
      const linked = await waitForLinkedWallet(() =>
        convex.query(api.wallets.hasLinkedWallet, {}),
      );
      if (!linked) {
        setStatus("failed");
        setErrorMessage(CONNECT_COPY.syncFailed);
        return;
      }
      setStatus("idle");
      onLinkedRef.current?.();
    } catch (error) {
      // Same taxonomy as the named path: a lapsed session is not a wallet that
      // failed. This branch swallowed the error entirely before.
      setStatus("failed");
      setErrorMessage(connectFailureMessage(error));
    }
  }, [convex, createMyTabWallet]);

  return { status, errorMessage, connectNamed, useMyTabWallet };
}
