"use node";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  FRANKFURTER_BOT_PROVIDER_KEY,
  FxError,
  FxErrorCode,
  buildFxSnapshotFields,
  parseIsoDate,
  type FxRateQuote,
} from "../../lib/domain/fx";
import { assertSupportedCurrency } from "../../lib/domain/currency";

/**
 * Frankfurter v2, filtered to the Bank of Thailand provider.
 *
 * `providers=BOT` is load-bearing: without it Frankfurter blends providers and
 * returns a rate we did not contract for. The response carries no provider
 * echo, so the filter is the only thing pinning the series — never drop it.
 */
export const FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v2";
export const FRANKFURTER_BOT_USD_THB_URL =
  `${FRANKFURTER_BASE_URL}/rates?base=USD&quotes=THB&providers=${FRANKFURTER_BOT_PROVIDER_KEY}`;

const FX_REQUEST_TIMEOUT_MS = 10_000;

export const FxProviderErrorCode = {
  UNREACHABLE: "FX_PROVIDER_UNREACHABLE",
  BAD_STATUS: "FX_PROVIDER_BAD_STATUS",
  EMPTY_SERIES: "FX_PROVIDER_EMPTY_SERIES",
  AMBIGUOUS_SERIES: "FX_PROVIDER_AMBIGUOUS_SERIES",
  UNEXPECTED_PAIR: "FX_PROVIDER_UNEXPECTED_PAIR",
  UNPARSEABLE: "FX_PROVIDER_UNPARSEABLE",
} as const;
export type FxProviderErrorCode =
  (typeof FxProviderErrorCode)[keyof typeof FxProviderErrorCode];

export class FxProviderError extends Error {
  readonly code: FxProviderErrorCode;

  constructor(code: FxProviderErrorCode, message: string) {
    super(message);
    this.name = "FxProviderError";
    this.code = code;
  }
}

/**
 * Extracts the quote from a raw Frankfurter body **as text**.
 *
 * `JSON.parse` would turn `32.8152` into an IEEE-754 double before we ever saw
 * it. The rate is therefore pulled out with a regex and kept as a string all
 * the way into the integer rational — no float ever exists.
 */
export function parseFrankfurterBotBody(body: string): FxRateQuote {
  const rateMatches = [...body.matchAll(/"rate"\s*:\s*(\d+(?:\.\d+)?)/g)];
  if (rateMatches.length === 0) {
    if (/^\s*\[\s*\]\s*$/.test(body)) {
      throw new FxProviderError(
        FxProviderErrorCode.EMPTY_SERIES,
        `Frankfurter returned no rows for provider ${FRANKFURTER_BOT_PROVIDER_KEY}`,
      );
    }
    throw new FxProviderError(
      FxProviderErrorCode.UNPARSEABLE,
      `Frankfurter body carried no rate: ${body.slice(0, 300)}`,
    );
  }
  if (rateMatches.length > 1) {
    throw new FxProviderError(
      FxProviderErrorCode.AMBIGUOUS_SERIES,
      `Frankfurter returned ${rateMatches.length} rows; exactly one Bank of Thailand row is required`,
    );
  }

  const dateMatch = /"date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/.exec(body);
  if (!dateMatch) {
    throw new FxProviderError(
      FxProviderErrorCode.UNPARSEABLE,
      `Frankfurter body carried no provider date: ${body.slice(0, 300)}`,
    );
  }

  if (!/"base"\s*:\s*"USD"/.test(body) || !/"quote"\s*:\s*"THB"/.test(body)) {
    throw new FxProviderError(
      FxProviderErrorCode.UNEXPECTED_PAIR,
      `Frankfurter returned a pair other than USD/THB: ${body.slice(0, 300)}`,
    );
  }

  const providerDate = dateMatch[1];
  parseIsoDate(providerDate);

  return { providerDate, rateText: rateMatches[0][1] };
}

