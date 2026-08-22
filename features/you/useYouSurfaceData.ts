"use client";

import { api } from "@/convex/_generated/api";
import { useViewer } from "@/features/auth/useViewer";
import { useLiveQuery } from "@/features/convex/useConvexData";
import { useTelegramRuntime } from "@/features/telegram/TelegramRuntimeProvider";
import { FIXTURE_YOU_SURFACE } from "./fixture";
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
 * `buildLabel` and `supportUrl` are build metadata, not Convex state, and stay
 * on the fixture constant deliberately.
 */
export function useYouSurfaceData(): YouSurfaceData {
  const { initDataUnsafe } = useTelegramRuntime();
  const subject = useViewer();
  const wallet = useLiveQuery(api.wallets.defaultReceivingWallet, {});

  if (wallet.fixture) {
    return FIXTURE_YOU_SURFACE;
  }

  const chrome = {
    buildLabel: FIXTURE_YOU_SURFACE.buildLabel,
    supportUrl: FIXTURE_YOU_SURFACE.supportUrl,
  };

  // §3.4 — the read failed, and the cards below still render. Never a takeover.
  if (wallet.error) {
    return { ...chrome, status: "error", viewer: null, wallet: { kind: "failed" } };
  }

  if (subject === undefined || wallet.loading) {
    return { ...chrome, status: "loading", viewer: null, wallet: { kind: "provisioning" } };
  }

  return {
    ...chrome,
    status: "ready",
    viewer: subject === null ? null : viewerFromTelegram(initDataUnsafe, subject),
    // Not an error and never a warning colour: Privy provisions on first login.
    wallet: wallet.data
      ? { kind: "ready", publicKey: wallet.data.solanaAddress }
      : { kind: "provisioning" },
  };
}
