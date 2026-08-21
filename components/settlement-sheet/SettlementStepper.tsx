"use client";

import type { SettlementStatus } from "@/convex/lib/settlementState";
import { buildSettlementStepperStages } from "@/lib/settlement/stepperCopy";
import { MYTAB_COLORS, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "@/lib/theme/tokens";

export type SettlementStepperProps = {
  status: SettlementStatus;
  recipientName: string;
  failureMessage?: string | null;
};

/** Server-driven four-step progress indicator (Story 3.7 AC5). */
export function SettlementStepper({
  status,
  recipientName,
  failureMessage,
}: SettlementStepperProps) {
  const stages = buildSettlementStepperStages({ status, recipientName, failureMessage });

  return (
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
      {stages.map((stage) => (
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
              background: stage.complete
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
                color: MYTAB_COLORS.ink,
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
  );
}
