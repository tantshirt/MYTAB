import { describe, expect, it } from "vitest";
import {
  countUnassignedItems,
  computeItemShares,
  resolveTabAdjustments,
  type ItemClaimRow,
} from "../../convex/lib/allocationSync";
import { checkClientRevision, bumpRevision, STALE_REVISION } from "../../convex/lib/revisionSync";
import { LOCK_FAILURE, REOPEN_FAILURE } from "../../convex/lib/lockSync";
import { CLAIM_FAILURE } from "../../convex/lib/claimSync";
import { thbMinorFromInteger } from "@/lib/domain/parse";

describe("Story 5.1 — revision sync", () => {
  it("AC2 — rejects stale revision with stable code", () => {
    expect(() => checkClientRevision(2, 3)).toThrow(expect.objectContaining({ code: STALE_REVISION }));
  });

  it("AC1 — bumpRevision increments", () => {
    expect(bumpRevision(4)).toBe(5);
  });
});

describe("Story 5.7 — unassigned item counting", () => {
  it("AC1 — counts items without claimants", () => {
    const rows: ItemClaimRow[] = [
      {
        itemId: "items:1" as never,
        lineTotalMinor: thbMinorFromInteger(100),
        mode: "equal",
        claims: [{ participantId: "users:1", weight: 1 }],
      },
      {
        itemId: "items:2" as never,
        lineTotalMinor: thbMinorFromInteger(200),
        mode: "equal",
        claims: [],
      },
    ];
    expect(countUnassignedItems(rows)).toBe(1);
  });
});

describe("Story 5.2/5.11 — computeItemShares", () => {
  it("sums mixed-mode items for lock invariant input", () => {
    const rows: ItemClaimRow[] = [
      {
        itemId: "items:1" as never,
        lineTotalMinor: thbMinorFromInteger(300),
        mode: "equal",
        claims: [
          { participantId: "a", weight: 1 },
          { participantId: "b", weight: 1 },
        ],
      },
      {
        itemId: "items:2" as never,
        lineTotalMinor: thbMinorFromInteger(200),
        mode: "quantity",
        claims: [
          { participantId: "a", weight: 2, quantity: 2 },
          { participantId: "c", weight: 1, quantity: 1 },
        ],
      },
    ];
    const shares = computeItemShares(rows);
    const total = shares.reduce((sum, row) => sum + row.amountMinor, 0);
    expect(total).toBe(500);
  });
});

describe("Story 5.3 — resolveTabAdjustments", () => {
  it("applies canonical service → tax → discount → tip order", () => {
    const itemSubtotal = thbMinorFromInteger(1000);
    const { totals } = resolveTabAdjustments(
      [
        {
          _id: "adj:1" as never,
          tabId: "tabs:1" as never,
          kind: "service",
          calculation: "percentage",
          valueMinorOrBps: 1000,
          percentageBase: "item_subtotal",
          position: 0,
          createdAt: 0,
          updatedAt: 0,
        },
        {
          _id: "adj:2" as never,
          tabId: "tabs:1" as never,
          kind: "tax",
          calculation: "percentage",
          valueMinorOrBps: 700,
          percentageBase: "after_service_charge",
          position: 1,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      itemSubtotal,
    );
    expect(totals.serviceMinor).toBe(100);
    expect(totals.taxMinor).toBe(77);
    expect(totals.billTotalMinor).toBe(1177);
  });
});

describe("Story 5.9/5.10 — stable failure codes", () => {
  it("exports lock and reopen failure codes", () => {
    expect(LOCK_FAILURE.UNASSIGNED_ITEMS).toBe("UNASSIGNED_ITEMS");
    expect(LOCK_FAILURE.INVARIANT_FAILED).toBe("INVARIANT_FAILED");
    expect(REOPEN_FAILURE.IN_FLIGHT_INTENT).toBe("IN_FLIGHT_INTENT");
  });

  it("exports claim failure codes", () => {
    expect(CLAIM_FAILURE.CANNOT_RELEASE_OTHERS).toBe("CANNOT_RELEASE_OTHERS");
  });
});
