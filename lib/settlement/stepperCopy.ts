import { SETTLEMENT_STATUS, type SettlementStatus } from "@/convex/lib/settlementState";

export type SettlementStepperStage = {
  key: string;
  label: string;
  detail?: string;
  active: boolean;
  complete: boolean;
};

const STEPPER_STAGES = [
  { key: "wallet", statuses: [SETTLEMENT_STATUS.READY_FOR_SIGNATURE] as SettlementStatus[] },
  { key: "verify", statuses: [SETTLEMENT_STATUS.USER_SIGNED] as SettlementStatus[] },
  { key: "send", statuses: [SETTLEMENT_STATUS.SUBMITTED] as SettlementStatus[] },
  { key: "confirm", statuses: [SETTLEMENT_STATUS.CONFIRMED] as SettlementStatus[] },
] as const;

export type StepperCopyInput = {
  status: SettlementStatus;
  recipientName: string;
  failureMessage?: string | null;
};

/** Maps server settlement status to Payment Progress stepper copy (Story 3.7 AC5). */
export function buildSettlementStepperStages(input: StepperCopyInput): SettlementStepperStage[] {
  const { status, recipientName, failureMessage } = input;

  if (status === SETTLEMENT_STATUS.FAILED) {
    return [
      {
        key: "failure",
        label: failureMessage ?? "Something went wrong",
        detail: undefined,
        active: true,
        complete: false,
      },
    ];
  }

  if (status === SETTLEMENT_STATUS.UNKNOWN) {
    return [
      {
        key: "checking",
        label: "Still checking — don't pay again",
        active: true,
        complete: false,
      },
    ];
  }

  const stageIndex = STEPPER_STAGES.findIndex((stage) => stage.statuses.includes(status));
  const resolvedIndex = stageIndex >= 0 ? stageIndex : 0;

  const labels = [
    "Approved in your wallet",
    "Verifying",
    `Sending to ${recipientName}`,
    "Confirmed",
  ];
  const details = [undefined, undefined, "Usually takes a few seconds", undefined];

  return STEPPER_STAGES.map((stage, index) => ({
    key: stage.key,
    label: labels[index]!,
    detail: details[index],
    active: index === resolvedIndex && status !== SETTLEMENT_STATUS.CONFIRMED,
    complete: index < resolvedIndex || status === SETTLEMENT_STATUS.CONFIRMED,
  }));
}
