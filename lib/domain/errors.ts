export const DomainErrorCode = {
  NON_INTEGER_NUMBER: "NON_INTEGER_NUMBER",
  INVALID_MONEY_FORMAT: "INVALID_MONEY_FORMAT",
  FIAT_OVERFLOW: "FIAT_OVERFLOW",
  CRYPTO_OVERFLOW: "CRYPTO_OVERFLOW",
  OUT_OF_BOUNDS: "OUT_OF_BOUNDS",
  NEGATIVE_NOT_ALLOWED: "NEGATIVE_NOT_ALLOWED",
  ZERO_DENOMINATOR: "ZERO_DENOMINATOR",
  ZERO_RECIPIENTS: "ZERO_RECIPIENTS",
  PERCENTAGE_OUT_OF_BOUNDS: "PERCENTAGE_OUT_OF_BOUNDS",
  INVALID_DECIMALS: "INVALID_DECIMALS",
} as const;

export type DomainErrorCode =
  (typeof DomainErrorCode)[keyof typeof DomainErrorCode];

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
