"use client";

import type React from "react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/primitives/empty-state";
import { NoticeBar } from "@/components/primitives/notice-bar";
import { ParticipantChip } from "@/components/primitives/participant-chip";
import { STATE_COPY } from "@/components/primitives/state-copy";
import {
  assertTipMinor,
  formatFiatMinorThb,
  parseThbStringToMinor,
  thbMinorFromWholeBaht,
  thbMinorToUsdcAtomicFixture,
  type FiatMinor,
} from "@/lib/domain";
import { formatThbMinorForA11y } from "@/lib/domain/a11yAmount";
import {
  avatarTintsForGroup,
  MYTAB_COLORS,
  MYTAB_ELEVATION,
  MYTAB_RADIUS,
  MYTAB_TYPOGRAPHY,
} from "@/lib/theme/tokens";

export const TIP_COPY = {
  title: "Send a tip",
  /** §4.2 — no eligible recipients. */
  emptyRecipients: "Nobody here has opened My Tab yet. Once they do, you can tip them.",
  /** §4.3 — custom amount invalid. */
  invalidAmount: "Enter an amount above ฿0.",
  /** §4.3 — send fails. */
  sendFailed: "Couldn't send the tip. Try again.",
  offline: STATE_COPY.offline,
  needsConnection: STATE_COPY.needsConnection,
  outsideTelegram: STATE_COPY.outsideTelegram,
} as const;

export const TIP_PRESET_WHOLE_BAHT = [20, 50, 100, 200] as const;
export const TIP_REACTIONS = ["🙏", "🔥", "💐", "🍜", "👏", "🫶"] as const;

export type TipComposerMember = {
  userId: string;
  displayName: string;
  membershipStatus: "active" | "left" | "kicked" | "restricted";
  walletReady: boolean;
};

export type TipComposerSubmitPayload = {
  recipientUserId: string;
  amountThbMinor: FiatMinor;
  amountAtomic: bigint;
  note?: string;
  reaction?: string;
  idempotencyKey: string;
};

