/**
 * Pure THB -> USDC FX policy (binding decision 6).
 *
 * Direction is always `USDC_ATOMIC_PER_THB_MINOR`:
 *   usdcAtomic = ceil(thbMinor * numeratorAtomic / denominatorMinor)
 *
 * Integer math only. No floats ever touch a rate or an amount — provider
 * decimals are parsed from their *string* form into an exact integer rational,
 * never through `Number`/`parseFloat`.
 *
 * This module is pure: no environment reads, no I/O, no clock.
 */

import { DomainError, DomainErrorCode } from "./errors";

export const FX_DIRECTION = "USDC_ATOMIC_PER_THB_MINOR" as const;
export const FX_GENERIC_DIRECTION = "STABLE_ATOMIC_PER_FIAT_MINOR" as const;
export type FxDirection = typeof FX_DIRECTION | typeof FX_GENERIC_DIRECTION;

/** USDC has 6 decimals; 1 USDC = 1_000_000 atomic. */
export const USDC_DECIMALS = 6;
/** THB has 2 decimals; 1 THB = 100 minor (satang). */
export const THB_MINOR_DIGITS = 2;

/** Frankfurter provider key for the Bank of Thailand series. */
export const FRANKFURTER_BOT_PROVIDER_KEY = "BOT";
/** Provider identity persisted on production snapshots. */
export const FX_PROVIDER_FRANKFURTER_BOT = "frankfurter:BOT";
/** Provider identity persisted on the non-production manual rational. */
export const FX_PROVIDER_MANUAL = "manual:non-production";
/** Policy version stamped on every snapshot produced by this module. */
export const FX_POLICY_VERSION = "frankfurter-bot-v1";

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Freshness window when the day after the provider date is a Thai bank business day. */
export const FX_FRESHNESS_WEEKDAY_MS = 36 * HOUR_MS;
/** Freshness window when the day after the provider date is a weekend or Thai bank holiday. */
export const FX_FRESHNESS_WEEKEND_MS = 96 * HOUR_MS;

/** Bangkok is UTC+7 year-round (no DST), so a fixed offset is exact. */
export const BANGKOK_UTC_OFFSET_MS = 7 * HOUR_MS;

export const FxErrorCode = {
  INVALID_RATE_FORMAT: "FX_INVALID_RATE_FORMAT",
  INVALID_PROVIDER_DATE: "FX_INVALID_PROVIDER_DATE",
  NON_POSITIVE_RATE: "FX_NON_POSITIVE_RATE",
  NON_POSITIVE_RATIONAL: "FX_NON_POSITIVE_RATIONAL",
  NEGATIVE_AMOUNT: "FX_NEGATIVE_AMOUNT",
  RATIONAL_OVERFLOW: "FX_RATIONAL_OVERFLOW",
  STALE_SNAPSHOT: "FX_SNAPSHOT_STALE",
  DIRECTION_MISMATCH: "FX_DIRECTION_MISMATCH",
} as const;
export type FxErrorCode = (typeof FxErrorCode)[keyof typeof FxErrorCode];

export class FxError extends Error {
  readonly code: FxErrorCode;

  constructor(code: FxErrorCode, message: string) {
    super(message);
    this.name = "FxError";
    this.code = code;
  }
}

/** An exact integer rational in the `USDC_ATOMIC_PER_THB_MINOR` direction. */
export type FxRational = {
  readonly numeratorAtomic: bigint;
  readonly denominatorMinor: bigint;
};

/** Everything a persisted snapshot needs, derived deterministically from a provider quote. */
export type FxRateQuote = {
  /** Provider business date, `YYYY-MM-DD`, in the provider's own calendar. */
  readonly providerDate: string;
  /** Decimal rate as the provider printed it: THB per 1 USD. Never a number. */
  readonly rateText: string;
};

export type FxSnapshotFields = FxRational & {
  readonly direction: FxDirection;
  readonly provider: string;
  readonly providerAsOf: number;
  readonly expiresAt: number;
  readonly policyVersion: string;
  readonly freshnessWindowMs: number;
};

// ---------------------------------------------------------------------------
// Rational construction
// ---------------------------------------------------------------------------

