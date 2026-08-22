import { MYTAB_COLORS } from "@/lib/theme/tokens";

/** Mirror of convex settlement statuses — kept in domain for purity (Story 7.4). */
export const SETTLEMENT_STATUS = {
  CREATED: "created",
  QUOTING: "quoting",
  READY_FOR_SIGNATURE: "ready_for_signature",
  USER_SIGNED: "user_signed",
  SUBMITTED: "submitted",
  UNKNOWN: "unknown",
  CONFIRMED: "confirmed",
  FAILED: "failed",
  EXPIRED: "expired",
  SUPERSEDED: "superseded",
} as const;

export type SettlementStatus =
  (typeof SETTLEMENT_STATUS)[keyof typeof SETTLEMENT_STATUS];

/** Six visually distinct payment states for lists (Story 7.4 AC1). */
export type PaymentDisplayState =
  | "quoted"
  | "awaiting_signature"
  | "submitted"
  | "confirmed"
  | "failed"
  | "expired";

export type PaymentStatePresentation = {
  state: PaymentDisplayState;
  label: string;
  glyph: string;
  color: string;
  background: string;
};

/**
 * Plain **named** causes, keyed by the server's stable failure code.
 *
 * This is the one map. The settlement stepper (`lib/settlement/stepperCopy.ts`)
 * re-exports `describeSettlementFailure` from here rather than keeping a second
 * copy: the Payment Progress stepper and a payment row in a list are two
 * renderings of the same failure and must never word it differently. They did —
 * the same `QUOTE_EXPIRED` read "Quote expired. Refresh it." on one surface and
 * "The quote expired. Refresh and try again." on the other.
 *
 * It lives in `lib/domain` because that is the pure layer both surfaces may
 * depend on; the stepper additionally knows about intent status, which domain
 * does not.
 */
const FAILURE_CAUSE: Record<string, string> = {
  QUOTE_EXPIRED: "Quote expired. Refresh it.",
  CONFIRMATION_REJECTED: "The network didn't confirm this payment.",
  TARGET_ALREADY_SETTLED: "This one was already settled.",
  INVALID_INTENT_STATUS: "This payment is no longer valid. Start again from the tab.",
  MESSAGE_HASH_MISMATCH: "The payment details changed. Start again from the tab.",
};

/**
 * The fallback for a code this build has never seen — still a named cause, never
 * "Something went wrong". EXPERIENCE requires the cause be named, and "the
 * payment didn't go through" IS the cause when nothing more specific is known
 * (POLISH-SPEC §4.3, "Failed — unknown cause").
 */
export const DEFAULT_FAILURE_CAUSE = "This payment didn't go through.";

/** Plain named cause from a stable code — never a raw provider error. */
export function describeSettlementFailure(failureCode?: string | null): string {
  if (!failureCode) {
    return DEFAULT_FAILURE_CAUSE;
  }
  return FAILURE_CAUSE[failureCode] ?? DEFAULT_FAILURE_CAUSE;
}

export function mapSettlementStatusToDisplay(
  status: SettlementStatus,
): PaymentDisplayState {
  switch (status) {
    case SETTLEMENT_STATUS.CREATED:
    case SETTLEMENT_STATUS.QUOTING:
      return "quoted";
    case SETTLEMENT_STATUS.READY_FOR_SIGNATURE:
    case SETTLEMENT_STATUS.USER_SIGNED:
      return "awaiting_signature";
    case SETTLEMENT_STATUS.SUBMITTED:
    case SETTLEMENT_STATUS.UNKNOWN:
      return "submitted";
    case SETTLEMENT_STATUS.CONFIRMED:
      return "confirmed";
    case SETTLEMENT_STATUS.FAILED:
      return "failed";
    case SETTLEMENT_STATUS.EXPIRED:
    case SETTLEMENT_STATUS.SUPERSEDED:
      return "expired";
    default:
      return "quoted";
  }
}

export function getPaymentStatePresentation(
  state: PaymentDisplayState,
): PaymentStatePresentation {
  switch (state) {
    case "quoted":
      return {
        state,
        label: "Quoted",
        glyph: "◎",
        color: MYTAB_COLORS.inkMuted,
        background: MYTAB_COLORS.sunk,
      };
    case "awaiting_signature":
      return {
        state,
        label: "Awaiting signature",
        glyph: "✎",
        color: MYTAB_COLORS.primary,
        background: MYTAB_COLORS.primarySoft,
      };
    case "submitted":
      return {
        state,
        label: "Submitted",
        glyph: "↗",
        color: MYTAB_COLORS.warning,
        background: MYTAB_COLORS.warningSoft,
      };
    case "confirmed":
      return {
        state,
        label: "Confirmed",
        glyph: "✓",
        color: MYTAB_COLORS.settled,
        background: MYTAB_COLORS.settledSoft,
      };
    case "failed":
      return {
        state,
        label: "Failed",
        glyph: "✕",
        color: MYTAB_COLORS.owed,
        background: MYTAB_COLORS.owedSoft,
      };
    case "expired":
      return {
        state,
        label: "Expired",
        glyph: "◷",
        color: MYTAB_COLORS.inkMuted,
        background: MYTAB_COLORS.sunk,
      };
  }
}

/**
 * Plain failure copy from a stable code — never raw provider errors, and never a
 * generic (Story 7.4 AC4; EXPERIENCE, *Failure and Recovery*).
 *
 * An alias of `describeSettlementFailure`, kept under the name the payment-state
 * surfaces already import, so the two can never drift apart again.
 */
export function formatPaymentFailureMessage(failureCode?: string | null): string {
  return describeSettlementFailure(failureCode);
}

/** Submitted payments must not reduce displayed debt (Story 7.4 AC2). */
export function countsTowardConfirmedBalance(status: SettlementStatus): boolean {
  return status === SETTLEMENT_STATUS.CONFIRMED;
}
