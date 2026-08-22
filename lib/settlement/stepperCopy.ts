import { SETTLEMENT_STATUS, type SettlementStatus } from "@/convex/lib/settlementState";

/** The four forward-only steps. A step never moves backward; a failure replaces one in place. */
export type SettlementStepKey = "wallet" | "verify" | "send" | "confirm";

const STEP_ORDER: readonly SettlementStepKey[] = ["wallet", "verify", "send", "confirm"];

export type SettlementStepperStage = {
  key: SettlementStepKey;
  label: string;
  detail?: string;
  active: boolean;
  complete: boolean;
  failed: boolean;
};

export type SettlementProgressAction = "try_again" | "back_to_tab" | "back_to_sheet";

export type SettlementProgressView = {
  status: SettlementStatus;
  /**
   * Which surface the state belongs on (EXPERIENCE, "Settlement Status, in Human Terms").
   * `sheet` means Payment Progress must route back — this surface has nothing true to show.
   */
  surface: "progress" | "sheet";
  heading: string;
  stages: SettlementStepperStage[];
  footnote?: string;
  actions: readonly SettlementProgressAction[];
  /** Announced once per transition by the stepper's live region. */
  announcement: string;
};

export type StepperCopyInput = {
  status: SettlementStatus;
  recipientName: string;
  /** Stable failure code from the server. Preferred over `failureMessage`. */
  failureCode?: string | null;
  /** Pre-resolved plain-language cause. Overrides `failureCode` when present. */
  failureMessage?: string | null;
  /** Step the failure happened on. Derived from `failureCode` when omitted. */
  failedAt?: SettlementStepKey;
  /** Bill name for the confirmed foot-note, e.g. "Sukhumvit Dinner". */
  billName?: string | null;
  /** What the recipient received, e.g. "8.25 USDC" — the step 4 note. */
  recipientReceivesLabel?: string | null;
};

/**
 * Plain named causes for Payment Progress (POLISH-SPEC §4.3).
 * Never a generic: EXPERIENCE requires the cause be named.
 */
const FAILURE_CAUSE: Record<string, string> = {
  QUOTE_EXPIRED: "Quote expired. Refresh it.",
  CONFIRMATION_REJECTED: "The network didn't confirm this payment.",
  TARGET_ALREADY_SETTLED: "This one was already settled.",
  INVALID_INTENT_STATUS: "This payment is no longer valid. Start again from the tab.",
  MESSAGE_HASH_MISMATCH: "The payment details changed. Start again from the tab.",
};

const FAILURE_STEP: Record<string, SettlementStepKey> = {
  QUOTE_EXPIRED: "wallet",
  INVALID_INTENT_STATUS: "verify",
  MESSAGE_HASH_MISMATCH: "verify",
  CONFIRMATION_REJECTED: "send",
  TARGET_ALREADY_SETTLED: "send",
};

/** POLISH-SPEC §4.3, "Failed — unknown cause". */
export const DEFAULT_FAILURE_CAUSE = "This payment didn't go through.";

export function describeSettlementFailure(failureCode?: string | null): string {
  if (!failureCode) return DEFAULT_FAILURE_CAUSE;
  return FAILURE_CAUSE[failureCode] ?? DEFAULT_FAILURE_CAUSE;
}

const IN_FLIGHT_FOOTNOTE = "You can close this — we'll update the tab either way.";
const UNKNOWN_FOOTNOTE = "Still checking — don't pay again.";
const FAILED_FOOTNOTE = "Nothing left your wallet. Your share is unchanged.";

function stepLabels(recipientName: string): Record<SettlementStepKey, string> {
  return {
    wallet: "Approved in your wallet",
    verify: "Verifying",
    send: `Sending to ${recipientName}`,
    confirm: "Confirmed",
  };
}

const ACTIVE_DETAIL: Record<SettlementStepKey, string | undefined> = {
  wallet: "Waiting for you to approve",
  verify: "Checking the amount and who it goes to",
  send: "Usually takes a few seconds",
  confirm: undefined,
};

type StageOptions = {
  recipientName: string;
  /** Index of the step currently in progress, or null when nothing is in progress yet. */
  activeIndex: number | null;
  /** Every step before this index is complete. */
  completedBefore: number;
  /** Replaces the active step's label in place — used by `unknown` and `failed`. */
  activeLabelOverride?: string;
  /** Replaces the active step's note; `null` clears it. */
  activeDetailOverride?: string | null;
  failed?: boolean;
  recipientReceivesLabel?: string | null;
};

function buildStages(options: StageOptions): SettlementStepperStage[] {
  const labels = stepLabels(options.recipientName);

  return STEP_ORDER.map((key, index) => {
    const isActive = options.activeIndex === index;
    const isComplete = index < options.completedBefore;

    let label = labels[key];
    if (isActive && options.activeLabelOverride) {
      label = options.activeLabelOverride;
    }

    let detail: string | undefined;
    if (isActive) {
      detail =
        options.activeDetailOverride === undefined
          ? ACTIVE_DETAIL[key]
          : (options.activeDetailOverride ?? undefined);
    } else if (isComplete && key === "confirm" && options.recipientReceivesLabel) {
      detail = `${options.recipientName} received ${options.recipientReceivesLabel}`;
    }

    return {
      key,
      label,
      detail,
      active: isActive,
      complete: isComplete,
      failed: isActive && options.failed === true,
    };
  });
}

