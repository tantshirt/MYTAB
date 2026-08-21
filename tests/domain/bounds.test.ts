import { describe, expect, it } from "vitest";
import {
  DomainErrorCode,
  MAX_BILL_TOTAL_MINOR,
  assertBillTotalMinor,
  assertChainedFiatAdjustmentDoesNotOverflow,
  assertNonZeroRecipients,
  assertPercentageBps,
  assertPositiveDenominator,
  assertTipMinor,
  fiatMinorFromInteger,
  mulFiatMinorByInt,
  thbMinorFromInteger,
} from "@/lib/domain";

describe("AC6 — bounds, overflow, and empty denominators fail closed", () => {
  it("accepts the maximum bill total", () => {
    expect(() => assertBillTotalMinor(fiatMinorFromInteger(MAX_BILL_TOTAL_MINOR))).not.toThrow();
  });

  it("rejects maximum bill total plus one satang", () => {
    expect(() =>
      assertBillTotalMinor(fiatMinorFromInteger(MAX_BILL_TOTAL_MINOR + 1)),
    ).toThrowError(expect.objectContaining({ code: DomainErrorCode.OUT_OF_BOUNDS }));
  });

  it("rejects zero and negative bill totals", () => {
    expect(() => assertBillTotalMinor(fiatMinorFromInteger(0))).toThrowError(
      expect.objectContaining({ code: DomainErrorCode.OUT_OF_BOUNDS }),
    );
    expect(() => assertBillTotalMinor(fiatMinorFromInteger(-100))).toThrowError(
      expect.objectContaining({ code: DomainErrorCode.OUT_OF_BOUNDS }),
    );
  });

  it("enforces tip bounds", () => {
    expect(() => assertTipMinor(thbMinorFromInteger(100))).not.toThrow();
    expect(() => assertTipMinor(thbMinorFromInteger(99))).toThrowError(
      expect.objectContaining({ code: DomainErrorCode.OUT_OF_BOUNDS }),
    );
    expect(() => assertTipMinor(thbMinorFromInteger(10_000_001))).toThrowError(
      expect.objectContaining({ code: DomainErrorCode.OUT_OF_BOUNDS }),
    );
  });

  it("rejects percentage basis points outside 0–10000", () => {
    expect(() => assertPercentageBps(0)).not.toThrow();
    expect(() => assertPercentageBps(10_000)).not.toThrow();
    expect(() => assertPercentageBps(10_001)).toThrowError(
      expect.objectContaining({ code: DomainErrorCode.PERCENTAGE_OUT_OF_BOUNDS }),
    );
    expect(() => assertPercentageBps(-1)).toThrowError(
      expect.objectContaining({ code: DomainErrorCode.PERCENTAGE_OUT_OF_BOUNDS }),
    );
  });

  it("rejects zero split denominators and zero recipient sets", () => {
    expect(() => assertPositiveDenominator(0, "split")).toThrowError(
      expect.objectContaining({ code: DomainErrorCode.ZERO_DENOMINATOR }),
    );
    expect(() => assertNonZeroRecipients(0)).toThrowError(
      expect.objectContaining({ code: DomainErrorCode.ZERO_RECIPIENTS }),
    );
  });

  it("rejects checked int64 overflow in chained adjustments", () => {
    const largeMinor = fiatMinorFromInteger(1_000_000_000);
    expect(() => mulFiatMinorByInt(largeMinor, 10_000_000_000)).toThrowError(
      expect.objectContaining({ code: DomainErrorCode.FIAT_OVERFLOW }),
    );

    expect(() =>
      assertChainedFiatAdjustmentDoesNotOverflow(
        Array.from({ length: 1025 }, () =>
          fiatMinorFromInteger(9_007_199_254_740_991),
        ),
      ),
    ).toThrowError(expect.objectContaining({ code: DomainErrorCode.FIAT_OVERFLOW }));
  });

  it("accepts chained adjustments that remain within int64 range", () => {
    const totalMinor = assertChainedFiatAdjustmentDoesNotOverflow([
      thbMinorFromInteger(100),
      thbMinorFromInteger(250),
      thbMinorFromInteger(50),
    ]);
    expect(totalMinor).toBe(400);
  });
});
