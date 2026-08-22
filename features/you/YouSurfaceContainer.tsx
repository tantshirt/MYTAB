"use client";

import { useExportWallet } from "@privy-io/react-auth/solana";
import { useOffline } from "@/components/primitives/use-offline";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { isPrivyFixtureMode } from "@/lib/privy/config";
import { YouSurface } from "./YouSurface";
import type { YouSurfaceData } from "./types";
import { useYouSurfaceData } from "@/features/you/useYouSurfaceData";
import { useLiveMutation } from "@/features/convex/useConvexData";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

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
    <YouSurface
      data={data}
      inTelegram={inTelegram}
      offline={offline}
      onExportWallet={() => {
        void exportWallet();
      }}
      onRevokeInvite={onRevokeInvite}
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
