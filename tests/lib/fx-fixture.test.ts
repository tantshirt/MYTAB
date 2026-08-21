import { describe, expect, it } from "vitest";
import { thbMinorFromWholeBaht, thbMinorToUsdcAtomicFixture } from "@/lib/domain";

describe("fixture FX", () => {
  it("converts THB minor to USDC atomic with upward rounding", () => {
    expect(thbMinorToUsdcAtomicFixture(thbMinorFromWholeBaht(100))).toBe(3_125_000n);
    expect(thbMinorToUsdcAtomicFixture(thbMinorFromWholeBaht(20))).toBe(625_000n);
  });
});
