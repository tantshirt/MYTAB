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

/**
 * Reads an already-formatted display amount aloud (EXPERIENCE, *Accessibility
 * Floor*: "Amounts read as money, not digits").
 *
 * The numeric functions above are the preferred path and are used wherever
 * minor units are in hand. This one exists for the rows that only ever receive
 * a rendered label — activity summaries, tab totals — so that no amount in the
 * product falls back to being spelled out glyph by glyph.
 *
 *   "฿291.74"    → "291 baht 74"
 *   "฿1,840.00"  → "1840 baht"
 *   "-฿50.00"    → "negative 50 baht"
 *   "42.10 USDC" → "42 USDC 1"
 *
 * Anything it does not recognise is returned unchanged — a wrong reading is
 * worse than the default one.
 */
export function formatAmountLabelForA11y(label: string): string {
  const trimmed = label.trim();

  const thb = /^(-)?฿(\d[\d,]*)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (thb) {
    const wholeBaht = Number(thb[2]!.replace(/,/g, ""));
    const satang = thb[3] ? Number(thb[3].padEnd(2, "0")) : 0;
    return formatThbMinorForA11y(
      ((thb[1] ? -1 : 1) * (wholeBaht * THB_MINOR_FACTOR + satang)) as FiatMinor,
    );
  }

  const token = /^(-)?(\d[\d,]*)(?:\.(\d+))?\s+([A-Za-z]{2,10})$/.exec(trimmed);
  if (token) {
    const sign = token[1] ? "negative " : "";
    const whole = token[2]!.replace(/,/g, "");
    const fraction = (token[3] ?? "").replace(/0+$/, "");
    const ticker = token[4]!.toUpperCase();
    return fraction
      ? `${sign}${whole} ${ticker} ${fraction}`
      : `${sign}${whole} ${ticker}`;
  }

  return trimmed;
}
