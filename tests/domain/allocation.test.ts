import { describe, expect, it } from "vitest";
import {
  ALLOCATION_ORDER_RULE,
  allocateAllAdjustments,
  allocateByMode,
  allocateEqualSplit,
  allocateLargestRemainder,
  buildParticipantBreakdowns,
  computeBillTotalMinor,
  sumShareAmounts,
  verifyLockInvariant,
} from "@/lib/domain/allocation";
import { thbMinorFromInteger } from "@/lib/domain/parse";
import {
  assertRevisionMatch,
  nextRevision,
  RevisionError,
  STALE_REVISION,
} from "@/lib/domain/revision";

describe("Story 5.2 — equal split largest remainder", () => {
  it("AC1 — 100 satang by 3 yields 34, 33, 33", () => {
    const shares = allocateEqualSplit(thbMinorFromInteger(100), ["a", "b", "c"]);
    expect(shares.map((share) => share.amountMinor)).toEqual([34, 33, 33]);
    expect(sumShareAmounts(shares)).toBe(100);
  });

  it("AC2 — stable ordering documented and reproducible", () => {
    expect(ALLOCATION_ORDER_RULE).toMatch(/lexicographically/i);
    const first = allocateEqualSplit(thbMinorFromInteger(101), ["z", "a", "m"]);
    const second = allocateEqualSplit(thbMinorFromInteger(101), ["m", "z", "a"]);
    expect(first).toEqual(second);
    expect(first.find((share) => share.participantId === "a")?.roundingMinor).toBe(1);
  });

  it("AC3 — covers one claimant and prime remainder", () => {
    const solo = allocateEqualSplit(thbMinorFromInteger(500), ["solo"]);
    expect(solo[0]?.amountMinor).toBe(500);

    const prime = allocateEqualSplit(thbMinorFromInteger(97), ["a", "b", "c"]);
    expect(sumShareAmounts(prime)).toBe(97);
  });

  it("AC3 — zero-price item yields zero shares", () => {
    const shares = allocateEqualSplit(thbMinorFromInteger(0), ["a", "b"]);
    expect(shares.every((share) => share.amountMinor === 0)).toBe(true);
  });
});

describe("Story 5.3 — proportional adjustments", () => {
  const itemShares = [
    { participantId: "a", amountMinor: thbMinorFromInteger(600), roundingMinor: thbMinorFromInteger(0) },
    { participantId: "b", amountMinor: thbMinorFromInteger(400), roundingMinor: thbMinorFromInteger(0) },
  ];

  it("AC1 — allocates tax/service/tip/discount with remainders", () => {
    const allocations = allocateAllAdjustments(itemShares, [
      { kind: "service", amountMinor: thbMinorFromInteger(100), calculation: "fixed" },
      { kind: "tax", amountMinor: thbMinorFromInteger(70), calculation: "fixed" },
      { kind: "discount", amountMinor: thbMinorFromInteger(50), calculation: "fixed" },
      { kind: "group_tip", amountMinor: thbMinorFromInteger(30), calculation: "fixed" },
    ]);

    expect(allocations).toHaveLength(4);
    for (const allocation of allocations) {
      const total = sumShareAmounts(allocation.byParticipant);
      const expected =
        allocation.kind === "service"
          ? 100
          : allocation.kind === "tax"
            ? 70
            : allocation.kind === "discount"
              ? 50
              : 30;
      expect(total).toBe(expected);
    }
  });

  it("AC2 — discount reduces totals without negative obligations", () => {
    const allocations = allocateAllAdjustments(itemShares, [
      { kind: "discount", amountMinor: thbMinorFromInteger(50), calculation: "fixed" },
    ]);
    const breakdowns = buildParticipantBreakdowns(itemShares, allocations);
    expect(breakdowns.every((row) => row.totalMinor >= 0)).toBe(true);
  });

  it("AC3 — exposes rounding line when remainder assigned", () => {
    const shares = allocateEqualSplit(thbMinorFromInteger(101), ["a", "b", "c"]);
    const breakdowns = buildParticipantBreakdowns(shares, []);
    const withRounding = breakdowns.find((row) => row.roundingMinor > 0);
    expect(withRounding).toBeTruthy();
  });

  it("AC5 — percentage uses integer basis points only", () => {
    const amount = allocateByMode(thbMinorFromInteger(10_000), "percentage", [
      { participantId: "a", weight: 1, percentageBps: 3333 },
      { participantId: "b", weight: 1, percentageBps: 3333 },
      { participantId: "c", weight: 1, percentageBps: 3334 },
    ]);
    expect(sumShareAmounts(amount)).toBe(10_000);
  });
});

