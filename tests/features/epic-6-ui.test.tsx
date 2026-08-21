import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentTokenSelector } from "@/components/settlement-sheet/PaymentTokenSelector";
import { RoundUpControl, StaleRevisionBanner } from "@/components/settlement-sheet/RoundUpControl";
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

describe("Story 6.6 — stale revision banner", () => {
  it("shows the required copy and one refresh action", () => {
    const html = renderToStaticMarkup(<StaleRevisionBanner onRefresh={() => undefined} />);
    expect(html).toContain("This bill changed. Refresh to see your new amount.");
    expect(html).toContain("Refresh");
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
  it("defaults off and shows the amount when enabled", () => {
    const html = renderToStaticMarkup(
      <RoundUpControl
        label="Round up for the organizer"
        amountLabel="0.50 USDC"
        enabled
        onToggle={() => undefined}
      />,
    );

    expect(html).toContain("Round up for the organizer");
    expect(html).toContain("0.50 USDC");
  });
});
