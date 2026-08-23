"use client";

import { useConvex, useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { parseWalletUlStartParam, readPendingUniversalLink } from "@/lib/wallet/universalLinks";
import { resumeUniversalLinkWallet, type WalletUlHandoffDeps } from "./walletUlHandoff";

function openExternalUrl(url: string): void {
  const webApp = window.Telegram?.WebApp as { openLink?: (href: string) => void } | undefined;
  if (typeof webApp?.openLink === "function") {
    webApp.openLink(url);
    return;
  }
  window.location.assign(url);
}

/**
 * After `t.me?startapp=ulcb_*` the original connect promise is gone.
 * Decrypt with the secret still in this WebView and finish the link.
 */
export function useWalletUlResume(): void {
  const convex = useConvex();
  const link = useMutation(api.wallets.linkExternalWallet);
  const consume = useMutation(api.wallets.consumeWalletUlCallback);
  const { startParam } = useTelegramRuntime();
  const started = useRef(false);

  useEffect(() => {
    const fromStart = parseWalletUlStartParam(startParam ?? "");
    const fromPending = readPendingUniversalLink()?.challengeId;
    const challengeId = fromStart ?? fromPending;
    if (!challengeId || started.current) {
      return;
    }
    started.current = true;

    const deps: WalletUlHandoffDeps = {
      queryCallback: (id) => convex.query(api.wallets.walletUlCallback, { challengeId: id }),
      consumeCallback: async (id) => {
        await consume({ challengeId: id });
      },
      submitSigned: async (input) => {
        await link(input);
      },
      openUrl: openExternalUrl,
    };

    void resumeUniversalLinkWallet({
      deps,
      challengeId: challengeId as Id<"walletLinkChallenges">,
    });
  }, [startParam, convex, link, consume]);
}
