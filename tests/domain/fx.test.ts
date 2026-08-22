import { describe, expect, it } from "vitest";
import {
  BANGKOK_UTC_OFFSET_MS,
  FX_DIRECTION,
  FX_FRESHNESS_WEEKDAY_MS,
  FX_FRESHNESS_WEEKEND_MS,
  FX_PROVIDER_FRANKFURTER_BOT,
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
  providerDateToAsOfMs,
  resolveFreshnessWindowMs,
  thbMinorToUsdcAtomic,
  usdThbRateTextToRational,
} from "@/lib/domain/fx";
import { MANUAL_FX_RATIONAL } from "@/lib/domain/fxFixture";

const HOUR = 60 * 60 * 1000;

describe("FX rational construction", () => {
  it("parses a provider decimal into an exact integer rational", () => {
    // 32.8152 THB per USD -> 10^(6-2+4) / 328152, reduced by gcd 8.
    expect(usdThbRateTextToRational("32.8152")).toEqual({
      numeratorAtomic: 12_500_000n,
      denominatorMinor: 41_019n,
    });
  });

  it("agrees with the legacy 625/2 manual rational for a flat rate of 32", () => {
    expect(usdThbRateTextToRational("32")).toEqual({
      numeratorAtomic: 625n,
      denominatorMinor: 2n,
    });
    expect(MANUAL_FX_RATIONAL).toEqual({ numeratorAtomic: 625n, denominatorMinor: 2n });
  });

  it("never routes the provider decimal through a JavaScript number", () => {
    // This rate has more significant digits than a double can hold exactly:
    // Number("32.123456789012") * 1e12 does not round-trip to the integer below.
    const rational = usdThbRateTextToRational("32.123456789012");

    // The reduced rational still represents the decimal *exactly*:
    // numerator/denominator === 10^16 / 32123456789012 with gcd 4 removed.
    expect(rational.numeratorAtomic).toBe(10n ** 16n / 4n);
    expect(rational.denominatorMinor).toBe(32_123_456_789_012n / 4n);
    expect(rational.numeratorAtomic * 32_123_456_789_012n).toBe(
      rational.denominatorMinor * 10n ** 16n,
    );
  });

  it("rejects malformed, non-positive, and over-precise rates", () => {
    for (const bad of ["", "abc", "-32.5", "3.2e1", "32,5", " 32.5x"]) {
      expect(() => usdThbRateTextToRational(bad)).toThrowError(
        expect.objectContaining({ code: FxErrorCode.INVALID_RATE_FORMAT }),
      );
    }
    expect(() => usdThbRateTextToRational("0")).toThrowError(
      expect.objectContaining({ code: FxErrorCode.NON_POSITIVE_RATE }),
    );
    expect(() => usdThbRateTextToRational("0.0000")).toThrowError(
      expect.objectContaining({ code: FxErrorCode.NON_POSITIVE_RATE }),
    );
    expect(() => usdThbRateTextToRational("32.1234567890123")).toThrowError(
      expect.objectContaining({ code: FxErrorCode.INVALID_RATE_FORMAT }),
    );
  });
});

