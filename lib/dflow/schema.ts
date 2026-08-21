import { z } from "zod";

/** DFlow order response shape — validated at the boundary (Story 6.2 AC2). */
export const dflowOrderResponseSchema = z.object({
  transaction: z.string().min(1),
  outAmount: z.string().regex(/^\d+$/),
  otherAmountThreshold: z.string().regex(/^\d+$/),
  contextSlot: z.number().int().nonnegative(),
  executionMode: z.literal("sync"),
  destinationWalletMustSign: z.literal(false),
  lastValidBlockHeight: z.number().int().positive().optional(),
  addressLookupTableAddresses: z.array(z.string()).optional(),
});

export type DflowOrderResponse = z.infer<typeof dflowOrderResponseSchema>;

export function parseDflowOrderResponse(payload: unknown): DflowOrderResponse {
  return dflowOrderResponseSchema.parse(payload);
}
