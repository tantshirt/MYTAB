import { USDC_MINT } from "../solana/constants";

/** Canonical wrapped SOL mint at the DFlow router boundary (FR-T4). */
export const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

export const DFLOW_INPUT_MINTS = [USDC_MINT, WRAPPED_SOL_MINT] as const;

export type DflowInputMint = (typeof DFLOW_INPUT_MINTS)[number];

export const DFLOW_SOLVER_MAX_REQUESTS = 4;
export const DFLOW_SOLVER_DEADLINE_MS = 3_000;
export const DFLOW_SOLVER_RESERVED_ATTEMPTS = 4;

export const DFLOW_ORDER_PARAMS = {
  allowSyncExec: true,
  allowAsyncExec: false,
  sponsorExec: false,
  includeAddressLookupTables: true,
} as const;

export const DFLOW_FIXTURE_PROGRAM_ID =
  "DFlowFix1111111111111111111111111111111111111";

/** Fixture API base — never called when DFLOW_API_KEY is absent. */
export const DFLOW_FIXTURE_ORDER_URL = "https://quote-api.dflow.net/order";
