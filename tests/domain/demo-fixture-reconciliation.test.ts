import { describe, expect, it } from "vitest";
import { FIXTURE_BILL_REVIEW, FIXTURE_CLAIM_BOARD } from "@/tests/fixtures/claims";

/**
 * The canonical demo dataset, locked.
 *
 * DESIGN.md fixes it: "Sukhumvit Dinner, five people, ฿1,840.00 total, with
 * Andre owing ฿291.74 (240.00 + 24.00 + 18.48 + 9.25 + 0.01)."
 *
 * These previously drifted: the bill review declared `reconciles: true` while
 * its rows summed ฿101 over the bill, and later the two surfaces disagreed by
 * ฿16.00 on the same bill's item subtotal. The product's entire trust argument
 * is that the arithmetic is exact, so a demo whose two screens disagree is a
 * defect, not a cosmetic issue.
 */
const BILL_TOTAL_MINOR = 184_000;
const ITEMS_SUBTOTAL_MINOR = 152_400;
const GROUP_TIP_PER_HEAD_MINOR = 925;
const SERVICE_RATE = 0.1;
const VAT_RATE = 0.07;

describe("Sukhumvit Dinner demo fixture", () => {
  it("claim board items subtotal to ฿1,524.00", () => {
    const subtotal = FIXTURE_CLAIM_BOARD.items.reduce(
      (sum, item) => sum + item.lineTotalMinor,
      0,
    );
    expect(subtotal).toBe(ITEMS_SUBTOTAL_MINOR);
  });

  it("฿1,524.00 is the only subtotal that reaches ฿1,840.00 under the stated rules", () => {
    const reaches = (items: number) => {
      const service = Math.round(items * SERVICE_RATE);
      const vat = Math.round((items + service) * VAT_RATE);
      return items + service + vat + GROUP_TIP_PER_HEAD_MINOR * 5 === BILL_TOTAL_MINOR;
    };
    const solutions: number[] = [];
    for (let items = 150_000; items <= 156_000; items++) {
      if (reaches(items)) solutions.push(items);
    }
    expect(solutions).toEqual([ITEMS_SUBTOTAL_MINOR]);
  });

  it("every bill review row's components sum to its own total", () => {
    for (const row of FIXTURE_BILL_REVIEW.breakdowns) {
      const components =
        row.itemShareMinor +
        row.serviceMinor +
        row.taxMinor +
        row.tipMinor -
        row.discountMinor +
        row.roundingMinor;
      expect(components, `${row.displayName} does not add up`).toBe(row.totalMinor);
    }
  });

  it("the five shares sum to the bill total, so `reconciles` is not a lie", () => {
    const shares = FIXTURE_BILL_REVIEW.breakdowns.reduce(
      (sum, row) => sum + row.totalMinor,
      0,
    );
    expect(shares).toBe(FIXTURE_BILL_REVIEW.billTotalMinor);
    expect(FIXTURE_BILL_REVIEW.billTotalMinor).toBe(BILL_TOTAL_MINOR);
    expect(FIXTURE_BILL_REVIEW.reconciles).toBe(true);
  });

  it("Andre owes exactly ฿291.74, from the canonical breakdown", () => {
    const andre = FIXTURE_BILL_REVIEW.breakdowns.find((r) => r.displayName === "Andre");
    expect(andre).toBeDefined();
    expect(andre!.itemShareMinor).toBe(24_000); // ฿240.00
    expect(andre!.serviceMinor).toBe(2_400); //    ฿24.00
    expect(andre!.taxMinor).toBe(1_848); //        ฿18.48
    expect(andre!.tipMinor).toBe(925); //           ฿9.25
    expect(andre!.roundingMinor).toBe(1); //        ฿0.01
    expect(andre!.totalMinor).toBe(29_174); //    ฿291.74
  });

  it("discloses the matching negative rounding rather than hiding the asymmetry", () => {
    const rounding = FIXTURE_BILL_REVIEW.breakdowns.map((r) => r.roundingMinor);
    expect(rounding.reduce((a, b) => a + b, 0)).toBe(0);
    expect(rounding).toContain(1);
    expect(rounding).toContain(-1);
  });

  it("only casts the five protagonists", () => {
    const cast = ["Maya", "Andre", "Noi", "Ploy", "Tim"];
    for (const row of FIXTURE_BILL_REVIEW.breakdowns) {
      expect(cast, `${row.displayName} is not in the cast`).toContain(row.displayName);
    }
    for (const participant of FIXTURE_CLAIM_BOARD.participants) {
      expect(cast).toContain(participant.displayName);
    }
  });
});
