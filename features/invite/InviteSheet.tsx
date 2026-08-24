"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SheetContainer } from "@/components/settlement-sheet/SheetContainer";
import { useCopyKey } from "@/features/you/useCopyKey";
import { useShareMessage } from "@/features/telegram/useShareMessage";
import { useLiveAction, useLiveMutation } from "@/features/convex/useConvexData";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { QrSvg } from "@/lib/qr/svg";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_SPACING, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";
import { INVITE_COPY } from "./copy";

/**
 * `manage` is the sheet reached from the Claim Board: share, copy, code, stop.
 *
 * `handoff` is the one moment the tab has just been started and the table is
 * still sitting there — the code leads, nothing is behind a toggle, and there
 * is no "Stop this link" beside it, because revoking a link one second after
 * minting it is not a thing anyone means to do.
 */
export type InviteSheetMode = "manage" | "handoff";

export type InviteSheetProps = {
  open: boolean;
  tabId: string;
  mode?: InviteSheetMode;
  onDismiss: () => void;
};

export function isCurrentInviteOperation(
  currentTabId: string,
  currentGeneration: number,
  operationTabId: string,
  operationGeneration: number,
): boolean {
  return currentTabId === operationTabId && currentGeneration === operationGeneration;
}

/**
 * Share + QR + revoke, on the same token (U-9, D-24).
 * Prepared messages are minted fresh on every tap — never cached.
 */
