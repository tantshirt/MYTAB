/**
 * Bounded target-output quote solver (spec-6-3).
 *
 * WHY THIS EXISTS. DFlow's `/order` has no `swapMode` and no ExactOut: it takes
 * an INPUT `amount` and tells you what comes out. My Tab's obligation runs the
 * other way — the recipient must receive an exact locked USDC figure. So the
 * input has to be searched for, under a hard request budget, because every
 * request is a rate-limited network call inside a user-facing latency budget.
 *
 * WHAT IT BRACKETS AGAINST. `otherAmountThreshold` (`minOutAmount`), and nothing
 * else. That is the only figure the chain enforces — DFlow: "if the swap
 * transaction doesn't produce at least this amount of the output token, the
 * transaction will fail." `outAmount` is documented as an ESTIMATE. Solving
 * against `outAmount` would let us promise a recipient an amount no rule
 * anywhere guarantees, and then settle short.
 *
 * HOW IT CONVERGES. Bisection on an unknown scale is wasteful when four requests
 * is the whole budget, so each step uses the rate the router just quoted:
 *
 *     nextInput = ceil(input × target / threshold) × (1 + margin)
 *
 * One probe establishes the rate; the second usually clears the target. The
 * result kept is the SMALLEST input seen whose threshold covers the target, so a
 * later worse quote can never replace a good one.
 *
 * BOUNDS. Never more than `DFLOW_SOLVER_MAX_REQUESTS` calls; never past the
 * wall-clock deadline; never an input above `maxInputAtomic`, which is the cap
 * the payer authorised.
 */

import { DFLOW_SOLVER_DEADLINE_MS, DFLOW_SOLVER_MAX_REQUESTS } from "./constants";

/** Basis points of headroom added to each scaled guess, absorbing curvature. */
export const SOLVER_OVERSHOOT_BPS = 30n;

export type SolvedQuote<T> = {
  /** Input amount this quote was requested at, in atomic units. */
  inputAtomic: bigint;
  /** `otherAmountThreshold` — the enforced floor, not `outAmount`. */
  guaranteedOutputAtomic: bigint;
  payload: T;
};

export type QuoteSolverFailureCode =
  | "SOLVER_DEADLINE"
  | "SOLVER_NO_COVERING_QUOTE"
  | "SOLVER_REQUEST_LIMIT"
  | "SOLVER_INPUT_CAP_EXCEEDED"
  | "SOLVER_QUOTE_FAILED";

export type QuoteSolverOutcome<T> =
  | {
      ok: true;
      quote: SolvedQuote<T>;
      requestCount: number;
      durationMs: number;
    }
  | {
      ok: false;
      failureCode: QuoteSolverFailureCode;
      requestCount: number;
      durationMs: number;
      detail?: string;
    };

export type QuoteRequester<T> = (
  inputAtomic: bigint,
  attempt: number,
) => Promise<SolvedQuote<T> | null>;

export type SolveTargetOutputInput<T> = {
  /** The locked USDC the recipient must receive, atomic. */
  targetOutputAtomic: bigint;
  /** Ceiling on what the payer may spend, atomic input units. */
  maxInputAtomic: bigint;
  /** First guess. Anything sane converges; a good one saves a request. */
  initialInputAtomic: bigint;
  requestQuote: QuoteRequester<T>;
  now?: () => number;
  maxRequests?: number;
  deadlineMs?: number;
};

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function clamp(value: bigint, low: bigint, high: bigint): bigint {
  if (value < low) {
    return low;
  }
  return value > high ? high : value;
}

export async function solveTargetOutputQuote<T>(
  input: SolveTargetOutputInput<T>,
): Promise<QuoteSolverOutcome<T>> {
  const now = input.now ?? Date.now;
  const startedAt = now();
  const deadline = startedAt + (input.deadlineMs ?? DFLOW_SOLVER_DEADLINE_MS);
  const maxRequests = input.maxRequests ?? DFLOW_SOLVER_MAX_REQUESTS;

  const target = input.targetOutputAtomic;
  const maxInput = input.maxInputAtomic;

  let requestCount = 0;
  const finish = () => now() - startedAt;

  if (target <= 0n || maxInput <= 0n) {
    return {
      ok: false,
      failureCode: "SOLVER_NO_COVERING_QUOTE",
      requestCount,
      durationMs: finish(),
      detail: "non-positive target or cap",
    };
  }

  let guess = clamp(
    input.initialInputAtomic > 0n ? input.initialInputAtomic : 1n,
    1n,
    maxInput,
  );

  let best: SolvedQuote<T> | null = null;
  const attempted = new Set<string>();

  while (requestCount < maxRequests) {
    if (now() >= deadline) {
      return {
        ok: false,
        failureCode: "SOLVER_DEADLINE",
        requestCount,
        durationMs: finish(),
      };
    }

    // Re-asking at an input we have already tried burns a request from a budget
    // of four and cannot teach us anything new.
    const key = guess.toString();
    if (attempted.has(key)) {
      break;
    }
    attempted.add(key);

    requestCount += 1;
    let quote: SolvedQuote<T> | null;
    try {
      quote = await input.requestQuote(guess, requestCount);
    } catch {
      return {
        ok: false,
        failureCode: "SOLVER_QUOTE_FAILED",
        requestCount,
        durationMs: finish(),
      };
    }

    if (!quote) {
      // The router could not price this size. Step up once — a common cause is
      // a size below a venue's minimum — but never past the payer's cap.
      const stepped = clamp(guess * 2n, 1n, maxInput);
      if (stepped === guess) {
        break;
      }
      guess = stepped;
      continue;
    }

    if (quote.guaranteedOutputAtomic >= target) {
      // Keep the cheapest covering quote seen so far.
      if (!best || quote.inputAtomic < best.inputAtomic) {
        best = quote;
      }
      // Try to shave the input, but only if a cheaper one is plausible.
      const scaled = ceilDiv(quote.inputAtomic * target, quote.guaranteedOutputAtomic);
      const withMargin = scaled + ceilDiv(scaled * SOLVER_OVERSHOOT_BPS, 10_000n);
      const next = clamp(withMargin, 1n, maxInput);
      if (next >= quote.inputAtomic) {
        break;
      }
      guess = next;
      continue;
    }

    // Short. Scale up by the rate this quote just revealed.
    if (quote.guaranteedOutputAtomic <= 0n) {
      const stepped = clamp(guess * 2n, 1n, maxInput);
      if (stepped === guess) {
        break;
      }
      guess = stepped;
      continue;
    }

    const scaled = ceilDiv(quote.inputAtomic * target, quote.guaranteedOutputAtomic);
    const withMargin = scaled + ceilDiv(scaled * SOLVER_OVERSHOOT_BPS, 10_000n);
    if (withMargin > maxInput) {
      // Even at the payer's ceiling the router cannot reach the locked target.
      // That is a real answer, not a retry: the obligation cannot be settled in
      // this token at this size right now.
      return {
        ok: false,
        failureCode: "SOLVER_INPUT_CAP_EXCEEDED",
        requestCount,
        durationMs: finish(),
        detail: `${withMargin} > ${maxInput}`,
      };
    }
    guess = clamp(withMargin, 1n, maxInput);
  }

  if (best) {
    return { ok: true, quote: best, requestCount, durationMs: finish() };
  }

  return {
    ok: false,
    failureCode:
      requestCount >= maxRequests ? "SOLVER_REQUEST_LIMIT" : "SOLVER_NO_COVERING_QUOTE",
    requestCount,
    durationMs: finish(),
  };
}
