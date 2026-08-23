"use client";

import { useState } from "react";
import { isConvexAuthFixtureMode } from "@/lib/privy/config";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";
import { NAMED_WALLET_LABELS, NAMED_WALLET_PROVIDERS } from "@/lib/wallet/providers";
import { CONNECT_COPY } from "./connectCopy";
import { useLinkExternalWallet, WalletLinkClientError } from "./useLinkExternalWallet";

export type ExternalWalletConnectProps = {
  onConnect?: () => void;
  onLinked?: () => void;
};

function ConnectButtons({
  busy,
  error,
  onPick,
}: {
  busy: boolean;
  error?: string;
  onPick: (provider: (typeof NAMED_WALLET_PROVIDERS)[number]) => void;
}) {
  return (
    <section
      aria-label={CONNECT_COPY.sheetLabel}
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
        {CONNECT_COPY.title}
      </h2>
      <p
        style={{
          margin: "0 0 16px",
          fontSize: MYTAB_TYPOGRAPHY.body.size,
          color: MYTAB_COLORS.inkMuted,
        }}
      >
        {CONNECT_COPY.body}
      </p>
      {NAMED_WALLET_PROVIDERS.map((provider) => (
        <button
          key={provider}
          type="button"
          disabled={busy}
          onClick={() => onPick(provider)}
          style={{
            width: "100%",
            minHeight: "44px",
            marginBottom: "8px",
            borderRadius: MYTAB_RADIUS.sm,
            border: `1px solid ${MYTAB_COLORS.primary}`,
            background: MYTAB_COLORS.primarySoft,
            color: MYTAB_COLORS.primary,
            fontSize: MYTAB_TYPOGRAPHY.body.size,
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {`Connect ${NAMED_WALLET_LABELS[provider]}`}
        </button>
      ))}
      {error ? (
        <p
          role="alert"
          style={{
            margin: "8px 0 0",
            fontSize: MYTAB_TYPOGRAPHY.meta.size,
            color: MYTAB_COLORS.owed,
          }}
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

function LiveExternalWalletConnect({ onConnect, onLinked }: ExternalWalletConnectProps) {
  const { linkNamed } = useLinkExternalWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <ConnectButtons
      busy={busy}
      error={error}
      onPick={(provider) => {
        onConnect?.();
        setBusy(true);
        setError(undefined);
        void linkNamed(provider)
          .then(() => {
            setBusy(false);
            onLinked?.();
          })
          .catch((caught: unknown) => {
            setBusy(false);
            setError(
              caught instanceof WalletLinkClientError ? caught.message : CONNECT_COPY.failed,
            );
          });
      }}
    />
  );
}

/**
 * Named-wallet connect (D-21, D-28). Replaces the Story 1.10 stub.
 * Linking is a signed challenge — this surface never accepts an address.
 */
export function ExternalWalletConnect(props: ExternalWalletConnectProps) {
  if (isConvexAuthFixtureMode()) {
    return (
      <ConnectButtons
        busy={false}
        onPick={() => {
          props.onConnect?.();
        }}
      />
    );
  }
  return <LiveExternalWalletConnect {...props} />;
}
