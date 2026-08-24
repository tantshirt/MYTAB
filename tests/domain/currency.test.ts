import { describe, expect, it } from "vitest";
import {
  CURRENCY_FAILURE,
  CurrencyError,
  addCurrencyMoney,
  formatCurrencyMinor,
  formatCurrencyMinorBigInt,
  formatCurrencyMinorForA11y,
  money,
  parseCurrencyAmount,
} from "@/lib/domain/currency";

describe("generic fiat currency", () => {
  it.each([
    ["JPY", "1840", 1840, "¥1,840"],
    ["THB", "291.74", 29174, "฿291.74"],
    ["KWD", "12.345", 12345, "KD 12.345"],
  ] as const)("parses and formats %s without a float", (currency, raw, minor, label) => {
    const parsed = parseCurrencyAmount(raw, currency);
    expect(parsed).toBe(minor);
    expect(formatCurrencyMinor(parsed, currency)).toBe(label);
  });

  it("rejects precision beyond the currency's minor units", () => {
    expect(() => parseCurrencyAmount("1.0", "JPY")).toThrow();
    expect(() => parseCurrencyAmount("1.234", "THB")).toThrow();
    expect(() => parseCurrencyAmount("1.2345", "KWD")).toThrow();
  });

  it("admits assigned ISO currencies and rejects structural placeholders", () => {
    expect(parseCurrencyAmount("1.234", "BHD")).toBe(1234);
    expect(() => parseCurrencyAmount("1.00", "ZZZ")).toThrow("Unsupported currency");
  });

  it.each(["CUC", "HRK", "SLL", "ZWL"])(
    "rejects withdrawn national unit %s even when Intl still formats it",
    (currency) => {
      expect(() => parseCurrencyAmount("1.00", currency)).toThrow("Unsupported currency");
    },
  );

  it("refuses unlike-currency sums", () => {
    try {
      addCurrencyMoney(money("THB", 100), money("USD", 100));
      throw new Error("expected mismatch");
    } catch (error) {
      expect(error).toBeInstanceOf(CurrencyError);
      expect((error as CurrencyError).code).toBe(CURRENCY_FAILURE.MISMATCH);
    }
  });

  it("keeps currency context in accessible copy", () => {
    expect(formatCurrencyMinorForA11y(parseCurrencyAmount("12.345", "KWD"), "KWD"))
      .toBe("12 Kuwaiti dinars 345");
  });

  it("formats persisted int64 values exactly for zero- and three-decimal fiat", () => {
    expect(formatCurrencyMinorBigInt(9_007_199_254_740_993n, "JPY"))
      .toBe("¥9,007,199,254,740,993");
    expect(formatCurrencyMinorBigInt(12_345n, "KWD")).toBe("KD 12.345");
  });
});
