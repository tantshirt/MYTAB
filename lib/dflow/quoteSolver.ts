import { DFLOW_SOLVER_DEADLINE_MS, DFLOW_SOLVER_MAX_REQUESTS } from "./constants";
import type { DflowFixtureQuoteInput, DflowFixtureQuoteResult } from "./fixture";
import { buildDflowFixtureQuote } from "./fixture";

export type QuoteSolverOutcome =
  | {
      ok: true;
      quote: DflowFixtureQuoteResult;
      requestCount: number;
      durationMs: number;
    }
  | {
      ok: false;
      failureCode: "SOLVER_DEADLINE" | "SOLVER_NO_COVERING_QUOTE" | "SOLVER_REQUEST_LIMIT";
      requestCount: number;
      durationMs: number;
    };

export type QuoteSolverRequest = (
  inputAmountAtomic: bigint,
  attempt: number,
) => DflowFixtureQuoteResult;

export type SolveTargetOutputInput = DflowFixtureQuoteInput & {
  now?: () => number;
  requestQuote?: QuoteSolverRequest;
};

/**
 * Bounded target-output quote solver (Story 6.3).
 * Hard-capped at four requests and three seconds wall-clock.
 */
export function solveTargetOutputQuote(input: SolveTargetOutputInput): QuoteSolverOutcome {
  const startedAt = input.now?.() ?? Date.now();
  const deadline = startedAt + DFLOW_SOLVER_DEADLINE_MS;
  const requestQuote =
    input.requestQuote ??
    ((inputAmountAtomic: bigint) =>
      buildDflowFixtureQuote({ ...input, inputAmountAtomic }));

  let requestCount = 0;
  let low = input.minimumOutputAtomic;
  let high = input.minimumOutputAtomic * 4n;
  if (high <= 0n) {
    high = input.minimumOutputAtomic + 1n;
  }

  let best: DflowFixtureQuoteResult | null = null;

  while (requestCount < DFLOW_SOLVER_MAX_REQUESTS) {
    const now = input.now?.() ?? Date.now();
    if (now >= deadline) {
      return {
        ok: false,
        failureCode: "SOLVER_DEADLINE",
        requestCount,
        durationMs: now - startedAt,
      };
    }

    requestCount += 1;
    const guess = (low + high) / 2n;
    const quote = requestQuote(guess > 0n ? guess : 1n, requestCount);
    const threshold = BigInt(quote.otherAmountThreshold);

    if (threshold >= input.minimumOutputAtomic) {
      best = quote;
      high = guess - 1n;
      if (guess <= input.minimumOutputAtomic) {
        break;
      }
      continue;
    }

    low = guess + 1n;
  }

  const finishedAt = input.now?.() ?? Date.now();
  const durationMs = finishedAt - startedAt;

  if (best) {
    return { ok: true, quote: best, requestCount, durationMs };
  }

  return {
    ok: false,
    failureCode:
      requestCount >= DFLOW_SOLVER_MAX_REQUESTS
        ? "SOLVER_REQUEST_LIMIT"
        : "SOLVER_NO_COVERING_QUOTE",
    requestCount,
    durationMs,
  };
}
