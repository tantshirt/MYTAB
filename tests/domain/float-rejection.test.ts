import { describe, expect, it } from "vitest";
import {
  DomainErrorCode,
  addFiatMinor,
  applyPercentageBpsToMinor,
  assertIntegerNumber,
  fiatMinorFromInteger,
  mulFiatMinorByInt,
  parseThbStringToMinor,
  rejectFloatAmount,
  thbMinorFromInteger,
  thbMinorFromWholeBaht,
} from "@/lib/domain";

describe("AC3 — floats cannot enter", () => {
  it("throws when a public function receives a non-integer JavaScript number", () => {
    expect(() => fiatMinorFromInteger(291.74)).toThrowError(
      expect.objectContaining({ code: DomainErrorCode.NON_INTEGER_NUMBER }),
    );
    expect(() => thbMinorFromWholeBaht(10.5)).toThrowError(
      expect.objectContaining({ code: DomainErrorCode.NON_INTEGER_NUMBER }),
    );
    expect(() => assertIntegerNumber(1.1, "test")).toThrowError(
      expect.objectContaining({ code: DomainErrorCode.NON_INTEGER_NUMBER }),
    );
  });

  it("rejects float amounts explicitly", () => {
    expect(() => rejectFloatAmount(12.34, "payment")).toThrowError(
      expect.objectContaining({ code: DomainErrorCode.NON_INTEGER_NUMBER }),
    );
  });

  it("never returns a non-integer numeric type for money values", () => {
    const amountMinor = parseThbStringToMinor("291.74");
    const doubledMinor = mulFiatMinorByInt(amountMinor, 2);
    const summedMinor = addFiatMinor(amountMinor, thbMinorFromInteger(26));
    const percentageMinor = applyPercentageBpsToMinor(amountMinor, 750);

    for (const value of [amountMinor, doubledMinor, summedMinor, percentageMinor]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
