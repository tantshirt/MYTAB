"use client";

import { FIXTURE_YOU_SURFACE } from "./fixture";
import type { YouSurfaceData } from "./types";

/**
 * The single prop-resolution seam for the You surface.
 *
 * TODO(live-data): replace the fixture with the live reads — this function is the
 * only thing that changes:
 *
 *   const wallet = useQuery(api.wallets.defaultReceivingWallet, {});
 *   const viewerSubject = useViewer();
 *   return {
 *     status: wallet === undefined || viewerSubject === undefined ? "loading" : "ready",
 *     viewer: ...,                                  // Telegram initDataUnsafe.user
 *     wallet: wallet ? { kind: "ready", publicKey: wallet.solanaAddress } : { kind: "provisioning" },
 *     buildLabel: FIXTURE_YOU_SURFACE.buildLabel,
 *     supportUrl: FIXTURE_YOU_SURFACE.supportUrl,
 *   };
 */
export function useYouSurfaceData(): YouSurfaceData {
  return FIXTURE_YOU_SURFACE;
}
