/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as adjustments from "../adjustments.js";
import type * as allocations from "../allocations.js";
import type * as balances from "../balances.js";
import type * as completionShare from "../completionShare.js";
import type * as crons from "../crons.js";
import type * as fxSnapshots from "../fxSnapshots.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as internal_confirmations from "../internal/confirmations.js";
import type * as internal_dflow from "../internal/dflow.js";
import type * as internal_fx from "../internal/fx.js";
import type * as internal_privy from "../internal/privy.js";
import type * as internal_sessionTokens from "../internal/sessionTokens.js";
import type * as internal_settlementPipeline from "../internal/settlementPipeline.js";
import type * as internal_settlementScheduler from "../internal/settlementScheduler.js";
import type * as internal_solana from "../internal/solana.js";
import type * as internal_solanaPolicy from "../internal/solanaPolicy.js";
import type * as internal_telegram from "../internal/telegram.js";
import type * as internal_telegramCommands from "../internal/telegramCommands.js";
import type * as internal_telegramDelivery from "../internal/telegramDelivery.js";
import type * as items from "../items.js";
import type * as lib_activitySync from "../lib/activitySync.js";
import type * as lib_allocationSync from "../lib/allocationSync.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_balanceDerivation from "../lib/balanceDerivation.js";
import type * as lib_billSnapshot from "../lib/billSnapshot.js";
import type * as lib_claimBoardQuery from "../lib/claimBoardQuery.js";
import type * as lib_claimSync from "../lib/claimSync.js";
import type * as lib_fxSnapshotSync from "../lib/fxSnapshotSync.js";
import type * as lib_groupSync from "../lib/groupSync.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_intentAuth from "../lib/intentAuth.js";
import type * as lib_intentExpiry from "../lib/intentExpiry.js";
import type * as lib_intentQuoteTtl from "../lib/intentQuoteTtl.js";
import type * as lib_lockSync from "../lib/lockSync.js";
import type * as lib_paymentConfirmationNotify from "../lib/paymentConfirmationNotify.js";
import type * as lib_privyAuth from "../lib/privyAuth.js";
import type * as lib_providerBudget from "../lib/providerBudget.js";
import type * as lib_receiptExtraction from "../lib/receiptExtraction.js";
import type * as lib_revisionSync from "../lib/revisionSync.js";
import type * as lib_sessionTokenOps from "../lib/sessionTokenOps.js";
import type * as lib_sessionTokenSync from "../lib/sessionTokenSync.js";
import type * as lib_settlementIntentSync from "../lib/settlementIntentSync.js";
import type * as lib_settlementLedger from "../lib/settlementLedger.js";
import type * as lib_settlementObligationSync from "../lib/settlementObligationSync.js";
import type * as lib_settlementState from "../lib/settlementState.js";
import type * as lib_solanaFixture from "../lib/solanaFixture.js";
import type * as lib_sponsorReservation from "../lib/sponsorReservation.js";
import type * as lib_tabAuth from "../lib/tabAuth.js";
import type * as lib_tabBillSync from "../lib/tabBillSync.js";
import type * as lib_tabCommandSync from "../lib/tabCommandSync.js";
import type * as lib_telegramBot from "../lib/telegramBot.js";
import type * as lib_telegramDeepLink from "../lib/telegramDeepLink.js";
import type * as lib_telegramDeliveryCore from "../lib/telegramDeliveryCore.js";
import type * as lib_telegramMembership from "../lib/telegramMembership.js";
import type * as lib_telegramNotify from "../lib/telegramNotify.js";
import type * as lib_telegramOutbox from "../lib/telegramOutbox.js";
import type * as lib_telegramStatusManager from "../lib/telegramStatusManager.js";
import type * as lib_telegramUpdateSync from "../lib/telegramUpdateSync.js";
import type * as lib_telegramVerify from "../lib/telegramVerify.js";
import type * as lib_telegramWebhook from "../lib/telegramWebhook.js";
import type * as lib_viewerScope from "../lib/viewerScope.js";
import type * as lib_walletSync from "../lib/walletSync.js";
import type * as obligations from "../obligations.js";
import type * as receipts from "../receipts.js";
import type * as sessionTokens from "../sessionTokens.js";
import type * as settlements from "../settlements.js";
import type * as sponsorPolicy from "../sponsorPolicy.js";
import type * as tabs from "../tabs.js";
import type * as tips from "../tips.js";
import type * as tokens from "../tokens.js";
import type * as users from "../users.js";
import type * as wallets from "../wallets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  adjustments: typeof adjustments;
  allocations: typeof allocations;
  balances: typeof balances;
  completionShare: typeof completionShare;
  crons: typeof crons;
  fxSnapshots: typeof fxSnapshots;
  groups: typeof groups;
  http: typeof http;
  "internal/confirmations": typeof internal_confirmations;
  "internal/dflow": typeof internal_dflow;
  "internal/fx": typeof internal_fx;
  "internal/privy": typeof internal_privy;
  "internal/sessionTokens": typeof internal_sessionTokens;
  "internal/settlementPipeline": typeof internal_settlementPipeline;
  "internal/settlementScheduler": typeof internal_settlementScheduler;
  "internal/solana": typeof internal_solana;
  "internal/solanaPolicy": typeof internal_solanaPolicy;
  "internal/telegram": typeof internal_telegram;
  "internal/telegramCommands": typeof internal_telegramCommands;
  "internal/telegramDelivery": typeof internal_telegramDelivery;
  items: typeof items;
  "lib/activitySync": typeof lib_activitySync;
  "lib/allocationSync": typeof lib_allocationSync;
  "lib/auth": typeof lib_auth;
  "lib/balanceDerivation": typeof lib_balanceDerivation;
  "lib/billSnapshot": typeof lib_billSnapshot;
  "lib/claimBoardQuery": typeof lib_claimBoardQuery;
  "lib/claimSync": typeof lib_claimSync;
  "lib/fxSnapshotSync": typeof lib_fxSnapshotSync;
  "lib/groupSync": typeof lib_groupSync;
  "lib/identity": typeof lib_identity;
  "lib/intentAuth": typeof lib_intentAuth;
  "lib/intentExpiry": typeof lib_intentExpiry;
  "lib/intentQuoteTtl": typeof lib_intentQuoteTtl;
  "lib/lockSync": typeof lib_lockSync;
  "lib/paymentConfirmationNotify": typeof lib_paymentConfirmationNotify;
  "lib/privyAuth": typeof lib_privyAuth;
  "lib/providerBudget": typeof lib_providerBudget;
  "lib/receiptExtraction": typeof lib_receiptExtraction;
  "lib/revisionSync": typeof lib_revisionSync;
  "lib/sessionTokenOps": typeof lib_sessionTokenOps;
  "lib/sessionTokenSync": typeof lib_sessionTokenSync;
  "lib/settlementIntentSync": typeof lib_settlementIntentSync;
  "lib/settlementLedger": typeof lib_settlementLedger;
  "lib/settlementObligationSync": typeof lib_settlementObligationSync;
  "lib/settlementState": typeof lib_settlementState;
  "lib/solanaFixture": typeof lib_solanaFixture;
  "lib/sponsorReservation": typeof lib_sponsorReservation;
  "lib/tabAuth": typeof lib_tabAuth;
  "lib/tabBillSync": typeof lib_tabBillSync;
  "lib/tabCommandSync": typeof lib_tabCommandSync;
  "lib/telegramBot": typeof lib_telegramBot;
  "lib/telegramDeepLink": typeof lib_telegramDeepLink;
  "lib/telegramDeliveryCore": typeof lib_telegramDeliveryCore;
  "lib/telegramMembership": typeof lib_telegramMembership;
  "lib/telegramNotify": typeof lib_telegramNotify;
  "lib/telegramOutbox": typeof lib_telegramOutbox;
  "lib/telegramStatusManager": typeof lib_telegramStatusManager;
  "lib/telegramUpdateSync": typeof lib_telegramUpdateSync;
  "lib/telegramVerify": typeof lib_telegramVerify;
  "lib/telegramWebhook": typeof lib_telegramWebhook;
  "lib/viewerScope": typeof lib_viewerScope;
  "lib/walletSync": typeof lib_walletSync;
  obligations: typeof obligations;
  receipts: typeof receipts;
  sessionTokens: typeof sessionTokens;
  settlements: typeof settlements;
  sponsorPolicy: typeof sponsorPolicy;
  tabs: typeof tabs;
  tips: typeof tips;
  tokens: typeof tokens;
  users: typeof users;
  wallets: typeof wallets;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