describe("Story 5.9 — lock invariant FR-M6", () => {
  it("AC1 — accepts reconciled totals", () => {
    const result = verifyLockInvariant({
      itemSharesTotalMinor: thbMinorFromInteger(1000),
      serviceMinor: thbMinorFromInteger(100),
      taxMinor: thbMinorFromInteger(70),
      tipMinor: thbMinorFromInteger(30),
      discountMinor: thbMinorFromInteger(50),
      billTotalMinor: thbMinorFromInteger(1150),
    });
    expect(result.valid).toBe(true);
  });

  it("AC1 — rejects with shortfall", () => {
    const result = verifyLockInvariant({
      itemSharesTotalMinor: thbMinorFromInteger(1000),
      serviceMinor: thbMinorFromInteger(0),
      taxMinor: thbMinorFromInteger(0),
      tipMinor: thbMinorFromInteger(0),
      discountMinor: thbMinorFromInteger(0),
      billTotalMinor: thbMinorFromInteger(1001),
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.shortfallMinor).toBe(1);
    }
  });

  it("AC3 — bill total follows canonical adjustment order", () => {
    const total = computeBillTotalMinor({
      itemSubtotalMinor: thbMinorFromInteger(1000),
      serviceMinor: thbMinorFromInteger(100),
      taxMinor: thbMinorFromInteger(70),
      discountMinor: thbMinorFromInteger(50),
      groupTipMinor: thbMinorFromInteger(30),
    });
    expect(total).toBe(1150);
  });
});

describe("Story 5.11 — additional allocation modes", () => {
  it("AC2 — quantity mode preserves item total", () => {
    const shares = allocateByMode(thbMinorFromInteger(900), "quantity", [
      { participantId: "a", weight: 1, quantity: 2 },
      { participantId: "b", weight: 1, quantity: 1 },
    ]);
    expect(sumShareAmounts(shares)).toBe(900);
    expect(shares.find((row) => row.participantId === "a")?.amountMinor).toBe(600);
  });

  it("AC2 — fixed mode preserves item total", () => {
    const shares = allocateByMode(thbMinorFromInteger(1000), "fixed", [
      { participantId: "a", weight: 1, fixedMinor: thbMinorFromInteger(600) },
      { participantId: "b", weight: 1, fixedMinor: thbMinorFromInteger(400) },
    ]);
    expect(sumShareAmounts(shares)).toBe(1000);
  });

  it("rejects percentage totals over 100%", () => {
    expect(() =>
      allocateByMode(thbMinorFromInteger(100), "percentage", [
        { participantId: "a", weight: 1, percentageBps: 8000 },
        { participantId: "b", weight: 1, percentageBps: 3000 },
      ]),
    ).toThrow();
  });
});

describe("Story 5.1 — revision key", () => {
  it("increments monotonically", () => {
    expect(nextRevision(1)).toBe(2);
    expect(nextRevision(2)).toBe(3);
  });

  it("rejects stale client revision", () => {
    expect(() => assertRevisionMatch(2, 3)).toThrow(RevisionError);
    expect(() => assertRevisionMatch(2, 3)).toThrow(expect.objectContaining({ code: STALE_REVISION }));
  });
});

describe("allocateLargestRemainder — weight edge cases", () => {
  it("distributes across arbitrary weights", () => {
    const shares = allocateLargestRemainder(thbMinorFromInteger(1000), [
      { participantId: "a", weight: 3 },
      { participantId: "b", weight: 2 },
    ]);
    expect(sumShareAmounts(shares)).toBe(1000);
    expect(shares.find((row) => row.participantId === "a")?.amountMinor).toBe(600);
  });
});
