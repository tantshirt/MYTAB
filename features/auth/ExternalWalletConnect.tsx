"use client";

import { isExternalWalletEnabled } from "@/lib/features/flags";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type ExternalWalletConnectProps = {
  onConnect?: () => void;
};

/**
 * P1 stub for wallet-standard external Solana connection (Story 1.10).
 * Hidden unless NEXT_PUBLIC_FEATURE_EXTERNAL_WALLET is enabled — embedded wallet remains default.
 */
export function ExternalWalletConnect({ onConnect }: ExternalWalletConnectProps) {
  if (!isExternalWalletEnabled()) {
    return null;
  }

  return (
    <section
      aria-label="Connect external wallet"
      style={{
        padding: "16px",
        background: MYTAB_COLORS.surface,
        border: `1px solid ${MYTAB_COLORS.border}`,
        borderRadius: MYTAB_RADIUS.md,
      }}
    >
      <h2
        style={{
          margin: "0 0 8px",
          fontSize: MYTAB_TYPOGRAPHY.title.size,
          fontWeight: MYTAB_TYPOGRAPHY.title.weight,
          color: MYTAB_COLORS.ink,
        }}
      >
        Use your own wallet
      </h2>
      <p
        style={{
          margin: "0 0 16px",
          fontSize: MYTAB_TYPOGRAPHY.body.size,
          color: MYTAB_COLORS.inkMuted,
        }}
      >
        Connect a Solana wallet you already own to receive tips and settlements there instead of
        the embedded wallet.
      </p>
      <button
        type="button"
        onClick={onConnect}
        style={{
          width: "100%",
          minHeight: "44px",
          borderRadius: MYTAB_RADIUS.sm,
          border: `1px solid ${MYTAB_COLORS.primary}`,
          background: MYTAB_COLORS.primarySoft,
          color: MYTAB_COLORS.primary,
          fontSize: MYTAB_TYPOGRAPHY.body.size,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Connect external wallet
      </button>
      <p
        style={{
          margin: "12px 0 0",
          fontSize: MYTAB_TYPOGRAPHY.meta.size,
          color: MYTAB_COLORS.inkSubtle,
        }}
      >
        Preview only — signature verification and wallet records ship in a later story.
      </p>
    </section>
  );
}

export { isExternalWalletEnabled };
