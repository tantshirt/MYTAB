import { assertIntegerNumber, type FiatMinor } from "./money";

const THB_MINOR_FACTOR = 100;

/**
 * Groups an integer string into thousands with `,` separators — "1840" → "1,840".
 * Intl-free on purpose: `Intl.NumberFormat` is locale-dependent and this product
 * renders one canonical format everywhere (DESIGN.md: ฿1,840.00).
 */
export function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatFiatMinorThb(amountMinor: FiatMinor): string {
  assertIntegerNumber(amountMinor, "formatFiatMinorThb");

  const isNegative = amountMinor < 0;
  const absoluteMinor = Math.abs(amountMinor);
  const wholeBaht = Math.floor(absoluteMinor / THB_MINOR_FACTOR);
  const satang = absoluteMinor % THB_MINOR_FACTOR;
  const satangText = String(satang).padStart(2, "0");

  const sign = isNegative ? "-" : "";
  return `${sign}฿${groupThousands(String(wholeBaht))}.${satangText}`;
}
