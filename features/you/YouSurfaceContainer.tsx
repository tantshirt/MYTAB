"use client";

import { useExportWallet } from "@privy-io/react-auth/solana";
import { useConvex } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useOffline } from "@/components/primitives/use-offline";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { isPrivyFixtureMode } from "@/lib/privy/config";
import { YouSurface } from "./YouSurface";
import type { YouSurfaceData } from "./types";
import { useYouSurfaceData } from "@/features/you/useYouSurfaceData";
import { useWalletMoveOffer } from "@/features/you/useWalletMoveOffer";
import { usePayObligation } from "@/features/settlement/usePayObligation";
import { useLiveAction, useLiveMutation } from "@/features/convex/useConvexData";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function YouMoveAndPay({
  data,
  inTelegram,
  offline,
  onRevokeInvite,
  onExportWallet,
}: {
  data: YouSurfaceData;
  inTelegram: boolean;
  offline: boolean;
  onRevokeInvite?: (tokenId: string) => void;
  onExportWallet?: () => void;
}) {
  const router = useRouter();
  const convex = useConvex();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveFailed, setMoveFailed] = useState(false);
  const moveReceived = useWalletMoveOffer(refreshNonce);
  const createMove = useLiveAction(api.wallets.createWalletMove);
  const { pay } = usePayObligation();

  return (
    <YouSurface
      data={data}
      inTelegram={inTelegram}
      offline={offline}
      onExportWallet={onExportWallet}
      onRevokeInvite={onRevokeInvite}
      onLinked={() => setRefreshNonce((value) => value + 1)}
      moveReceived={moveReceived}
      moveBusy={moveBusy}
      moveFailed={moveFailed}
      onMoveReceived={() => {
        if (!createMove) {
          return;
        }
        setMoveBusy(true);
        setMoveFailed(false);
        void createMove({ idempotencyKey: crypto.randomUUID() })
          .then(async (result) => {
            const started = Date.now();
            let prepared: string | null = null;
            let walletKind: "embedded" | "external" | null = null;
            let walletProvider: string | null = null;
            while (Date.now() - started < 20_000) {
              const intent = await convex.query(api.settlements.getIntent, {
                intentId: result.intentId as Id<"settlementIntents">,
              });
              if (intent?.preparedTxBase64) {
                prepared = intent.preparedTxBase64;
                walletKind = intent.walletKind;
                walletProvider = intent.walletProvider;
                break;
              }
              await new Promise((resolve) => setTimeout(resolve, 400));
            }
            if (!prepared) {
              setMoveFailed(true);
              return;
            }
            const signed = await pay({
              intentId: result.intentId,
              walletKind,
              walletProvider,
              preparedTxBase64: prepared,
            });
            if (!signed.ok) {
              setMoveFailed(true);
              return;
            }
            router.replace(`/pay/${result.intentId}`);
          })
          .catch(() => setMoveFailed(true))
          .finally(() => setMoveBusy(false));
      }}
    />
  );
}

function PrivyYouSurface({
  data,
  inTelegram,
  offline,
  onRevokeInvite,
}: {
  data: YouSurfaceData;
  inTelegram: boolean;
  offline: boolean;
  onRevokeInvite?: (tokenId: string) => void;
}) {
  // Privy renders its own export modal; we render nothing over it (POLISH-SPEC §3.2).
  const { exportWallet } = useExportWallet();

  return (
    <YouMoveAndPay
      data={data}
      inTelegram={inTelegram}
      offline={offline}
      onRevokeInvite={onRevokeInvite}
      onExportWallet={() => {
        void exportWallet();
      }}
    />
  );
}

/**
 * Chooses the export binding once, the same way `app/providers.tsx` chooses the
 * provider stack: `useExportWallet` needs a `PrivyProvider` above it, and fixture
 * mode has none.
 */
export function YouSurfaceContainer() {
  const data = useYouSurfaceData();
  const { isTelegramWebApp } = useTelegramRuntime();
  const offline = useOffline();
  const revoke = useLiveMutation(api.sessionTokens.revokeToken);
  const onRevokeInvite = revoke
    ? (tokenId: string) => {
        void revoke({ tokenId: tokenId as Id<"sessionTokens"> });
      }
    : undefined;

  if (isPrivyFixtureMode()) {
    return (
      <YouSurface
        data={data}
        inTelegram={isTelegramWebApp}
        offline={offline}
        onRevokeInvite={onRevokeInvite}
      />
    );
  }

  return (
    <PrivyYouSurface
      data={data}
      inTelegram={isTelegramWebApp}
      offline={offline}
      onRevokeInvite={onRevokeInvite}
    />
  );
}