export function InviteSheet({ open, tabId, mode = "manage", onDismiss }: InviteSheetProps) {
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
  const [operationError, setOperationError] = useState<string | null>(null);
  const activeTabId = useRef(tabId);
  const operationGeneration = useRef(0);

  useEffect(() => {
    activeTabId.current = tabId;
    operationGeneration.current += 1;
    setDeepLinkUrl(null);
    setTokenId(null);
    setSeats(null);
    setSent(false);
    setStopped(false);
    setShowQr(false);
    setBusy(false);
    setOperationError(null);
  }, [tabId]);

  const current = useCallback((operationTabId: string, generation: number) =>
    isCurrentInviteOperation(
      activeTabId.current,
      operationGeneration.current,
      operationTabId,
      generation,
    ), []);

  const loadInvite = useCallback(async () => {
    const operationTabId = tabId;
    const generation = operationGeneration.current;
    if (!ensure) {
      if (current(operationTabId, generation)) {
        setOperationError("Invite details are unavailable here. Reopen My Tab in Telegram.");
      }
      return null;
    }
    setOperationError(null);
    try {
      const payload = await ensure({ tabId: tabId as Id<"tabs"> });
      if (!current(operationTabId, generation)) return null;
      setDeepLinkUrl(payload.deepLinkUrl);
      setTokenId(payload.tokenId || null);
      setSeats(payload.seatsRemaining);
      return payload;
    } catch {
      if (current(operationTabId, generation)) setOperationError("Couldn't load the invite. Try again.");
      return null;
    }
  }, [current, ensure, tabId]);

  const handleShare = useCallback(async () => {
    if (!prepare || !share.available || busy) {
      return;
    }
    setBusy(true);
    setOperationError(null);
    const operationTabId = tabId;
    const generation = operationGeneration.current;
    try {
      const prepared = await prepare({ tabId: tabId as Id<"tabs"> });
      if (!current(operationTabId, generation)) return;
      if (!prepared.ok) {
        setOperationError("Couldn't prepare the invite. Try again.");
        return;
      }
      setDeepLinkUrl(prepared.deepLinkUrl);
      setTokenId(prepared.tokenId || null);
      setSeats(prepared.seatsRemaining);
      const outcome = await share.share(prepared.preparedMessageId);
      if (!current(operationTabId, generation)) return;
      if (outcome.status === "sent") {
        setSent(true);
      } else if (outcome.status === "failed") {
        setOperationError("Couldn't open sharing. Copy the link instead.");
      }
    } catch {
      if (current(operationTabId, generation)) setOperationError("Couldn't prepare the invite. Try again.");
    } finally {
      if (current(operationTabId, generation)) setBusy(false);
    }
  }, [busy, current, prepare, share, tabId]);

  const handleCopy = useCallback(async () => {
    const operationTabId = tabId;
    const generation = operationGeneration.current;
    setOperationError(null);
    let url = deepLinkUrl;
    if (!url) {
      const payload = await loadInvite();
      if (!current(operationTabId, generation)) return;
      url = payload?.deepLinkUrl ?? null;
    }
    if (url) {
      copy(url);
    } else if (current(operationTabId, generation)) {
      setOperationError("Couldn't load the link. Try again.");
    }
  }, [copy, current, deepLinkUrl, loadInvite, tabId]);

  /*
   * Handoff opens straight onto the code. A toggle here would mean the table
   * waits while the organizer finds a button, which is the whole friction this
   * mode exists to delete.
   */
  const handoff = mode === "handoff";
  useEffect(() => {
    if (!open || !handoff || deepLinkUrl) {
      return;
    }
    setShowQr(true);
    void loadInvite();
  }, [open, handoff, deepLinkUrl, loadInvite]);

  const handleQr = useCallback(async () => {
    const operationTabId = tabId;
    const generation = operationGeneration.current;
    setOperationError(null);
    if (!deepLinkUrl) {
      const loaded = await loadInvite();
      if (!current(operationTabId, generation)) return;
      if (!loaded) return;
    }
    if (!current(operationTabId, generation)) return;
    setShowQr((open) => !open);
  }, [current, deepLinkUrl, loadInvite, tabId]);

  const handleRevoke = useCallback(async () => {
    const operationTabId = tabId;
    const generation = operationGeneration.current;
    if (!revoke || !tokenId || busy) {
      if (!tokenId) {
        const payload = await loadInvite();
        if (!payload?.tokenId || !revoke) {
          return;
        }
        setBusy(true);
        try {
          await revoke({ tokenId: payload.tokenId as Id<"sessionTokens"> });
          if (!current(operationTabId, generation)) return;
          setStopped(true);
          setDeepLinkUrl(null);
        } catch {
          if (current(operationTabId, generation)) setOperationError("Couldn't stop the link. Try again.");
        } finally {
          if (current(operationTabId, generation)) setBusy(false);
        }
        return;
      }
      return;
    }
    setBusy(true);
    setOperationError(null);
    try {
      await revoke({ tokenId: tokenId as Id<"sessionTokens"> });
      if (!current(operationTabId, generation)) return;
      setStopped(true);
      setDeepLinkUrl(null);
    } catch {
      if (current(operationTabId, generation)) setOperationError("Couldn't stop the link. Try again.");
    } finally {
      if (current(operationTabId, generation)) setBusy(false);
    }
  }, [busy, current, loadInvite, revoke, tabId, tokenId]);

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

  const qrPanel =
    deepLinkUrl && !stopped ? (
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
        {/* The code has to survive a phone held across a table, so handoff
            gets every pixel the 320px floor allows. */}
        <QrSvg value={deepLinkUrl} label={INVITE_COPY.qrLabel} size={handoff ? 240 : 196} />
      </div>
    ) : null;

  const errorPanel = operationError || copyStatus === "failed" ? (
    <div role="alert" className="mytab-type-meta" style={{ marginTop: MYTAB_SPACING["3"] }}>
      <p style={{ margin: 0 }}>
        {operationError ?? "Couldn't copy the link. Try again or long-press it to select."}
      </p>
      {operationError ? (
        <button
          type="button"
          className="mytab-link-button"
          style={{ minHeight: 44 }}
          onClick={() => void loadInvite()}
          disabled={busy}
        >
          Try again
        </button>
      ) : null}
    </div>
  ) : null;

  if (handoff) {
    return (
      <SheetContainer label={INVITE_COPY.handoffTitle} onDismiss={onDismiss}>
        <p className="mytab-type-micro-label" style={{ margin: 0 }}>
          {INVITE_COPY.handoffTitle}
        </p>

        {qrPanel}
        {errorPanel}

        <p
          className="mytab-type-body"
          style={{ margin: `${MYTAB_SPACING["4"]} 0 0`, textAlign: "center" }}
        >
          {INVITE_COPY.handoffInstruction}
        </p>

        {seats !== null ? (
          <p
            className="mytab-type-meta"
            style={{ margin: `${MYTAB_SPACING["3"]} 0 0`, textAlign: "center" }}
          >
            {INVITE_COPY.seatsLeft(seats)}
          </p>
        ) : null}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: MYTAB_SPACING["3"],
            marginTop: MYTAB_SPACING["5"],
          }}
        >
          <button
            type="button"
            className="mytab-button-secondary"
            style={{ minHeight: 44, flex: "1 1 0" }}
            onClick={() => void handleCopy()}
          >
            {copyLabel}
          </button>
          {share.available && prepare ? (
            <button
              type="button"
              className="mytab-button-secondary"
              style={{ minHeight: 44, flex: "1 1 0" }}
              onClick={() => void handleShare()}
              disabled={busy}
            >
              {shareLabel}
            </button>
          ) : null}
        </div>

        <p
          className="mytab-type-meta"
          style={{ margin: `${MYTAB_SPACING["4"]} 0 0`, textAlign: "center" }}
        >
          {INVITE_COPY.handoffAside}
        </p>
      </SheetContainer>
    );
  }

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

      {errorPanel}

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

      {showQr ? qrPanel : null}

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
