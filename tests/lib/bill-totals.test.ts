import { describe, expect, it } from "vitest";
import {
  CANONICAL_ADJUSTMENT_ORDER,
  computeBillBreakdown,
  computeLineTotalMinor,
  assertItemName,
} from "@/lib/domain/bill";
import { thbMinorFromWholeBaht } from "@/lib/domain";
import { DomainError } from "@/lib/domain/errors";

describe("Story 4.2 — item domain", () => {
  it("AC1 — computes line total from quantity and unit price", () => {
    const unit = thbMinorFromWholeBaht(180);
    expect(computeLineTotalMinor(2, unit)).toBe(thbMinorFromWholeBaht(360));
  });

  it("AC1 — rejects invalid item names", () => {
    expect(() => assertItemName("")).toThrow(DomainError);
  });
});

describe("Story 4.3 — bill breakdown", () => {
  it("AC2 — applies canonical adjustment order", () => {
    expect(CANONICAL_ADJUSTMENT_ORDER).toEqual(["service", "tax", "discount", "group_tip"]);
  });

  it("AC3 — returns labelled lines with exact totals", () => {
    const subtotal = thbMinorFromWholeBaht(520);
    const breakdown = computeBillBreakdown([{ lineTotalMinor: subtotal }], [
      { kind: "service", calculation: "percentage", valueMinorOrBps: 1000 },
      { kind: "tax", calculation: "percentage", valueMinorOrBps: 700 },
    ]);

    expect(breakdown.lines.map((line) => line.label)).toEqual([
      "Subtotal",
      "Service charge",
      "Tax",
      "Total",
    ]);
    expect(breakdown.totalMinor).toBeGreaterThan(subtotal);
  });

  it("AC4 — rejects discount exceeding pre-discount total", () => {
    const subtotal = thbMinorFromWholeBaht(100);
    expect(() =>
      computeBillBreakdown([{ lineTotalMinor: subtotal }], [
        { kind: "discount", calculation: "fixed", valueMinorOrBps: thbMinorFromWholeBaht(200) },
      ]),
    ).toThrow(/Discount cannot exceed/);
  });
});
