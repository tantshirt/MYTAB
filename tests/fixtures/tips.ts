/**
 * Tip composer fixture — tests and the responsive sweep only.
 *
 * Nothing under `app/`, `features/` or `components/` may import this file.
 *
 * The cast is the five protagonists — Maya, Andre, Noi, Ploy and Tim (DESIGN.md).
 */
import type { TipComposerData } from "../../features/tips/useTipComposerData";

export const FIXTURE_TIP_COMPOSER: TipComposerData = {
  viewerUserId: "users:andre",
  members: [
    { userId: "users:andre", displayName: "Andre", membershipStatus: "active", walletReady: true },
    { userId: "users:maya", displayName: "Maya", membershipStatus: "active", walletReady: true },
    { userId: "users:ploy", displayName: "Ploy", membershipStatus: "active", walletReady: true },
    { userId: "users:noi", displayName: "Noi", membershipStatus: "active", walletReady: false },
  ],
};
