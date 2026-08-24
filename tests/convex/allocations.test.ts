import { describe, expect, it } from "vitest";
import {
  countUnassignedItems,
  computeItemShares,
  itemMonetaryShortfallMinor,
  resolveTabAdjustments,
  type ItemClaimRow,
} from "../../convex/lib/allocationSync";
import { checkClientRevision, bumpRevision, STALE_REVISION } from "../../convex/lib/revisionSync";
import { LOCK_FAILURE, REOPEN_FAILURE } from "../../convex/lib/lockSync";
import {
  CLAIM_FAILURE,
  organizerResolveItemCore,
  setOwnClaimQuantityCore,
} from "../../convex/lib/claimSync";
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

describe("frozen-spec organizer fair resolution", () => {
  const NOW = 1_800_000_100_000;
  const participants = ["users:organizer", "users:andre", "users:maya", "users:lee"] as never[];

  function seed(claims: Array<{ id: string; userId: string; quantity: number }>, quantity = 4) {
    return createFakeCtx({
      tabs: [{ _id: "tabs:1", status: "open", revision: 7, updatedAt: NOW }],
      items: [{
        _id: "items:shared",
        tabId: "tabs:1",
        name: "Skewers",
        quantity,
        unitPriceMinor: 1000,
        lineTotalMinor: quantity * 1000,
        allocationMode: "quantity",
        sortOrder: 0,
        source: "receipt",
        createdAt: NOW,
        updatedAt: NOW,
      }],
      allocations: claims.map((claim) => ({
        _id: claim.id,
        tabId: "tabs:1",
        itemId: "items:shared",
        userId: claim.userId,
        revision: 7,
        mode: "quantity",
        quantity: claim.quantity,
        amountMinor: 0n,
        roundingMinor: 0n,
        createdAt: NOW,
        updatedAt: NOW,
      })),
      adjustments: [],
      adjustmentAllocations: [],
    });
  }

  const resolve = (ctx: never, operation: Parameters<typeof organizerResolveItemCore>[1]["operation"], extra = {}) =>
    organizerResolveItemCore(ctx, {
      tabId: "tabs:1" as never,
      itemId: "items:shared" as never,
      organizerUserId: "users:organizer" as never,
      participantUserIds: participants,
      operation,
      clientRevision: 7,
      now: NOW,
      ...extra,
    });

  it("assigns only the remaining integer quantity across multiple selected people", async () => {
    const { ctx, store } = seed([{ id: "allocations:andre", userId: "users:andre", quantity: 1 }]);
    await resolve(ctx, "assign_remaining", {
      targetUserIds: ["users:maya", "users:lee"] as never[],
    });
    const quantities = Object.fromEntries(store.allocations.map((row) => [row.userId, row.quantity]));
    expect(quantities).toEqual({ "users:andre": 1, "users:maya": 2, "users:lee": 1 });
  });

  it("lets the organizer explicitly cover the remainder without changing prior claims", async () => {
    const { ctx, store } = seed([{ id: "allocations:andre", userId: "users:andre", quantity: 1 }]);
    await resolve(ctx, "organizer_covers_remainder");
    expect(store.allocations.find((row) => row.userId === "users:andre")?.quantity).toBe(1);
    expect(store.allocations.find((row) => row.userId === "users:organizer")?.quantity).toBe(3);
  });

  it("removes one claimant and leaves an explicit shortfall instead of redistributing", async () => {
    const { ctx, store } = seed([
      { id: "allocations:andre", userId: "users:andre", quantity: 1 },
      { id: "allocations:maya", userId: "users:maya", quantity: 3 },
    ]);
    await resolve(ctx, "remove_claimant", { sourceUserId: "users:maya" as never });
    expect(store.allocations).toHaveLength(1);
    expect(store.allocations[0]?.userId).toBe("users:andre");
    expect(store.allocations[0]?.quantity).toBe(1);
  });

  it("reassigns an individual's exact quantity and merges an existing target", async () => {
    const { ctx, store } = seed([
      { id: "allocations:andre", userId: "users:andre", quantity: 1 },
      { id: "allocations:maya", userId: "users:maya", quantity: 3 },
    ]);
    await resolve(ctx, "reassign_claimant", {
      sourceUserId: "users:maya" as never,
      targetUserId: "users:andre" as never,
    });
    expect(store.allocations).toHaveLength(1);
    expect(store.allocations[0]).toMatchObject({ userId: "users:andre", quantity: 4 });
  });

  it("merges exact fixed monetary weights when reassigning onto an existing claimant", async () => {
    const { ctx, store } = createFakeCtx({
      tabs: [{ _id: "tabs:1", status: "open", revision: 7, updatedAt: NOW }],
      items: [{
        _id: "items:shared", tabId: "tabs:1", name: "Set menu", quantity: 1,
        unitPriceMinor: 4000, lineTotalMinor: 4000, allocationMode: "fixed",
        sortOrder: 0, source: "receipt", createdAt: NOW, updatedAt: NOW,
      }],
      allocations: [
        { _id: "allocations:andre", tabId: "tabs:1", itemId: "items:shared", userId: "users:andre", revision: 7, mode: "fixed", fixedMinor: 1000n, amountMinor: 1000n, roundingMinor: 0n, createdAt: NOW, updatedAt: NOW },
        { _id: "allocations:maya", tabId: "tabs:1", itemId: "items:shared", userId: "users:maya", revision: 7, mode: "fixed", fixedMinor: 3000n, amountMinor: 3000n, roundingMinor: 0n, createdAt: NOW, updatedAt: NOW },
      ],
      adjustments: [], adjustmentAllocations: [],
    });
    await resolve(ctx, "reassign_claimant", {
      sourceUserId: "users:maya" as never,
      targetUserId: "users:andre" as never,
    });
    expect(store.allocations).toHaveLength(1);
    expect(store.allocations[0]?.fixedMinor).toBe(4000n);
  });

  it("projects and assigns the exact remaining percentage weight", async () => {
    const row: ItemClaimRow = {
      itemId: "items:shared" as never,
      lineTotalMinor: thbMinorFromInteger(4000),
      mode: "percentage",
      itemQuantity: 1,
      claims: [{ participantId: "users:andre", weight: 1, percentageBps: 2500 }],
    };
    expect(itemMonetaryShortfallMinor(row)).toBe(3000);

    const { ctx, store } = createFakeCtx({
      tabs: [{ _id: "tabs:1", status: "open", revision: 7, updatedAt: NOW }],
      items: [{ _id: "items:shared", tabId: "tabs:1", name: "Set menu", quantity: 1, unitPriceMinor: 4000, lineTotalMinor: 4000, allocationMode: "percentage", sortOrder: 0, source: "receipt", createdAt: NOW, updatedAt: NOW }],
      allocations: [{ _id: "allocations:andre", tabId: "tabs:1", itemId: "items:shared", userId: "users:andre", revision: 7, mode: "percentage", percentageBps: 2500, amountMinor: 1000n, roundingMinor: 0n, createdAt: NOW, updatedAt: NOW }],
      adjustments: [], adjustmentAllocations: [],
    });
    await resolve(ctx, "assign_remaining", { targetUserIds: ["users:maya"] as never[] });
    expect(store.allocations.find((allocation) => allocation.userId === "users:maya")?.percentageBps).toBe(7500);
  });

  it("shares with the complete frozen participant roster only when explicitly chosen", async () => {
    const { ctx, store } = seed([{ id: "allocations:andre", userId: "users:andre", quantity: 1 }]);
    await resolve(ctx, "share_with_everyone");
    expect(store.items[0]?.allocationMode).toBe("equal");
    expect(store.allocations.map((row) => row.userId).sort()).toEqual([...participants].sort());
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
