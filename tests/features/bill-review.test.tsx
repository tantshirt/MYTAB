import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BillReview,
  buildBillReviewLines,
  buildBillTotalsLines,
  type BillReviewBreakdown,
  type BillReviewProps,
} from "@/features/claims/BillReview";
import { FIXTURE_BILL_REVIEW } from "@/tests/fixtures/claims";

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
    // The check is drawn (§1.7), so the sentence no longer carries a "✓" glyph —
    // semantic colour still never travels alone.
    expect(html).toContain("Everyone&#x27;s shares add up to ฿1,840.00");
    expect(html).toContain('stroke-width="2.4"');
  });
});

describe("P2-28 — one card of hairlines, not a card per person", () => {
  it("does not wrap each participant in its own rounded card", () => {
    const html = renderToStaticMarkup(
      <BillReview
        {...props({
          breakdowns: [
            row({ participantId: "user_maya", displayName: "Maya" }),
            row({ participantId: "user_noi", displayName: "Noi" }),
          ],
          billTotalMinor: 180_000,
        })}
      />,
    );
    // One card wrapper, one radius. DESIGN.md: "Lists are separated by `colors/border`
    // hairlines inside one card" — never one rounded card per row.
    expect(html.match(/border-radius:12px/g) ?? []).toHaveLength(1);
    expect(html).not.toContain("margin-bottom:12px");
  });

  it("replaces the mechanism caption with the tab and the head count", () => {
    const html = renderToStaticMarkup(<BillReview {...props()} />);
    expect(html).toContain("Review bill");
    expect(html).toContain("Sukhumvit Dinner · 1 person");
    expect(html).not.toContain("read only");
  });

  it("tints the viewer's own row so they find themselves without reading", () => {
    const html = renderToStaticMarkup(
      <BillReview {...props({ viewerUserId: "user_maya" })} />,
    );
    expect(html).toContain("background:#E7EDFC");
    expect(html).toContain("Maya · you");
  });
});

describe("P2-28 — the 'Applied to everyone' block", () => {
  it("sums from the same per-person rows, so the halves cannot disagree", () => {
    const lines = buildBillTotalsLines(FIXTURE_BILL_REVIEW.breakdowns, {
      servicePercent: 10,
      taxPercent: 7,
    });
    expect(lines.map((line) => line.label)).toEqual([
      "Subtotal",
      "Service charge 10%",
      "VAT 7%",
      "Group tip",
    ]);
    expect(lines.map((line) => line.amount)).toEqual([
      "฿1,524.00",
      "฿152.40",
      "฿117.35",
      "฿46.25",
    ]);

    const summed =
      152_400 + 15_240 + 11_735 + 4_625 +
      FIXTURE_BILL_REVIEW.breakdowns.reduce((total, one) => total + one.roundingMinor, 0);
    expect(summed).toBe(FIXTURE_BILL_REVIEW.billTotalMinor);
  });

  it("annotates every shared charge `proportional`, and the subtotal not at all", () => {
    const lines = buildBillTotalsLines(FIXTURE_BILL_REVIEW.breakdowns);
    expect(lines.find((line) => line.key === "subtotal")?.annotation).toBeUndefined();
    for (const key of ["service", "tax", "tip"]) {
      expect(lines.find((line) => line.key === key)?.annotation).toBe("proportional");
    }
  });

  it("renders the block with the bill total beneath it", () => {
    const html = renderToStaticMarkup(<BillReview {...FIXTURE_BILL_REVIEW} />);
    expect(html).toContain("Applied to everyone");
    expect(html).toContain("proportional");
    expect(html).toContain("฿1,840.00");
  });
});

describe("P2-28 — the pinned bar and its note", () => {
  it("gives the organizer the sentence that makes lock feel deliberate", () => {
    const html = renderToStaticMarkup(<BillReview {...props()} />);
    expect(html).toContain("Lock bill");
    expect(html).toContain(
      "Locking creates each person&#x27;s final amount. Editing after this needs a reopen.",
    );
  });

  it("states the reason a participant cannot act yet", () => {
    const html = renderToStaticMarkup(<BillReview {...props({ isOrganizer: false })} />);
    expect(html).toContain("Settle up");
    expect(html).toContain("Waiting on Maya to lock.");
  });

  it("tells a participant their amount is final after lock", () => {
    const html = renderToStaticMarkup(
      <BillReview {...props({ isOrganizer: false, isLocked: true })} />,
    );
    expect(html).toContain("Maya locked this bill. Your amount is final.");
  });

  it("carries the safe area through the published CSS var", () => {
    expect(renderToStaticMarkup(<BillReview {...props()} />)).toContain(
      "var(--app-pad-bottom, 0px)",
    );
  });
});

describe("P2-28 — nobody has claimed anything yet", () => {
  it("offers a way back rather than an empty card", () => {
    const html = renderToStaticMarkup(<BillReview {...props({ breakdowns: [] })} />);
    expect(html).toContain("Nobody has claimed anything yet.");
    expect(html).toContain("Back to the tab");
  });
});
