import { describe, expect, it } from "vitest";
import {
  formatDiscrepancyCopy,
  parseExtractedReceipt,
  parseReceiptAmount,
  recomputeReconciliation,
} from "@/lib/domain/receiptParse";
import {
  RECEIPT_FORMAT_FIXTURES,
  validateReceiptFixture,
} from "@/lib/domain/receiptFixture";

describe("Story 8.3 — deterministic re-parse", () => {
  it("AC1 — parses whole baht and two-decimal strings to minor units", () => {
    expect(parseReceiptAmount("120")).toBe(12_000);
    expect(parseReceiptAmount("85.50")).toBe(8_550);
  });

  it("AC2 — recomputes line totals, flags mismatch", () => {
    const parsed = parseExtractedReceipt({
      lines: [
        {
          name: "Item",
          quantity: 2,
          unitPriceRaw: "100",
          lineTotalRaw: "250",
        },
      ],
      totalRaw: "200",
    });

    expect(parsed.lines[0]?.computedLineTotalMinor).toBe(20_000);
    expect(parsed.lines[0]?.lineMismatch).toBe(true);
  });

  it("AC3 — reconciliation stored in integer minor units", () => {
    const parsed = parseExtractedReceipt({
      lines: [{ name: "A", quantity: 1, unitPriceRaw: "100" }],
      totalRaw: "120",
    });

    expect(parsed.reconciliation.differenceMinor).toBe(2_000);
    expect(parsed.reconciliation.reconciled).toBe(false);
    expect(formatDiscrepancyCopy(parsed.reconciliation)).toContain("฿100.00");
    expect(formatDiscrepancyCopy(parsed.reconciliation)).toContain("฿120.00");
  });

  it("AC5 — live recompute after edit", () => {
    const parsed = parseExtractedReceipt({
      lines: [{ name: "A", quantity: 1, unitPriceRaw: "100" }],
      totalRaw: "120",
    });

    const fixed = recomputeReconciliation({
      lines: [{ ...parsed.lines[0]!, unitPriceMinor: 12_000, computedLineTotalMinor: 12_000 }],
      receiptTotalMinor: 12_000,
    });

    expect(fixed.reconciled).toBe(true);
  });
});

describe("Story 8.7 — Thai/English receipt subset", () => {
  it("AC2 — each named format has a fixture passing parser", () => {
    for (const [name, fixture] of Object.entries(RECEIPT_FORMAT_FIXTURES)) {
      const result = validateReceiptFixture(fixture);
      expect(result.parsed.lines.length).toBeGreaterThan(0);
      expect(result.parsed.reconciliation.receiptTotalMinor).toBeGreaterThan(0);
      expect(name).toBeTruthy();
    }
  });
});
