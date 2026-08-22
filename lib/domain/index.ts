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

export { formatFiatMinorThb, groupThousands } from "./format";

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
  thbMinorToUsdcAtomicFixture,
  FIXTURE_USDC_ATOMIC_NUMERATOR,
  FIXTURE_USDC_ATOMIC_DENOMINATOR,
  FIXTURE_FX_PROVIDER,
  MANUAL_FX_RATIONAL,
  MANUAL_USD_THB_RATE_TEXT,
} from "./fxFixture";

export {
  FX_DIRECTION,
  FX_FRESHNESS_WEEKDAY_MS,
  FX_FRESHNESS_WEEKEND_MS,
  FX_POLICY_VERSION,
  FX_PROVIDER_FRANKFURTER_BOT,
  FX_PROVIDER_MANUAL,
  FxError,
  FxErrorCode,
  THAI_BANK_HOLIDAYS,
  THAI_BANK_HOLIDAY_COVERAGE,
  addIsoDays,
  assertFxSnapshotFresh,
  buildFxSnapshotFields,
  isFxSnapshotFresh,
  isThaiBankBusinessDay,
  isThaiBankHoliday,
  isWeekend,
  parseIsoDate,
  providerDateToAsOfMs,
  reduceFxRational,
  resolveFreshnessWindowMs,
  thbMinorToUsdcAtomic,
  usdThbRateTextToRational,
  type FxRateQuote,
  type FxRational,
  type FxSnapshotFields,
} from "./fx";

export {
  CANONICAL_ADJUSTMENT_ORDER,
  DEFAULT_PERCENTAGE_BASE,
  ITEM_NAME_MAX_LENGTH,
  ITEM_NAME_MIN_LENGTH,
  ITEM_QUANTITY_MAX,
  ITEM_QUANTITY_MIN,
  assertItemName,
  assertItemQuantity,
  computeBillBreakdown,
  computeItemsSubtotalMinor,
  computeLineTotalMinor,
  type AdjustmentCalculation,
  type AdjustmentKind,
  type BillAdjustmentInput,
  type BillBreakdown,
  type BillItemInput,
  type BillLineBreakdown,
  type ItemSource,
  type PercentageBaseKind,
} from "./bill";

export {
  deriveWithinGroupBalance,
  formatBalanceHeroParts,
  formatBalanceHeroText,
  isBillComplete,
  resolveBalanceHero,
  type BalanceHeroParts,
  type BalanceHeroState,
  type GroupBalanceSummary,
  type LedgerOffset,
  type LedgerOffsetKind,
  type ObligationRecord,
  type UserNetPosition,
} from "./balance";

export {
  compressDebts,
  DEBT_COMPRESSION_DISCLAIMER,
  type CompressedTransfer,
} from "./debtCompression";

export {
  parseExtractedReceipt,
  parseReceiptAmount,
  formatDiscrepancyCopy,
  recomputeReconciliation,
  type ExtractedReceipt,
  type ExtractedReceiptLine,
  type FieldConfidence,
  type ParsedReceipt,
  type ParsedReceiptLine,
  type ReconciliationStatus,
} from "./receiptParse";

export {
  formatThbMinorForA11y,
  formatUsdcAtomicForA11y,
} from "./a11yAmount";

export {
  ACTIVITY_EVENT_TYPE,
  activityIconTint,
  type ActivityEventPayload,
  type ActivityEventType,
} from "./activityTypes";

export {
  countsTowardConfirmedBalance,
  DEFAULT_FAILURE_CAUSE,
  describeSettlementFailure,
  formatPaymentFailureMessage,
  getPaymentStatePresentation,
  mapSettlementStatusToDisplay,
  type PaymentDisplayState,
  type PaymentStatePresentation,
} from "./paymentState";

export {
  ALLOCATION_ORDER_RULE,
  allocateAdjustmentProportional,
  allocateAllAdjustments,
  allocateByMode,
  allocateEqualSplit,
  allocateFullShare,
  allocateLargestRemainder,
  buildParticipantBreakdowns,
  computeBillTotalMinor,
  perHeadDisplayMinor,
  resolveAdjustmentAmountMinor,
  sumShareAmounts,
  verifyLockInvariant,
  type AdjustmentAllocation,
  type AllocationMode,
  type ClaimWeight,
  type LockInvariantResult,
  type ParticipantBreakdown,
  type PersistedShare,
} from "./allocation";

export {
  STALE_REVISION,
  RevisionError,
  assertRevisionMatch,
  nextRevision,
  revisionKey,
} from "./revision";

export {
  buildObligationSnapshots,
  emptyBillTotals,
  type BillLockSnapshotPayload,
  type ObligationSnapshot,
} from "./obligations";

export {
  FIXTURE_PARSED_RECEIPT,
  FIXTURE_SAMPLE_EXTRACTION,
  RECEIPT_FORMAT_FIXTURES,
  RECEIPT_TARGET_SUBSET,
} from "./receiptFixture";

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
