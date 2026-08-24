import { DomainError, DomainErrorCode } from "./errors";
import {
  addFiatMinor,
  assertIntegerNumber,
  fiatMinorFromInteger,
  type FiatMinor,
} from "./money";

/** Explicit supported set; these cover ISO-4217's 0, 2, and 3 digit precisions. */
export const SUPPORTED_FIAT_CURRENCIES = {
  THB: { minorDigits: 2, symbol: "฿", spokenName: "Thai baht" },
  USD: { minorDigits: 2, symbol: "$", spokenName: "US dollars" },
  EUR: { minorDigits: 2, symbol: "€", spokenName: "euros" },
  GBP: { minorDigits: 2, symbol: "£", spokenName: "British pounds" },
  SGD: { minorDigits: 2, symbol: "S$", spokenName: "Singapore dollars" },
  JPY: { minorDigits: 0, symbol: "¥", spokenName: "Japanese yen" },
  KWD: { minorDigits: 3, symbol: "KD ", spokenName: "Kuwaiti dinars" },
} as const;

export type SupportedFiatCurrency = string;
export type CurrencyMoney = {
  readonly currency: SupportedFiatCurrency;
  readonly amountMinor: FiatMinor;
};

export const CURRENCY_FAILURE = {
  UNSUPPORTED: "UNSUPPORTED_CURRENCY",
  MISMATCH: "CURRENCY_MISMATCH",
} as const;

export class CurrencyError extends Error {
  constructor(
    public readonly code: (typeof CURRENCY_FAILURE)[keyof typeof CURRENCY_FAILURE],
    message: string = code,
  ) {
    super(message);
    this.name = "CurrencyError";
  }
}

/**
 * Shipped ISO-4217 assignment registry. `Intl.supportedValuesOf` is absent in
 * older Telegram WebViews; falling back to seven launch shortcuts made valid
 * receipts change support depending on the phone that opened them.
 */
const ISO_4217_ASSIGNED_FALLBACK = (
  "AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF XAG XAU XBA XBB XBC XBD XCD XCG XDR XOF XPD XPF XPT XSU XTS XUA XXX YER ZAR ZMW ZWG ZWL"
).split(" ");

const runtimeAssigned = (
  Intl as typeof Intl & {
    supportedValuesOf?: (key: "currency") => string[];
  }
).supportedValuesOf?.("currency");
const ASSIGNED_CURRENCY_CODES = new Set(
  runtimeAssigned && runtimeAssigned.length > 0
    ? [...runtimeAssigned, ...ISO_4217_ASSIGNED_FALLBACK]
    : ISO_4217_ASSIGNED_FALLBACK,
);

/**
 * ISO-4217 also assigns codes that are not circulating fiat money. They are
 * useful to accounting systems, but admitting one here would let a receipt be
 * locked in a metal, test unit, bond-market unit, or "no currency" marker that
 * the payment-time FX provider cannot honestly price.
 */
const NON_CIRCULATING_CURRENCY_CODES = new Set([
  "BOV", "CHE", "CHW", "CLF", "COU", "MXV", "USN", "UYI", "UYW",
  "XAG", "XAU", "XBA", "XBB", "XBC", "XBD", "XCD", "XDR", "XPD",
  "XPT", "XSU", "XTS", "XUA", "XXX",
  // Withdrawn national units can remain accepted by Intl implementations for
  // years after replacement. A structural/formatting success is not evidence
  // that a payment-time FX market still exists.
  "ADP", "AFA", "ANG", "ATS", "BEF", "BYB", "BYR", "CYP", "CUC",
  "DEM", "EEK", "ESP", "FIM", "FRF", "GHC", "GRD", "HRK", "IEP",
  "ITL", "LTL", "LUF", "LVL", "MGF", "MRO", "MTL", "NLG", "PTE",
  "ROL", "SDD", "SIT", "SKK", "SLL", "SRG", "STD", "TRL", "VEB",
  "VEF", "YUM", "ZMK", "ZWD", "ZWL", "ZWN", "ZWR",
]);

export function assertSupportedCurrency(value: string): SupportedFiatCurrency {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new CurrencyError(CURRENCY_FAILURE.UNSUPPORTED, `Unsupported currency ${value}`);
  }
  currencyDefinition(normalized);
  return normalized;
}

