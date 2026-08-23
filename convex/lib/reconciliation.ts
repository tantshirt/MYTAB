/**
 * Reconciliation incidents (D-30).
 *
 * A finalized transaction that fails a confirmation check is not `failed` —
 * value may have moved. Polling stops, the intent stays `unknown`, and this
 * module records what was actually observed so an operator can find it.
 *
 * Never invent a failure reason. A bare `false` from the provider is recorded
 * as the absence of a named check, not as a story about why.
 */

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { timingSafeEqual, utf8ToBytes } from "../../lib/crypto/convexCrypto";

export const RECONCILIATION_INCIDENT_STATUS = {
  OPEN: "open",
  RESOLVED: "resolved",
} as const;

export type ReconciliationIncidentStatus =
  (typeof RECONCILIATION_INCIDENT_STATUS)[keyof typeof RECONCILIATION_INCIDENT_STATUS];

export type ReconciliationIncidentDraft = {
  intentId: Id<"settlementIntents">;
  tabId?: Id<"tabs">;
  observedSignature?: string;
  failedCheck?: string;
};

/**
 * True when polling stops while the intent stays `unknown`.
 * Do not resume a poll that was correctly stopped.
 */
export function shouldRecordReconciliationIncident(reschedule: boolean): boolean {
  return reschedule === false;
}

function optionalObserved(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Shape the incident from a mismatch stop. Empty or missing observations are
 * omitted — they are not replaced with a fabricated check name.
 */
export function incidentFromMismatchStop(input: {
  intentId: Id<"settlementIntents">;
  tabId?: Id<"tabs"> | null;
  observedSignature?: string | null;
  failedCheck?: string | null;
}): ReconciliationIncidentDraft {
  const draft: ReconciliationIncidentDraft = { intentId: input.intentId };
  if (input.tabId) {
    draft.tabId = input.tabId;
  }
  const signature = optionalObserved(input.observedSignature);
  if (signature) {
    draft.observedSignature = signature;
  }
  const failedCheck = optionalObserved(input.failedCheck);
  if (failedCheck) {
    draft.failedCheck = failedCheck;
  }
  return draft;
}

export async function findOpenIncidentForIntent(
  ctx: QueryCtx | MutationCtx,
  intentId: Id<"settlementIntents">,
) {
  const rows = await ctx.db
    .query("reconciliationIncidents")
    .withIndex("by_intent_id", (q) => q.eq("intentId", intentId))
    .collect();
  return rows.find((row) => row.status === RECONCILIATION_INCIDENT_STATUS.OPEN) ?? null;
}

/**
 * Inserts one open incident per intent. A second stop for the same intent is
 * a no-op so a retry cannot double-open the queue.
 */
export async function recordReconciliationIncident(
  ctx: MutationCtx,
  draft: ReconciliationIncidentDraft,
): Promise<{ inserted: boolean; incidentId: Id<"reconciliationIncidents"> | null }> {
  const existing = await findOpenIncidentForIntent(ctx, draft.intentId);
  if (existing) {
    return { inserted: false, incidentId: existing._id };
  }

  const incidentId = await ctx.db.insert("reconciliationIncidents", {
    intentId: draft.intentId,
    ...(draft.tabId ? { tabId: draft.tabId } : {}),
    ...(draft.observedSignature ? { observedSignature: draft.observedSignature } : {}),
    ...(draft.failedCheck ? { failedCheck: draft.failedCheck } : {}),
    createdAt: Date.now(),
    status: RECONCILIATION_INCIDENT_STATUS.OPEN,
  });
  return { inserted: true, incidentId };
}

export async function listReconciliationIncidents(
  ctx: QueryCtx,
  status: ReconciliationIncidentStatus = RECONCILIATION_INCIDENT_STATUS.OPEN,
) {
  const rows = await ctx.db
    .query("reconciliationIncidents")
    .withIndex("by_status", (q) => q.eq("status", status))
    .collect();
  return [...rows].sort((a, b) => b.createdAt - a.createdAt);
}

function secretsEqual(left: string, right: string): boolean {
  return timingSafeEqual(utf8ToBytes(left), utf8ToBytes(right));
}

/**
 * Operator secret from Convex env. Empty or missing is `null` — fail closed.
 * Never throws: a missing secret is not permission to list, and must not
 * become a 500 that tells a stranger the deployment is unconfigured.
 */
export function readOperatorReconciliationSecret(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const secret = env.OPERATOR_RECONCILIATION_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

export function parseBearerSecret(headerValue: string | null | undefined): string | null {
  if (!headerValue) {
    return null;
  }
  const trimmed = headerValue.trim();
  const match = /^Bearer\s+(\S+)/i.exec(trimmed);
  return match?.[1] ?? null;
}

/**
 * Same 403 either way: missing secret, wrong secret, or unset configured
 * secret. A stranger must not learn which.
 */
export function authorizeOperatorReconciliation(
  provided: string | null | undefined,
  configured: string | null | undefined,
): boolean {
  if (!configured || !provided) {
    return false;
  }
  return secretsEqual(provided, configured);
}
