/**
 * Reconciliation incidents — operator surface for D-30 unknown intents.
 *
 * Public `listIncidents` always refuses. A stranger who can name a tab must
 * not learn whether an incident exists. Operators read through
 * `listIncidentsInternal` (Convex dashboard / `npx convex run`) or the
 * HTTP list gated by `OPERATOR_RECONCILIATION_SECRET`.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { AuthError, UNAUTHORIZED } from "./lib/auth";
import {
  RECONCILIATION_INCIDENT_STATUS,
  listReconciliationIncidents,
  recordReconciliationIncident,
  type ReconciliationIncidentStatus,
} from "./lib/reconciliation";

/**
 * Public surface: always 403. No `tabId` argument, so this is not an oracle
 * for "is there an incident on tab X".
 */
export const listIncidents = query({
  args: {},
  handler: async () => {
    throw new AuthError(UNAUTHORIZED);
  },
});

export const listIncidentsInternal = internalQuery({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
  },
  handler: async (ctx, args) => {
    const status = (args.status ?? RECONCILIATION_INCIDENT_STATUS.OPEN) as ReconciliationIncidentStatus;
    return listReconciliationIncidents(ctx, status);
  },
});

export const recordIncidentInternal = internalMutation({
  args: {
    intentId: v.id("settlementIntents"),
    tabId: v.optional(v.id("tabs")),
    observedSignature: v.optional(v.string()),
    failedCheck: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return recordReconciliationIncident(ctx, {
      intentId: args.intentId,
      ...(args.tabId ? { tabId: args.tabId } : {}),
      ...(args.observedSignature ? { observedSignature: args.observedSignature } : {}),
      ...(args.failedCheck ? { failedCheck: args.failedCheck } : {}),
    });
  },
});
