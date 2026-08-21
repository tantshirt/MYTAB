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
import type * as internal_telegram from "../internal/telegram.js";
import type * as users from "../users.js";

declare const fullApi: ApiFromModules<{
  users: typeof users;
  "internal/telegram": typeof internal_telegram;
}>;

export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
