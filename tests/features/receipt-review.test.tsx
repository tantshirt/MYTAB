import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReceiptReview } from "@/features/receipts/ReceiptReview";
import { ReceiptCapture, ManualEntryFallback } from "@/features/receipts/ReceiptCapture";
import { FIXTURE_PARSED_RECEIPT } from "@/lib/domain/receiptFixture";

describe("Story 8.4 — Receipt review", () => {
  it("AC2 — discrepancy card states exact gap", () => {
    const mismatched = {
      ...FIXTURE_PARSED_RECEIPT,
      reconciliation: {
        ...FIXTURE_PARSED_RECEIPT.reconciliation,
        reconciled: false,
        differenceMinor: 2800,
      },
    };

    const html = renderToStaticMarkup(
      <ReceiptReview
        parsed={mismatched}
        onConfirm={() => undefined}
        onManualEntry={() => undefined}
      />,
    );

    expect(html).toContain("Items add up to");
    expect(html).toContain("but the total says");
  });

  it("AC1 — low-confidence row flagged with word", () => {
    const html = renderToStaticMarkup(
      <ReceiptReview
        parsed={FIXTURE_PARSED_RECEIPT}
        onConfirm={() => undefined}
        onManualEntry={() => undefined}
      />,
    );

    expect(html).toContain("Check this row");
  });

  it("AC5 — no confidence percentages", () => {
    const html = renderToStaticMarkup(
      <ReceiptReview
        parsed={FIXTURE_PARSED_RECEIPT}
        onConfirm={() => undefined}
        onManualEntry={() => undefined}
      />,
    );

    expect(html).not.toContain("confidence score");
    expect(html).not.toContain("confidence:");
  });
});

describe("Story 8.1/8.6 — Receipt capture", () => {
  it("AC7 — scan affordance without AI framing", () => {
    const previous = process.env.NEXT_PUBLIC_FEATURE_RECEIPT_SCAN;
    process.env.NEXT_PUBLIC_FEATURE_RECEIPT_SCAN = "true";

    const html = renderToStaticMarkup(
      <ReceiptCapture onCapture={() => undefined} onSelectFile={() => undefined} />,
    );

    expect(html).toContain("Scan receipt");
    expect(html).not.toMatch(/AI|magic|sparkle|robot/i);

    process.env.NEXT_PUBLIC_FEATURE_RECEIPT_SCAN = previous;
  });

  it("AC2 — failure fallback to manual entry", () => {
    const html = renderToStaticMarkup(
      <ManualEntryFallback onManualEntry={() => undefined} failureMessage="Could not read photo" />,
    );

    expect(html).toContain("Add what you ordered");
    expect(html).toContain("Add items manually");
  });
});
