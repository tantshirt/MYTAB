import type { FiatMinor } from "./money";

const THB_MINOR_FACTOR = 100;

/** Reads THB minor units aloud — "291 baht 73" (Story 7.7 AC4). */
export function formatThbMinorForA11y(amountMinor: FiatMinor): string {
  const isNegative = amountMinor < 0;
  const absolute = Math.abs(amountMinor);
  const wholeBaht = Math.floor(absolute / THB_MINOR_FACTOR);
  const satang = absolute % THB_MINOR_FACTOR;
  const prefix = isNegative ? "negative " : "";
  if (satang === 0) {
    return `${prefix}${wholeBaht} baht`;
  }
  return `${prefix}${wholeBaht} baht ${satang}`;
}

/** Reads USDC atomic units as whole and fractional parts for screen readers. */
export function formatUsdcAtomicForA11y(amountAtomic: bigint, decimals = 6): string {
  const factor = 10n ** BigInt(decimals);
  const whole = amountAtomic / factor;
  const fraction = amountAtomic % factor;
  if (fraction === 0n) {
    return `${whole} USDC`;
  }
  const fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole} USDC ${fractionStr}`;
}
