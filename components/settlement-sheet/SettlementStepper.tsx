"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/primitives/use-reduced-motion";
import { SETTLEMENT_STATUS, type SettlementStatus } from "@/convex/lib/settlementState";
import { buildSettlementProgressView, type SettlementStepKey } from "@/lib/settlement/stepperCopy";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type SettlementStepperProps = {
  status: SettlementStatus;
  recipientName: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  failedAt?: SettlementStepKey;
  billName?: string | null;
  recipientReceivesLabel?: string | null;
  /** Set false when a parent already owns the live region for this transition. */
  announce?: boolean;
};

const SR_ONLY = {
  position: "absolute",
  width: "1px",
  height: "1px",
  margin: "-1px",
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

const DOT_PX = 26;

/**
 * The only looping animation in the product (§5.6), the ring overshoot and the check
 * draw (§5.2). Scoped to this component because `lib/theme` is not this pass's to edit.
 */
const STEPPER_KEYFRAMES = `
@keyframes mytab-stepper-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(30, 81, 210, 0.35); }
  100% { box-shadow: 0 0 0 6px rgba(30, 81, 210, 0); }
}
@keyframes mytab-check-ring {
  from { transform: scale(0.9); }
  to   { transform: scale(1); }
}
@keyframes mytab-check-draw {
  from { stroke-dashoffset: 34; }
  to   { stroke-dashoffset: 0; }
}
`;

/**
 * True for the life of the component once `status` *transitions* into `confirmed`.
 * A surface that mounts already confirmed never draws — §5.2 is a transition, not a state.
 */
function useConfirmationTransition(status: SettlementStatus): boolean {
  const previous = useRef<SettlementStatus>(status);
  const [transitioned, setTransitioned] = useState(false);

  useEffect(() => {
    if (previous.current !== status && status === SETTLEMENT_STATUS.CONFIRMED) {
      setTransitioned(true);
    }
    previous.current = status;
  }, [status]);

  return transitioned;
}

function CheckGlyph({ animate }: { animate: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke={MYTAB_COLORS.surface}
      strokeWidth={3.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5 12.5l4.5 4.5L19 7"
        style={{
          strokeDasharray: 34,
          // Reduce motion renders the check fully drawn; the colour swap is identical.
          strokeDashoffset: animate ? 34 : 0,
          animation: animate ? "mytab-check-draw 400ms cubic-bezier(0.65, 0, 0.35, 1) 140ms both" : undefined,
        }}
      />
    </svg>
  );
}

function CrossGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke={MYTAB_COLORS.surface}
      strokeWidth={3.2}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/**
 * `settlement-stepper` — vertical, four steps, server-driven (DESIGN.md; §1.9).
 *
 * 26px dots with a 2px border and a 2px connector coloured `settled` above the active
 * step and `border` below it. The active dot pulses, because a flat dot next to
 * "Sending to Maya" reads as frozen; that is suppressed entirely under reduce-motion.
 */
export function SettlementStepper({
  status,
  recipientName,
  failureCode,
  failureMessage,
  failedAt,
  billName,
  recipientReceivesLabel,
  announce = true,
}: SettlementStepperProps) {
  const reduceMotion = useReducedMotion();
  const confirmedNow = useConfirmationTransition(status);

  const view = buildSettlementProgressView({
    status,
    recipientName,
    failureCode,
    failureMessage,
    failedAt,
    billName,
    recipientReceivesLabel,
  });

  // The live region starts empty and is filled after mount, so every transition —
  // and only a transition — is announced, exactly once. The confirmation is the
  // single most important announcement in the product.
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (!announce) return;
    setAnnouncement(view.announcement);
  }, [announce, view.announcement]);

  const drawCheck = confirmedNow && !reduceMotion;

  return (
    <>
      {reduceMotion ? null : <style>{STEPPER_KEYFRAMES}</style>}
      {announce ? (
        <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
          {announcement}
        </div>
      ) : null}
      <ol
        aria-label="Payment progress"
        style={{ listStyle: "none", margin: 0, padding: 0 }}
      >
        {view.stages.map((stage, index) => {
          const last = index === view.stages.length - 1;
          const background = stage.failed
            ? MYTAB_COLORS.owed
            : stage.complete
              ? MYTAB_COLORS.settled
              : stage.active
                ? reduceMotion
                  ? MYTAB_COLORS.primary
                  : MYTAB_COLORS.surface
                : MYTAB_COLORS.paper;
          const borderColor = stage.failed
            ? MYTAB_COLORS.owed
            : stage.complete
              ? MYTAB_COLORS.settled
              : stage.active
                ? MYTAB_COLORS.primary
                : MYTAB_COLORS.border;
          // Above the active step the line is settled money; below it, nothing yet.
          const connectorColor = stage.complete ? MYTAB_COLORS.settled : MYTAB_COLORS.border;

          return (
            <li
              key={stage.key}
              aria-current={stage.active ? "step" : undefined}
              style={{
                display: "flex",
                alignItems: "stretch",
                gap: "12px",
                paddingBottom: last ? 0 : "22px",
              }}
            >
              <span
                aria-hidden="true"
                style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none" }}
              >
                <span
                  style={{
                    width: `${DOT_PX}px`,
                    height: `${DOT_PX}px`,
                    borderRadius: MYTAB_RADIUS.full,
                    border: `2px solid ${borderColor}`,
                    background,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxSizing: "border-box",
                    animation:
                      stage.active && !reduceMotion
                        ? "mytab-stepper-pulse 1400ms ease-in-out infinite"
                        : stage.complete && stage.key === "confirm" && drawCheck
                          ? "mytab-check-ring 260ms cubic-bezier(0.34, 1.4, 0.64, 1) both"
                          : undefined,
                  }}
                >
                  {stage.failed ? <CrossGlyph /> : null}
                  {stage.complete ? (
                    <CheckGlyph animate={stage.key === "confirm" && drawCheck} />
                  ) : null}
                </span>
                {last ? null : (
                  <span
                    style={{
                      width: "2px",
                      flex: 1,
                      minHeight: "18px",
                      background: connectorColor,
                    }}
                  />
                )}
              </span>
              <div style={{ minWidth: 0, paddingTop: "2px" }}>
                <div
                  style={{
                    fontSize: MYTAB_TYPOGRAPHY.body.size,
                    fontWeight: stage.active || stage.complete ? 600 : 400,
                    // Only the confirmation swaps to settled, and instantly — the colour
                    // is the information, the drawing is the flourish (§5.2).
                    color: stage.failed
                      ? MYTAB_COLORS.owed
                      : stage.complete && stage.key === "confirm"
                        ? MYTAB_COLORS.settled
                        : MYTAB_COLORS.ink,
                  }}
                >
                  {stage.label}
                </div>
                {stage.detail ? (
                  <div
                    style={{
                      marginTop: "4px",
                      fontSize: MYTAB_TYPOGRAPHY.meta.size,
                      color: MYTAB_COLORS.inkMuted,
                    }}
                  >
                    {stage.detail}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
