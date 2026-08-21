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

const FAILURE_COPY: Record<string, string> = {
  INVALID_INTENT_STATUS: "This payment is no longer valid. Start again from the tab.",
  MESSAGE_HASH_MISMATCH: "The payment details changed. Try again from the tab.",
  CONFIRMATION_REJECTED: "The network did not confirm this payment. Try again.",
  TARGET_ALREADY_SETTLED: "This was already settled. Refresh the tab.",
  QUOTE_EXPIRED: "The quote expired. Refresh and try again.",
};

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

/** Plain failure copy from stable code — never raw provider errors (Story 7.4 AC4). */
export function formatPaymentFailureMessage(failureCode?: string | null): string {
  if (!failureCode) {
    return "Something went wrong. Try again from the tab.";
  }
  return FAILURE_COPY[failureCode] ?? "Something went wrong. Try again from the tab.";
}

/** Submitted payments must not reduce displayed debt (Story 7.4 AC2). */
export function countsTowardConfirmedBalance(status: SettlementStatus): boolean {
  return status === SETTLEMENT_STATUS.CONFIRMED;
}
