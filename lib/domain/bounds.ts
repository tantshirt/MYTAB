import { DomainError, DomainErrorCode } from "./errors";
import {
  addFiatMinor,
  assertIntegerNumber,
  fiatMinorFromInteger,
  type FiatMinor,
} from "./money";

export const THB_MINOR_SCALE = 2;
export const THB_MINOR_FACTOR = 100;

/** THB 10,000,000.00 expressed in satang. */
export const MAX_BILL_TOTAL_MINOR = 1_000_000_000;

/** Bill and line totals must be strictly positive. */
export const MIN_POSITIVE_AMOUNT_MINOR = 1;

/** THB 1.00 expressed in satang. */
export const MIN_TIP_MINOR = 100;

/** THB 100,000.00 expressed in satang. */
export const MAX_TIP_MINOR = 10_000_000;

export const MIN_PERCENTAGE_BPS = 0;
export const MAX_PERCENTAGE_BPS = 10_000;

export function assertNonNegativeFiatMinor(
  amountMinor: FiatMinor,
  context: string,
): void {
  if (amountMinor < 0) {
    throw new DomainError(
      DomainErrorCode.NEGATIVE_NOT_ALLOWED,
      `${context}: amount must not be negative`,
    );
  }
}

export function assertPositiveFiatMinor(
  amountMinor: FiatMinor,
  context: string,
): void {
  if (amountMinor <= 0) {
    throw new DomainError(
      DomainErrorCode.OUT_OF_BOUNDS,
      `${context}: amount must be greater than zero`,
    );
  }
}

export function assertBillTotalMinor(amountMinor: FiatMinor): void {
  assertPositiveFiatMinor(amountMinor, "assertBillTotalMinor");
  if (amountMinor > MAX_BILL_TOTAL_MINOR) {
    throw new DomainError(
      DomainErrorCode.OUT_OF_BOUNDS,
      `assertBillTotalMinor: amount exceeds maximum bill total of ${MAX_BILL_TOTAL_MINOR} satang`,
    );
  }
}

export function assertTipMinor(amountMinor: FiatMinor): void {
  assertNonNegativeFiatMinor(amountMinor, "assertTipMinor");
  if (amountMinor < MIN_TIP_MINOR || amountMinor > MAX_TIP_MINOR) {
    throw new DomainError(
      DomainErrorCode.OUT_OF_BOUNDS,
      `assertTipMinor: tip must be between ${MIN_TIP_MINOR} and ${MAX_TIP_MINOR} satang`,
    );
  }
}

export function assertPercentageBps(basisPoints: number): void {
  assertIntegerNumber(basisPoints, "assertPercentageBps");
  if (basisPoints < MIN_PERCENTAGE_BPS || basisPoints > MAX_PERCENTAGE_BPS) {
    throw new DomainError(
      DomainErrorCode.PERCENTAGE_OUT_OF_BOUNDS,
      `assertPercentageBps: basis points must be between ${MIN_PERCENTAGE_BPS} and ${MAX_PERCENTAGE_BPS}`,
    );
  }
}

export function assertPositiveDenominator(denominator: number, context: string): void {
  assertIntegerNumber(denominator, context);
  if (denominator <= 0) {
    throw new DomainError(
      DomainErrorCode.ZERO_DENOMINATOR,
      `${context}: denominator must be greater than zero`,
    );
  }
}

export function assertNonZeroRecipients(recipientCount: number): void {
  assertIntegerNumber(recipientCount, "assertNonZeroRecipients");
  if (recipientCount <= 0) {
    throw new DomainError(
      DomainErrorCode.ZERO_RECIPIENTS,
      "assertNonZeroRecipients: at least one recipient is required",
    );
  }
}

export function applyPercentageBpsToMinor(
  baseMinor: FiatMinor,
  basisPoints: number,
): FiatMinor {
  assertPercentageBps(basisPoints);
  const product = BigInt(baseMinor) * BigInt(basisPoints);
  const result = product / 10000n;
  return fiatMinorFromInteger(Number(result));
}

export function assertChainedFiatAdjustmentDoesNotOverflow(
  amountsMinor: readonly FiatMinor[],
): FiatMinor {
  let total = fiatMinorFromInteger(0);
  for (const amountMinor of amountsMinor) {
    total = addFiatMinor(total, amountMinor);
  }
  return total;
}
