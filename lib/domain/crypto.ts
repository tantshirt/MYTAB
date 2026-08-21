import { DomainError, DomainErrorCode } from "./errors";
import {
  assertIntegerNumber,
  cryptoAtomicFromBigint,
  type CryptoAtomic,
} from "./money";

export const USDC_DECIMALS = 6;

export type CryptoAmount = {
  amountAtomic: CryptoAtomic;
  decimals: number;
};

const ATOMIC_STRING_PATTERN = /^-?\d+$/;

export function assertValidDecimals(decimals: number, context: string): void {
  assertIntegerNumber(decimals, context);
  if (decimals < 0 || decimals > 18) {
    throw new DomainError(
      DomainErrorCode.INVALID_DECIMALS,
      `${context}: decimals must be between 0 and 18`,
    );
  }
}

export function parseAtomicStringToBigint(value: string, context: string): bigint {
  const trimmed = value.trim();
  if (!ATOMIC_STRING_PATTERN.test(trimmed)) {
    throw new DomainError(
      DomainErrorCode.INVALID_MONEY_FORMAT,
      `${context}: atomic amount must be a decimal integer string`,
    );
  }
  return BigInt(trimmed);
}

export function cryptoAmountFromAtomicString(
  amountAtomic: string,
  decimals: number,
): CryptoAmount {
  assertValidDecimals(decimals, "cryptoAmountFromAtomicString");
  const atomicValue = parseAtomicStringToBigint(
    amountAtomic,
    "cryptoAmountFromAtomicString",
  );
  return {
    amountAtomic: cryptoAtomicFromBigint(atomicValue),
    decimals,
  };
}

export function usdcAmountFromAtomicString(amountAtomic: string): CryptoAmount {
  return cryptoAmountFromAtomicString(amountAtomic, USDC_DECIMALS);
}

export type SerializedCryptoAmount = {
  amountAtomic: string;
  decimals: number;
};

export function serializeCryptoAmount(amount: CryptoAmount): SerializedCryptoAmount {
  return {
    amountAtomic: amount.amountAtomic.toString(),
    decimals: amount.decimals,
  };
}

export function deserializeCryptoAmount(
  payload: SerializedCryptoAmount,
): CryptoAmount {
  return cryptoAmountFromAtomicString(payload.amountAtomic, payload.decimals);
}

export function formatCryptoAmountDisplay(amount: CryptoAmount): string {
  assertValidDecimals(amount.decimals, "formatCryptoAmountDisplay");
  const negative = amount.amountAtomic < 0n;
  const absolute = negative ? -amount.amountAtomic : amount.amountAtomic;
  const scale = BigInt(10) ** BigInt(amount.decimals);
  const whole = absolute / scale;
  const fraction = absolute % scale;
  const fractionText = fraction.toString().padStart(amount.decimals, "0");
  const sign = negative ? "-" : "";
  return `${sign}${whole.toString()}.${fractionText}`;
}
