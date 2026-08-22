import { describe, expect, it } from "vitest";
import {
  countUnassignedItems,
  computeItemShares,
  resolveTabAdjustments,
  type ItemClaimRow,
} from "../../convex/lib/allocationSync";
import { checkClientRevision, bumpRevision, STALE_REVISION } from "../../convex/lib/revisionSync";
import { LOCK_FAILURE, REOPEN_FAILURE } from "../../convex/lib/lockSync";
import { CLAIM_FAILURE, setOwnClaimQuantityCore } from "../../convex/lib/claimSync";
import { projectClaimItemView } from "../../convex/lib/claimBoardQuery";
import { createFakeCtx } from "../helpers/convexFakeDb";
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
        itemQuantity: 1,
        claims: [{ participantId: "users:1", weight: 1 }],
      },
      {
        itemId: "items:2" as never,
        lineTotalMinor: thbMinorFromInteger(200),
        mode: "equal",
        itemQuantity: 1,
        claims: [],
      },
    ];
    expect(countUnassignedItems(rows)).toBe(1);
  });

  it("AC1 — quantity shortfall counts as unassigned (D-29)", () => {
    const rows: ItemClaimRow[] = [
      {
        itemId: "items:beers" as never,
        lineTotalMinor: thbMinorFromInteger(9000),
        mode: "quantity",
        itemQuantity: 3,
        claims: [{ participantId: "users:1", weight: 1, quantity: 1 }],
      },
    ];
    expect(countUnassignedItems(rows)).toBe(1);
  });

  it("AC1 — fully claimed k-of-n is assigned", () => {
    const rows: ItemClaimRow[] = [
      {
        itemId: "items:beers" as never,
        lineTotalMinor: thbMinorFromInteger(9000),
        mode: "quantity",
        itemQuantity: 3,
        claims: [
          { participantId: "users:1", weight: 2, quantity: 2 },
          { participantId: "users:2", weight: 1, quantity: 1 },
        ],
      },
    ];
    expect(countUnassignedItems(rows)).toBe(0);
  });
});

describe("Story 5.2/5.11 — computeItemShares", () => {
  it("sums mixed-mode items for lock invariant input", () => {
    const rows: ItemClaimRow[] = [
      {
        itemId: "items:1" as never,
        lineTotalMinor: thbMinorFromInteger(300),
        mode: "equal",
        itemQuantity: 1,
        claims: [
          { participantId: "a", weight: 1 },
          { participantId: "b", weight: 1 },
        ],
      },
      {
        itemId: "items:2" as never,
        lineTotalMinor: thbMinorFromInteger(200),
        mode: "quantity",
        itemQuantity: 3,
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
          _creationTime: 0,
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
          _creationTime: 0,
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

describe("D-29 — claim board query projects quantity", () => {
  it("sends quantity, claimed counts and shortfall to the client", () => {
    const view = projectClaimItemView({
      itemId: "items:beers",
      name: "Singha",
      lineTotalMinor: 9000,
      quantity: 3,
      allocationMode: "quantity",
      claims: [
        { userId: "users:maya", quantity: 1 },
        { userId: "users:andre", quantity: 1 },
      ],
      viewerUserId: "users:maya",
    });
    expect(view.quantity).toBe(3);
    expect(view.allocationMode).toBe("quantity");
    expect(view.claimedCount).toBe(2);
    expect(view.shortfall).toBe(1);
    expect(view.viewerClaimedQuantity).toBe(1);
    expect(view.unassigned).toBe(true);
  });

  it("treats a qty-3 receipt line without an explicit mode as quantity", () => {
    const view = projectClaimItemView({
      itemId: "items:beers",
      name: "Singha",
      lineTotalMinor: 9000,
      quantity: 3,
      claims: [],
      viewerUserId: "users:maya",
    });
    expect(view.allocationMode).toBe("quantity");
    expect(view.claimedCount).toBe(0);
    expect(view.shortfall).toBe(3);
    expect(view.unassigned).toBe(true);
  });

  it("keeps equal-split qty-1 as claimant count, not a percent", () => {
    const view = projectClaimItemView({
      itemId: "items:curry",
      name: "Green Curry",
      lineTotalMinor: 18000,
      quantity: 1,
      allocationMode: "equal",
      claims: [{ userId: "users:maya" }, { userId: "users:andre" }],
      viewerUserId: "users:maya",
    });
    expect(view.allocationMode).toBe("equal");
    expect(view.claimedCount).toBe(2);
    expect(view.shortfall).toBe(0);
    expect(view.unassigned).toBe(false);
  });
});

describe("D-29 — claimSync persists integer quantity", () => {
  const NOW = 1_800_000_000_000;

  function seedQuantityTab() {
    const store: Record<string, Array<Record<string, unknown> & { _id: string }>> = {
      tabs: [
        {
          _id: "tabs:1",
          status: "open",
          revision: 1,
          updatedAt: NOW,
        },
      ],
      items: [
        {
          _id: "items:beers",
          tabId: "tabs:1",
          name: "Singha",
          quantity: 3,
          unitPriceMinor: 3000,
          lineTotalMinor: 9000,
          allocationMode: "quantity",
          sortOrder: 0,
          source: "receipt",
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      allocations: [
        {
          _id: "allocations:andre",
          tabId: "tabs:1",
          itemId: "items:beers",
          userId: "users:andre",
          revision: 1,
          mode: "quantity",
          quantity: 2,
          amountMinor: 0n,
          roundingMinor: 0n,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      adjustments: [],
      adjustmentAllocations: [],
    };
    return createFakeCtx(store);
  }

  it("refuses a write that would take more than n", async () => {
    const { ctx } = seedQuantityTab();
    await expect(
      setOwnClaimQuantityCore(ctx, {
        tabId: "tabs:1" as never,
        itemId: "items:beers" as never,
        userId: "users:maya" as never,
        clientRevision: 1,
        quantity: 2,
        now: NOW,
      }),
    ).rejects.toThrow(CLAIM_FAILURE.QUANTITY_EXCEEDS_ITEM);
  });

  it("refuses a fractional quantity", async () => {
    const { ctx } = seedQuantityTab();
    await expect(
      setOwnClaimQuantityCore(ctx, {
        tabId: "tabs:1" as never,
        itemId: "items:beers" as never,
        userId: "users:maya" as never,
        clientRevision: 1,
        quantity: 1.5,
        now: NOW,
      }),
    ).rejects.toThrow(CLAIM_FAILURE.INVALID_QUANTITY);
  });

  it("persists the viewer's integer count when it fits", async () => {
    const { ctx, store } = seedQuantityTab();
    const result = await setOwnClaimQuantityCore(ctx, {
      tabId: "tabs:1" as never,
      itemId: "items:beers" as never,
      userId: "users:maya" as never,
      clientRevision: 1,
      quantity: 1,
      now: NOW,
    });
    expect(result.claimed).toBe(true);
    expect(result.quantity).toBe(1);
    const maya = store.allocations?.find((row) => row.userId === "users:maya");
    expect(maya?.quantity).toBe(1);
    expect(maya?.mode).toBe("quantity");
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
    expect(CLAIM_FAILURE.QUANTITY_EXCEEDS_ITEM).toBe("QUANTITY_EXCEEDS_ITEM");
    expect(CLAIM_FAILURE.INVALID_QUANTITY).toBe("INVALID_QUANTITY");
  });
});
