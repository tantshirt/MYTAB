/**
 * Token metadata for My Tab.
 *
 * Source: Jupiter Token API V2, batched by mint, fetched server-side into a
 * Convex cache and never shipped to the client as a list. Decimals are proven
 * against the mint account before any amount is scaled by them, and the mints
 * pinned in `lib/solana/cluster.ts` outrank anything a registry says.
 *
 * The entry points that matter:
 *  - `assertTransactable` — the fail-closed gate before building a transaction.
 *  - `formatTokenAmountWithSymbol` — the only sanctioned way to render an amount.
 *  - `api.tokens.getTokenMetadata` (Convex) — the narrow, per-mint read.
 */

export * from "./types";
export * from "./mintAccount";
export * from "./canonical";
export * from "./policy";
export * from "./display";
export * from "./jupiter";
export * from "./chain";
export * from "./resolve";
