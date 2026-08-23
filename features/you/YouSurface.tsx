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
import type { YouMoveReceived, YouSurfaceData } from "./types";
import { WalletConnectHost } from "@/features/auth/WalletConnectHost";
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
  onLinked?: () => void;
  onMoveReceived?: () => void;
  moveReceived?: YouMoveReceived;
  moveBusy?: boolean;
  moveFailed?: boolean;
  onRevokeInvite?: (tokenId: string) => void;
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
  onLinked,
  onMoveReceived,
  moveReceived,
  moveBusy = false,
  moveFailed = false,
  onRevokeInvite,
}: YouSurfaceProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

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
        : data.wallet.kind === "none"
          ? YOU_COPY.noneSub
          : undefined);

  const exportExternal =
    data.wallet.kind === "ready" && data.wallet.walletKind === "external";
  const exportDisabled = !walletReady || blockedReason !== undefined || exportExternal;
  const exportReason = exportExternal
    ? YOU_COPY.exportExternalReason
    : walletReasonSub;
  const manageDisabled =
    (data.wallet.kind !== "ready" && data.wallet.kind !== "none") ||
    blockedReason !== undefined;

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
  } else if (data.wallet.kind === "none") {
    walletRow = (
      <ListRow
        label={YOU_COPY.walletRowLabel}
        sub={YOU_COPY.noneSub}
        onPress={() => setSheetOpen(true)}
        trailing={<ChevronGlyph />}
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

      <h1 className="mytab-type-title" style={{ margin: "24px 0" }}>
        {YOU_COPY.title}
      </h1>

      {data.status === "loading" ? (
        <YouSkeleton />
      ) : (
        <>
          <div>
            {data.viewer ? (
              <IdentityBlock viewer={data.viewer} />
            ) : (
              <IdentityError onRetry={onRetryViewer} />
            )}
          </div>

          {/*
            Groups moved here from Tabs home. A group is chosen inside the
            start-a-tab flow, so a roster on the home screen sat above the
            sections people actually acted on without ever being one of them.
          */}
          {data.groups && data.groups.length > 0 ? (
            <div style={{ marginTop: "30px" }}>
              <ListCard label={YOU_COPY.groupsSection}>
                {data.groups.map((group) => (
                  <ListRow
                    key={group.id}
                    label={group.name}
                    sub={YOU_COPY.groupMembers(group.memberCount)}
                    href={`/groups/${group.id}`}
                    trailing={<ChevronGlyph />}
                  />
                ))}
              </ListCard>
            </div>
          ) : null}

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
                sub={exportDisabled ? exportReason : YOU_COPY.exportSub}
                disabled={exportDisabled}
                onPress={onExportWallet}
                trailing={<ChevronGlyph />}
              />
            </ListCard>
          </div>

          {moveReceived?.visible ? (
            <div style={{ marginTop: "12px" }}>
              <ListCard>
                <ListRow
                  label={YOU_COPY.moveReceived(moveReceived.destinationLabel)}
                  sub={moveBusy ? YOU_COPY.moveReceivedBusy : YOU_COPY.moveReceivedSub}
                  onPress={blockedReason || moveBusy ? undefined : onMoveReceived}
                  trailing={
                    <span className="mytab-tabular" style={{ flex: "none" }}>
                      {moveReceived.amountLabel}
                    </span>
                  }
                />
                {moveFailed ? (
                  <p role="alert" style={{ margin: "8px 16px 12px", color: MYTAB_COLORS.owed }}>
                    {YOU_COPY.moveReceivedFailed}
                  </p>
                ) : null}
              </ListCard>
            </div>
          ) : null}

          <button
            type="button"
            className="mytab-button-secondary"
            style={{ marginTop: "12px" }}
            disabled={manageDisabled}
            onClick={() => {
              if (data.wallet.kind === "none") {
                setConnectOpen(true);
                return;
              }
              setSheetOpen(true);
            }}
          >
            {data.wallet.kind === "none" ? YOU_COPY.addWallet : YOU_COPY.manageWallet}
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

          {data.liveInvites && data.liveInvites.length > 0 ? (
            <div style={{ marginTop: "28px" }}>
              <ListCard label={YOU_COPY.liveLinksSection}>
                {data.liveInvites.map((invite) => (
                  <ListRow
                    key={invite.tokenId}
                    label={invite.tabName}
                    sub={
                      invite.seatsRemaining === null
                        ? undefined
                        : YOU_COPY.seatsLeft(invite.seatsRemaining)
                    }
                    disabled={!onRevokeInvite || !inTelegram || offline}
                    onPress={
                      onRevokeInvite && inTelegram && !offline
                        ? () => onRevokeInvite(invite.tokenId)
                        : undefined
                    }
                    trailing={
                      <span
                        style={{
                          fontSize: MYTAB_TYPOGRAPHY.meta.size,
                          color: MYTAB_COLORS.owed,
                          flex: "none",
                        }}
                      >
                        {YOU_COPY.stopLink}
                      </span>
                    }
                  />
                ))}
              </ListCard>
            </div>
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

      {data.wallet.kind === "ready" || data.wallet.kind === "none" ? (
        <ManageWalletSheet
          open={sheetOpen}
          publicKey={data.wallet.kind === "ready" ? data.wallet.publicKey : ""}
          onDismiss={() => setSheetOpen(false)}
          onExportWallet={onExportWallet}
          exportDisabled={exportDisabled}
          exportDisabledReason={exportReason}
          onConnectExternalWallet={() => {
            setSheetOpen(false);
            setConnectOpen(true);
            onConnectExternalWallet?.();
          }}
        />
      ) : null}
      {connectOpen ? (
        <WalletConnectHost
          reason="you"
          showEmbedded={data.wallet.kind === "none" || data.wallet.kind !== "ready" || !data.wallet.hasEmbedded}
          onLinked={() => {
            setConnectOpen(false);
            setSheetOpen(false);
            onLinked?.();
          }}
          onSkip={() => setConnectOpen(false)}
        />
      ) : null}
    </main>
  );
}