const INT64_MAX = 9223372036854775807n;
const MAX_RATE_DECIMALS = 12;
const RATE_TEXT_PATTERN = /^(0|[1-9]\d{0,17})(?:\.(\d{1,18}))?$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

/** Reduces a rational by its gcd so persisted int64 columns stay small. */
export function reduceFxRational(rational: FxRational): FxRational {
  assertPositiveRational(rational);
  const divisor = gcd(rational.numeratorAtomic, rational.denominatorMinor);
  return {
    numeratorAtomic: rational.numeratorAtomic / divisor,
    denominatorMinor: rational.denominatorMinor / divisor,
  };
}

export function assertPositiveRational(rational: FxRational): void {
  if (rational.numeratorAtomic <= 0n || rational.denominatorMinor <= 0n) {
    throw new FxError(
      FxErrorCode.NON_POSITIVE_RATIONAL,
      `FX rational must be strictly positive, got ${rational.numeratorAtomic}/${rational.denominatorMinor}`,
    );
  }
  if (rational.numeratorAtomic > INT64_MAX || rational.denominatorMinor > INT64_MAX) {
    throw new FxError(
      FxErrorCode.RATIONAL_OVERFLOW,
      `FX rational ${rational.numeratorAtomic}/${rational.denominatorMinor} does not fit the int64 snapshot columns`,
    );
  }
}

/**
 * Converts a provider decimal string ("32.8152" THB per USD) into the exact
 * `USDC_ATOMIC_PER_THB_MINOR` rational.
 *
 * Derivation (USDC is treated as one USD per the product contract):
 *   usdcAtomic = thbMinor / 10^THB_MINOR_DIGITS / rate * 10^USDC_DECIMALS
 * With `rate = R / 10^d` for integer R and d decimal places:
 *   usdcAtomic = thbMinor * 10^(USDC_DECIMALS - THB_MINOR_DIGITS + d) / R
 *
 * @param rateText - Decimal THB-per-USD as printed by the provider.
 */
export function usdThbRateTextToRational(rateText: string): FxRational {
  return usdFiatRateTextToRational(rateText, THB_MINOR_DIGITS, USDC_DECIMALS);
}

/** Exact stable-reference atomic units per fiat minor unit for any ISO scale. */
export function usdFiatRateTextToRational(
  rateText: string,
  fiatMinorDigits: number,
  stableAtomicDecimals: number = USDC_DECIMALS,
): FxRational {
  if (!Number.isInteger(fiatMinorDigits) || fiatMinorDigits < 0 || fiatMinorDigits > 3) {
    throw new FxError(FxErrorCode.INVALID_RATE_FORMAT, `Unsupported fiat minor digits ${fiatMinorDigits}`);
  }
  if (!Number.isInteger(stableAtomicDecimals) || stableAtomicDecimals < fiatMinorDigits) {
    throw new FxError(FxErrorCode.INVALID_RATE_FORMAT, `Invalid stable decimals ${stableAtomicDecimals}`);
  }
  const trimmed = rateText.trim();
  const match = RATE_TEXT_PATTERN.exec(trimmed);
  if (!match) {
    throw new FxError(
      FxErrorCode.INVALID_RATE_FORMAT,
      `FX rate must be a plain non-negative decimal string, got ${JSON.stringify(rateText)}`,
    );
  }

  const wholePart = match[1];
  const fractionPart = match[2] ?? "";
  if (fractionPart.length > MAX_RATE_DECIMALS) {
    throw new FxError(
      FxErrorCode.INVALID_RATE_FORMAT,
      `FX rate has ${fractionPart.length} decimals, exceeding the ${MAX_RATE_DECIMALS} allowed`,
    );
  }

  const scaledRate = BigInt(`${wholePart}${fractionPart}`);
  if (scaledRate <= 0n) {
    throw new FxError(
      FxErrorCode.NON_POSITIVE_RATE,
      `FX rate must be strictly positive, got ${JSON.stringify(rateText)}`,
    );
  }

  const exponent = stableAtomicDecimals - fiatMinorDigits + fractionPart.length;
  return reduceFxRational({
    numeratorAtomic: pow10(exponent),
    denominatorMinor: scaledRate,
  });
}

// ---------------------------------------------------------------------------
// Conversion — always rounds up so the recipient is never short
// ---------------------------------------------------------------------------