export type TipComposerProps = {
  members: TipComposerMember[];
  viewerUserId: string;
  preselectedRecipientUserId?: string;
  onSubmit?: (payload: TipComposerSubmitPayload) => void;
  /** The send failed. Renders §4.3 copy above the footer; the action re-submits. */
  sendFailed?: boolean;
  /** §4.4 — money never moves optimistically, so the whole surface is disabled. */
  offline?: boolean;
  /** §4.5 — reads work, every mutation is disabled. */
  inTelegram?: boolean;
};

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tip-${Date.now()}`;
}

/** Tip composer — pick person, amount, optional note (Story 3.1). */
export function TipComposer({
  members,
  viewerUserId,
  preselectedRecipientUserId,
  onSubmit,
  sendFailed = false,
  offline = false,
  inTelegram = true,
}: TipComposerProps) {
  const eligibleMembers = useMemo(
    () =>
      members.filter(
        (member) =>
          member.membershipStatus === "active" &&
          member.userId !== viewerUserId &&
          member.walletReady,
      ),
    [members, viewerUserId],
  );

  // The chip row is a set of people rendered together, so the tints are allocated
  // for the set rather than hashed per id (§2.6).
  const chipTints = useMemo(
    () => avatarTintsForGroup(eligibleMembers.map((member) => member.userId)),
    [eligibleMembers],
  );

  const initialRecipient =
    preselectedRecipientUserId &&
    eligibleMembers.some((member) => member.userId === preselectedRecipientUserId)
      ? preselectedRecipientUserId
      : eligibleMembers[0]?.userId ?? "";

  const [recipientUserId, setRecipientUserId] = useState(initialRecipient);
  const [amountThbMinor, setAmountThbMinor] = useState<FiatMinor>(thbMinorFromWholeBaht(100));
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [note, setNote] = useState("");
  const [reaction, setReaction] = useState<string | null>(null);
  const [customInvalid, setCustomInvalid] = useState(false);

  const blockedReason = !inTelegram
    ? TIP_COPY.outsideTelegram
    : offline
      ? TIP_COPY.needsConnection
      : undefined;

  const recipient = eligibleMembers.find((member) => member.userId === recipientUserId);
  const amountLabel = formatFiatMinorThb(amountThbMinor);
  const canSubmit = Boolean(recipient) && amountThbMinor > 0 && blockedReason === undefined;

  function selectPreset(wholeBaht: number) {
    setCustomMode(false);
    setCustomInvalid(false);
    setAmountThbMinor(thbMinorFromWholeBaht(wholeBaht));
  }

  function applyCustomAmount() {
    if (customInput.trim() === "") {
      setCustomInvalid(false);
      return;
    }
    try {
      const parsed = parseThbStringToMinor(customInput);
      assertTipMinor(parsed);
      setAmountThbMinor(parsed);
      setCustomInvalid(false);
      setCustomMode(false);
    } catch {
      // The hero holds its last value — a figure is never blanked (§4.0 rule 3).
      setCustomInvalid(true);
    }
  }

  function handleSubmit() {
    if (!recipient || !canSubmit) {
      return;
    }

    const amountAtomic = thbMinorToUsdcAtomicFixture(amountThbMinor);
    onSubmit?.({
      recipientUserId: recipient.userId,
      amountThbMinor,
      amountAtomic,
      note: note.trim() || undefined,
      reaction: reaction ?? undefined,
      idempotencyKey: createIdempotencyKey(),
    });
  }

  return (
    <section
      aria-label="Send a tip"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        background: MYTAB_COLORS.paper,
        color: MYTAB_COLORS.ink,
        fontFamily: MYTAB_TYPOGRAPHY.family,
      }}
    >
      {offline ? <NoticeBar tone="warning">{TIP_COPY.offline}</NoticeBar> : null}
      {!inTelegram ? <NoticeBar tone="quiet">{TIP_COPY.outsideTelegram}</NoticeBar> : null}

      <header style={{ padding: "16px" }}>
        <h1
          style={{
            margin: 0,
            fontSize: MYTAB_TYPOGRAPHY.title.size,
            fontWeight: MYTAB_TYPOGRAPHY.title.weight,
          }}
        >
          {TIP_COPY.title}
        </h1>
      </header>

      {eligibleMembers.length === 0 ? (
        <div style={{ padding: "0 16px 24px" }}>
          <EmptyState headline={TIP_COPY.emptyRecipients} />
        </div>
      ) : null}

      <div style={{ flex: 1, paddingBottom: "24px" }}>
        <div
          style={{
            fontSize: MYTAB_TYPOGRAPHY.microLabel.size,
            fontWeight: MYTAB_TYPOGRAPHY.microLabel.weight,
            letterSpacing: MYTAB_TYPOGRAPHY.microLabel.tracking,
            textTransform: MYTAB_TYPOGRAPHY.microLabel.transform,
            color: MYTAB_COLORS.inkSubtle,
            padding: "0 16px",
            marginBottom: "12px",
          }}
        >
          To
        </div>
        <div
          style={{
            display: "flex",
            gap: "16px",
            padding: "0 16px 4px",
            overflowX: "auto",
          }}
        >
          {eligibleMembers.map((member) => (
            <ParticipantChip
              key={member.userId}
              userId={member.userId}
              displayName={member.displayName}
              tint={chipTints.get(member.userId)}
              selected={member.userId === recipientUserId}
              onSelect={() => setRecipientUserId(member.userId)}
            />
          ))}
        </div>

        <div style={{ textAlign: "center", margin: "38px 0 24px" }}>
          <div
            data-mytab-amount
            aria-label={formatThbMinorForA11y(amountThbMinor)}
            style={{
              fontSize: MYTAB_TYPOGRAPHY.amountHero.size,
              fontWeight: MYTAB_TYPOGRAPHY.amountHero.weight,
              letterSpacing: MYTAB_TYPOGRAPHY.amountHero.tracking,
              fontVariantNumeric: "tabular-nums",
              fontFeatureSettings: '"tnum"',
              whiteSpace: "nowrap",
            }}
          >
            {amountLabel}
          </div>
          {recipient ? (
            <div
              style={{
                marginTop: "8px",
                fontSize: MYTAB_TYPOGRAPHY.meta.size,
                color: MYTAB_COLORS.inkMuted,
              }}
            >
              to {recipient.displayName}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            padding: "0 16px",
            marginBottom: "30px",
          }}
        >
          {TIP_PRESET_WHOLE_BAHT.map((wholeBaht) => {
            const presetMinor = thbMinorFromWholeBaht(wholeBaht);
            const selected = !customMode && amountThbMinor === presetMinor;
            return (
              <button
                key={wholeBaht}
                type="button"
                onClick={() => selectPreset(wholeBaht)}
                style={presetChipStyle(selected)}
              >
                ฿{wholeBaht}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setCustomMode(true)}
            style={presetChipStyle(customMode)}
          >
            Custom
          </button>
        </div>

        {customMode ? (
          <div style={{ padding: "0 16px", marginBottom: "16px" }}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Enter amount"
              value={customInput}
              onChange={(event) => setCustomInput(event.target.value)}
              onBlur={applyCustomAmount}
              aria-invalid={customInvalid}
              aria-describedby={customInvalid ? "tip-custom-amount-error" : undefined}
              style={{
                width: "100%",
                minHeight: "44px",
                boxSizing: "border-box",
                border: `1px solid ${customInvalid ? MYTAB_COLORS.owed : MYTAB_COLORS.border}`,
                borderRadius: MYTAB_RADIUS.sm,
                padding: "14px 16px",
                fontSize: MYTAB_TYPOGRAPHY.body.size,
              }}
            />
            {customInvalid ? (
              <p
                id="tip-custom-amount-error"
                style={{
                  margin: "6px 0 0",
                  fontSize: MYTAB_TYPOGRAPHY.meta.size,
                  color: MYTAB_COLORS.owed,
                }}
              >
                {TIP_COPY.invalidAmount}
              </p>
            ) : null}
          </div>
        ) : null}

        <div style={{ padding: "0 16px" }}>
          <input
            type="text"
            placeholder="Say something nice…"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: MYTAB_COLORS.surface,
              border: `1px solid ${MYTAB_COLORS.border}`,
              borderRadius: MYTAB_RADIUS.sm,
              padding: "14px 16px",
              fontSize: MYTAB_TYPOGRAPHY.body.size,
              color: note ? MYTAB_COLORS.ink : MYTAB_COLORS.inkMuted,
            }}
          />
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginTop: "12px",
            }}
          >
            {TIP_REACTIONS.map((glyph) => {
              const selected = reaction === glyph;
              return (
                <button
                  key={glyph}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setReaction(selected ? null : glyph)}
                  style={{
                    flex: 1,
                    minHeight: "44px",
                    fontSize: "20px",
                    borderRadius: MYTAB_RADIUS.full,
                    background: selected ? MYTAB_COLORS.tipSoft : MYTAB_COLORS.surface,
                    border: `1px solid ${selected ? MYTAB_COLORS.tip : MYTAB_COLORS.border}`,
                    cursor: "pointer",
                  }}
                >
                  {glyph}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "0 16px", marginTop: "26px" }}>
          <div
            style={{
              background: MYTAB_COLORS.surface,
              border: `1px solid ${MYTAB_COLORS.border}`,
              borderRadius: MYTAB_RADIUS.md,
              boxShadow: MYTAB_ELEVATION.cardShadow,
              padding: "16px 18px",
            }}
          >
            <div style={{ fontSize: MYTAB_TYPOGRAPHY.body.size, fontWeight: 500 }}>
              Paying with USDC
            </div>
            <div
              style={{
                marginTop: "3px",
                fontSize: MYTAB_TYPOGRAPHY.meta.size,
                color: MYTAB_COLORS.inkMuted,
              }}
            >
              {recipient ? `${recipient.displayName} receives USDC` : "Recipient receives USDC"}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: MYTAB_COLORS.surface,
          borderTop: `1px solid ${MYTAB_COLORS.border}`,
          padding: "14px 16px 22px",
        }}
      >
        {sendFailed ? (
          <p
            role="alert"
            style={{
              margin: "0 0 10px",
              fontSize: MYTAB_TYPOGRAPHY.body.size,
              fontWeight: 500,
              color: MYTAB_COLORS.ink,
            }}
          >
            {TIP_COPY.sendFailed}
          </p>
        ) : null}
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          style={{
            width: "100%",
            minHeight: "52px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "9px",
            borderRadius: MYTAB_RADIUS.sm,
            border: "none",
            background: MYTAB_COLORS.primary,
            color: "#fff",
            fontSize: "16px",
            fontWeight: 600,
            boxShadow: MYTAB_ELEVATION.buttonInset,
            cursor: canSubmit ? "pointer" : "not-allowed",
            opacity: canSubmit ? 1 : 0.5,
          }}
        >
          <span aria-hidden style={{ color: "#F1CBB2" }}>
            ↑
          </span>
          Send tip
        </button>
        {blockedReason ? (
          <p
            style={{
              margin: "8px 0 0",
              textAlign: "center",
              fontSize: MYTAB_TYPOGRAPHY.meta.size,
              color: MYTAB_COLORS.inkMuted,
            }}
          >
            {blockedReason}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function presetChipStyle(selected: boolean): React.CSSProperties {
  return {
    flex: 1,
    minHeight: "44px",
    borderRadius: MYTAB_RADIUS.full,
    fontSize: "14px",
    fontWeight: 600,
    background: selected ? MYTAB_COLORS.primarySoft : MYTAB_COLORS.surface,
    color: selected ? MYTAB_COLORS.primary : MYTAB_COLORS.ink,
    border: `1px solid ${selected ? MYTAB_COLORS.primary : MYTAB_COLORS.border}`,
    cursor: "pointer",
  };
}
