import { describe, expect, it } from "vitest";
import {
  addFiatMinor,
  formatFiatMinorThb,
  groupThousands,
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

  // POLISH-SPEC §7 P0-3 / DESIGN.md: the canonical fixture is ฿1,840.00.
  it("groups thousands with commas", () => {
    expect(formatFiatMinorThb(thbMinorFromInteger(184_000))).toBe("฿1,840.00");
    expect(formatFiatMinorThb(thbMinorFromInteger(100_000_000))).toBe("฿1,000,000.00");
    expect(formatFiatMinorThb(thbMinorFromInteger(99_999))).toBe("฿999.99");
    expect(formatFiatMinorThb(thbMinorFromInteger(100_000))).toBe("฿1,000.00");
    expect(formatFiatMinorThb(thbMinorFromInteger(-184_000))).toBe("-฿1,840.00");
    expect(formatFiatMinorThb(thbMinorFromInteger(0))).toBe("฿0.00");
    expect(formatFiatMinorThb(thbMinorFromInteger(1))).toBe("฿0.01");
  });

  it("groupThousands leaves short runs alone", () => {
    expect(groupThousands("0")).toBe("0");
    expect(groupThousands("999")).toBe("999");
    expect(groupThousands("1000")).toBe("1,000");
    expect(groupThousands("1234567")).toBe("1,234,567");
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
