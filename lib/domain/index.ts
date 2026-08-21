export {
  DomainError,
  DomainErrorCode,
  type DomainErrorCode as DomainErrorCodeType,
} from "./errors";

export {
  assertIntegerNumber,
  assertInt64Range,
  addCryptoAtomic,
  addFiatMinor,
  cryptoAtomicFromBigint,
  divFiatMinor,
  fiatMinorFromInteger,
  mulCryptoAtomicByInt,
  mulFiatMinor,
  mulFiatMinorByInt,
  subCryptoAtomic,
  subFiatMinor,
  type CryptoAtomic,
  type FiatMinor,
} from "./money";

export {
  parseThbStringToMinor,
  rejectFloatAmount,
  thbMinorFromInteger,
  thbMinorFromWholeBaht,
} from "./parse";

export { formatFiatMinorThb } from "./format";

export {
  USDC_DECIMALS,
  assertValidDecimals,
  cryptoAmountFromAtomicString,
  deserializeCryptoAmount,
  formatCryptoAmountDisplay,
  parseAtomicStringToBigint,
  serializeCryptoAmount,
  usdcAmountFromAtomicString,
  type CryptoAmount,
  type SerializedCryptoAmount,
} from "./crypto";

export {
  MAX_BILL_TOTAL_MINOR,
  MAX_PERCENTAGE_BPS,
  MAX_TIP_MINOR,
  MIN_PERCENTAGE_BPS,
  MIN_POSITIVE_AMOUNT_MINOR,
  MIN_TIP_MINOR,
  THB_MINOR_FACTOR,
  THB_MINOR_SCALE,
  applyPercentageBpsToMinor,
  assertBillTotalMinor,
  assertChainedFiatAdjustmentDoesNotOverflow,
  assertNonNegativeFiatMinor,
  assertNonZeroRecipients,
  assertPercentageBps,
  assertPositiveDenominator,
  assertPositiveFiatMinor,
  assertTipMinor,
} from "./bounds";