describe("recipient targets round upward", () => {
  const rational = usdThbRateTextToRational("32.8152");

  it("adds one atomic unit whenever there is any remainder", () => {
    // 1 THB minor * 12_500_000 / 41_019 = 304.7... -> 305
    expect(thbMinorToUsdcAtomic(1n, rational)).toBe(305n);
    // exact multiple: no inflation
    expect(thbMinorToUsdcAtomic(41_019n, { numeratorAtomic: 1n, denominatorMinor: 41_019n })).toBe(1n);
  });

  it("never leaves the recipient short across a wide sweep of amounts", () => {
    for (let minor = 0n; minor < 500n; minor += 1n) {
      const atomic = thbMinorToUsdcAtomic(minor, rational);
      const product = minor * rational.numeratorAtomic;
      // atomic * denominator >= exact target: the recipient is at or above par.
      expect(atomic * rational.denominatorMinor >= product).toBe(true);
      // and never more than one atomic unit above it.
      expect((atomic - 1n) * rational.denominatorMinor < product || minor === 0n).toBe(true);
    }
  });

  it("rounds up for the manual rational too", () => {
    // 1 THB minor * 625 / 2 = 312.5 -> 313
    expect(thbMinorToUsdcAtomic(1n, MANUAL_FX_RATIONAL)).toBe(313n);
    // 10000 THB minor (100 THB) is exact at 32 THB/USD
    expect(thbMinorToUsdcAtomic(10_000n, MANUAL_FX_RATIONAL)).toBe(3_125_000n);
  });

  it("refuses negative amounts and non-positive rationals", () => {
    expect(() => thbMinorToUsdcAtomic(-1n, rational)).toThrowError(
      expect.objectContaining({ code: FxErrorCode.NEGATIVE_AMOUNT }),
    );
    expect(() =>
      thbMinorToUsdcAtomic(100n, { numeratorAtomic: 1n, denominatorMinor: 0n }),
    ).toThrowError(expect.objectContaining({ code: FxErrorCode.NON_POSITIVE_RATIONAL }));
  });

  it("refuses a float amount rather than silently truncating it", () => {
    expect(() => thbMinorToUsdcAtomic(10.5, rational)).toThrowError(
      expect.objectContaining({ code: "NON_INTEGER_NUMBER" }),
    );
  });
});

