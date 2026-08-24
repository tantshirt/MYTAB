import { assertIntegerNumber, type FiatMinor } from "./money";
import { formatCurrencyMinor } from "./currency";

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
  return formatCurrencyMinor(amountMinor, "THB");
}

export { formatCurrencyMinor } from "./currency";
