import { DomainError, DomainErrorCode } from "./errors";
import { assertIntegerNumber, fiatMinorFromInteger, type FiatMinor } from "./money";

const THB_MINOR_SCALE = 2;
const THB_MINOR_FACTOR = 100;

const THB_STRING_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;

export function parseThbStringToMinor(input: string): FiatMinor {
  const trimmed = input.trim();
  if (!THB_STRING_PATTERN.test(trimmed)) {
    throw new DomainError(
      DomainErrorCode.INVALID_MONEY_FORMAT,
      `parseThbStringToMinor: invalid THB amount string "${input}"`,
    );
  }

  const isNegative = trimmed.startsWith("-");
  const unsigned = isNegative ? trimmed.slice(1) : trimmed;
  const [wholePart = "0", fractionalPart = ""] = unsigned.split(".");

  if (fractionalPart.length > THB_MINOR_SCALE) {
    throw new DomainError(
      DomainErrorCode.INVALID_MONEY_FORMAT,
      `parseThbStringToMinor: at most ${THB_MINOR_SCALE} decimal places allowed`,
    );
  }

  const paddedFraction = fractionalPart.padEnd(THB_MINOR_SCALE, "0");
  const minorDigits = `${wholePart}${paddedFraction}`.replace(/^0+(?=\d)/, "");
  const normalizedDigits = minorDigits === "" ? "0" : minorDigits;
  const signedDigits = isNegative ? `-${normalizedDigits}` : normalizedDigits;

  const value = Number(signedDigits);
  assertIntegerNumber(value, "parseThbStringToMinor");
  return fiatMinorFromInteger(value);
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
