import { describe, expect, it } from "vitest";
import { AuthError, UNAUTHORIZED } from "@/convex/lib/auth";
import {
  authorizeOperatorReconciliation,
  incidentFromMismatchStop,
  listReconciliationIncidents,
  parseBearerSecret,
  RECONCILIATION_INCIDENT_STATUS,
  readOperatorReconciliationSecret,
  recordReconciliationIncident,
  shouldRecordReconciliationIncident,
} from "@/convex/lib/reconciliation";
import * as reconciliation from "@/convex/reconciliation";
import { createFakeCtx, fakeId } from "../helpers/convexFakeDb";

const run = (fn: unknown, ctx: unknown, args: unknown = {}) =>
  (fn as { _handler: (c: unknown, a: unknown) => Promise<unknown> })._handler(ctx, args);

const INTENT_ID = fakeId<"settlementIntents">("settlementIntents:1");
const TAB_ID = fakeId<"tabs">("tabs:1");

describe("D-30 — mismatch stop records an incident", () => {
  it("records an incident only when polling stops", () => {
    expect(shouldRecordReconciliationIncident(false)).toBe(true);
    expect(shouldRecordReconciliationIncident(true)).toBe(false);
  });

  it("omits a failed check when the provider named nothing", () => {
    const draft = incidentFromMismatchStop({
      intentId: INTENT_ID,
      tabId: TAB_ID,
      observedSignature: "5sig",
      failedCheck: "",
    });

    expect(draft.failedCheck).toBeUndefined();
    expect(draft.observedSignature).toBe("5sig");
    expect(draft.tabId).toBe(TAB_ID);
  });

  it("writes an open incident when poll stops on mismatch", async () => {
    const { ctx, store } = createFakeCtx({
      settlementIntents: [{ _id: INTENT_ID, tabId: TAB_ID, status: "unknown" }],
      reconciliationIncidents: [],
    });

    const result = await recordReconciliationIncident(ctx, {
      intentId: INTENT_ID,
      tabId: TAB_ID,
      observedSignature: "5observedSig",
      failedCheck: "CONFIRMATION_RECIPIENT_DELTA",
    });

    expect(result.inserted).toBe(true);
    expect(store.reconciliationIncidents).toHaveLength(1);
    expect(store.reconciliationIncidents![0]).toMatchObject({
      intentId: INTENT_ID,
      tabId: TAB_ID,
      observedSignature: "5observedSig",
      failedCheck: "CONFIRMATION_RECIPIENT_DELTA",
      status: RECONCILIATION_INCIDENT_STATUS.OPEN,
    });
    expect(store.reconciliationIncidents![0]?.failedCheck).not.toMatch(/something went wrong/i);
  });

  it("does not invent a check when none was observed", async () => {
    const { ctx, store } = createFakeCtx({ reconciliationIncidents: [] });

    await recordReconciliationIncident(ctx, { intentId: INTENT_ID, tabId: TAB_ID });

    expect(store.reconciliationIncidents).toHaveLength(1);
    expect(store.reconciliationIncidents![0]?.failedCheck).toBeUndefined();
    expect(store.reconciliationIncidents![0]?.observedSignature).toBeUndefined();
  });

  it("does not open a second incident for the same intent", async () => {
    const { ctx, store } = createFakeCtx({ reconciliationIncidents: [] });

    await recordReconciliationIncident(ctx, {
      intentId: INTENT_ID,
      failedCheck: "CONFIRMATION_MINT",
    });
    const second = await recordReconciliationIncident(ctx, {
      intentId: INTENT_ID,
      failedCheck: "CONFIRMATION_MINT",
    });

    expect(second.inserted).toBe(false);
    expect(store.reconciliationIncidents).toHaveLength(1);
  });

  it("lists open incidents to the operator path", async () => {
    const { ctx } = createFakeCtx({
      reconciliationIncidents: [
        {
          _id: "reconciliationIncidents:1",
          intentId: INTENT_ID,
          tabId: TAB_ID,
          failedCheck: "CONFIRMATION_RECIPIENT_DELTA",
          createdAt: 20,
          status: "open",
        },
        {
          _id: "reconciliationIncidents:2",
          intentId: "settlementIntents:2",
          createdAt: 10,
          status: "resolved",
        },
      ],
    });

    const open = await listReconciliationIncidents(ctx);
    expect(open).toHaveLength(1);
    expect(open[0]?.intentId).toBe(INTENT_ID);

    const viaInternal = await run(reconciliation.listIncidentsInternal, ctx, {});
    expect(viaInternal).toEqual(open);
  });
});

describe("D-30 — a stranger cannot read incidents", () => {
  it("refuses the public list with nothing about whether a tab has one", async () => {
    const { ctx } = createFakeCtx({
      reconciliationIncidents: [
        {
          _id: "reconciliationIncidents:1",
          intentId: INTENT_ID,
          tabId: TAB_ID,
          createdAt: 1,
          status: "open",
        },
      ],
    });

    await expect(run(reconciliation.listIncidents, ctx, {})).rejects.toBeInstanceOf(AuthError);
    await expect(run(reconciliation.listIncidents, ctx, {})).rejects.toMatchObject({
      code: UNAUTHORIZED,
    });
  });

  it("HTTP list is 403 without the operator secret — same answer either way", () => {
    expect(authorizeOperatorReconciliation(null, "secret")).toBe(false);
    expect(authorizeOperatorReconciliation("wrong", "secret")).toBe(false);
    expect(authorizeOperatorReconciliation("secret", null)).toBe(false);
    expect(authorizeOperatorReconciliation("secret", "")).toBe(false);
    expect(authorizeOperatorReconciliation("secret", "secret")).toBe(true);
    expect(readOperatorReconciliationSecret({})).toBeNull();
    expect(readOperatorReconciliationSecret({ OPERATOR_RECONCILIATION_SECRET: "  " })).toBeNull();
    expect(parseBearerSecret(null)).toBeNull();
    expect(parseBearerSecret("Bearer operator-secret")).toBe("operator-secret");
  });
});
