import { DomainError, DomainErrorCode } from "./errors";
import { assertIntegerNumber, fiatMinorFromInteger, type FiatMinor } from "./money";
import { parseCurrencyAmount } from "./currency";

const THB_MINOR_FACTOR = 100;

export function parseThbStringToMinor(input: string): FiatMinor {
  return parseCurrencyAmount(input, "THB");
}

export function thbMinorFromInteger(minorUnits: number): FiatMinor {
  return fiatMinorFromInteger(minorUnits);
}

export function thbMinorFromWholeBaht(wholeBaht: number): FiatMinor {
  assertIntegerNumber(wholeBaht, "thbMinorFromWholeBaht");
  return fiatMinorFromInteger(wholeBaht * THB_MINOR_FACTOR);
}

export function rejectFloatAmount(value: number, context: string): never {
  if (!Number.isInteger(value)) {
    throw new DomainError(
      DomainErrorCode.NON_INTEGER_NUMBER,
      `${context}: JavaScript float amounts are not allowed`,
    );
  }
  throw new DomainError(
    DomainErrorCode.INVALID_MONEY_FORMAT,
    `${context}: unsupported amount representation`,
  );
}