/** Fetches the current Bank of Thailand USD/THB quote. */
export async function fetchBotUsdThbQuote(
  fetchImpl: typeof fetch = fetch,
): Promise<FxRateQuote> {
  let response: Response;
  try {
    response = await fetchImpl(FRANKFURTER_BOT_USD_THB_URL, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FX_REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new FxProviderError(
      FxProviderErrorCode.UNREACHABLE,
      `Frankfurter is unreachable: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  if (!response.ok) {
    throw new FxProviderError(
      FxProviderErrorCode.BAD_STATUS,
      `Frankfurter responded ${response.status}`,
    );
  }

  return parseFrankfurterBotBody(await response.text());
}

export function parseFrankfurterUsdQuoteBody(body: string, currency: string): FxRateQuote {
  const escaped = currency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`"base"\\s*:\\s*"USD"`).test(body) ||
      !new RegExp(`"quote"\\s*:\\s*"${escaped}"`).test(body)) {
    throw new FxProviderError(FxProviderErrorCode.UNEXPECTED_PAIR, `Unexpected USD/${currency} body`);
  }
  const rate = /"rate"\s*:\s*(\d+(?:\.\d+)?)/.exec(body)?.[1];
  const providerDate = /"date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/.exec(body)?.[1];
  if (!rate || !providerDate) throw new FxProviderError(FxProviderErrorCode.UNPARSEABLE, body.slice(0, 300));
  parseIsoDate(providerDate);
  return { providerDate, rateText: rate };
}

export function parseFrankfurterUsdSeries(body: string): Array<{ currency: string; quote: FxRateQuote }> {
  const rows: Array<{ currency: string; quote: FxRateQuote }> = [];
  for (const block of body.match(/\{[^{}]*\}/g) ?? []) {
    const currency = /"quote"\s*:\s*"([A-Z]{3})"/.exec(block)?.[1];
    if (!currency) continue;
    try {
      assertSupportedCurrency(currency);
      rows.push({ currency, quote: parseFrankfurterUsdQuoteBody(block, currency) });
    } catch {
      // Provider currencies with unsupported ISO scales are not admitted.
    }
  }
  if (rows.length === 0) throw new FxProviderError(FxProviderErrorCode.EMPTY_SERIES, "No supported USD quotes");
  return rows;
}

export async function fetchFrankfurterUsdSeries(
  fetchImpl: typeof fetch = fetch,
): Promise<Array<{ currency: string; quote: FxRateQuote }>> {
  const response = await fetchImpl(`${FRANKFURTER_BASE_URL}/rates?base=USD`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(FX_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new FxProviderError(FxProviderErrorCode.BAD_STATUS, String(response.status));
  return parseFrankfurterUsdSeries(await response.text());
}

/**
 * Refreshes the Bank of Thailand snapshot.
 *
 * Append-only: a quote for a provider date we already hold returns the existing
 * row untouched, so locked bills keep the exact rational they locked against.
 * Failures propagate — there is no manual fallback on this path at all.
 */
export const refreshFxSnapshot = internalAction({
  args: {},
  handler: async (ctx) => {
    // BOT and the generic catalog are separate evidence lanes. A BOT outage
    // must not prevent USD/EUR/etc. snapshots from refreshing.
    const [botAttempt, catalogAttempt] = await Promise.allSettled([
      fetchBotUsdThbQuote(),
      fetchFrankfurterUsdSeries(),
    ]);
    let genericCreated = 0;
    // Refresh every supported non-USD pair through the same already-approved
    // provider. Each row remains exact and append-only; one missing pair does
    // not overwrite or synthesize another currency's evidence.
    const series = catalogAttempt.status === "fulfilled" ? catalogAttempt.value : [];
    if (catalogAttempt.status === "rejected") {
      console.error(JSON.stringify({ event: "fx_catalog_refresh_failed", error: String(catalogAttempt.reason) }));
    }
    for (const { currency, quote: generic } of series) {
      if (currency === "THB" || currency === "USD") continue;
      try {
        const recorded: { created: boolean } = await ctx.runMutation(internal.fxSnapshots.recordGenericSnapshot, {
          currency,
          providerDate: generic.providerDate,
          rateText: generic.rateText,
        });
        if (recorded.created) genericCreated += 1;
      } catch (error) {
        console.error(JSON.stringify({ event: "fx_pair_refresh_failed", currency, error: String(error) }));
      }
    }

    if (botAttempt.status === "rejected") {
      if (catalogAttempt.status === "rejected") throw botAttempt.reason;
      console.error(JSON.stringify({ event: "fx_bot_refresh_failed", error: String(botAttempt.reason) }));
      return { botCreated: false as const, genericCreated };
    }

    const quote = botAttempt.value;
    const fields = buildFxSnapshotFields(quote);
    const result: { created: boolean } = await ctx.runMutation(
      internal.fxSnapshots.recordBotSnapshot,
      { providerDate: quote.providerDate, rateText: quote.rateText },
    );

    return {
      botCreated: true as const,
      genericCreated,
      providerDate: quote.providerDate,
      numeratorAtomic: fields.numeratorAtomic.toString(),
      denominatorMinor: fields.denominatorMinor.toString(),
      expiresAt: fields.expiresAt,
      created: result.created,
    };
  },
});

export { FxError, FxErrorCode };
