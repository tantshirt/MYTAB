"use client";

import { useEffect, useMemo, useRef } from "react";
import { formatAmountLabelForA11y } from "@/lib/domain/a11yAmount";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";
import { avatarTintsForGroup } from "@/lib/theme/tokens";

export type AllSquareCardProps = {
  billName: string;
  amountLabel: string;
  members: Array<{ userId: string; displayName: string }>;
  onDismiss: () => void;
  reduceMotion?: boolean;
};

const SEEN_KEY_PREFIX = "mytab-all-square-seen:";

/** Marks a bill as having shown the all-square card (Story 7.6 AC1). */
export function markAllSquareSeen(billId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(`${SEEN_KEY_PREFIX}${billId}`, "1");
}

export function hasSeenAllSquare(billId: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.sessionStorage.getItem(`${SEEN_KEY_PREFIX}${billId}`) === "1";
}

/** One-time completion moment — only gradient in the system (Story 7.6). */
export function AllSquareCard({
  billName,
  amountLabel,
  members,
  onDismiss,
  reduceMotion = false,
}: AllSquareCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  // A stack of the whole cast: the set-aware allocator, so no two faces here
  // share a tint (POLISH-SPEC §2.6; DESIGN.md "a row of five reads as one family").
  const tints = useMemo(
    () => avatarTintsForGroup(members.map((member) => member.userId)),
    [members],
  );

  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  return (
    <section
      ref={cardRef}
      tabIndex={-1}
      aria-label={`All square — ${billName}`}
      style={{
        position: "relative",
        borderRadius: MYTAB_RADIUS.lg,
        overflow: "hidden",
        background: MYTAB_COLORS.paper,
        border: `1px solid ${MYTAB_COLORS.border}`,
        padding: "32px 24px",
        textAlign: "center",
      }}
    >
      {!reduceMotion ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            height: "40%",
            background: `linear-gradient(180deg, ${MYTAB_COLORS.tipSoft} 0%, ${MYTAB_COLORS.paper} 100%)`,
            pointerEvents: "none",
          }}
        />
      ) : null}

      <div style={{ position: "relative" }}>
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            margin: "0 auto 16px",
            borderRadius: "999px",
            border: `2px solid ${MYTAB_COLORS.settled}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: MYTAB_COLORS.settled,
            fontSize: "24px",
          }}
        >
          ✓
        </div>

        {/* "All square" is a state, not a figure — it carries no tabular slot. */}
        <p className="mytab-type-amount-hero" style={{ margin: 0, color: MYTAB_COLORS.ink }}>
          All square
        </p>
        <p className="mytab-type-meta" style={{ margin: "8px 0 16px" }}>
          {billName} ·{" "}
          <span
            className="mytab-tabular"
            data-mytab-amount
            aria-label={formatAmountLabelForA11y(amountLabel)}
          >
            {amountLabel}
          </span>
        </p>

        <div
          role="group"
          aria-label="Present members"
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "-8px",
            marginBottom: "24px",
          }}
        >
          {members.map((member, index) => (
            <span
              key={member.userId}
              title={member.displayName}
              aria-label={member.displayName}
              style={{
                width: 32,
                height: 32,
                borderRadius: "999px",
                background: tints.get(member.userId),
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                fontWeight: 600,
                marginLeft: index > 0 ? -8 : 0,
                border: "2px solid #fff",
              }}
            >
              {member.displayName.charAt(0).toUpperCase()}
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          style={{
            minHeight: "52px",
            minWidth: "44px",
            padding: "0 24px",
            borderRadius: MYTAB_RADIUS.sm,
            border: "none",
            background: MYTAB_COLORS.primary,
            color: "#fff",
            fontSize: MYTAB_TYPOGRAPHY.label.size,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Done
        </button>
      </div>
    </section>
  );
}
