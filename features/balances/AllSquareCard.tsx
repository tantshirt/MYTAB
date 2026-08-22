"use client";

import { useMemo } from "react";
import { formatAmountLabelForA11y } from "@/lib/domain/a11yAmount";
import { avatarTintsForGroup, MYTAB_COLORS, MYTAB_RADIUS } from "@/lib/theme/tokens";

export type AllSquareMember = { userId: string; displayName: string };

export type AllSquareCardProps = {
  billName: string;
  /**
   * The bill total, already formatted — e.g. "฿1,840.00". Optional: a bill
   * whose total the caller does not hold renders the name alone. An absent
   * figure is a different thing from a truncated one, and only the first is
   * allowed here.
   */
  amountLabel?: string;
  /** The "5 of 5 settled" row. Counts come from `balances.billCompletion`. */
  settledCount: number;
  totalCount: number;
  members: AllSquareMember[];
  onDismiss: () => void;
  /**
   * Posts the completion card to the group through the bot (§1.10). Optional
   * because the surface that mounts this card may have no way to post — and a
   * visible button that does nothing is worse than an absent one, so when it is
   * absent `Done` is promoted to the primary rather than sitting under a dead
   * `Share to group`.
   */
  onShare?: () => void;
  reduceMotion?: boolean;
};

export const ALL_SQUARE_COPY = {
  headline: "All square",
  closing: "Your group tab. Settled.",
  share: "Share to group",
  dismiss: "Done",
  /** "5 of 5 settled" — a count of shares on ONE bill, never a group net position. */
  settledCount: (settled: number, total: number) => `${settled} of ${total} settled`,
} as const;

const SEEN_KEY_PREFIX = "mytab.allsquare.";
/** The pre-POLISH-SPEC key, still read so an in-flight session is not replayed. */
const LEGACY_SEEN_KEY_PREFIX = "mytab-all-square-seen:";

function readStore(store: "localStorage" | "sessionStorage"): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    // Safari in Lockdown Mode and private windows throw on ACCESS, not on use.
    return window[store];
  } catch {
    return null;
  }
}

/**
 * Marks a bill as having had its completion moment (EXPERIENCE, `all-square-card`).
 *
 * Written to `localStorage` FIRST, because "never replayed on revisit" is a
 * promise that has to outlive the tab. `sessionStorage` is written too so that
 * a browser which refuses durable storage still cannot replay the card inside
 * the session that saw it (POLISH-SPEC §5.3, *Guard*).
 */
export function markAllSquareSeen(billId: string): void {
  const key = `${SEEN_KEY_PREFIX}${billId}`;
  try {
    readStore("localStorage")?.setItem(key, "1");
  } catch {
    // Quota or a storage-blocking browser. The session guard below still holds.
  }
  try {
    readStore("sessionStorage")?.setItem(key, "1");
  } catch {
    // Nothing durable is available; the in-memory transition guard is the floor.
  }
}

export function hasSeenAllSquare(billId: string): boolean {
  const key = `${SEEN_KEY_PREFIX}${billId}`;
  try {
    if (readStore("localStorage")?.getItem(key) === "1") {
      return true;
    }
    const session = readStore("sessionStorage");
    return (
      session?.getItem(key) === "1" ||
      session?.getItem(`${LEGACY_SEEN_KEY_PREFIX}${billId}`) === "1"
    );
  } catch {
    return false;
  }
}

/** The stagger, in ms, in reading order (POLISH-SPEC §5.3). */
const RISE_DELAY = {
  ring: 0,
  headline: 80,
  billLine: 140,
  settled: 200,
  avatars: 260,
  closing: 320,
} as const;

const WASH_CSS = `
@keyframes mytab-allsquare-wash {
  from { opacity: 0; transform: translateY(-12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes mytab-allsquare-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes mytab-allsquare-draw {
  from { stroke-dashoffset: 34; }
  to { stroke-dashoffset: 0; }
}
`;

