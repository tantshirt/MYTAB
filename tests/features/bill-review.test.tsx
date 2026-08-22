import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BillReview,
  buildBillReviewLines,
  type BillReviewBreakdown,
  type BillReviewProps,
} from "@/features/claims/BillReview";

function props(overrides: Partial<BillReviewProps> = {}): BillReviewProps {
  return {
    tabName: "Sukhumvit Dinner",
    isOrganizer: true,
    isLocked: false,
    billTotalMinor: 100_000,
    reconciles: true,
    organizerDisplayName: "Maya",
    breakdowns: [
      {
        participantId: "user_maya",
        displayName: "Maya",
        itemShareMinor: 90_000,
        taxMinor: 6_300,
        serviceMinor: 4_500,
        tipMinor: 0,
        discountMinor: 0,
        roundingMinor: -1,
        totalMinor: 100_799,
      },
    ],
    ...overrides,
  };
}

function row(overrides: Partial<BillReviewBreakdown> = {}): BillReviewBreakdown {
  return {
    participantId: "user_maya",
    displayName: "Maya",
    itemShareMinor: 90_000,
    taxMinor: 0,
    serviceMinor: 0,
    tipMinor: 0,
    discountMinor: 0,
    roundingMinor: 0,
    totalMinor: 90_000,
    ...overrides,
  };
}

describe("P0-12 — the expanded breakdown always sums", () => {
  it("shows a negative rounding line signed, never hidden", () => {
    const lines = buildBillReviewLines(row({ roundingMinor: -1, totalMinor: 89_999 }));
    const rounding = lines.find((line) => line.key === "rounding");

    expect(rounding).toBeTruthy();
    expect(rounding?.amount).toBe("−฿0.01");
    expect(rounding?.tone).toBe("warning");
  });

  it("shows a positive rounding line with its plus", () => {
    const rounding = buildBillReviewLines(row({ roundingMinor: 1 })).find(
      (line) => line.key === "rounding",
    );
    expect(rounding?.amount).toBe("+฿0.01");
  });

  it("shows discounts in either direction", () => {
    expect(
      buildBillReviewLines(row({ discountMinor: 500 })).find((l) => l.key === "discount")?.amount,
    ).toBe("−฿5.00");
    expect(
      buildBillReviewLines(row({ discountMinor: -500 })).find((l) => l.key === "discount")?.amount,
    ).toBe("+฿5.00");
  });

  it("omits only genuinely zero lines", () => {
    expect(buildBillReviewLines(row()).map((line) => line.key)).toEqual(["items"]);
    expect(
      buildBillReviewLines(
        row({ serviceMinor: 1, taxMinor: -1, tipMinor: 1, discountMinor: 1, roundingMinor: -1 }),
      ).map((line) => line.key),
    ).toEqual(["items", "service", "tax", "tip", "discount", "rounding"]);
  });

  it("names the exact shortfall when shares do not reconcile", () => {
    const html = renderToStaticMarkup(
      <BillReview
        {...props({
          reconciles: false,
          billTotalMinor: 101_000,
          breakdowns: [
            {
              participantId: "user_maya",
              displayName: "Maya",
              itemShareMinor: 100_000,
              taxMinor: 0,
              serviceMinor: 0,
              tipMinor: 0,
              discountMinor: 0,
              roundingMinor: 0,
              totalMinor: 100_000,
            },
          ],
        })}
      />,
    );

    expect(html).toContain("Shares are ฿10.00 short of ฿1,010.00. Lock is blocked.");
    expect(html).not.toContain("do not reconcile");
  });

  it("states reconciliation positively with the exact total", () => {
    const html = renderToStaticMarkup(<BillReview {...props({ billTotalMinor: 184_000 })} />);
    expect(html).toContain("Everyone&#x27;s shares add up to ฿1,840.00 ✓");
  });
});
