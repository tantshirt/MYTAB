import { parseExtractedReceipt, type ExtractedReceipt } from "./receiptParse";

/** Seeded sample receipt for demo mode (Story 8.6, UX protagonists). */
export const FIXTURE_SAMPLE_EXTRACTION: ExtractedReceipt = {
  merchant: "Sukhumvit Kitchen",
  lines: [
    { name: "Green Curry", quantity: 1, unitPriceRaw: "180" },
    { name: "Pad Thai", quantity: 2, unitPriceRaw: "120" },
    { name: "Thai Iced Tea", quantity: 3, unitPriceRaw: "45.00" },
    {
      name: "Mango Sticky Rice",
      quantity: 1,
      unitPriceRaw: "95",
      priceConfidence: "low",
    },
  ],
  totalRaw: "1840.00",
};

/** Thai/English subset fixtures (Story 8.7). */
export const RECEIPT_FORMAT_FIXTURES = {
  thaiWholeBaht: {
    merchant: "ร้านอาหาร",
    lines: [{ name: "ข้าวผัด", quantity: 1, unitPriceRaw: "120" }],
    totalRaw: "120",
  },
  englishTwoDecimal: {
    merchant: "Bangkok Bistro",
    lines: [{ name: "Spring Rolls", quantity: 2, unitPriceRaw: "85.50" }],
    totalRaw: "171.00",
  },
  vatAndService: {
    merchant: "VAT Demo",
    lines: [{ name: "Subtotal item", quantity: 1, unitPriceRaw: "100" }],
    totalRaw: "100",
  },
} as const satisfies Record<string, ExtractedReceipt>;

/** Documented target subset scope (Story 8.7 AC1). */
export const RECEIPT_TARGET_SUBSET = [
  "Thai restaurant receipts with baht symbols and whole-baht amounts",
  "English restaurant receipts with two-decimal baht amounts",
  "Receipts with VAT and service-charge rows",
  "Mixed Thai/English item names",
] as const;

export function validateReceiptFixture(raw: ExtractedReceipt) {
  const parsed = parseExtractedReceipt(raw);
  const fieldConfidence: Record<string, "high" | "low"> = {
    total: raw.totalConfidence ?? "high",
  };
  raw.lines.forEach((line, index) => {
    fieldConfidence[`line.${index}.name`] = line.nameConfidence ?? "high";
    fieldConfidence[`line.${index}.price`] = line.priceConfidence ?? "high";
  });
  return { raw, parsed, fieldConfidence };
}

/** Known-good parsed sample for demo and tests (Story 8.6). */
export const FIXTURE_PARSED_RECEIPT = validateReceiptFixture(FIXTURE_SAMPLE_EXTRACTION).parsed;
