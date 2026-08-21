/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev` or `npx convex codegen`.
 * This stub exists so builds succeed without a linked Convex deployment.
 */
import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import type * as internal_confirmations from "../internal/confirmations.js";
import type * as internal_privy from "../internal/privy.js";
import type * as internal_settlementPipeline from "../internal/settlementPipeline.js";
import type * as internal_solana from "../internal/solana.js";
import type * as internal_solanaPolicy from "../internal/solanaPolicy.js";
import type * as internal_settlementScheduler from "../internal/settlementScheduler.js";
import type * as internal_sessionTokens from "../internal/sessionTokens.js";
import type * as internal_telegram from "../internal/telegram.js";
import type * as sessionTokens from "../sessionTokens.js";
import type * as tabs from "../tabs.js";
import type * as settlements from "../settlements.js";
import type * as sponsorPolicy from "../sponsorPolicy.js";
import type * as users from "../users.js";
import type * as wallets from "../wallets.js";

declare const fullApi: ApiFromModules<{
  users: typeof users;
  wallets: typeof wallets;
  settlements: typeof settlements;
  sessionTokens: typeof sessionTokens;
  tabs: typeof tabs;
  sponsorPolicy: typeof sponsorPolicy;
  "internal/sessionTokens": typeof internal_sessionTokens;
  "internal/settlementScheduler": typeof internal_settlementScheduler;
  "internal/telegram": typeof internal_telegram;
  "internal/privy": typeof internal_privy;
  "internal/confirmations": typeof internal_confirmations;
  "internal/solana": typeof internal_solana;
  "internal/solanaPolicy": typeof internal_solanaPolicy;
  "internal/settlementPipeline": typeof internal_settlementPipeline;
}>;

export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
