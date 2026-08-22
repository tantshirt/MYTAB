import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentProgress, PaymentSheet, SheetContainer } from "@/components/settlement-sheet";
import type { PaymentSheetProps } from "@/components/settlement-sheet/PaymentSheet";
import { SETTLEMENT_STATUS } from "@/convex/lib/settlementState";

const TOKENS = [
  { id: "usdc", name: "USDC", balanceLabel: "12.40 USDC", affordable: true },
  { id: "sol", name: "SOL", balanceLabel: "0.0612 SOL", affordable: true },
];

function sheet(overrides: Partial<PaymentSheetProps> = {}) {
  const props: PaymentSheetProps = {
    billAmount: "฿291.74",
    billAmountLabel: "your share of Sukhumvit Dinner",
    recipientName: "Maya",
    destinationAsset: "USDC",
    tokens: TOKENS,
    selectedTokenId: "sol",
    onSelectToken: () => undefined,
    spendLabel: "≈ 0.0412 SOL",
    minimumReceiveAmount: "8.25 USDC",
    maximumSpend: "0.0418 SOL",
    rateLabel: "฿35.36 per USDC",
    quoteRemainingMs: 42_000,
    onPay: () => undefined,
    ...overrides,
  };
  return renderToStaticMarkup(<PaymentSheet {...props} />);
}

