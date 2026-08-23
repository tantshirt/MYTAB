"use client";

import { useCallback, useState } from "react";
import { SheetContainer } from "@/components/settlement-sheet/SheetContainer";
import { useCopyKey } from "@/features/you/useCopyKey";
import { useShareMessage } from "@/features/telegram/useShareMessage";
import { useLiveAction, useLiveMutation } from "@/features/convex/useConvexData";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { QrSvg } from "@/lib/qr/svg";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_SPACING, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";
import { INVITE_COPY } from "./copy";

export type InviteSheetProps = {
  open: boolean;
  tabId: string;
  onDismiss: () => void;
};

/**
 * Share + QR + revoke, on the same token (U-9, D-24).
 * Prepared messages are minted fresh on every tap — never cached.
 */
export function InviteSheet({ open, tabId, onDismiss }: InviteSheetProps) {
  const share = useShareMessage();
  const prepare = useLiveAction(api.tabInvite.prepareTabInvite);
  const ensure = useLiveMutation(api.tabInvite.ensureInvite);
  const revoke = useLiveMutation(api.sessionTokens.revokeToken);
  const { status: copyStatus, copy } = useCopyKey();

  const [deepLinkUrl, setDeepLinkUrl] = useState<string | null>(null);
  const [tokenId, setTokenId] = useState<string | null>(null);
  const [seats, setSeats] = useState<number | null>(null);
  const [sent, setSent] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadInvite = useCallback(async () => {
    if (!ensure) {
      return null;
    }
    const payload = await ensure({ tabId: tabId as Id<"tabs"> });
    setDeepLinkUrl(payload.deepLinkUrl);
    setTokenId(payload.tokenId || null);
    setSeats(payload.seatsRemaining);
    return payload;
  }, [ensure, tabId]);

  const handleShare = useCallback(async () => {
    if (!prepare || !share.available || busy) {
      return;
    }
    setBusy(true);
    try {
      const prepared = await prepare({ tabId: tabId as Id<"tabs"> });
      if (!prepared.ok) {
        return;
      }
      setDeepLinkUrl(prepared.deepLinkUrl);
      setTokenId(prepared.tokenId || null);
      setSeats(prepared.seatsRemaining);
      const outcome = await share.share(prepared.preparedMessageId);
      if (outcome.status === "sent") {
        setSent(true);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, prepare, share, tabId]);

  const handleCopy = useCallback(async () => {
    let url = deepLinkUrl;
    if (!url) {
      const payload = await loadInvite();
      url = payload?.deepLinkUrl ?? null;
    }
    if (url) {
      copy(url);
    }
  }, [copy, deepLinkUrl, loadInvite]);

  const handleQr = useCallback(async () => {
    if (!deepLinkUrl) {
      await loadInvite();
    }
    setShowQr((current) => !current);
  }, [deepLinkUrl, loadInvite]);

  const handleRevoke = useCallback(async () => {
    if (!revoke || !tokenId || busy) {
      if (!tokenId) {
        const payload = await loadInvite();
        if (!payload?.tokenId || !revoke) {
          return;
        }
        setBusy(true);
        try {
          await revoke({ tokenId: payload.tokenId as Id<"sessionTokens"> });
          setStopped(true);
          setDeepLinkUrl(null);
        } finally {
          setBusy(false);
        }
        return;
      }
      return;
    }
    setBusy(true);
    try {
      await revoke({ tokenId: tokenId as Id<"sessionTokens"> });
      setStopped(true);
      setDeepLinkUrl(null);
    } finally {
      setBusy(false);
    }
  }, [busy, loadInvite, revoke, tokenId]);

  if (!open) {
    return null;
  }

  const shareLabel = sent ? INVITE_COPY.sendToSomeoneElse : INVITE_COPY.sendTheLink;
  const copyLabel =
    copyStatus === "copied"
      ? INVITE_COPY.copied
      : copyStatus === "failed"
        ? INVITE_COPY.copyFailed
        : INVITE_COPY.copyLink;

  return (
    <SheetContainer label={INVITE_COPY.sheetTitle} onDismiss={onDismiss}>
      <p className="mytab-type-micro-label" style={{ margin: 0 }}>
        {INVITE_COPY.sheetTitle}
      </p>

      {stopped ? (
        <p className="mytab-type-body" style={{ margin: `${MYTAB_SPACING["4"]} 0 0` }}>
          {INVITE_COPY.stopped}
        </p>
      ) : null}

      {sent && seats !== null && !stopped ? (
        <p className="mytab-type-meta" style={{ margin: `${MYTAB_SPACING["3"]} 0 0` }}>
          {INVITE_COPY.sentSeats(seats)}
        </p>
      ) : null}

      {!stopped && share.available && prepare ? (
        <button
          type="button"
          className="mytab-button-primary"
          style={{ marginTop: MYTAB_SPACING["5"], minHeight: 44 }}
          onClick={() => void handleShare()}
          disabled={busy}
        >
          {shareLabel}
        </button>
      ) : null}

      {!stopped && (!share.available || !prepare) ? (
        <p className="mytab-type-meta" style={{ margin: `${MYTAB_SPACING["4"]} 0 0` }}>
          {INVITE_COPY.shareUnavailable}
        </p>
      ) : null}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: MYTAB_SPACING["3"],
          marginTop: MYTAB_SPACING["4"],
        }}
      >
        <button
          type="button"
          className="mytab-button-secondary"
          style={{ minHeight: 44, flex: "1 1 0" }}
          onClick={() => void handleCopy()}
          disabled={stopped}
        >
          {copyLabel}
        </button>
        <button
          type="button"
          className="mytab-button-secondary"
          style={{ minHeight: 44, flex: "1 1 0" }}
          onClick={() => void handleQr()}
          disabled={stopped}
        >
          {showQr ? INVITE_COPY.hideQr : INVITE_COPY.showQr}
        </button>
      </div>

      {showQr && deepLinkUrl && !stopped ? (
        <div
          style={{
            marginTop: MYTAB_SPACING["5"],
            padding: MYTAB_SPACING["5"],
            background: MYTAB_COLORS.surface,
            border: `1px solid ${MYTAB_COLORS.border}`,
            borderRadius: MYTAB_RADIUS.md,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <QrSvg value={deepLinkUrl} label={INVITE_COPY.qrLabel} />
        </div>
      ) : null}

      {revoke ? (
        <button
          type="button"
          className="mytab-button-secondary"
          style={{
            marginTop: MYTAB_SPACING["5"],
            minHeight: 44,
            color: stopped ? MYTAB_COLORS.inkMuted : MYTAB_COLORS.owed,
          }}
          onClick={() => void handleRevoke()}
          disabled={busy || stopped}
        >
          {INVITE_COPY.stopLink}
        </button>
      ) : null}

      {seats !== null && !stopped ? (
        <p
          className="mytab-type-meta"
          style={{
            margin: `${MYTAB_SPACING["4"]} 0 0`,
            fontSize: MYTAB_TYPOGRAPHY.meta.size,
            color: MYTAB_COLORS.inkMuted,
          }}
        >
          {INVITE_COPY.seatsLeft(seats)}
        </p>
      ) : null}
    </SheetContainer>
  );
}
