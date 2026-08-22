"use client";

import { useEffect, useState } from "react";
import type { SettlementStatus } from "@/convex/lib/settlementState";
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

/** Server-driven four-step progress indicator (Story 3.7 AC5). */
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

  return (
    <>
      {announce ? (
        <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
          {announcement}
        </div>
      ) : null}
      <ol
        aria-label="Payment progress"
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {view.stages.map((stage) => (
          <li
            key={stage.key}
            aria-current={stage.active ? "step" : undefined}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
            }}
          >
            <span
              style={{
                width: "20px",
                height: "20px",
                borderRadius: MYTAB_RADIUS.full,
                flexShrink: 0,
                marginTop: "2px",
                background: stage.failed
                  ? MYTAB_COLORS.owed
                  : stage.complete
                    ? MYTAB_COLORS.settled
                    : stage.active
                      ? MYTAB_COLORS.primary
                      : MYTAB_COLORS.border,
              }}
            />
            <div>
              <div
                style={{
                  fontSize: MYTAB_TYPOGRAPHY.body.size,
                  fontWeight: stage.active || stage.complete ? 600 : 400,
                  color: stage.failed ? MYTAB_COLORS.owed : MYTAB_COLORS.ink,
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
        ))}
      </ol>
    </>
  );
}