/**
 * Converts THB minor units to USDC atomic units, rounding **up**.
 *
 * Rounding direction is a correctness property: the recipient target must never
 * be below the locked display amount, so any remainder adds one atomic unit.
 */
export function thbMinorToUsdcAtomic(
  thbMinor: bigint | number,
  rational: FxRational,
): bigint {
  assertPositiveRational(rational);

  const minor = toIntegerBigInt(thbMinor);
  if (minor < 0n) {
    throw new FxError(
      FxErrorCode.NEGATIVE_AMOUNT,
      `FX conversion requires a non-negative THB minor amount, got ${minor}`,
    );
  }

  const product = minor * rational.numeratorAtomic;
  // ceil(product / denominator) with strictly non-negative integers.
  return (product + rational.denominatorMinor - 1n) / rational.denominatorMinor;
}

function toIntegerBigInt(value: bigint | number): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new DomainError(
      DomainErrorCode.NON_INTEGER_NUMBER,
      `thbMinorToUsdcAtomic: expected an integer number of THB minor units, got ${value}`,
    );
  }
  return BigInt(value);
}

// ---------------------------------------------------------------------------
// Thai bank calendar
// ---------------------------------------------------------------------------

/**
 * Bank of Thailand financial-institution holidays.
 *
 * A holiday here only ever *extends* the freshness window (36h -> 96h), so a
 * missing entry fails closed (the snapshot expires sooner) while a wrong entry
 * would accept a staler rate. Every date below is one BOT or the standard Thai
 * bank calendar states explicitly; lunar-calendar observances that could not be
 * confirmed are deliberately omitted rather than guessed.
 *
 * Coverage is bounded by {@link THAI_BANK_HOLIDAY_COVERAGE}: outside that range
 * holidays are treated as unknown and only weekends extend the window.
 *
 * Source: https://www.bot.or.th/en/financial-institutions-holiday.html
 */
export const THAI_BANK_HOLIDAYS: readonly string[] = [
  "2026-01-01", // New Year's Day
  "2026-01-02", // Additional special financial-institution holiday (BOT announcement)
  "2026-04-06", // Chakri Memorial Day
  "2026-04-13", // Songkran
  "2026-04-14", // Songkran
  "2026-04-15", // Songkran
  "2026-05-01", // National Labour Day
  "2026-05-04", // Coronation Day
  "2026-06-01", // Substitution for Visakha Bucha Day (BOT announcement)
  "2026-06-03", // HM Queen Suthida's Birthday
  "2026-07-28", // HM King Vajiralongkorn's Birthday
  "2026-08-12", // HM Queen Mother's Birthday
  "2026-10-13", // Passing of HM King Bhumibol
  "2026-10-16", // Additional special Bangkok financial-institution holiday (BOT announcement)
  "2026-10-23", // Chulalongkorn Memorial Day
  "2026-12-07", // Substitution for 5 December (BOT announcement)
  "2026-12-10", // Constitution Day
  "2026-12-31", // New Year's Eve
];

/** Inclusive year range the holiday table is authoritative for. */
export const THAI_BANK_HOLIDAY_COVERAGE = {
  firstYear: 2026,
  lastYear: 2026,
} as const;

const HOLIDAY_SET: ReadonlySet<string> = new Set(THAI_BANK_HOLIDAYS);

export type IsoDateParts = { year: number; month: number; day: number };

