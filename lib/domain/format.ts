import { assertIntegerNumber, type FiatMinor } from "./money";

const THB_MINOR_FACTOR = 100;

export function formatFiatMinorThb(amountMinor: FiatMinor): string {
  assertIntegerNumber(amountMinor, "formatFiatMinorThb");

  const isNegative = amountMinor < 0;
  const absoluteMinor = Math.abs(amountMinor);
  const wholeBaht = Math.floor(absoluteMinor / THB_MINOR_FACTOR);
  const satang = absoluteMinor % THB_MINOR_FACTOR;
  const satangText = String(satang).padStart(2, "0");

  const sign = isNegative ? "-" : "";
  return `${sign}฿${wholeBaht}.${satangText}`;
}
