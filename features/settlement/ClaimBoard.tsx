"use client";

import { useEffect, useRef, useState } from "react";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type ClaimBoardRow = {
  id: string;
  participantName: string;
  amountLabel: string;
  status: "open" | "submitted" | "settled";
  isCurrentUser?: boolean;
};

export type ClaimBoardProps = {
  rows: ClaimBoardRow[];
  settledCount: number;
  totalCount: number;
  recentlyConfirmedRowId?: string | null;
  reduceMotion?: boolean;
  onSuccessHaptic?: () => void;
};

const SETTLE_ANIMATION_MS = 400;

/** Claim board with in-place settlement and progress ring (Story 6.7). */
export function ClaimBoard({
  rows,
  settledCount,
  totalCount,
  recentlyConfirmedRowId,
  reduceMotion = false,
  onSuccessHaptic,
}: ClaimBoardProps) {
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

  const ringProgress = totalCount > 0 ? settledCount / totalCount : 0;

  return (
    <section aria-label="Claim board">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        <div
          aria-hidden
          style={{
            width: "56px",
            height: "56px",
            borderRadius: MYTAB_RADIUS.full,
            background: `conic-gradient(${MYTAB_COLORS.settled} ${ringProgress * 360}deg, ${MYTAB_COLORS.border} 0deg)`,
            display: "grid",
            placeItems: "center",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: MYTAB_RADIUS.full,
              background: MYTAB_COLORS.paper,
            }}
          />
        </div>
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
