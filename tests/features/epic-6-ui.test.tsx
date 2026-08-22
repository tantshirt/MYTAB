import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentTokenSelector } from "@/components/settlement-sheet/PaymentTokenSelector";
import { RoundUpControl } from "@/components/settlement-sheet/RoundUpControl";
import { PaymentSheet } from "@/components/settlement-sheet/PaymentSheet";
import { ClaimBoard } from "@/features/settlement/ClaimBoard";
import {
  formatPaymentProgressMessage,
} from "@/convex/lib/paymentConfirmationNotify";

describe("Story 6.5 — payment token selector", () => {
  it("shows token names and balances without logos", () => {
    const html = renderToStaticMarkup(
      <PaymentTokenSelector
        tokens={[
          { id: "usdc", name: "USDC", balanceLabel: "12.50 USDC", affordable: true },
          { id: "sol", name: "Solana", balanceLabel: "0.04 SOL", affordable: false },
        ]}
        selectedId="usdc"
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain("USDC");
    expect(html).toContain("12.50 USDC");
    expect(html).toContain("Solana");
    expect(html).toContain("0.04 SOL");
    expect(html).toContain('role="radio"');
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain("min-height:44px");
  });

  it("keeps unaffordable tokens visible but disabled", () => {
    const html = renderToStaticMarkup(
      <PaymentTokenSelector
        tokens={[{ id: "sol", name: "Solana", balanceLabel: "0.01 SOL", affordable: false }]}
        selectedId="sol"
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain("disabled");
    expect(html).toContain("0.01 SOL");
  });
});

describe("Story 6.6 — stale revision, in place", () => {
  it("keeps the amounts and puts the message in the sheet", () => {
    const html = renderToStaticMarkup(
      <PaymentSheet
        billAmount="฿291.74"
        billAmountLabel="your share of Sukhumvit Dinner"
        recipientName="Maya"
        destinationAsset="USDC"
        tokens={[{ id: "usdc", name: "USDC", balanceLabel: "12.40 USDC", affordable: true }]}
        selectedTokenId="usdc"
        onSelectToken={() => undefined}
        spendLabel="8.31 USDC"
        minimumReceiveAmount="8.25 USDC"
        maximumSpend="8.31 USDC"
        quoteRemainingMs={42_000}
        staleRevision
        onPay={() => undefined}
        onRefreshBill={() => undefined}
      />,
    );
    expect(html).toContain("This bill changed. Refresh to see your new amount.");
    expect(html).toContain("Refresh bill");
    // The sheet is not replaced: the amounts hold their values, dimmed.
    expect(html).toContain("8.25 USDC");
    expect(html).toContain("opacity:0.4");
  });
});

describe("Story 6.7 — claim board progress", () => {
  it("counts only settled rows in the ring caption", () => {
    const html = renderToStaticMarkup(
      <ClaimBoard
        rows={[
          { id: "1", participantName: "Alex", amountLabel: "฿291.74", status: "settled" },
          { id: "2", participantName: "Maya", amountLabel: "฿120.00", status: "submitted" },
          { id: "3", participantName: "Bo", amountLabel: "฿80.00", status: "open" },
        ]}
        settledCount={1}
        totalCount={3}
      />,
    );

    expect(html).toContain("1 of 3 settled");
    expect(html).toContain("aria-live");
  });
});

describe("Story 6.8 — payment confirmed group message", () => {
  it("states group facts only", () => {
    expect(
      formatPaymentProgressMessage({
        tabId: "tabs:1" as never,
        groupId: "groups:1" as never,
        settledCount: 2,
        totalCount: 5,
        billCompleted: false,
      }),
    ).toBe("2 of 5 shares settled");

    expect(
      formatPaymentProgressMessage({
        tabId: "tabs:1" as never,
        groupId: "groups:1" as never,
        settledCount: 5,
        totalCount: 5,
        billCompleted: true,
      }),
    ).toBe("This bill is all settled. Nice work, everyone.");
  });
});

describe("Story 6.9 — round-up control", () => {
  it("shows the amount whether it is on or off, and clears the 44px floor", () => {
    for (const enabled of [true, false]) {
      const html = renderToStaticMarkup(
        <RoundUpControl
          label="Round up for the organizer"
          amountLabel="0.50 USDC"
          enabled={enabled}
          onToggle={() => undefined}
        />,
      );

      expect(html).toContain("Round up for the organizer");
      // A person cannot weigh an offer they cannot see.
      expect(html).toContain("0.50 USDC");
      expect(html).toContain("min-height:44px");
      expect(html).toContain(`aria-checked="${enabled}"`);
    }
  });

  it("carries the tip colour, never the action colour", () => {
    const html = renderToStaticMarkup(
      <RoundUpControl
        label="Round up to ฿300"
        amountLabel="+฿8.26"
        enabled
        onToggle={() => undefined}
      />,
    );

    expect(html).toContain("#A85F2E");
    expect(html).not.toContain("#1E51D2");
  });
});