export function currencyDefinition(currencyInput: string): {
  minorDigits: number;
  symbol: string;
  spokenName: string;
} {
  const currency = currencyInput.trim().toUpperCase();
  const known = (SUPPORTED_FIAT_CURRENCIES as Record<string, { minorDigits: number; symbol: string; spokenName: string }>)[currency];
  if (known) return known;
  // Intl.NumberFormat accepts structurally-valid placeholders such as ZZZ.
  // `supportedValuesOf("currency")` is the assigned-code registry; checking it
  // first keeps those placeholders out while still admitting real 0/2/3-digit
  // ISO currencies beyond the launch shortcuts above.
  if (
    !ASSIGNED_CURRENCY_CODES.has(currency) ||
    NON_CIRCULATING_CURRENCY_CODES.has(currency)
  ) {
    throw new CurrencyError(CURRENCY_FAILURE.UNSUPPORTED, `Unsupported currency ${currencyInput}`);
  }
  try {
    const options = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions();
    const digits = options.maximumFractionDigits ?? Number.NaN;
    if (!Number.isInteger(digits) || digits < 0 || digits > 3) throw new Error("scale");
    return { minorDigits: digits, symbol: `${currency} `, spokenName: currency };
  } catch {
    throw new CurrencyError(CURRENCY_FAILURE.UNSUPPORTED, `Unsupported currency ${currencyInput}`);
  }
}

export function currencyMinorDigits(currency: string): number {
  return currencyDefinition(assertSupportedCurrency(currency)).minorDigits;
}

export function money(currency: string, amountMinor: number): CurrencyMoney {
  return {
    currency: assertSupportedCurrency(currency),
    amountMinor: fiatMinorFromInteger(amountMinor),
  };
}

export function addCurrencyMoney(a: CurrencyMoney, b: CurrencyMoney): CurrencyMoney {
  if (a.currency !== b.currency) {
    throw new CurrencyError(CURRENCY_FAILURE.MISMATCH, `Cannot add ${a.currency} and ${b.currency}`);
  }
  return { currency: a.currency, amountMinor: addFiatMinor(a.amountMinor, b.amountMinor) };
}

/** Parses the provider/user string directly to integer minor units. */
export function parseCurrencyAmount(input: string, currencyInput: string): FiatMinor {
  const currency = assertSupportedCurrency(currencyInput);
  const digits = currencyDefinition(currency).minorDigits;
  const trimmed = input.trim();
  const pattern = digits === 0 ? /^-?\d+$/ : new RegExp(`^-?\\d+(?:\\.\\d{1,${digits}})?$`);
  if (!pattern.test(trimmed)) {
    throw new DomainError(
      DomainErrorCode.INVALID_MONEY_FORMAT,
      `${currency} amount must use at most ${digits} decimal places`,
    );
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const magnitude = `${whole}${fraction.padEnd(digits, "0")}`.replace(/^0+(?=\d)/, "") || "0";
  const value = Number(`${negative ? "-" : ""}${magnitude}`);
  assertIntegerNumber(value, `parseCurrencyAmount(${currency})`);
  if (!Number.isSafeInteger(value)) {
    throw new DomainError(DomainErrorCode.FIAT_OVERFLOW, `${currency} amount exceeds safe integer range`);
  }
  return fiatMinorFromInteger(value);
}

function groupThousands(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatCurrencyMinor(amountMinor: FiatMinor, currencyInput: string): string {
  assertIntegerNumber(amountMinor, "formatCurrencyMinor");
  return formatCurrencyMinorBigInt(BigInt(amountMinor), currencyInput);
}

/**
 * Formats persisted Convex `int64` money without narrowing it through a JS number.
 * Off-chain ledger events are stored as bigint and may legitimately exceed the
 * safe-integer range even though interactive entry is capped below it.
 */
export function formatCurrencyMinorBigInt(
  amountMinor: bigint,
  currencyInput: string,
): string {
  const currency = assertSupportedCurrency(currencyInput);
  const definition = currencyDefinition(currency);
  const factor = 10n ** BigInt(definition.minorDigits);
  const absolute = amountMinor < 0n ? -amountMinor : amountMinor;
  const whole = absolute / factor;
  const fraction = absolute % factor;
  const decimal = definition.minorDigits === 0
    ? ""
    : `.${String(fraction).padStart(definition.minorDigits, "0")}`;
  return `${amountMinor < 0n ? "-" : ""}${definition.symbol}${groupThousands(String(whole))}${decimal}`;
}

export function formatCurrencyMinorForA11y(amountMinor: FiatMinor, currencyInput: string): string {
  const currency = assertSupportedCurrency(currencyInput);
  const definition = currencyDefinition(currency);
  const factor = 10 ** definition.minorDigits;
  const absolute = Math.abs(amountMinor);
  const whole = Math.floor(absolute / factor);
  const fraction = absolute % factor;
  const prefix = amountMinor < 0 ? "negative " : "";
  return fraction === 0
    ? `${prefix}${whole} ${definition.spokenName}`
    : `${prefix}${whole} ${definition.spokenName} ${String(fraction).padStart(definition.minorDigits, "0")}`;
}
