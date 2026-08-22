import { USDC_MINT } from "../solana/constants";

/** Canonical wrapped SOL mint at the DFlow router boundary (FR-T4). */
export const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

export const DFLOW_INPUT_MINTS = [USDC_MINT, WRAPPED_SOL_MINT] as const;

export type DflowInputMint = (typeof DFLOW_INPUT_MINTS)[number];

export const DFLOW_SOLVER_MAX_REQUESTS = 4;
export const DFLOW_SOLVER_DEADLINE_MS = 3_000;
export const DFLOW_SOLVER_RESERVED_ATTEMPTS = 4;

/**
 * Fixed `/order` parameters, every one of them deliberate.
 *
 *  allowSyncExec  = true  — sync is the only mode we accept.
 *  allowAsyncExec = false — MUST be explicit. The API default is `true`
 *      (verified in DFlow's own OpenAPI). Binding decision 7 requires sync-only,
 *      and an async order returns a *revert mint* path we have no settlement
 *      story for. Omitting this parameter silently violates our architecture.
 *      `allowSyncExec=false` together with this is rejected upstream as
 *      `cannot_disable_sync_and_async_execution`, so the pair is load-bearing.
 *  sponsorExec    = false — user-executes. The sponsor is still `account[0]`
 *      and still the fee payer either way (verified by decoding both modes), but
 *      with `false` the swap runs out of the USER's token accounts, so the
 *      sponsor wallet never custodies funds mid-transaction, and the transaction
 *      is smaller. Strictly better on both risk and size.
 *  includeAddressLookupTables = true — see `resolveAddressTableLookups`. DFlow
 *      ALWAYS returns address lookup tables (verified: even `onlyDirectRoutes`
 *      with a single-venue route carries DFlow's own common table), so we must
 *      resolve them against the RPC regardless. Asking DFlow to declare the
 *      entries it used lets us CROSS-CHECK the RPC-resolved addresses against
 *      the router's own claim and reject on any disagreement. This can only
 *      reject more, never less.
 *
 * Deliberately ABSENT:
 *  platformFeeBps / platformFeeMode / feeAccount — the judged build's platform
 *      fee is zero and there is no funded fee account. A declared fee is
 *      factored into the slippage budget, so declaring one with nothing behind
 *      it spends the user's price protection on nothing.
 *  positiveSlippageFeeAccount / positiveSlippageLimitPct — see
 *      DFLOW_POSITIVE_SLIPPAGE_DECISION.
 *  slippageBps — left at DFlow's `"auto"`, which is recomputed server-side from
 *      live conditions. The resolved value is echoed back and is what we log.
 */
export const DFLOW_ORDER_PARAMS = {
  allowSyncExec: true,
  allowAsyncExec: false,
  sponsorExec: false,
  includeAddressLookupTables: true,
} as const;

/**
 * Routing bounds.
 *
 * These do NOT remove address lookup tables — nothing does; see above. They cap
 * how much of the transaction we have to resolve and validate, which bounds both
 * the RPC work and the blast radius of a route we cannot fully enumerate.
 *
 * `maxAccounts` is the account budget for the whole transaction. Empirically a
 * sponsored SOL->USDC route resolves to ~20 accounts and a three-leg BONK->USDC
 * route to ~46; 24 was too tight to route at all (`route_not_found`), so this is
 * set where real routes still fit.
 */
export const DFLOW_ROUTING_BOUNDS = {
  maxAccounts: 64,
  maxRouteLength: 3,
} as const;

/**
 * Positive slippage decision (deliberate, not a default).
 *
 * When a swap fills better than its quote, the excess output is the PAYER's
 * money — they funded the input. EXPERIENCE already models that excess as
 * `excessOutputAtomic` and offers it back as the round-up tip. Routing it to a
 * `positiveSlippageFeeAccount` would silently divert the payer's upside to an
 * account they never agreed to, and we have no funded account to divert it to.
 *
 * So both parameters are omitted. DFlow does not take positive slippage itself,
 * which means the excess lands in the destination token account — the
 * RECIPIENT's USDC account, because we route output straight there. The payer
 * then sees it as the tip they already opted into, which is exactly the product
 * behaviour EXPERIENCE specifies.
 */
export const DFLOW_POSITIVE_SLIPPAGE_DECISION = "payer-keeps-upside" as const;

export const DFLOW_FIXTURE_PROGRAM_ID =
  "DFlowFix1111111111111111111111111111111111111";
