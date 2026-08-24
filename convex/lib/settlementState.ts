/** Persisted settlement intent status machine (AD-21). */

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

const TERMINAL: ReadonlySet<SettlementStatus> = new Set([
  SETTLEMENT_STATUS.CONFIRMED,
  SETTLEMENT_STATUS.FAILED,
  SETTLEMENT_STATUS.EXPIRED,
  SETTLEMENT_STATUS.SUPERSEDED,
]);

const ALLOWED = new Map<SettlementStatus, ReadonlySet<SettlementStatus>>([
    [
      SETTLEMENT_STATUS.CREATED,
      new Set([SETTLEMENT_STATUS.QUOTING, SETTLEMENT_STATUS.SUPERSEDED]),
    ],
    [
      SETTLEMENT_STATUS.QUOTING,
      new Set([
        SETTLEMENT_STATUS.READY_FOR_SIGNATURE,
        SETTLEMENT_STATUS.FAILED,
        SETTLEMENT_STATUS.EXPIRED,
        SETTLEMENT_STATUS.SUPERSEDED,
      ]),
    ],
    [
      SETTLEMENT_STATUS.READY_FOR_SIGNATURE,
      new Set([
        SETTLEMENT_STATUS.USER_SIGNED,
        SETTLEMENT_STATUS.EXPIRED,
        SETTLEMENT_STATUS.SUPERSEDED,
      ]),
    ],
    [
      SETTLEMENT_STATUS.USER_SIGNED,
      new Set([SETTLEMENT_STATUS.SUBMITTED, SETTLEMENT_STATUS.FAILED]),
    ],
    [
      SETTLEMENT_STATUS.SUBMITTED,
      new Set([
        SETTLEMENT_STATUS.UNKNOWN,
        SETTLEMENT_STATUS.CONFIRMED,
        SETTLEMENT_STATUS.FAILED,
      ]),
    ],
    [
      SETTLEMENT_STATUS.UNKNOWN,
      new Set([SETTLEMENT_STATUS.CONFIRMED, SETTLEMENT_STATUS.FAILED]),
    ],
  ]);

export function isTerminalSettlementStatus(status: SettlementStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransitionSettlementStatus(
  from: SettlementStatus,
  to: SettlementStatus,
): boolean {
  if (from === to) {
    return true;
  }
  if (TERMINAL.has(from)) {
    return false;
  }
  return ALLOWED.get(from)?.has(to) ?? false;
}

export function assertSettlementTransition(
  from: SettlementStatus,
  to: SettlementStatus,
): void {
  if (!canTransitionSettlementStatus(from, to)) {
    throw new SettlementStateError("INVALID_STATUS_TRANSITION", { from, to });
  }
}

export class SettlementStateError extends Error {
  constructor(
    public readonly code: string,
    public readonly details?: Record<string, string>,
  ) {
    super(code);
    this.name = "SettlementStateError";
  }
}

export const SETTLEMENT_FAILURE = {
  INVALID_STATUS: "INVALID_INTENT_STATUS",
  INVALID_TRANSITION: "INVALID_STATUS_TRANSITION",
  MESSAGE_HASH_MISMATCH: "MESSAGE_HASH_MISMATCH",
  DUPLICATE_USER_SIGNATURE: "DUPLICATE_USER_SIGNATURE",
  DUPLICATE_TRANSACTION_SIGNATURE: "DUPLICATE_TRANSACTION_SIGNATURE",
  CONFIRMATION_REJECTED: "CONFIRMATION_REJECTED",
  TARGET_ALREADY_SETTLED: "TARGET_ALREADY_SETTLED",
} as const;
