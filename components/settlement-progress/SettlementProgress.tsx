"use client";

import { useEffect, useRef, useState } from "react";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type SettlementProgressRow = {
  id: string;
  participantName: string;
  amountLabel: string;
  status: "open" | "submitted" | "settled";
  isCurrentUser?: boolean;
};

export type SettlementProgressProps = {
  rows: SettlementProgressRow[];
  settledCount: number;
  totalCount: number;
  recentlyConfirmedRowId?: string | null;
  reduceMotion?: boolean;
  onSuccessHaptic?: () => void;
};

const SETTLE_ANIMATION_MS = 400;

/*
 * Ring geometry. 56px outer, a 44px hole, so the band is 6px and the stroke is
 * centred on r = (56 − 6) / 2 = 25. `stroke-dasharray` walks that circumference
 * exactly once, which is why the ring can be drawn with two <circle>s and no
 * gradient at all — DESIGN.md allows exactly one gradient in the system (the
 * all-square wash) and this is not it.
 */
const RING_SIZE = 56;
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Per-person settlement progress — a ring, a count, and one row per share
 * (Story 6.7).
 *
 * Not a claim board: nothing here is claimable. It used to be exported under
 * that name from `features/settlement/`, colliding with the real Claim Board in
 * `features/claims/` (POLISH-SPEC §6.2).
 */
export function SettlementProgress({
  rows,
  settledCount,
  totalCount,
  recentlyConfirmedRowId,
  reduceMotion = false,
  onSuccessHaptic,
}: SettlementProgressProps) {
  const [animatingRowId, setAnimatingRowId] = useState<string | null>(null);
  const hapticFiredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!recentlyConfirmedRowId || reduceMotion) {
      return;
    }

    setAnimatingRowId(recentlyConfirmedRowId);

    if (hapticFiredRef.current !== recentlyConfirmedRowId) {
      onSuccessHaptic?.();
      hapticFiredRef.current = recentlyConfirmedRowId;
    }

    const timer = window.setTimeout(() => {
      setAnimatingRowId(null);
    }, SETTLE_ANIMATION_MS);

    return () => window.clearTimeout(timer);
  }, [recentlyConfirmedRowId, reduceMotion, onSuccessHaptic]);

  const ringProgress = totalCount > 0 ? Math.min(1, Math.max(0, settledCount / totalCount)) : 0;

  return (
    <section aria-label="Settlement progress">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        <svg
          aria-hidden
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          style={{ flex: "none", display: "block" }}
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={MYTAB_COLORS.border}
            strokeWidth={RING_STROKE}
          />
          {ringProgress > 0 ? (
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={MYTAB_COLORS.settled}
              strokeWidth={RING_STROKE}
              strokeLinecap="butt"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - ringProgress)}
              // Twelve o'clock is where a progress ring starts.
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          ) : null}
        </svg>
        <p
          className="mytab-type-meta"
          style={{ margin: 0 }}
          aria-live="polite"
          aria-atomic="true"
        >
          {settledCount} of {totalCount} settled
        </p>
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "10px" }}>
        {rows.map((row) => {
          const settled = row.status === "settled";
          const animating = animatingRowId === row.id && !reduceMotion;

          return (
            <li
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderRadius: MYTAB_RADIUS.sm,
                background: MYTAB_COLORS.surface,
                border: `1px solid ${MYTAB_COLORS.border}`,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  className="mytab-row__label"
                  style={{ fontWeight: 600, color: MYTAB_COLORS.ink }}
                >
                  {row.participantName}
                </div>
                <div
                  className="mytab-tabular"
                  data-mytab-amount
                  style={{
                    marginTop: "4px",
                    fontSize: MYTAB_TYPOGRAPHY.meta.size,
                    color: MYTAB_COLORS.inkMuted,
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.amountLabel}
                </div>
              </div>
              <span
                aria-label={settled ? "Settled" : row.status === "submitted" ? "Sending" : "Open"}
                style={{
                  flex: "none",
                  width: "24px",
                  height: "24px",
                  borderRadius: MYTAB_RADIUS.full,
                  border: settled
                    ? "none"
                    : `2px solid ${row.status === "submitted" ? MYTAB_COLORS.primary : MYTAB_COLORS.border}`,
                  background: settled ? MYTAB_COLORS.settled : "transparent",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: "14px",
                  transition: reduceMotion ? "none" : `background ${SETTLE_ANIMATION_MS}ms ease`,
                  transform: animating ? "scale(1.08)" : "scale(1)",
                }}
              >
                {settled ? "✓" : row.status === "submitted" ? "…" : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
