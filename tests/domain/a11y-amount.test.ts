import { describe, expect, it } from "vitest";
import { formatThbMinorForA11y, formatUsdcAtomicForA11y } from "@/lib/domain/a11yAmount";

describe("Story 7.7 — accessibility amount copy", () => {
  it("AC4 — THB reads as baht and satang", () => {
    expect(formatThbMinorForA11y(29_173)).toBe("291 baht 73");
    expect(formatThbMinorForA11y(12_000)).toBe("120 baht");
  });

  it("AC4 — USDC reads as token units", () => {
    expect(formatUsdcAtomicForA11y(42_100_000n)).toContain("USDC");
    expect(formatUsdcAtomicForA11y(42_100_000n)).not.toMatch(/two|nine|one/i);
  });
});
