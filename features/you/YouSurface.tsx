"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DisclosureRow } from "@/components/primitives/disclosure-row";
import { ChevronGlyph } from "@/components/primitives/glyphs";
import { ListCard } from "@/components/primitives/list-card";
import { ListRow } from "@/components/primitives/list-row";
import { NoticeBar } from "@/components/primitives/notice-bar";
import { MYTAB_COLORS, MYTAB_LAYOUT, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";
import { YOU_COPY } from "./copy";
import { IdentityBlock, IdentityError } from "./IdentityBlock";
import { ManageWalletSheet } from "./ManageWalletSheet";
import { PROVISIONING_SWEEP_KEYFRAMES, ProvisioningSweep } from "./ProvisioningSweep";
import type { YouSurfaceData } from "./types";
import { elideWalletKey } from "./useCopyKey";
import { WalletKeyRow } from "./WalletKeyRow";
import { YouSkeleton } from "./YouSkeleton";

export type YouSurfaceProps = {
  data: YouSurfaceData;
  /** False renders the "Open this in Telegram to make changes." bar and disables mutations. */
  inTelegram?: boolean;
  offline?: boolean;
  onRetryViewer?: () => void;
  /** Privy `exportWallet()`. Privy renders its own modal; we render nothing over it. */
  onExportWallet?: () => void;
  onConnectExternalWallet?: () => void;
};

function openSupport(url: string, inTelegram: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  if (inTelegram) {
    const webApp = window.Telegram?.WebApp as
      | { openTelegramLink?: (link: string) => void }
      | undefined;
    if (typeof webApp?.openTelegramLink === "function") {
      webApp.openTelegramLink(url);
      return;
    }
  }
  window.open(url, "_blank", "noreferrer");
}

/**
 * "Wallet, receiving preference, export" (EXPERIENCE, IA), designed in POLISH-SPEC §3.
 * The one idea it has to land: My Tab holds nothing of yours.
 */
export function YouSurface({
  data,
  inTelegram = true,
  offline = false,
  onRetryViewer,
  onExportWallet,
  onConnectExternalWallet,
}: YouSurfaceProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  // Tab root — a stale BackButton from a previous surface must never survive here.
  useEffect(() => {
    const backButton = window.Telegram?.WebApp?.BackButton;
    backButton?.hide();
  }, []);

  const walletReady = data.wallet.kind === "ready";
  const blockedReason = !inTelegram
    ? YOU_COPY.outsideTelegram
    : offline
      ? YOU_COPY.needsConnection
      : undefined;

  const walletReasonSub =
    blockedReason ??
    (data.wallet.kind === "provisioning"
      ? YOU_COPY.provisioning
      : data.wallet.kind === "failed"
        ? YOU_COPY.walletNotReady
        : undefined);

  const exportDisabled = !walletReady || blockedReason !== undefined;
  const manageDisabled = !walletReady || blockedReason !== undefined;

  let walletRow: ReactNode;
  if (data.wallet.kind === "ready") {
    walletRow = (
      <WalletKeyRow
        label={YOU_COPY.walletRowLabel}
        publicKey={data.wallet.publicKey}
        idleValue={elideWalletKey(data.wallet.publicKey)}
        ariaLabel={YOU_COPY.copyRowAriaLabel}
      />
    );
  } else if (data.wallet.kind === "provisioning") {
    walletRow = (
      <ListRow
        label={YOU_COPY.walletRowLabel}
        sub={
          <>
            {YOU_COPY.provisioning}
            <ProvisioningSweep />
          </>
        }
      />
    );
  } else {
    walletRow = (
      <ListRow
        label={YOU_COPY.walletRowLabel}
        sub={YOU_COPY.provisioningFailed}
        subColor={MYTAB_COLORS.owed}
      />
    );
  }

  const gutter = MYTAB_LAYOUT.gutter;

  return (
    <main style={{ paddingBottom: "32px" }}>
      <style>{PROVISIONING_SWEEP_KEYFRAMES}</style>

      {offline ? (
        <NoticeBar tone="warning" style={{ marginLeft: `-${gutter}`, marginRight: `-${gutter}` }}>
          {YOU_COPY.offline}
        </NoticeBar>
      ) : null}
      {!inTelegram ? (
        <NoticeBar tone="quiet" style={{ marginLeft: `-${gutter}`, marginRight: `-${gutter}` }}>
          {YOU_COPY.outsideTelegram}
        </NoticeBar>
      ) : null}

      <h1 className="mytab-type-title" style={{ margin: "24px 0 0" }}>
        {YOU_COPY.title}
      </h1>

      {data.status === "loading" ? (
        <YouSkeleton />
      ) : (
        <>
          <div style={{ marginTop: "24px" }}>
            {data.viewer ? (
              <IdentityBlock viewer={data.viewer} />
            ) : (
              <IdentityError onRetry={onRetryViewer} />
            )}
          </div>

          <div style={{ marginTop: "30px" }}>
            <ListCard label={YOU_COPY.walletSection}>
              {walletRow}
              <DisclosureRow
                id="you-receiving-panel"
                label={YOU_COPY.receivingLabel}
                value={YOU_COPY.receivingValue}
              >
                {YOU_COPY.receivingExplainer}
              </DisclosureRow>
              <ListRow
                label={YOU_COPY.exportLabel}
                sub={exportDisabled ? walletReasonSub : YOU_COPY.exportSub}
                disabled={exportDisabled}
                onPress={onExportWallet}
                trailing={<ChevronGlyph />}
              />
            </ListCard>
          </div>

          <button
            type="button"
            className="mytab-button-secondary"
            style={{ marginTop: "12px" }}
            disabled={manageDisabled}
            onClick={() => setSheetOpen(true)}
          >
            {YOU_COPY.manageWallet}
          </button>
          {manageDisabled && walletReasonSub ? (
            <p
              style={{
                margin: "8px 0 0",
                textAlign: "center",
                fontSize: MYTAB_TYPOGRAPHY.meta.size,
                color: MYTAB_COLORS.inkMuted,
              }}
            >
              {walletReasonSub}
            </p>
          ) : null}

          <div style={{ marginTop: "28px" }}>
            <ListCard label={YOU_COPY.aboutSection}>
              <DisclosureRow id="you-splits-panel" label={YOU_COPY.splitsLabel}>
                {YOU_COPY.splitsExplainer}
              </DisclosureRow>
              {inTelegram ? (
                <ListRow
                  label={YOU_COPY.helpLabel}
                  onPress={() => openSupport(data.supportUrl, true)}
                  trailing={<ChevronGlyph />}
                />
              ) : (
                <ListRow
                  label={YOU_COPY.helpLabel}
                  href={data.supportUrl}
                  external
                  trailing={<ChevronGlyph />}
                />
              )}
            </ListCard>
          </div>
        </>
      )}

      <p
        style={{
          margin: "20px 0 0",
          padding: "0 4px",
          fontSize: MYTAB_TYPOGRAPHY.meta.size,
          lineHeight: 1.5,
          color: MYTAB_COLORS.inkMuted,
        }}
      >
        {YOU_COPY.footerNote}
      </p>

      <p
        style={{
          margin: "16px 0 0",
          padding: "0 4px",
          fontSize: "11px",
          color: MYTAB_COLORS.inkSubtle,
        }}
      >
        {`${YOU_COPY.buildPrefix}${data.buildLabel}`}
      </p>

      {data.wallet.kind === "ready" ? (
        <ManageWalletSheet
          open={sheetOpen}
          publicKey={data.wallet.publicKey}
          onDismiss={() => setSheetOpen(false)}
          onExportWallet={onExportWallet}
          exportDisabled={exportDisabled}
          exportDisabledReason={walletReasonSub}
          onConnectExternalWallet={onConnectExternalWallet}
        />
      ) : null}
    </main>
  );
}
