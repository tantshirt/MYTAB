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
    expect(html).toContain("Quote expired. Refresh it.");
    // The amounts hold their last values rather than blanking.
    expect(html).toContain("฿291.74");
  });

  it("closes the gap where the clock ran out but the server flag had not flipped", () => {
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
        quoteExpired={false}
        onPay={() => undefined}
        onRefreshQuote={() => undefined}
      />,
    );

    expect(html).toContain("Quote expired. Refresh it.");
    expect(html).toContain("Refresh quote");
    expect(html).toContain("opacity:0.4");
  });

  it("gives the countdown a live region that does not speak every second", () => {
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
        onPay={() => undefined}
      />,
    );

    expect(html).toContain('aria-live="polite"');
    // The ticking figure itself is hidden from the live region.
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders server-driven payment progress steps", () => {
    const html = renderToStaticMarkup(
      <PaymentProgress status={SETTLEMENT_STATUS.SUBMITTED} recipientName="Maya" />,
    );

    expect(html).toContain("Sending to Maya");
    expect(html).toContain("Usually takes a few seconds");
  });

  it("shows failure actions with the cause named, never a raw code", () => {
    const html = renderToStaticMarkup(
      <PaymentProgress
        status={SETTLEMENT_STATUS.FAILED}
        recipientName="Maya"
        failureCode="QUOTE_EXPIRED"
        onTryAgain={() => undefined}
        onBackToTab={() => undefined}
      />,
    );

    expect(html).toContain("Try again");
    expect(html).toContain("Back to tab");
    expect(html).toContain("Quote expired. Refresh it.");
    expect(html).toContain("Nothing left your wallet. Your share is unchanged.");
    expect(html).not.toContain("QUOTE_EXPIRED");
    expect(html).not.toMatch(/something went wrong/i);
  });

  it("keeps the four steps and offers no retry while the outcome is unknown", () => {
    const html = renderToStaticMarkup(
      <PaymentProgress
        status={SETTLEMENT_STATUS.UNKNOWN}
        recipientName="Maya"
        onTryAgain={() => undefined}
        onBackToTab={() => undefined}
      />,
    );

    expect(html).toContain("Still checking");
    // Rendered markup escapes the apostrophe.
    expect(html).toContain("Still checking — don&#x27;t pay again.");
    expect(html).toContain("Approved in your wallet");
    expect(html).toContain("Verifying");
    expect(html).not.toContain("Try again");
    expect(html).not.toContain("Sending payment");
  });

  it("never renders an expired payment as approved and active", () => {
    const html = renderToStaticMarkup(
      <PaymentProgress status={SETTLEMENT_STATUS.EXPIRED} recipientName="Maya" />,
    );

    expect(html).toContain("Quote expired. Refresh it.");
    expect(html).not.toContain('aria-current="step"');
  });

  it("surfaces superseded as a changed bill, not as progress", () => {
    const html = renderToStaticMarkup(
      <PaymentProgress status={SETTLEMENT_STATUS.SUPERSEDED} recipientName="Maya" />,
    );

    expect(html).toContain("This bill changed. Refresh to see your new amount.");
    expect(html).not.toContain('aria-current="step"');
  });

  it("carries a live region so each transition is announced once", () => {
    const html = renderToStaticMarkup(
      <PaymentProgress status={SETTLEMENT_STATUS.SUBMITTED} recipientName="Maya" />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("You can close this — we&#x27;ll update the tab either way.");
  });
});
