import { describe, expect, it } from "vitest";
import { compressDebts, DEBT_COMPRESSION_DISCLAIMER } from "@/lib/domain/debtCompression";

describe("Story 7.11 — debt compression", () => {
  it("AC2 — greedy matching produces at most n-1 transfers", () => {
    const transfers = compressDebts([
      { userId: "a", netMinor: -100 },
      { userId: "b", netMinor: -50 },
      { userId: "c", netMinor: 80 },
      { userId: "d", netMinor: 70 },
    ]);

    expect(transfers.length).toBeLessThanOrEqual(3);
    const total = transfers.reduce((sum, t) => sum + t.amountMinor, 0);
    expect(total).toBe(150);
  });

  it("AC3 — disclaimer does not claim mathematical minimum", () => {
    expect(DEBT_COMPRESSION_DISCLAIMER).toMatch(/not guaranteed/i);
  });

  it("AC1 — operates on confirmed net positions only", () => {
    const transfers = compressDebts([
      { userId: "debtor", netMinor: -1000 },
      { userId: "creditor", netMinor: 1000 },
    ]);

    expect(transfers).toEqual([
      { fromUserId: "debtor", toUserId: "creditor", amountMinor: 1000 },
    ]);
  });
});
