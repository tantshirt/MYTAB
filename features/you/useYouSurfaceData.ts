"use client";

import { api } from "@/convex/_generated/api";
import { useViewer } from "@/features/auth/useViewer";
import { useLiveQuery } from "@/features/convex/useConvexData";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { BUILD_LABEL, SUPPORT_URL } from "./appChrome";
import type { YouSurfaceData, YouViewer } from "./types";

/**
 * Telegram's `initDataUnsafe.user` is display-only and never an authorization
 * signal (FR-A4) — which is exactly what this surface needs it for: the name,
 * the @handle and the photo beside them.
 */
function viewerFromTelegram(
  initDataUnsafe: Record<string, unknown> | null,
  subject: string,
): YouViewer {
  const user = (initDataUnsafe?.user ?? {}) as {
    first_name?: unknown;
    last_name?: unknown;
    username?: unknown;
    photo_url?: unknown;
  };
  const str = (value: unknown) =>
    typeof value === "string" && value.length > 0 ? value : undefined;

  return {
    userId: subject,
    firstName: str(user.first_name) ?? "You",
    lastName: str(user.last_name),
    username: str(user.username),
    photoUrl: str(user.photo_url),
  };
}

/**
 * The single prop-resolution seam for the You surface.
 *
 * Live reads:
 *   `api.users.viewer` (via `useViewer`) — the authenticated subject.
 *   `api.wallets.defaultReceivingWallet` — the embedded Solana wallet.
 *
 * `buildLabel` and `supportUrl` are build metadata rather than Convex state and
 * come from `./appChrome`.
 *
 * With no Convex client there is no viewer and no wallet to name. §4.2 says this
 * surface has no empty state, so it resolves to the one honest thing left: the
 * §3.4 first-paint shape — no viewer, wallet `provisioning` — which renders the
 * skeleton identity block and the cards beneath it, and never a stranger's name
 * or somebody else's key.
 */
export function useYouSurfaceData(): YouSurfaceData {
  const { initDataUnsafe } = useTelegramRuntime();
  const subject = useViewer();
  const wallet = useLiveQuery(api.wallets.defaultReceivingWallet, {});
  const liveInvites = useLiveQuery(api.tabInvite.listOrganizerLiveInvites, {});

  const chrome = { buildLabel: BUILD_LABEL, supportUrl: SUPPORT_URL };

  // §3.4 — the read failed, and the cards below still render. Never a takeover.
  if (wallet.error) {
    return {
      ...chrome,
      status: "error",
      viewer: null,
      wallet: { kind: "failed" },
      liveInvites: [],
    };
  }

  if (subject === undefined || wallet.loading || wallet.fixture) {
    return {
      ...chrome,
      status: "loading",
      viewer: null,
      wallet: { kind: "provisioning" },
      liveInvites: [],
    };
  }

  return {
    ...chrome,
    status: "ready",
    viewer: subject === null ? null : viewerFromTelegram(initDataUnsafe, subject),
    // Not an error and never a warning colour: Privy provisions on first login.
    wallet: wallet.data
      ? { kind: "ready", publicKey: wallet.data.solanaAddress }
      : { kind: "none" },
    liveInvites: (liveInvites.data ?? []).map((row) => ({
      tabId: row.tabId,
      tokenId: row.tokenId,
      tabName: row.tabName,
      expiresAt: row.expiresAt,
      seatsRemaining: row.seatsRemaining,
    })),
  };
}