/** Parses `YYYY-MM-DD`, rejecting anything that is not a real calendar date. */
export function parseIsoDate(isoDate: string): IsoDateParts {
  const match = ISO_DATE_PATTERN.exec(isoDate.trim());
  if (!match) {
    throw new FxError(
      FxErrorCode.INVALID_PROVIDER_DATE,
      `Provider date must be YYYY-MM-DD, got ${JSON.stringify(isoDate)}`,
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcMs = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(utcMs);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    throw new FxError(
      FxErrorCode.INVALID_PROVIDER_DATE,
      `Provider date ${isoDate} is not a real calendar date`,
    );
  }

  return { year, month, day };
}

function isoDateToUtcMidnightMs(isoDate: string): number {
  const { year, month, day } = parseIsoDate(isoDate);
  return Date.UTC(year, month - 1, day);
}

function utcMsToIsoDate(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

/** Returns the calendar date `days` after `isoDate` (both `YYYY-MM-DD`). */
export function addIsoDays(isoDate: string, days: number): string {
  return utcMsToIsoDate(isoDateToUtcMidnightMs(isoDate) + days * DAY_MS);
}

export function isWeekend(isoDate: string): boolean {
  const weekday = new Date(isoDateToUtcMidnightMs(isoDate)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** True only for dates inside {@link THAI_BANK_HOLIDAY_COVERAGE}. */
export function isThaiBankHolidayKnown(isoDate: string): boolean {
  const { year } = parseIsoDate(isoDate);
  return (
    year >= THAI_BANK_HOLIDAY_COVERAGE.firstYear &&
    year <= THAI_BANK_HOLIDAY_COVERAGE.lastYear
  );
}

/**
 * True when the date is a known Thai bank holiday. Dates outside the table's
 * coverage return `false` — unknown holidays must never extend the window.
 */
export function isThaiBankHoliday(isoDate: string): boolean {
  parseIsoDate(isoDate);
  return HOLIDAY_SET.has(isoDate.trim());
}

/** A day banks settle on: not a weekend, not a known Thai bank holiday. */
export function isThaiBankBusinessDay(isoDate: string): boolean {
  return !isWeekend(isoDate) && !isThaiBankHoliday(isoDate);
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

/**
 * `providerAsOf` anchor for a provider business date: 00:00 Asia/Bangkok.
 *
 * Anchoring at the start of the provider day (rather than publication time,
 * which the provider does not expose) makes the window strictly conservative —
 * the snapshot expires earlier, never later.
 */
export function providerDateToAsOfMs(isoDate: string): number {
  return isoDateToUtcMidnightMs(isoDate) - BANGKOK_UTC_OFFSET_MS;
}

/**
 * Freshness window for a provider date.
 *
 * BOT publishes each business day, so a rate dated on a day followed by another
 * business day should be superseded within 36h. When the following day is a
 * weekend or a Thai bank holiday no new rate is coming, so the window widens to
 * 96h — which spans a Friday rate through the weekend and a Monday holiday.
 */
export function resolveFreshnessWindowMs(providerDate: string): number {
  const nextDay = addIsoDays(providerDate, 1);
  return isThaiBankBusinessDay(nextDay)
    ? FX_FRESHNESS_WEEKDAY_MS
    : FX_FRESHNESS_WEEKEND_MS;
}

/** Builds the full set of snapshot columns from a provider quote. */
export function buildFxSnapshotFields(
  quote: FxRateQuote,
  provider: string = FX_PROVIDER_FRANKFURTER_BOT,
  policyVersion: string = FX_POLICY_VERSION,
): FxSnapshotFields {
  const rational = usdThbRateTextToRational(quote.rateText);
  const providerAsOf = providerDateToAsOfMs(quote.providerDate);
  const freshnessWindowMs = resolveFreshnessWindowMs(quote.providerDate);

  return {
    ...rational,
    direction: FX_DIRECTION,
    provider,
    providerAsOf,
    expiresAt: providerAsOf + freshnessWindowMs,
    policyVersion,
    freshnessWindowMs,
  };
}

export type FxFreshnessInput = {
  readonly expiresAt: number;
  readonly direction?: string;
};

/** A snapshot is fresh strictly before its expiry; the boundary itself is stale. */
export function isFxSnapshotFresh(snapshot: FxFreshnessInput, nowMs: number): boolean {
  return nowMs < snapshot.expiresAt;
}

/** Fail-closed guard for any path that is about to price money off a snapshot. */
export function assertFxSnapshotFresh(snapshot: FxFreshnessInput, nowMs: number): void {
  if (
    snapshot.direction !== undefined &&
    snapshot.direction !== FX_DIRECTION &&
    snapshot.direction !== FX_GENERIC_DIRECTION
  ) {
    throw new FxError(
      FxErrorCode.DIRECTION_MISMATCH,
      `FX snapshot direction ${snapshot.direction} is not ${FX_DIRECTION}`,
    );
  }
  if (!isFxSnapshotFresh(snapshot, nowMs)) {
    throw new FxError(
      FxErrorCode.STALE_SNAPSHOT,
      `FX snapshot expired at ${snapshot.expiresAt}; now is ${nowMs}`,
    );
  }
}
