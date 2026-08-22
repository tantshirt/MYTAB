/**
 * The exact `/order` request My Tab sends, and nothing else.
 *
 * Every parameter present is here for a stated reason; every parameter absent is
 * absent for a stated reason (see DFLOW_ORDER_PARAMS). Building the query string
 * lives here too, so there is one place where a parameter can be added and one
 * place a test can assert the whole set.
 */

import { DFLOW_ORDER_PARAMS, DFLOW_ROUTING_BOUNDS } from "./constants";

export type DflowOrderRequestParams = {
  /** Base58 mint the payer is spending. */
  inputMint: string;
  /** Base58 mint the recipient is credited in — always the cluster USDC. */
  outputMint: string;
  /** INPUT amount in atomic units. There is no ExactOut mode; see the solver. */
  amount: string;
  /** The payer. Required for a transaction to come back at all. */
  userPublicKey: string;
  /**
   * Routes the swap OUTPUT straight to the recipient's wallet, so the swap and
   * the payment are one transaction instead of swap-then-transfer. Mutually
   * exclusive with `destinationTokenAccount`; sending both is a 400.
   */
  destinationWallet: string;
  /** Fee payer. There is no separate `feePayer` param — the sponsor IS it. */
  sponsor: string;
  sponsorExec: false;
  allowSyncExec: true;
  allowAsyncExec: false;
  includeAddressLookupTables: true;
  maxAccounts: number;
  maxRouteLength: number;
};

export function buildDflowOrderRequestParams(input: {
  inputMint: string;
  outputMint: string;
  inputAmountAtomic: bigint;
  payerAddress: string;
  recipientAddress: string;
  sponsorAddress: string;
}): DflowOrderRequestParams {
  return {
    inputMint: input.inputMint,
    outputMint: input.outputMint,
    amount: input.inputAmountAtomic.toString(),
    userPublicKey: input.payerAddress,
    destinationWallet: input.recipientAddress,
    sponsor: input.sponsorAddress,
    ...DFLOW_ORDER_PARAMS,
    maxAccounts: DFLOW_ROUTING_BOUNDS.maxAccounts,
    maxRouteLength: DFLOW_ROUTING_BOUNDS.maxRouteLength,
  };
}

/** Serialises to a query string with booleans as `true`/`false`, not `1`/`0`. */
export function toOrderQueryString(params: DflowOrderRequestParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    search.set(key, typeof value === "boolean" ? String(value) : String(value));
  }
  return search.toString();
}

export function buildOrderUrl(baseUrl: string, params: DflowOrderRequestParams): string {
  return `${baseUrl}/order?${toOrderQueryString(params)}`;
}