describe("Thai bank calendar", () => {
  it("treats Saturday and Sunday as non-business days", () => {
    expect(isWeekend("2026-08-22")).toBe(true); // Saturday
    expect(isWeekend("2026-08-23")).toBe(true); // Sunday
    expect(isWeekend("2026-08-24")).toBe(false); // Monday
    expect(isThaiBankBusinessDay("2026-08-24")).toBe(true);
  });

  it("recognises the announced Bank of Thailand special holidays", () => {
    expect(isThaiBankHoliday("2026-01-02")).toBe(true);
    expect(isThaiBankHoliday("2026-10-16")).toBe(true);
    expect(isThaiBankHoliday("2026-12-07")).toBe(true);
    expect(isThaiBankBusinessDay("2026-01-02")).toBe(false);
  });

  it("never extends the window for years outside the table's coverage", () => {
    // An unknown holiday must fail closed (shorter window), not be assumed.
    const beyond = `${THAI_BANK_HOLIDAY_COVERAGE.lastYear + 1}-01-01`;
    expect(isThaiBankHoliday(beyond)).toBe(false);
    for (const holiday of THAI_BANK_HOLIDAYS) {
      expect(Number(holiday.slice(0, 4))).toBeLessThanOrEqual(
        THAI_BANK_HOLIDAY_COVERAGE.lastYear,
      );
    }
  });

  it("rejects dates that are not real calendar dates", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "26-01-01", "2026/01/01"]) {
      expect(() => isWeekend(bad)).toThrowError(
        expect.objectContaining({ code: FxErrorCode.INVALID_PROVIDER_DATE }),
      );
    }
  });

  it("advances calendar dates across month and year boundaries", () => {
    expect(addIsoDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addIsoDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("freshness windows", () => {
  it("uses 36h when the next day is a Thai bank business day", () => {
    // 2026-08-24 is a Monday; Tuesday the 25th is a business day.
    expect(resolveFreshnessWindowMs("2026-08-24")).toBe(FX_FRESHNESS_WEEKDAY_MS);
    expect(FX_FRESHNESS_WEEKDAY_MS).toBe(36 * HOUR);
  });

  it("uses 96h when the next day is a weekend", () => {
    // 2026-08-21 is a Friday; Saturday follows.
    expect(resolveFreshnessWindowMs("2026-08-21")).toBe(FX_FRESHNESS_WEEKEND_MS);
    expect(FX_FRESHNESS_WEEKEND_MS).toBe(96 * HOUR);
  });

  it("uses 96h when the next day is a Thai bank holiday", () => {
    // 2026-01-01 is a Thursday, and 2026-01-02 is an announced bank holiday,
    // so the Thursday rate must survive the long weekend.
    expect(isThaiBankBusinessDay("2026-01-02")).toBe(false);
    expect(resolveFreshnessWindowMs("2026-01-01")).toBe(FX_FRESHNESS_WEEKEND_MS);
  });

  it("anchors providerAsOf at midnight Asia/Bangkok", () => {
    const asOf = providerDateToAsOfMs("2026-08-21");
    expect(asOf).toBe(Date.UTC(2026, 7, 21) - BANGKOK_UTC_OFFSET_MS);
    expect(new Date(asOf).toISOString()).toBe("2026-08-20T17:00:00.000Z");
  });
});

describe("freshness boundaries", () => {
  const weekdayQuote = { providerDate: "2026-08-24", rateText: "32.8152" };
  const weekendQuote = { providerDate: "2026-08-21", rateText: "32.8152" };

  it("expires exactly 36h after a weekday provider date", () => {
    const fields = buildFxSnapshotFields(weekdayQuote);
    const asOf = providerDateToAsOfMs(weekdayQuote.providerDate);

    expect(fields.expiresAt).toBe(asOf + 36 * HOUR);
    expect(fields.direction).toBe(FX_DIRECTION);
    expect(fields.provider).toBe(FX_PROVIDER_FRANKFURTER_BOT);

    // one millisecond either side of the boundary
    expect(isFxSnapshotFresh(fields, asOf + 36 * HOUR - 1)).toBe(true);
    expect(isFxSnapshotFresh(fields, asOf + 36 * HOUR)).toBe(false);
    expect(isFxSnapshotFresh(fields, asOf + 36 * HOUR + 1)).toBe(false);
  });

  it("expires exactly 96h after a provider date followed by a weekend", () => {
    const fields = buildFxSnapshotFields(weekendQuote);
    const asOf = providerDateToAsOfMs(weekendQuote.providerDate);

    expect(fields.expiresAt).toBe(asOf + 96 * HOUR);
    expect(isFxSnapshotFresh(fields, asOf + 96 * HOUR - 1)).toBe(true);
    expect(isFxSnapshotFresh(fields, asOf + 96 * HOUR)).toBe(false);

    // and it is still stale at the 36h mark's opposite: fresh well past 36h
    expect(isFxSnapshotFresh(fields, asOf + 36 * HOUR + 1)).toBe(true);
  });

  it("assertFxSnapshotFresh throws a named error at and past expiry", () => {
    const fields = buildFxSnapshotFields(weekdayQuote);
    expect(() => assertFxSnapshotFresh(fields, fields.expiresAt - 1)).not.toThrow();
    expect(() => assertFxSnapshotFresh(fields, fields.expiresAt)).toThrowError(
      expect.objectContaining({ code: FxErrorCode.STALE_SNAPSHOT }),
    );
  });

  it("rejects a snapshot stored in the wrong direction", () => {
    expect(() =>
      assertFxSnapshotFresh(
        { expiresAt: Number.MAX_SAFE_INTEGER, direction: "THB_MINOR_PER_USDC_ATOMIC" },
        0,
      ),
    ).toThrowError(expect.objectContaining({ code: FxErrorCode.DIRECTION_MISMATCH }));
  });

  it("produces snapshot fields that survive the int64 columns", () => {
    const fields = buildFxSnapshotFields({ providerDate: "2026-08-24", rateText: "32.123456789012" });
    expect(fields.numeratorAtomic).toBeLessThanOrEqual(9223372036854775807n);
    expect(fields.denominatorMinor).toBeLessThanOrEqual(9223372036854775807n);
    expect(fields.numeratorAtomic > 0n).toBe(true);
  });

  it("is an FxError, so callers can branch on the class", () => {
    const fields = buildFxSnapshotFields(weekdayQuote);
    try {
      assertFxSnapshotFresh(fields, fields.expiresAt);
      expect.unreachable("expected a stale-snapshot throw");
    } catch (error) {
      expect(error).toBeInstanceOf(FxError);
    }
  });
});
