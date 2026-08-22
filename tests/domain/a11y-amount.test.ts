import { describe, expect, it } from "vitest";
import { fiatMinor } from "@/tests/helpers/money";
import {
  formatAmountLabelForA11y,
  formatThbMinorForA11y,
  formatUsdcAtomicForA11y,
} from "@/lib/domain/a11yAmount";

describe("Story 7.7 — accessibility amount copy", () => {
  it("AC4 — THB reads as baht and satang", () => {
    expect(formatThbMinorForA11y(fiatMinor(29_173))).toBe("291 baht 73");
    expect(formatThbMinorForA11y(fiatMinor(12_000))).toBe("120 baht");
  });

  it("AC4 — USDC reads as token units", () => {
    expect(formatUsdcAtomicForA11y(42_100_000n)).toContain("USDC");
    expect(formatUsdcAtomicForA11y(42_100_000n)).not.toMatch(/two|nine|one/i);
  });
});

describe("POLISH-SPEC §6.4 — rendered labels also read as money", () => {
  it("reads a THB label, thousands separators and all", () => {
    expect(formatAmountLabelForA11y("฿291.74")).toBe("291 baht 74");
    expect(formatAmountLabelForA11y("฿1,840.00")).toBe("1840 baht");
    expect(formatAmountLabelForA11y("-฿50.00")).toBe("negative 50 baht");
  });

  it("reads a token label without a symbol", () => {
    expect(formatAmountLabelForA11y("42.10 USDC")).toBe("42 USDC 1");
    expect(formatAmountLabelForA11y("8 USDC")).toBe("8 USDC");
  });

  it("returns anything it does not recognise unchanged", () => {
    // A wrong reading is worse than the default one.
    expect(formatAmountLabelForA11y("All square")).toBe("All square");
  });
});