describe("Payment Sheet — §1.8", () => {
  it("renders the one sanctioned reading order", () => {
    const html = sheet({
      roundUpLabel: "Round up to ฿300",
      roundUpAmountLabel: "+฿8.26",
      onToggleRoundUp: () => undefined,
    });

    // amount → recipient → Pay with → disclosed lines → tip → disclosure → countdown → CTA
    const order = [
      "฿291.74",
      "To Maya",
      "Pay with",
      "You spend",
      "Maya receives at least",
      "Round up to ฿300",
      "Fees and network",
      "Quote refreshes in 0:42",
    ].map((needle) => html.indexOf(needle));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // The amount on the button is the last thing a person reads.
    expect(html.lastIndexOf("Pay ฿291.74")).toBeGreaterThan(order[order.length - 1]!);
    expect(html).not.toMatch(/execute|swap|broadcast|signature|mint|blockhash|\broute\b/i);
  });

  it("carries the obligation at amount-lg, not at list-row size", () => {
    // DESIGN.md: `amount-lg` (34px) carries the obligation on this surface.
    expect(sheet()).toContain("font-size:34px");
  });

  it("names the person on the minimum-receive line and gives it a real value", () => {
    const html = sheet({ recipientName: "Maya", minimumReceiveAmount: "8.25 USDC" });
    expect(html).toContain("Maya receives at least");
    expect(html).toContain("8.25 USDC");
    // "At least" is the honest word, so the figure is never presented as exact.
    expect(html).not.toContain("Minimum they receive");
  });

  it("keeps the disclosure collapsed on open and labels it Fees and network", () => {
    const html = sheet();
    expect(html).toContain("Fees and network");
    expect(html).toContain('aria-expanded="false"');
    // Never unmounted, so the panel is present but hidden.
    expect(html).toContain("hidden");
    expect(html).toContain("Covered by My Tab");
    expect(html).toContain("Most you can spend");
    expect(html).toContain("฿35.36 per USDC");
    // PLATFORM_FEE_BPS is zero; no placeholder fee line anywhere.
    expect(html).not.toMatch(/platform fee|service fee/i);
  });

  it("shows refresh quote when expired and dims amounts", () => {
    const html = sheet({ quoteRemainingMs: 0, quoteExpired: true });

    expect(html).toContain("Refresh quote");
    expect(html).toContain("opacity:0.4");
    expect(html).toContain("Quote expired. Refresh it.");
    // The amounts hold their last values rather than blanking.
    expect(html).toContain("฿291.74");
    expect(html).toContain("transition:opacity 160ms ease");
  });

  it("closes the gap where the clock ran out but the server flag had not flipped", () => {
    const html = sheet({ quoteRemainingMs: 0, quoteExpired: false });

    expect(html).toContain("Quote expired. Refresh it.");
    expect(html).toContain("Refresh quote");
    expect(html).toContain("opacity:0.4");
  });

  it("keeps a stale bill in place rather than replacing the sheet", () => {
    const html = sheet({ staleRevision: true, onRefreshBill: () => undefined });

    expect(html).toContain("This bill changed. Refresh to see your new amount.");
    expect(html).toContain("Refresh bill");
    // The person keeps their bearings: the amounts are dimmed, never removed.
    expect(html).toContain("฿291.74");
    expect(html).toContain("To Maya");
    expect(html).toContain("opacity:0.4");
  });

  it("disables the action while the quote is still resolving", () => {
    const html = sheet({ quoteResolving: true, quoteRemainingMs: 0 });

    expect(html).toContain("Getting your quote");
    expect(html).toContain("disabled");
    expect(html).toContain("Pay ฿291.74");
    expect(html).not.toContain("Quote expired. Refresh it.");
  });

  it("disables the action while payments are paused", () => {
    const html = sheet({ paymentsPaused: true });

    expect(html).toContain("Payments are paused right now. Your tab is safe.");
    expect(html).toContain("disabled");
  });

  it("gives the countdown a live region that does not speak every second", () => {
    const html = sheet();

    expect(html).toContain('aria-live="polite"');
    // The ticking figure itself is hidden from the live region.
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("Payment Progress — §1.9", () => {
  it("renders server-driven payment progress steps", () => {
    const html = renderToStaticMarkup(
      <PaymentProgress status={SETTLEMENT_STATUS.SUBMITTED} recipientName="Maya" />,
    );

    expect(html).toContain("Sending to Maya");
    expect(html).toContain("Usually takes a few seconds");
  });

  it("leads with the amount in flight rather than a heading", () => {
    const html = renderToStaticMarkup(
      <PaymentProgress
        status={SETTLEMENT_STATUS.SUBMITTED}
        recipientName="Maya"
        amount="฿291.74"
      />,
    );

    expect(html).toContain("฿291.74");
    expect(html).toContain("to Maya");
    expect(html).toContain("font-size:34px");
    expect(html).not.toContain("<h2");
  });

  it("draws the stepper at the specified geometry", () => {
    const html = renderToStaticMarkup(
      <PaymentProgress status={SETTLEMENT_STATUS.SUBMITTED} recipientName="Maya" />,
    );

    expect(html).toContain("width:26px");
    expect(html).toContain("border:2px solid");
    expect(html).toContain("mytab-stepper-pulse");
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

describe("SheetContainer — §1.8, §5.4", () => {
  it("is a sheet: scrim, rounded/lg top corners, grab handle, shadow", () => {
    const html = renderToStaticMarkup(
      <SheetContainer label="Payment sheet" onDismiss={() => undefined}>
        <p>contents</p>
      </SheetContainer>,
    );

    expect(html).toContain("rgba(10, 32, 56, 0.38)");
    expect(html).toContain("border-radius:20px 20px 0 0");
    // 36x4 grab handle.
    expect(html).toContain("width:36px");
    expect(html).toContain("height:4px");
    expect(html).toContain("box-shadow:0 -8px 32px");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("overscroll-behavior:contain");
  });

  it("offers a dismiss affordance before Pay and none after", () => {
    const before = renderToStaticMarkup(
      <SheetContainer label="Payment sheet" onDismiss={() => undefined}>
        <p>contents</p>
      </SheetContainer>,
    );
    const after = renderToStaticMarkup(
      <SheetContainer label="Payment sheet" dismissible={false} onDismiss={() => undefined}>
        <p>contents</p>
      </SheetContainer>,
    );

    expect(before).toContain('aria-label="Dismiss"');
    // Once Pay is tapped the sheet cannot be dismissed backward.
    expect(after).not.toContain('aria-label="Dismiss"');
  });

  it("presents from off-screen so the transform is gesture-continuous", () => {
    const html = renderToStaticMarkup(
      <SheetContainer label="Payment sheet" onDismiss={() => undefined}>
        <p>contents</p>
      </SheetContainer>,
    );

    expect(html).toContain("translateY(100%)");
    expect(html).toContain("cubic-bezier(0.32, 0.72, 0, 1)");
  });
});
