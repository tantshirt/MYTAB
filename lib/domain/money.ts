import { DomainError, DomainErrorCode } from "./errors";

export type FiatMinor = number & { readonly __fiatMinorBrand: unique symbol };
export type CryptoAtomic = bigint & { readonly __cryptoAtomicBrand: unique symbol };

const INT64_MIN = -9223372036854775808n;
const INT64_MAX = 9223372036854775807n;

export function assertIntegerNumber(value: number, context: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new DomainError(
      DomainErrorCode.NON_INTEGER_NUMBER,
      `${context}: expected an integer number, got ${value}`,
    );
  }
}

export function assertInt64Range(value: number, context = "fiatMinor"): void {
  const asBigInt = BigInt(value);
  if (asBigInt < INT64_MIN || asBigInt > INT64_MAX) {
    throw new DomainError(
      DomainErrorCode.FIAT_OVERFLOW,
      `${context}: value ${value} is outside signed int64 range`,
    );
  }
}

export function fiatMinorFromInteger(value: number): FiatMinor {
  assertIntegerNumber(value, "fiatMinorFromInteger");
  assertInt64Range(value);
  return value as FiatMinor;
}

export function cryptoAtomicFromBigint(value: bigint): CryptoAtomic {
  return value as CryptoAtomic;
}

function toCheckedBigInt(value: FiatMinor, context: string): bigint {
  assertIntegerNumber(value, context);
  assertInt64Range(value, context);
  return BigInt(value);
}

function fromCheckedBigInt(value: bigint, context: string): FiatMinor {
  if (value < INT64_MIN || value > INT64_MAX) {
    throw new DomainError(
      DomainErrorCode.FIAT_OVERFLOW,
      `${context}: result ${value.toString()} overflows signed int64`,
    );
  }
  return Number(value) as FiatMinor;
}

export function addFiatMinor(aMinor: FiatMinor, bMinor: FiatMinor): FiatMinor {
  const result = toCheckedBigInt(aMinor, "addFiatMinor") + toCheckedBigInt(bMinor, "addFiatMinor");
  return fromCheckedBigInt(result, "addFiatMinor");
}

export function subFiatMinor(aMinor: FiatMinor, bMinor: FiatMinor): FiatMinor {
  const result = toCheckedBigInt(aMinor, "subFiatMinor") - toCheckedBigInt(bMinor, "subFiatMinor");
  return fromCheckedBigInt(result, "subFiatMinor");
}

export function mulFiatMinor(aMinor: FiatMinor, bMinor: FiatMinor): FiatMinor {
  const result = toCheckedBigInt(aMinor, "mulFiatMinor") * toCheckedBigInt(bMinor, "mulFiatMinor");
  return fromCheckedBigInt(result, "mulFiatMinor");
}

export function mulFiatMinorByInt(aMinor: FiatMinor, multiplier: number): FiatMinor {
  assertIntegerNumber(multiplier, "mulFiatMinorByInt");
  const result = toCheckedBigInt(aMinor, "mulFiatMinorByInt") * BigInt(multiplier);
  return fromCheckedBigInt(result, "mulFiatMinorByInt");
}

export function divFiatMinor(aMinor: FiatMinor, divisor: number): FiatMinor {
  assertIntegerNumber(divisor, "divFiatMinor");
  if (divisor === 0) {
    throw new DomainError(
      DomainErrorCode.ZERO_DENOMINATOR,
      "divFiatMinor: divisor must be greater than zero",
    );
  }
  const result = toCheckedBigInt(aMinor, "divFiatMinor") / BigInt(divisor);
  return fromCheckedBigInt(result, "divFiatMinor");
}

export function addCryptoAtomic(
  aAtomic: CryptoAtomic,
  bAtomic: CryptoAtomic,
): CryptoAtomic {
  return (aAtomic + bAtomic) as CryptoAtomic;
}

export function subCryptoAtomic(
  aAtomic: CryptoAtomic,
  bAtomic: CryptoAtomic,
): CryptoAtomic {
  return (aAtomic - bAtomic) as CryptoAtomic;
}

export function mulCryptoAtomicByInt(
  amountAtomic: CryptoAtomic,
  multiplier: number,
): CryptoAtomic {
  assertIntegerNumber(multiplier, "mulCryptoAtomicByInt");
  return (amountAtomic * BigInt(multiplier)) as CryptoAtomic;
}
