"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useConvex, useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { parseWalletUlStartParam, readPendingUniversalLink } from "@/lib/wallet/universalLinks";
import { openWalletUrl } from "./openWalletUrl";
import {
  shouldStartWalletUlResume,
  writeWalletUlResumeStatus,
} from "./walletUlResumeStatus";
import { resumeUniversalLinkWallet, type WalletUlHandoffDeps } from "./walletUlHandoff";

/**
 * After `t.me?startapp=ulcb_*` the original connect promise is gone.
 * Wait for Privy, hydrate the secret from Convex if the WebView died,
 * then finish the link.
 */
export function useWalletUlResume(): void {
  const { ready, authenticated } = usePrivy();
  const convex = useConvex();
  const link = useMutation(api.wallets.linkExternalWallet);
  const consume = useMutation(api.wallets.consumeWalletUlCallback);
  const storeSession = useMutation(api.wallets.storeWalletUlSession);
  const storePaySession = useMutation(api.wallets.storeWalletPaySession);
  const { startParam } = useTelegramRuntime();
  const started = useRef(false);

  useEffect(() => {
    const fromStart = parseWalletUlStartParam(startParam ?? "");
    const fromPending = readPendingUniversalLink()?.challengeId;
    const challengeId = fromStart ?? fromPending ?? null;
    if (
      !shouldStartWalletUlResume({
        started: started.current,
        ready,
        authenticated,
        challengeId,
      })
    ) {
      return;
    }
    started.current = true;
    writeWalletUlResumeStatus("working");

    const deps: WalletUlHandoffDeps = {
      queryCallback: (id) => convex.query(api.wallets.walletUlCallback, { challengeId: id }),
      consumeCallback: async (id) => {
        await consume({ challengeId: id });
      },
      submitSigned: async (input) => {
        await link(input);
      },
      openUrl: openWalletUrl,
      persistSession: (id, secret, pending) => storeSession({ challengeId: id, secret, pending }),
      storePaySession: (input) => storePaySession(input).then(() => undefined),
    };

    void resumeUniversalLinkWallet({
      deps,
      challengeId: challengeId as Id<"walletLinkChallenges">,
    }).then((result) => {
      if (result === "linked") {
        writeWalletUlResumeStatus("linked");
        return;
      }
      if (result === "failed") {
        writeWalletUlResumeStatus("failed");
        started.current = false;
      }
    });
  }, [startParam, convex, link, consume, storeSession, storePaySession, ready, authenticated]);
}
