import { z } from "zod";

const ATOMIC = z.string().regex(/^\d+$/, "atomic amounts are integer strings");

const routePlanLegSchema = z
  .object({
    venue: z.string(),
    inputMint: z.string(),
    outputMint: z.string(),
    inAmount: ATOMIC,
    outAmount: ATOMIC,
  })
  .passthrough();

const addressLookupTableSchema = z.object({
  address: z.string().min(32),
  addresses: z.record(z.string().regex(/^\d+$/), z.string().min(32)),
});

/**
 * DFlow `/order` response, validated at the boundary.
 *
 * Field notes that matter for money, taken from DFlow's own OpenAPI:
 *
 *  - `otherAmountThreshold` / `minOutAmount` — "Minimum output amount after all
 *    fees… If the swap transaction doesn't produce at least this amount of the
 *    output token, THE TRANSACTION WILL FAIL." This is the only number the chain
 *    enforces, and therefore the only number the product may promise.
 *  - `outAmount` — "EXPECTED output amount". An estimate. Never promised.
 *  - `priceImpactPct` — explicitly an estimate.
 *  - `executionMode` — `sync` or `async`. We accept `sync` only; an async order
 *    settles through a revert-mint path this product has no story for, and
 *    binding decision 7 forbids it.
 *  - `destinationWalletMustSign` — VERIFIED absent on every real sponsored order
 *    we captured, so it is optional. Absent means "no". `true` is refused: we
 *    cannot produce the recipient's signature, and a third required signer would
 *    be an unfillable slot the sponsor had already paid to sign.
 */
export const dflowOrderResponseSchema = z
  .object({
    transaction: z.string().min(1),
    inputMint: z.string().min(32).optional(),
    outputMint: z.string().min(32).optional(),
    inAmount: ATOMIC.optional(),
    outAmount: ATOMIC,
    otherAmountThreshold: ATOMIC,
    minOutAmount: ATOMIC.optional(),
    slippageBps: z.number().int().nonnegative().optional(),
    priceImpactPct: z.string().optional(),
    platformFee: z.null().optional(),
    contextSlot: z.number().int().nonnegative(),
    executionMode: z.literal("sync"),
    destinationWalletMustSign: z.literal(false).optional(),
    predictionMarketInitPayerMustSign: z.literal(false).optional(),
    lastValidBlockHeight: z.number().int().positive().optional(),
    computeUnitLimit: z.number().int().positive().optional(),
    prioritizationFeeLamports: z.number().int().nonnegative().optional(),
    routePlan: z.array(routePlanLegSchema).optional(),
    addressLookupTables: z.array(addressLookupTableSchema).optional(),
    /** Legacy/alternate spelling seen in older docs; kept for tolerance. */
    addressLookupTableAddresses: z.array(z.string()).optional(),
  })
  .superRefine((value, ctx) => {
    // The two names are documented as the same number. If they ever disagree we
    // do not get to pick one — something is wrong and the order is refused.
    if (
      value.minOutAmount !== undefined &&
      value.minOutAmount !== value.otherAmountThreshold
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "minOutAmount disagrees with otherAmountThreshold",
        path: ["minOutAmount"],
      });
    }
    // A declared platform fee means the slippage budget was spent on a fee we
    // did not ask for and have no account to receive.
    if (value.platformFee !== undefined && value.platformFee !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "platform fee present on a zero-fee order",
        path: ["platformFee"],
      });
    }
  });

export type DflowOrderResponse = z.infer<typeof dflowOrderResponseSchema>;

export function parseDflowOrderResponse(payload: unknown): DflowOrderResponse {
  return dflowOrderResponseSchema.parse(payload);
}

export type DflowOrderErrorResponse = { code: string; msg: string };

export const dflowOrderErrorSchema = z
  .object({ code: z.string(), msg: z.string() })
  .passthrough();

/**
 * The output figure the product is allowed to display.
 *
 * "Maya receives at least X" must be DFlow's enforced threshold, never
 * `outAmount` and never a locally re-derived number. Exported as one function so
 * there is a single place this can be got wrong.
 */
export function guaranteedOutputAtomic(order: DflowOrderResponse): bigint {
  return BigInt(order.otherAmountThreshold);
}