/**
 * The completion moment — sanctioned animation #3, and the only gradient in the
 * product (DESIGN.md; POLISH-SPEC §1.10, §5.3).
 *
 * It is a full-bleed overlay rather than a card in the scroll: it is a moment,
 * not a row, and it is deliberately given no route so that it cannot be
 * replayed by navigating to it (§1.0).
 *
 * Two numbers disagree in the binding documents. DESIGN.md's `all-square-card`
 * line says the wash covers "the top 40%"; POLISH-SPEC §1.10 and §5.3 and the
 * approved artboard all say 46% and supply the exact three stops. 46% wins here
 * because it is the only place the gradient is specified precisely enough to
 * build — DESIGN.md's sentence also names `colors/tip` as the top stop, which
 * is demonstrably not what the artboard paints.
 *
 * Focus is NOT taken on mount. The Accessibility Floor puts focus order in
 * reading order and this card's actions are last in it; the headline block is a
 * polite live region instead, so the moment is announced without stealing the
 * caret from whatever the person was already doing.
 */
export function AllSquareCard({
  billName,
  amountLabel,
  settledCount,
  totalCount,
  members,
  onDismiss,
  onShare,
  reduceMotion = false,
}: AllSquareCardProps) {
  // The whole cast in one stack, so the set-aware allocator: no two faces here
  // share a tint (§2.6; DESIGN.md "a row of five reads as one family").
  const tints = useMemo(
    () => avatarTintsForGroup(members.map((member) => member.userId)),
    [members],
  );

  const rise = (delay: number) =>
    reduceMotion
      ? undefined
      : `mytab-allsquare-rise 420ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms both`;

  const visible = members.slice(0, 5);
  const overflow = members.length - visible.length;

  return (
    <section
      aria-label={`${ALL_SQUARE_COPY.headline} — ${billName}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        background: MYTAB_COLORS.paper,
        color: MYTAB_COLORS.ink,
        overflow: "hidden",
      }}
    >
      <style>{WASH_CSS}</style>

      {/*
       * Reduce Motion keeps the wash and drops only the washing-IN. EXPERIENCE
       * is explicit: "The all-square card still appears; it simply does not wash
       * in." A gradient is styling, not motion.
       */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          insetInline: 0,
          height: "46%",
          background: `linear-gradient(180deg, ${MYTAB_COLORS.tipWashTop} 0%, ${MYTAB_COLORS.tipWashMid} 45%, ${MYTAB_COLORS.paper} 100%)`,
          pointerEvents: "none",
          animation: reduceMotion
            ? undefined
            : "mytab-allsquare-wash 600ms cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      />

      <div
        role="status"
        style={{
          position: "relative",
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 32px",
          textAlign: "center",
          minHeight: 0,
        }}
      >
        <div
          aria-hidden
          style={{
            width: "84px",
            height: "84px",
            borderRadius: MYTAB_RADIUS.full,
            background: MYTAB_COLORS.surface,
            border: `2px solid ${MYTAB_COLORS.tip}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "28px",
            flexShrink: 0,
            animation: rise(RISE_DELAY.ring),
          }}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke={MYTAB_COLORS.tip}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
          >
            <path
              d="M20 6L9 17l-5-5"
              strokeDasharray="34"
              style={{
                strokeDashoffset: 0,
                animation: reduceMotion
                  ? undefined
                  : "mytab-allsquare-draw 480ms 220ms cubic-bezier(0.16, 1, 0.3, 1) both",
              }}
            />
          </svg>
        </div>

        {/*
         * "All square" is a state, not a figure. It carries no tabular slot and
         * no `data-mytab-amount`; only the bill total below does.
         */}
        <h2
          className="mytab-type-amount-hero"
          style={{ margin: 0, lineHeight: 1.05, animation: rise(RISE_DELAY.headline) }}
        >
          {ALL_SQUARE_COPY.headline}
        </h2>

        <p
          className="mytab-type-body"
          style={{
            margin: "12px 0 0",
            color: MYTAB_COLORS.inkMuted,
            animation: rise(RISE_DELAY.billLine),
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{billName}</span>
          {amountLabel ? (
            <>
              {" · "}
              <span
                className="mytab-tabular"
                data-mytab-amount
                aria-label={formatAmountLabelForA11y(amountLabel)}
                style={{ whiteSpace: "nowrap" }}
              >
                {amountLabel}
              </span>
            </>
          ) : null}
        </p>

        <p
          style={{
            display: "flex",
            alignItems: "center",
            gap: "9px",
            margin: "22px 0 0",
            fontSize: "15px",
            fontWeight: 600,
            color: MYTAB_COLORS.settled,
            animation: rise(RISE_DELAY.settled),
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            focusable="false"
            style={{ flex: "none" }}
          >
            <circle cx="12" cy="12" r="9" stroke={MYTAB_COLORS.border} strokeWidth={3} />
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke={MYTAB_COLORS.settled}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray="56.5"
              strokeDashoffset={0}
              transform="rotate(-90 12 12)"
            />
          </svg>
          <span className="mytab-tabular" style={{ whiteSpace: "nowrap" }}>
            {ALL_SQUARE_COPY.settledCount(settledCount, totalCount)}
          </span>
        </p>

        {/* Guarded: an empty cast used to render 24px of dead space (§1.10). */}
        {visible.length > 0 ? (
          <div
            role="group"
            aria-label="Everyone on this bill"
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: "34px",
              animation: rise(RISE_DELAY.avatars),
            }}
          >
            {visible.map((member, index) => (
              <span
                key={member.userId}
                aria-label={member.displayName}
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: MYTAB_RADIUS.full,
                  background: tints.get(member.userId),
                  color: MYTAB_COLORS.surface,
                  fontSize: "14px",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `3px solid ${MYTAB_COLORS.paper}`,
                  boxSizing: "border-box",
                  flex: "none",
                  marginLeft: index > 0 ? "-10px" : 0,
                }}
              >
                {member.displayName.trim().charAt(0).toUpperCase() || "?"}
              </span>
            ))}
            {overflow > 0 ? (
              <span
                aria-label={`and ${overflow} more`}
                className="mytab-tabular"
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: MYTAB_RADIUS.full,
                  background: MYTAB_COLORS.sunk,
                  color: MYTAB_COLORS.inkMuted,
                  fontSize: "13px",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `3px solid ${MYTAB_COLORS.paper}`,
                  boxSizing: "border-box",
                  flex: "none",
                  marginLeft: "-10px",
                }}
              >
                +{overflow}
              </span>
            ) : null}
          </div>
        ) : null}

        <p
          style={{
            margin: "32px 0 0",
            fontSize: "16px",
            fontWeight: 500,
            letterSpacing: "-0.005em",
            animation: rise(RISE_DELAY.closing),
          }}
        >
          {ALL_SQUARE_COPY.closing}
        </p>
      </div>

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          padding: "0 20px calc(28px + env(safe-area-inset-bottom, 0px))",
          flexShrink: 0,
        }}
      >
        {onShare ? (
          <button
            type="button"
            onClick={onShare}
            style={{
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
              boxShadow: "inset 0 -1px 0 rgba(10,32,56,0.24)",
              cursor: "pointer",
            }}
          >
            <ShareGlyph />
            {ALL_SQUARE_COPY.share}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onDismiss}
          style={
            onShare
              ? {
                  minHeight: "44px",
                  border: "none",
                  background: "transparent",
                  fontSize: "15px",
                  fontWeight: 500,
                  color: MYTAB_COLORS.inkMuted,
                  cursor: "pointer",
                }
              : {
                  minHeight: "52px",
                  borderRadius: MYTAB_RADIUS.sm,
                  border: "none",
                  background: MYTAB_COLORS.primary,
                  color: MYTAB_COLORS.surface,
                  fontSize: "16px",
                  fontWeight: 600,
                  boxShadow: "inset 0 -1px 0 rgba(10,32,56,0.24)",
                  cursor: "pointer",
                }
          }
        >
          {ALL_SQUARE_COPY.dismiss}
        </button>
      </div>
    </section>
  );
}

/** Tray with an arrow leaving it — the artboard's share mark. */
function ShareGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      style={{ flex: "none" }}
    >
      <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
      <path d="M12 15V3M12 3L8 7M12 3l4 4" />
    </svg>
  );
}