/**
 * Total mapping of the ten persisted intent states to what a person sees
 * (EXPERIENCE, "Settlement Status, in Human Terms"; POLISH-SPEC §1.9, §4.3).
 *
 * The switch is exhaustive by construction — a new status is a compile error,
 * never a silent fallthrough onto step 1.
 */
export function buildSettlementProgressView(input: StepperCopyInput): SettlementProgressView {
  const {
    status,
    recipientName,
    failureCode,
    failureMessage,
    failedAt,
    billName,
    recipientReceivesLabel,
  } = input;

  switch (status) {
    // The quote is still being put together — this belongs on the Payment Sheet
    // with its action disabled, not on a progress surface.
    case SETTLEMENT_STATUS.CREATED:
    case SETTLEMENT_STATUS.QUOTING:
      return {
        status,
        surface: "sheet",
        heading: "Getting your quote",
        stages: buildStages({ recipientName, activeIndex: null, completedBefore: 0 }),
        actions: ["back_to_sheet"],
        announcement: "Getting your quote",
      };

    case SETTLEMENT_STATUS.READY_FOR_SIGNATURE:
      return {
        status,
        surface: "progress",
        heading: "Sending payment",
        stages: buildStages({ recipientName, activeIndex: 0, completedBefore: 0 }),
        footnote: IN_FLIGHT_FOOTNOTE,
        actions: [],
        announcement: "Waiting for you to approve",
      };

    case SETTLEMENT_STATUS.USER_SIGNED:
      return {
        status,
        surface: "progress",
        heading: "Sending payment",
        stages: buildStages({ recipientName, activeIndex: 1, completedBefore: 1 }),
        footnote: IN_FLIGHT_FOOTNOTE,
        actions: [],
        announcement: "Verifying",
      };

    case SETTLEMENT_STATUS.SUBMITTED:
      return {
        status,
        surface: "progress",
        heading: "Sending payment",
        stages: buildStages({ recipientName, activeIndex: 2, completedBefore: 2 }),
        footnote: IN_FLIGHT_FOOTNOTE,
        actions: [],
        announcement: `Sending to ${recipientName}`,
      };

    // A submission timeout is not a failure. The stepper holds on step 3,
    // forward-only, and no retry is ever offered.
    case SETTLEMENT_STATUS.UNKNOWN:
      return {
        status,
        surface: "progress",
        heading: "Still checking",
        stages: buildStages({
          recipientName,
          activeIndex: 2,
          completedBefore: 2,
          activeLabelOverride: "Still checking",
          activeDetailOverride: null,
        }),
        footnote: UNKNOWN_FOOTNOTE,
        actions: [],
        announcement: UNKNOWN_FOOTNOTE,
      };

    case SETTLEMENT_STATUS.CONFIRMED: {
      const footnote = billName
        ? `Your share of ${billName} is settled.`
        : "Your share is settled.";
      return {
        status,
        surface: "progress",
        heading: "Confirmed",
        stages: buildStages({
          recipientName,
          activeIndex: null,
          completedBefore: STEP_ORDER.length,
          recipientReceivesLabel,
        }),
        footnote,
        actions: ["back_to_tab"],
        announcement: `Confirmed. ${footnote}`,
      };
    }

    case SETTLEMENT_STATUS.FAILED: {
      const cause = failureMessage ?? describeSettlementFailure(failureCode);
      const stepKey = failedAt ?? (failureCode ? (FAILURE_STEP[failureCode] ?? "send") : "send");
      const failedIndex = STEP_ORDER.indexOf(stepKey);
      const alreadySettled = failureCode === "TARGET_ALREADY_SETTLED";

      return {
        status,
        surface: "progress",
        heading: "Payment did not go through",
        stages: buildStages({
          recipientName,
          activeIndex: failedIndex,
          completedBefore: failedIndex,
          activeLabelOverride: cause,
          activeDetailOverride: null,
          failed: true,
        }),
        footnote: FAILED_FOOTNOTE,
        actions: alreadySettled ? ["back_to_tab"] : ["try_again", "back_to_tab"],
        announcement: `${cause} ${FAILED_FOOTNOTE}`,
      };
    }

    // Nothing was ever approved; the person belongs back on the sheet with a fresh quote.
    case SETTLEMENT_STATUS.EXPIRED:
      return {
        status,
        surface: "sheet",
        heading: "Quote expired. Refresh it.",
        stages: buildStages({ recipientName, activeIndex: null, completedBefore: 0 }),
        actions: ["back_to_sheet"],
        announcement: "Quote expired. Refresh it.",
      };

    case SETTLEMENT_STATUS.SUPERSEDED:
      return {
        status,
        surface: "sheet",
        heading: "This bill changed. Refresh to see your new amount.",
        stages: buildStages({ recipientName, activeIndex: null, completedBefore: 0 }),
        actions: ["back_to_tab"],
        announcement: "This bill changed. Refresh to see your new amount.",
      };

    default: {
      const exhaustive: never = status;
      throw new Error(`Unhandled settlement status: ${String(exhaustive)}`);
    }
  }
}

/** Maps server settlement status to Payment Progress stepper copy (Story 3.7 AC5). */
export function buildSettlementStepperStages(input: StepperCopyInput): SettlementStepperStage[] {
  return buildSettlementProgressView(input).stages;
}
