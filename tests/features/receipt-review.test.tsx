import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { ReceiptReview } from "@/features/receipts/ReceiptReview";
import { ReceiptCapture, ManualEntryFallback } from "@/features/receipts/ReceiptCapture";
import { FIXTURE_PARSED_RECEIPT } from "@/lib/domain/receiptFixture";
import { fiatMinorFromInteger } from "@/lib/domain/money";

function renderReview(parsed = FIXTURE_PARSED_RECEIPT, extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <ReceiptReview
      parsed={parsed}
      onConfirm={() => undefined}
      onManualEntry={() => undefined}
      {...extra}
    />,
  );
}

describe("Story 8.4 — Receipt review", () => {
  it("AC2 — discrepancy card states exact gap and names its next action", () => {
    const mismatched = {
      ...FIXTURE_PARSED_RECEIPT,
      reconciliation: {
        ...FIXTURE_PARSED_RECEIPT.reconciliation,
        reconciled: false,
        differenceMinor: fiatMinorFromInteger(2800),
      },
    };

    const html = renderReview(mismatched);

    expect(html).toContain("Items add up to");
    expect(html).toContain("but the total says");
    // §1.5 — the sentence must name its next action.
    expect(html).toContain("Check the highlighted rows.");
  });

  it("AC1 — low-confidence row flagged with word", () => {
    const html = renderReview();
    expect(html).toContain("Check this row");
  });

  it("AC5 — no confidence percentages", () => {
    const html = renderReview();
    expect(html).not.toContain("confidence score");
    expect(html).not.toContain("confidence:");
  });

  // The worst voice violation in the codebase: people were asked to type satang
  // integers under a label that named the storage unit (POLISH-SPEC §1.5).
  it("§1.5 — never surfaces the storage unit", () => {
    const html = renderReview();
    expect(html).not.toContain("(minor)");
    expect(html).not.toMatch(/minor/i);
    expect(html).toContain("Receipt total");
  });

  it("§1.5 — a disabled Confirm states its reason", () => {
    const html = renderReview();
    expect(html).toContain("Confirm receipt");
    expect(html).toContain("disabled");
    expect(html).toContain("The items and the receipt total have to match first.");
  });

  it("§1.5 — the sample-receipt affordance is hidden unless demo mode is on", () => {
    const previous = process.env.NEXT_PUBLIC_DEMO_MODE;

    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    expect(renderReview(FIXTURE_PARSED_RECEIPT, { onUseSampleReceipt: () => undefined })).not.toContain(
      "Use sample receipt",
    );

    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    expect(renderReview(FIXTURE_PARSED_RECEIPT, { onUseSampleReceipt: () => undefined })).toContain(
      "Use sample receipt",
    );

    process.env.NEXT_PUBLIC_DEMO_MODE = previous;
  });
});

describe("Story 8.1/8.6 — Receipt capture", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_FEATURE_RECEIPT_SCAN;
  });

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
