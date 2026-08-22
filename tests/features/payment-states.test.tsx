import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentStateBadge } from "@/features/balances/PaymentStateBadge";
import { AllSquareCard } from "@/features/balances/AllSquareCard";
import {
  formatPaymentFailureMessage,
  getPaymentStatePresentation,
} from "@/lib/domain/paymentState";

describe("Story 7.4 — Payment states", () => {
  it("AC1 — six distinct presentations", () => {
    const states = ["quoted", "awaiting_signature", "submitted", "confirmed", "failed", "expired"] as const;
    const labels = states.map((s) => getPaymentStatePresentation(s).label);
    expect(new Set(labels).size).toBe(6);
  });

  it("AC1 — each carries word and glyph", () => {
    const html = renderToStaticMarkup(<PaymentStateBadge state="submitted" />);
    expect(html).toContain("Submitted");
    expect(html).toContain("↗");
  });

  it("AC4 — failure copy from stable code", () => {
    const message = formatPaymentFailureMessage("CONFIRMATION_REJECTED");
    expect(message).toContain("network");
    expect(message).not.toMatch(/Error:|stack/i);
  });
});

describe("Story 7.6 — All square card", () => {
  it("AC3 — centered check, headline, presence, primary action", () => {
    const html = renderToStaticMarkup(
      <AllSquareCard
        billName="Sukhumvit Dinner"
        amountLabel="฿1,840.00"
        settledCount={5}
        totalCount={5}
        members={[
          { userId: "u1", displayName: "Maya" },
          { userId: "u2", displayName: "Andre" },
        ]}
        onDismiss={() => undefined}
        reduceMotion
      />,
    );

    expect(html).toContain("All square");
    expect(html).toContain("Done");
    // Reduce Motion keeps the wash and drops only the washing-in.
    expect(html).toContain("linear-gradient");
    expect(html).not.toContain("mytab-allsquare-wash 600ms");
  });
});
