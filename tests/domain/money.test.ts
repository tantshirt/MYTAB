import { describe, expect, it } from "vitest";
import {
  addFiatMinor,
  formatFiatMinorThb,
  parseThbStringToMinor,
  thbMinorFromInteger,
} from "@/lib/domain";

describe("AC1 — fiat is int64 minor units", () => {
  it("stores THB 291.74 as 29174 satang", () => {
    const amountMinor = parseThbStringToMinor("291.74");
    expect(amountMinor).toBe(29174);
    expect(Number.isInteger(amountMinor)).toBe(true);
  });

  it("formats satang only at the display boundary", () => {
    const amountMinor = thbMinorFromInteger(29174);
    expect(formatFiatMinorThb(amountMinor)).toBe("฿291.74");
  });

  it("keeps arithmetic in integer minor units", () => {
    const aMinor = thbMinorFromInteger(100);
    const bMinor = thbMinorFromInteger(50);
    const totalMinor = addFiatMinor(aMinor, bMinor);
    expect(totalMinor).toBe(150);
    expect(Number.isInteger(totalMinor)).toBe(true);
  });

  it("parses whole-baht strings without fractional digits", () => {
    expect(parseThbStringToMinor("100")).toBe(10000);
  });

  it("parses one-decimal-place strings", () => {
    expect(parseThbStringToMinor("10.5")).toBe(1050);
  });
});
