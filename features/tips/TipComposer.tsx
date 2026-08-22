"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/primitives/empty-state";
import { NoticeBar } from "@/components/primitives/notice-bar";
import { ParticipantChip } from "@/components/primitives/participant-chip";
import { STATE_COPY } from "@/components/primitives/state-copy";
import {
  assertTipMinor,
  formatFiatMinorThb,
  MAX_TIP_MINOR,
  MIN_TIP_MINOR,
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
  /** §4.3 — the custom amount is not a number at all. */
  invalidAmount: "Enter an amount above ฿0.",
  /**
   * The two bounds are separate states with separate causes, so they get
   * separate sentences. Both quote the real limit rather than rounding it —
   * numbers are never rounded and never blanked (§4.0 rule 3).
   */
  amountTooSmall: `The smallest tip is ${formatFiatMinorThb(MIN_TIP_MINOR as FiatMinor)}.`,
  amountTooLarge: `The largest tip is ${formatFiatMinorThb(MAX_TIP_MINOR as FiatMinor)}.`,
  /** §4.3 — send fails. */
  sendFailed: "Couldn't send the tip. Try again.",
  /** The label the primary takes while a tip is in flight. */
  sending: "Sending…",
  send: "Send tip",
  /**
   * Why a person in the row cannot be picked. Shown on the chip itself, because
   * a friend who is simply absent from the row reads as a bug.
   */
  reasonNotReady: "Hasn't opened My Tab yet",
  reasonNotInGroup: "Not in this group any more",
  reasonRestricted: "Can't receive tips right now",
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

/** What makes one tip a different tip from another. */
export function composeTipSignature(parts: {
  recipientUserId: string;
  amountThbMinor: FiatMinor;
  note: string;
  reaction: string | null;
}): string {
  return [
    parts.recipientUserId,
    String(parts.amountThbMinor),
    parts.note.trim(),
    parts.reaction ?? "",
  ].join("|");
}

export type TipIdempotency = { composition: string; key: string };

/**
 * One tip, one key.
 *
 * The composer used to call `createIdempotencyKey()` inside its submit handler,
 * so every press minted a NEW key and the server's idempotency could not tell a
 * double-tap from two deliberate tips — the guard was decorative. Pinning the
 * key to the composition makes a retry of the same tip collapse server-side,
 * while changing the recipient, the amount, the note or the reaction is a
 * different tip and correctly earns a new key.
 */
export function nextIdempotency(
  current: TipIdempotency | null,
  composition: string,
  mint: () => string = createIdempotencyKey,
): TipIdempotency {
  if (current && current.composition === composition) {
    return current;
  }
  return { composition, key: mint() };
}

/**
 * Why this person cannot receive a tip, or `null` if they can.
 *
 * Membership is checked before readiness: someone who has left the group is not
 * "waiting to open My Tab", and telling them so would be a lie about which door
 * is shut.
 */
function ineligibleReason(member: TipComposerMember): string | null {
  if (member.membershipStatus === "left" || member.membershipStatus === "kicked") {
    return TIP_COPY.reasonNotInGroup;
  }
  if (member.membershipStatus === "restricted") {
    return TIP_COPY.reasonRestricted;
  }
  if (!member.walletReady) {
    return TIP_COPY.reasonNotReady;
  }
  return null;
}

/** Tip composer — pick person, amount, optional note (Story 3.1, POLISH-SPEC §1.11). */
export function TipComposer({
  members,
  viewerUserId,
  preselectedRecipientUserId,
  onSubmit,
  sendFailed = false,
  offline = false,
  inTelegram = true,
}: TipComposerProps) {
  /*
   * The roster is everyone except the viewer — you do not tip yourself, which
   * is a different fact from being ineligible and is the only silent filter
   * here. Everyone else stays in the row; the ones who cannot be picked are
   * rendered disabled with the reason beneath their name (§1.11).
   */
  const { eligibleMembers, ineligibleMembers } = useMemo(() => {
    const roster = members.filter((member) => member.userId !== viewerUserId);
    return {
      eligibleMembers: roster.filter((member) => ineligibleReason(member) === null),
      ineligibleMembers: roster.filter((member) => ineligibleReason(member) !== null),
    };
  }, [members, viewerUserId]);

  // The chip row is a set of people rendered together, so the tints are allocated
  // for the set rather than hashed per id (§2.6). Ineligible faces are in the set:
  // they are on screen, so they must not collide with anyone else's colour.
  const chipTints = useMemo(
    () =>
      avatarTintsForGroup([
        ...eligibleMembers.map((member) => member.userId),
        ...ineligibleMembers.map((member) => member.userId),
      ]),
    [eligibleMembers, ineligibleMembers],
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
  const [amountError, setAmountError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const blockedReason = !inTelegram
    ? TIP_COPY.outsideTelegram
    : offline
      ? TIP_COPY.needsConnection
      : undefined;

  const recipient = eligibleMembers.find((member) => member.userId === recipientUserId);
  const amountLabel = formatFiatMinorThb(amountThbMinor);
  const canSubmit =
    Boolean(recipient) && amountThbMinor > 0 && blockedReason === undefined && !submitting;

  const composition = composeTipSignature({ recipientUserId, amountThbMinor, note, reaction });
  const idempotencyRef = useRef<TipIdempotency | null>(null);

  // A failure re-arms the action; the copy above it already names the next step.
  useEffect(() => {
    if (sendFailed) {
      setSubmitting(false);
    }
  }, [sendFailed]);

  function selectPreset(wholeBaht: number) {
    setCustomMode(false);
    setAmountError(null);
    setAmountThbMinor(thbMinorFromWholeBaht(wholeBaht));
  }

  /**
   * Three ways a typed amount can be wrong, three sentences.
   *
   * This used to be a bare `catch {}` around `parseThbStringToMinor` +
   * `assertTipMinor`, which meant "abc", "฿0.50" and "฿1,000,000" all failed
   * identically and silently. The hero still holds its last value throughout —
   * a figure is never blanked (§4.0 rule 3) — but the reason is now on screen.
   */
  function applyCustomAmount() {
    if (customInput.trim() === "") {
      setAmountError(null);
      return;
    }

    let parsed: FiatMinor;
    try {
      parsed = parseThbStringToMinor(customInput);
    } catch {
      setAmountError(TIP_COPY.invalidAmount);
      return;
    }

    if (parsed <= 0) {
      setAmountError(TIP_COPY.invalidAmount);
      return;
    }
    if (parsed < MIN_TIP_MINOR) {
      setAmountError(TIP_COPY.amountTooSmall);
      return;
    }
    if (parsed > MAX_TIP_MINOR) {
      setAmountError(TIP_COPY.amountTooLarge);
      return;
    }

    // Belt and braces: the bounds above are the copy, this is the invariant.
    try {
      assertTipMinor(parsed);
    } catch {
      setAmountError(TIP_COPY.invalidAmount);
      return;
    }

    setAmountThbMinor(parsed);
    setAmountError(null);
    setCustomMode(false);
  }

  function handleSubmit() {
    if (!recipient || !canSubmit) {
      return;
    }

    // Second press of the same tip reuses the key; `submitting` has already
    // taken the button out of reach, and this is the belt to that brace.
    idempotencyRef.current = nextIdempotency(idempotencyRef.current, composition);

    setSubmitting(true);
    const amountAtomic = thbMinorToUsdcAtomicFixture(amountThbMinor);
    onSubmit?.({
      recipientUserId: recipient.userId,
      amountThbMinor,
      amountAtomic,
      note: note.trim() || undefined,
      reaction: reaction ?? undefined,
      idempotencyKey: idempotencyRef.current.key,
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
          id="tip-recipient-label"
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
          role="group"
          aria-labelledby="tip-recipient-label"
          style={{
            display: "flex",
            alignItems: "flex-start",
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
          {/* Never hidden — same rule as the token chip: shown, disabled, reason visible. */}
          {ineligibleMembers.map((member) => (
            <ParticipantChip
              key={member.userId}
              userId={member.userId}
              displayName={member.displayName}
              tint={chipTints.get(member.userId)}
              disabled
              reason={ineligibleReason(member) ?? undefined}
            />
          ))}
        </div>

        <div style={{ textAlign: "center", margin: "38px 0 24px" }}>
          <div
            data-mytab-amount
            aria-label={formatThbMinorForA11y(amountThbMinor)}
            style={{
              // Amounts never truncate, and this one has to hold at 320px.
              fontSize: "clamp(32px, 10.8vw, 42px)",
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
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: MYTAB_TYPOGRAPHY.meta.size,
                color: MYTAB_COLORS.inkMuted,
              }}
            >
              to {recipient.displayName}
            </div>
          ) : null}
        </div>

        {/*
          Five chips on one line at 320px, each at or above the 44px floor.
          `flex: 1` with an `auto` basis sized them by their own text, which
          left the two shortest presets at 39.6px — under the floor — while
          "Custom" took the slack. A 44px basis makes the floor the starting
          point, and `wrap` is what stops the row running off the screen when
          the platform text setting doubles every label.
        */}
        <div
          className="mytab-chip-row"
          style={{ padding: "0 16px", marginBottom: "30px" }}
        >
          {TIP_PRESET_WHOLE_BAHT.map((wholeBaht) => {
            const presetMinor = thbMinorFromWholeBaht(wholeBaht);
            const selected = !customMode && amountThbMinor === presetMinor;
            return (
              <button
                key={wholeBaht}
                type="button"
                aria-pressed={selected}
                onClick={() => selectPreset(wholeBaht)}
                style={presetChipStyle(selected)}
              >
                <span className="mytab-tabular">฿{wholeBaht}</span>
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={customMode}
            aria-expanded={customMode}
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
              aria-label="Custom tip amount"
              value={customInput}
              onChange={(event) => setCustomInput(event.target.value)}
              onBlur={applyCustomAmount}
              aria-invalid={amountError !== null}
              aria-describedby={amountError ? "tip-custom-amount-error" : undefined}
              style={{
                width: "100%",
                minHeight: "44px",
                boxSizing: "border-box",
                border: `1px solid ${amountError ? MYTAB_COLORS.owed : MYTAB_COLORS.border}`,
                borderRadius: MYTAB_RADIUS.sm,
                padding: "14px 16px",
                fontSize: MYTAB_TYPOGRAPHY.body.size,
              }}
            />
            {amountError ? (
              <p
                id="tip-custom-amount-error"
                role="alert"
                className="mytab-tabular"
                style={{
                  margin: "6px 0 0",
                  fontSize: MYTAB_TYPOGRAPHY.meta.size,
                  color: MYTAB_COLORS.owed,
                }}
              >
                {amountError}
              </p>
            ) : null}
          </div>
        ) : null}

        <div style={{ padding: "0 16px" }}>
          <input
            type="text"
            placeholder="Say something nice…"
            aria-label="Note"
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
          {/* Six chips, each at the 44px floor — see `.mytab-chip-row`. */}
          <div className="mytab-chip-row" style={{ marginTop: "12px" }}>
            {TIP_REACTIONS.map((glyph) => {
              const selected = reaction === glyph;
              return (
                <button
                  key={glyph}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setReaction(selected ? null : glyph)}
                  style={{
                    flex: "1 1 44px",
                    minWidth: "44px",
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
          {/* A statement, not a control: there is one payment asset for tips, so
              the artboard's chevron had nowhere to go and is not rendered (§1.11). */}
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
          // Above the tab bar, never behind it. `AppShell`'s own footer uses the
          // same measured variable; this bar is hand-rolled and has to say so
          // itself.
          bottom: "var(--tab-bar-height, 0px)",
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
          aria-busy={submitting}
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
            color: MYTAB_COLORS.surface,
            fontSize: "16px",
            fontWeight: 600,
            boxShadow: MYTAB_ELEVATION.buttonInset,
            cursor: canSubmit ? "pointer" : "not-allowed",
            opacity: canSubmit ? 1 : 0.5,
          }}
        >
          {submitting ? null : <SendTipGlyph />}
          {submitting ? TIP_COPY.sending : TIP_COPY.send}
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

/**
 * The one warm note on the primary.
 *
 * The artboard strokes this arrow `#F1CBB2`, a value in no palette. Rather than
 * mint a `tip-on-primary` token for a single decorative glyph, it is restroked
 * in `colors/tip-soft` — the token that already exists for terracotta-on-light
 * and reads as the same warm note against `colors/primary` (POLISH-SPEC §8
 * item 5, second option).
 */
function SendTipGlyph() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke={MYTAB_COLORS.tipSoft}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      style={{ flex: "none" }}
    >
      <path d="M12 20V8M12 8l-4 4M12 8l4 4" />
      <circle cx="12" cy="4" r="1.6" />
    </svg>
  );
}

function presetChipStyle(selected: boolean): React.CSSProperties {
  return {
    /*
     * Basis 44px, and no `min-width` override — `min-width: auto` on a flex
     * item is its content minimum, so "Custom" claims the width its label
     * actually needs and the four presets share what is left, all of them at or
     * above the floor. Pinning `min-width: 44px` here instead made every chip
     * an equal 51.2px at 320 and clipped "Custom" by 9px.
     */
    flex: "1 1 44px",
    minHeight: "44px",
    /*
     * A flex item's automatic minimum size is its CONTENT minimum — but only
     * while its overflow is visible. Chrome's UA stylesheet clips buttons, so
     * without this every preset shrank to an equal share and "Custom" lost 9px
     * of its label at 320px.
     */
    overflow: "visible",
    borderRadius: MYTAB_RADIUS.full,
    fontSize: "14px",
    fontWeight: 600,
    background: selected ? MYTAB_COLORS.primarySoft : MYTAB_COLORS.surface,
    color: selected ? MYTAB_COLORS.primary : MYTAB_COLORS.ink,
    border: `1px solid ${selected ? MYTAB_COLORS.primary : MYTAB_COLORS.border}`,
    cursor: "pointer",
  };
}
