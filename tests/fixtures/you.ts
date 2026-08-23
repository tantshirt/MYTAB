import type { YouSurfaceData } from "@/features/you/types";

/**
 * The You surface as the demo protagonist sees it (Sukhumvit Dinner cast).
 * Shaped to match `wallets.defaultReceivingWallet` + `users.viewer` so the live
 * swap in `useYouSurfaceData` is a one-line change.
 */
export const FIXTURE_YOU_SURFACE: YouSurfaceData = {
  status: "ready",
  viewer: {
    userId: "user-andre",
    firstName: "Andre",
    username: "andre",
  },
  wallet: {
    kind: "ready",
    publicKey: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJos9mPq",
    walletKind: "embedded",
    provider: null,
    hasEmbedded: true,
  },
  buildLabel: "2026.08.22",
  supportUrl: "https://t.me/mytabsupport",
  liveInvites: [
    {
      tabId: "tabs:sukhumvit",
      tokenId: "sessionTokens:live",
      tabName: "Sukhumvit Dinner",
      expiresAt: Date.now() + 86_400_000,
      seatsRemaining: 3,
    },
  ],
};

/** First paint with no cached viewer (POLISH-SPEC §3.4). */
export const FIXTURE_YOU_LOADING: YouSurfaceData = {
  ...FIXTURE_YOU_SURFACE,
  status: "loading",
  viewer: null,
};

/** Convex viewer query failed — cards still render (POLISH-SPEC §3.4). */
export const FIXTURE_YOU_VIEWER_ERROR: YouSurfaceData = {
  ...FIXTURE_YOU_SURFACE,
  status: "error",
  viewer: null,
};

/** Privy embedded wallet not created yet — not an error, no warning colour. */
export const FIXTURE_YOU_PROVISIONING: YouSurfaceData = {
  ...FIXTURE_YOU_SURFACE,
  wallet: { kind: "provisioning" },
};

/** Privy returned an error while provisioning. Reopening is the retry. */
export const FIXTURE_YOU_WALLET_FAILED: YouSurfaceData = {
  ...FIXTURE_YOU_SURFACE,
  wallet: { kind: "failed" },
};
