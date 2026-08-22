/**
 * Receipt fixture — tests and the responsive sweep only.
 *
 * Nothing under `app/`, `features/` or `components/` may import this file.
 *
 * Self-contained on purpose. `lib/domain/receiptFixture.ts` still holds the
 * server-side sample that `convex/receipts.useSampleReceipt` seeds; this file
 * depends only on the parser, so removing that server-side sample cannot take
 * the sweep's populated Receipt Review with it.
 */
import {
  parseExtractedReceipt,
  type ExtractedReceipt,
  type ParsedReceipt,
} from "@/lib/domain/receiptParse";

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

export const FIXTURE_PARSED_RECEIPT: ParsedReceipt =
  parseExtractedReceipt(FIXTURE_SAMPLE_EXTRACTION);
