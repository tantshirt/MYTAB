import { describe, expect, it } from "vitest";
import { combineReceiptPages, parseExtractedReceipt } from "@/lib/domain/receiptParse";

describe("multi-page exact receipt extraction", () => {
  it("combines pages in order and reconciles printed adjustments", () => {
    const combined = combineReceiptPages([
      {
        currency: "KWD",
        merchant: "Table",
        lines: [{ name: "Starter", quantity: 1, unitPriceRaw: "1.250" }],
        totalRaw: "",
      },
      {
        currency: "KWD",
        lines: [{ name: "Main", quantity: 2, unitPriceRaw: "2.000" }],
        adjustments: [
          { kind: "service", amountRaw: "0.500" },
          { kind: "discount", amountRaw: "0.250" },
          { kind: "gratuity", amountRaw: "0.100" },
        ],
        totalRaw: "5.600",
      },
    ]);

    const parsed = parseExtractedReceipt(combined);
    expect(parsed.currency).toBe("KWD");
    expect(parsed.lines.map((line) => line.name)).toEqual(["Starter", "Main"]);
    expect(parsed.reconciliation.reconciled).toBe(true);
    expect(parsed.reconciliation.adjustmentsTotalMinor).toBe(350);
  });

  it("blocks a currency mismatch across pages", () => {
    expect(() =>
      combineReceiptPages([
        { currency: "JPY", lines: [], totalRaw: "1" },
        { currency: "THB", lines: [], totalRaw: "1.00" },
      ]),
    ).toThrow("RECEIPT_CURRENCY_MISMATCH");
  });

  it("refuses totals or adjustments before the final page", () => {
    expect(() => combineReceiptPages([
      {
        currency: "THB",
        lines: [{ name: "Starter", quantity: 1, unitPriceRaw: "100.00" }],
        adjustments: [{ kind: "tax", amountRaw: "7.00" }],
        totalRaw: "107.00",
      },
      {
        currency: "THB",
        lines: [{ name: "Main", quantity: 1, unitPriceRaw: "200.00" }],
        totalRaw: "307.00",
      },
    ])).toThrow("RECEIPT_NON_FINAL_SUMMARY");
  });

  it("normalizes printed discount sign to a positive magnitude", () => {
    const parsed = parseExtractedReceipt({
      currency: "THB",
      lines: [{ name: "Main", quantity: 1, unitPriceRaw: "100.00" }],
      adjustments: [{ kind: "discount", amountRaw: "-10.00" }],
      totalRaw: "90.00",
    });
    expect(parsed.adjustments[0]?.amountMinor).toBe(1_000);
    expect(parsed.reconciliation.reconciled).toBe(true);
  });
});
