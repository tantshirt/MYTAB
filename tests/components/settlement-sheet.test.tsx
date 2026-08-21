import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentProgress, PaymentSheet } from "@/components/settlement-sheet";
import { SETTLEMENT_STATUS } from "@/convex/lib/settlementState";

describe("Story 3.7 — Payment Sheet and Progress", () => {
  it("renders the payment sheet in fixed order without banned vocabulary", () => {
    const html = renderToStaticMarkup(
      <PaymentSheet
        billAmountLabel="You owe"
        billAmount="฿291.74"
        recipientName="Maya"
        destinationAsset="USDC"
        paymentToken="USDC"
        maximumSpend="10.00 USDC"
        minimumReceive="10.00 USDC"
        quoteRemainingMs={42_000}
        quoteExpired={false}
        disclosureDefaultExpanded
        onPay={() => undefined}
      />,
    );

    expect(html.indexOf("You owe")).toBeLessThan(html.indexOf("Maya"));
    expect(html.indexOf("Maya")).toBeLessThan(html.indexOf("Paying with"));
    expect(html.indexOf("Paying with")).toBeLessThan(html.indexOf("Maximum you spend"));
    expect(html.indexOf("Maximum you spend")).toBeLessThan(html.indexOf("Fees and details"));
    expect(html).toContain("Quote refreshes in 0:42");
    expect(html).toContain("Fees and details");
    expect(html).toContain("Network fee · Covered by My Tab");
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toMatch(/execute|swap|broadcast|signature|mint|blockhash/i);
  });

  it("shows refresh quote when expired and dims amounts", () => {
    const html = renderToStaticMarkup(
      <PaymentSheet
        billAmountLabel="You owe"
        billAmount="฿291.74"
        recipientName="Maya"
        destinationAsset="USDC"
        paymentToken="USDC"
        maximumSpend="10.00 USDC"
        minimumReceive="10.00 USDC"
        quoteRemainingMs={0}
        quoteExpired
        onPay={() => undefined}
        onRefreshQuote={() => undefined}
      />,
    );

    expect(html).toContain("Refresh quote");
    expect(html).toContain("opacity:0.4");
  });

  it("renders server-driven payment progress steps", () => {
    const html = renderToStaticMarkup(
      <PaymentProgress status={SETTLEMENT_STATUS.SUBMITTED} recipientName="Maya" />,
    );

    expect(html).toContain("Sending to Maya");
    expect(html).toContain("Usually takes a few seconds");
  });

  it("shows failure actions without raw codes", () => {
    const html = renderToStaticMarkup(
      <PaymentProgress
        status={SETTLEMENT_STATUS.FAILED}
        recipientName="Maya"
        failureMessage="Quote expired before approval"
        onTryAgain={() => undefined}
        onBackToTab={() => undefined}
      />,
    );

    expect(html).toContain("Try again");
    expect(html).toContain("Back to tab");
    expect(html).toContain("Quote expired before approval");
    expect(html).not.toContain("INVALID_INTENT_STATUS");
  });
});
