import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ClaimBoard,
  claimFooterAction,
  unassignedPhrase,
  type ClaimBoardProps,
} from "@/features/claims/ClaimBoard";
import { ClaimRow, claimRowAriaLabel, claimRowCaption, claimRowStateTag } from "@/components/claim-row";
import { quantityAfterStep, quantityClaimedCaption } from "@/lib/domain";
import { FIXTURE_BILL_REVIEW, FIXTURE_CLAIM_BOARD } from "@/tests/fixtures/claims";
import { WhoHasThisSheet } from "@/features/claims/WhoHasThisSheet";
import { formatFiatMinorThb, perHeadDisplayMinor, thbMinorFromInteger } from "@/lib/domain";

function board(overrides: Partial<ClaimBoardProps> = {}): ClaimBoardProps {
  return { ...FIXTURE_CLAIM_BOARD, ...overrides };
}

const render = (props: ClaimBoardProps) => renderToStaticMarkup(<ClaimBoard {...props} />);

const item = (id: string) => FIXTURE_CLAIM_BOARD.items.find((one) => one.id === id)!;

describe("Story 5.4 — claim board fixture", () => {
  it("AC2 — a shared item shows the per-head split", () => {
    // Sukhumvit Dinner, canonical: Pad Thai is ฿240.00 across Maya and Noi.
    const padThai = item("item_pad_thai");
    expect(padThai.claimantIds).toHaveLength(2);
    expect(
      formatFiatMinorThb(perHeadDisplayMinor(thbMinorFromInteger(padThai.lineTotalMinor), 2)),
    ).toBe("฿120.00");

    // ...and Som Tam is ฿120.00 across Noi and Ploy, the Flow 3 collision.
    const somTam = item("item_som_tam");
    expect(
      formatFiatMinorThb(perHeadDisplayMinor(thbMinorFromInteger(somTam.lineTotalMinor), 2)),
    ).toBe("฿60.00");
  });

  it("AC6 — unassigned row flagged", () => {
    expect(FIXTURE_CLAIM_BOARD.unassignedCount).toBe(1);
    expect(FIXTURE_CLAIM_BOARD.items.some((one) => one.unassigned)).toBe(true);
  });
});

describe("Story 5.6 — sticky footer states", () => {
  it("AC3 — organizer sees unassigned count in disabled action", () => {
    expect(FIXTURE_CLAIM_BOARD.isOrganizer).toBe(true);
    expect(FIXTURE_CLAIM_BOARD.unassignedCount).toBe(1);
  });
});

describe("Story 5.5 — presence fixture", () => {
  it("AC1 — presence excludes viewer", () => {
    expect(FIXTURE_CLAIM_BOARD.presenceUserIds).not.toContain(FIXTURE_CLAIM_BOARD.viewerUserId);
  });
});

describe("Story 5.8 — bill review fixture", () => {
  it("AC5 — reconciliation copy when shares add up", () => {
    expect(FIXTURE_BILL_REVIEW.reconciles).toBe(true);
    expect(FIXTURE_BILL_REVIEW.breakdowns.length).toBeGreaterThan(0);
  });

  it("AC2 — participant action disabled pre-lock with reason", () => {
    expect(FIXTURE_BILL_REVIEW.isLocked).toBe(false);
    expect(FIXTURE_BILL_REVIEW.organizerDisplayName).toBe("Maya");
  });
});

describe("P1-20 — the verb agrees with the count", () => {
  it("says 'needs' for one and 'need' for many", () => {
    expect(unassignedPhrase(1)).toBe("1 item needs an owner");
    expect(unassignedPhrase(3)).toBe("3 items need an owner");
  });

  it("puts the count in the blocked organizer's action", () => {
    expect(
      claimFooterAction({
        isLocked: false,
        isOrganizer: true,
        unassignedCount: 1,
        viewerHasClaims: true,
        hasItems: true,
      }),
    ).toEqual({ label: "1 item needs an owner", disabled: true, intent: "blocked" });
  });

  it("never blocks a participant on someone else's unclaimed item", () => {
    expect(
      claimFooterAction({
        isLocked: false,
        isOrganizer: false,
        unassignedCount: 2,
        viewerHasClaims: true,
        hasItems: true,
      }),
    ).toEqual({ label: "Finish claiming", disabled: false, intent: "review" });
  });

  it("routes each label somewhere different", () => {
    const base = { isLocked: false, isOrganizer: false, unassignedCount: 0, hasItems: true };
    expect(claimFooterAction({ ...base, viewerHasClaims: false }).intent).toBe("claim");
    expect(claimFooterAction({ ...base, viewerHasClaims: true }).intent).toBe("review");
    expect(claimFooterAction({ ...base, isLocked: true, viewerHasClaims: true }).intent).toBe(
      "settle",
    );
  });
});

describe("P1-20 — the claim board is not a debugging surface", () => {
  it("never renders the revision", () => {
    const html = render(board({ revision: 7 }));
    expect(html).not.toContain("Revision");
    expect(html).not.toContain("Revision 7");
  });

  it("ticks the assigned total beside the count", () => {
    // ฿1,524.00 of items — the only subtotal that reconciles to the canonical
    // ฿1,840.00 — with the ฿180.00 Mango Sticky Rice still an orphan.
    const html = render(board());
    expect(html).toContain("฿1,344.00 of ฿1,524.00 assigned");
    expect(html).toContain("1 item needs an owner");
  });

  it("says 'all assigned' once nothing is orphaned", () => {
    const html = render(
      board({
        unassignedCount: 0,
        items: FIXTURE_CLAIM_BOARD.items.map((one) =>
          one.unassigned
            ? { ...one, unassigned: false, claimantIds: ["user_ploy"] }
            : one,
        ),
      }),
    );
    expect(html).toContain("฿1,524.00 of ฿1,524.00 assigned");
    expect(html).toContain("all assigned");
  });

  it("teaches the additive rule under the card", () => {
    expect(render(board())).toContain(
      "Tap a dish to claim it. Two people on the same dish split it — nobody gets bumped.",
    );
  });

  it("carries the safe area through the published CSS var, not env()", () => {
    const html = render(board());
    expect(html).toContain("var(--app-pad-bottom, 0px)");
    expect(html).not.toContain("env(safe-area-inset-bottom");
  });

  it("clears the two-line footer with 200px of scroll padding", () => {
    expect(render(board())).toContain("200px");
  });
});

describe("P1-20 — locked removes the affordance, it does not grey it", () => {
  it("drops every claim button rather than disabling it", () => {
    const html = render(board({ isLocked: true }));
    expect(html).not.toContain("data-claim-target");
    expect(html).not.toContain("disabled=\"\"");
  });

  it("gains 'Locked' in its own element and keeps only the Yours tag", () => {
    const html = render(board({ isLocked: true }));
    expect(html).toContain('data-testid="claim-board-locked"');
    expect(html).toContain(">Locked<");
    expect(html).toContain("Yours");
    expect(html).not.toContain(">Claim<");
    expect(html).not.toContain(">Taken<");
  });

  it("offers Settle up beside a quiet link to the full bill", () => {
    const html = render(board({ isLocked: true }));
    expect(html).toContain("Settle up");
    expect(html).toContain("See the full bill");
    expect(html).toContain("Maya locked this bill. Amounts are final.");
  });

  it("keeps the state tag column reserved rather than greyed", () => {
    expect(claimRowStateTag([], false, true)).toBe("none");
    expect(claimRowStateTag([{ userId: "user_maya", displayName: "Maya" }], true, true)).toBe(
      "yours",
    );
  });
});

describe("D-29 — quantity caption and stepper", () => {
  const viewer = "user_maya";

  it("captions quantity-mode as '1 of 3 claimed', never a split or a percent", () => {
    expect(quantityClaimedCaption(1, 3)).toBe("1 of 3 claimed");
    expect(
      claimRowCaption(
        [{ userId: viewer, displayName: "Maya" }],
        9000,
        viewer,
        { itemQuantity: 3, claimedCount: 1 },
      ),
    ).toEqual({ text: "1 of 3 claimed", tone: "warning" });
    expect(
      claimRowCaption(
        [{ userId: viewer, displayName: "Maya" }, { userId: "user_andre", displayName: "Andre" }],
        9000,
        viewer,
        { itemQuantity: 3, claimedCount: 3 },
      ).text,
    ).toBe("3 of 3 claimed");
    expect(
      claimRowCaption(
        [{ userId: viewer, displayName: "Maya" }, { userId: "user_andre", displayName: "Andre" }],
        9000,
        viewer,
        { itemQuantity: 3, claimedCount: 1 },
      ).text,
    ).not.toMatch(/Split|%|50%/);
  });

  it("keeps equal-split copy for a qty-1 shared dish", () => {
    expect(
      claimRowCaption(
        [{ userId: viewer, displayName: "Maya" }, { userId: "user_andre", displayName: "Andre" }],
        18000,
        viewer,
      ).text,
    ).toContain("Split 2 ways");
  });

  it("announces claimed counts instead of a split on a qty-3 line", () => {
    expect(
      claimRowAriaLabel({
        name: "Singha",
        quantity: 3,
        lineTotalMinor: 9000,
        claimants: [{ userId: viewer, displayName: "Maya" }],
        viewerUserId: viewer,
        claimedCount: 1,
      }),
    ).toContain("1 of 3 claimed");
    expect(
      claimRowAriaLabel({
        name: "Singha",
        quantity: 3,
        lineTotalMinor: 9000,
        claimants: [{ userId: viewer, displayName: "Maya" }],
        viewerUserId: viewer,
        claimedCount: 1,
      }),
    ).not.toMatch(/split|50%/i);
  });

  it("steps claimed counts by integers and refuses overflow", () => {
    expect(quantityAfterStep({ itemQuantity: 3, viewerQuantity: 0, othersClaimed: 0, delta: 1 })).toBe(1);
    expect(quantityAfterStep({ itemQuantity: 3, viewerQuantity: 1, othersClaimed: 0, delta: 1 })).toBe(2);
    expect(quantityAfterStep({ itemQuantity: 3, viewerQuantity: 2, othersClaimed: 0, delta: -1 })).toBe(1);
    expect(quantityAfterStep({ itemQuantity: 3, viewerQuantity: 2, othersClaimed: 1, delta: 1 })).toBeNull();
  });

  it("renders 44px increment and decrement targets on a quantity-mode row", () => {
    const html = renderToStaticMarkup(
      <ClaimRow
        itemId="item_singha"
        name="Singha"
        quantity={3}
        allocationMode="quantity"
        lineTotalMinor={9000}
        claimants={[{ userId: viewer, displayName: "Maya" }]}
        viewerUserId={viewer}
        viewerOwns
        locked={false}
        isOrganizer={false}
        claimedCount={1}
        shortfall={2}
        viewerClaimedQuantity={1}
        onSetClaimQuantity={() => undefined}
      />,
    );
    expect(html).toContain("1 of 3 claimed");
    expect(html).not.toContain("Split");
    expect(html).not.toContain("50%");
    expect(html).toContain('data-testid="claim-row-increment-item_singha"');
    expect(html).toContain('data-testid="claim-row-decrement-item_singha"');
    expect(html).toMatch(/min-width:\s*44px/);
    expect(html).toMatch(/min-height:\s*44px/);
    expect(html).not.toContain('data-testid="claim-row-item_singha"');
  });

  it("renders the qty-3 fixture row as a stepper, not a binary tap", () => {
    const html = render(board());
    expect(html).toContain("2 of 2 claimed");
    expect(html).toContain('data-testid="claim-row-stepper-item_pad_thai"');
  });
});

describe("P1-20 — the row announces the other claimants", () => {
  const viewer = "user_andre";
  const noi = { userId: "user_noi", displayName: "Noi" };
  const andre = { userId: viewer, displayName: "Andre" };

  it("reads the item, the money and 'claimed by you'", () => {
    expect(
      claimRowAriaLabel({
        name: "Green Curry",
        lineTotalMinor: 18000,
        claimants: [andre],
        viewerUserId: viewer,
      }),
    ).toBe("Green Curry, 180 baht, claimed by you");
  });

  it("names who else is on it, not just the viewer", () => {
    expect(
      claimRowAriaLabel({
        name: "Green Curry",
        lineTotalMinor: 18000,
        claimants: [andre, noi],
        viewerUserId: viewer,
      }),
    ).toBe("Green Curry, 180 baht, claimed by you and Noi, split 2 ways, 90 baht each");
  });

  it("names the claimants when the viewer holds nothing", () => {
    expect(
      claimRowAriaLabel({
        name: "Som Tam",
        lineTotalMinor: 12000,
        claimants: [noi, { userId: "user_ploy", displayName: "Ploy" }],
        viewerUserId: viewer,
      }),
    ).toBe("Som Tam, 120 baht, claimed by Noi and Ploy, split 2 ways, 60 baht each");
  });

  it("says an orphan needs an owner", () => {
    expect(
      claimRowAriaLabel({
        name: "Mango Sticky Rice",
        lineTotalMinor: 18000,
        claimants: [],
        viewerUserId: viewer,
      }),
    ).toBe("Mango Sticky Rice, 180 baht, needs an owner");
  });
});

describe("INVITE-FLOW S4 — invite panel on the board", () => {
  it("asks the organizer to send the link when they are alone", () => {
    const html = render(
      board({
        participants: [FIXTURE_CLAIM_BOARD.participants[0]!],
        onInvite: () => undefined,
      }),
    );
    expect(html).toContain("Nobody else is here yet");
    expect(html).toContain("Send the link");
  });

  it("shrinks to + Add someone once anyone else is on the roster", () => {
    const html = render(board({ onInvite: () => undefined }));
    expect(html).toContain("+ Add someone");
    expect(html).not.toContain("Nobody else is here yet");
  });
});

describe("P1-20 — empty items", () => {
  it("asks the organizer for the bill with both capture actions", () => {
    const html = render(
      board({
        items: [],
        unassignedCount: 0,
        viewerHasClaims: false,
        onAddManual: () => {},
        // `BillEmptyState` hides the scan action when it is unwired, never disabled.
        onScanReceipt: () => {},
      }),
    );
    expect(html).toContain("Add what you ordered.");
    expect(html).toContain("Type an item");
    expect(html).toContain("Scan receipt");
  });

  it("tells a participant to stay put", () => {
    const html = render(
      board({ items: [], unassignedCount: 0, viewerHasClaims: false, isOrganizer: false }),
    );
    expect(html).toContain(
      "Maya is adding the bill. You can stay here — it will appear automatically.",
    );
  });
});

describe("P1-20 — concurrency notices are lines, never dialogs", () => {
  it("defaults the stale copy", () => {
    expect(render(board({ isStale: true }))).toContain("That changed a moment ago.");
  });

  it("names the organizer when a claimed item is removed", () => {
    expect(render(board({ removedClaimedItem: true }))).toContain(
      "Maya removed an item you claimed.",
    );
  });
});

describe("P1-20 — the who-has-this sheet", () => {
  const people = [
    { userId: "user_noi", displayName: "Noi" },
    { userId: "user_ploy", displayName: "Ploy" },
    { userId: "user_tim", displayName: "Tim" },
  ];

  it("names everyone on the dish and their per-head amount", () => {
    const html = renderToStaticMarkup(
      <WhoHasThisSheet
        itemName="Som Tam"
        lineTotalMinor={12000}
        claimants={people.slice(0, 2)}
        assignable={people.slice(2)}
        viewerUserId="user_andre"
        isOrganizer={false}
        locked={false}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("Som Tam");
    expect(html).toContain("Split 2 ways · ฿60.00 each");
    expect(html).toContain("Noi");
    expect(html).toContain("Ploy");
    // No override for a participant.
    expect(html).not.toContain("Assign to");
  });

  it("is the organizer's override surface on an orphan row", () => {
    const html = renderToStaticMarkup(
      <WhoHasThisSheet
        itemName="Mango Sticky Rice"
        lineTotalMinor={18000}
        claimants={[]}
        assignable={people}
        viewerUserId="user_maya"
        isOrganizer
        locked={false}
        onAssign={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("Nobody has claimed this yet.");
    expect(html).toContain("Assign to");
    expect(html).toContain("Tim");
  });

  it("withdraws the override once the bill is locked", () => {
    const html = renderToStaticMarkup(
      <WhoHasThisSheet
        itemName="Mango Sticky Rice"
        lineTotalMinor={18000}
        claimants={[]}
        assignable={people}
        viewerUserId="user_maya"
        isOrganizer
        locked
        onAssign={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).not.toContain("Assign to");
  });
});

/*
 * The board is where a bill gets built, not just claimed.
 *
 * Two defects lived here at once. `BillEmptyState` carries "Type an item", but
 * it renders only while the board has no items — so the first dish removed the
 * only way to add a second. And on `TabDeepLinkSurface` the handler behind
 * that button was `useCallback(() => {}, [])`: a visible primary control wired
 * to an empty function, which §1.4 rates worse than no control at all.
 */
describe("the claim board can still take an item once it has one", () => {
  it("offers the organizer an add action below a populated list", () => {
    const html = render(board({ onAddManual: () => undefined }));
    expect(html).toContain("Add another item");
  });

  it("withholds it from a participant", () => {
    const html = render(board({ isOrganizer: false, onAddManual: () => undefined }));
    expect(html).not.toContain("Add another item");
  });

  it("withholds it once the bill is locked — amounts are final", () => {
    const html = render(board({ isLocked: true, onAddManual: () => undefined }));
    expect(html).not.toContain("Add another item");
  });

  /*
   * The handler is absent, not a no-op, when the viewer cannot write. An
   * affordance that is present and dead is the failure this whole guard exists
   * for, so the button must disappear rather than sit there swallowing taps.
   */
  it("renders no add action at all when no handler is passed", () => {
    const html = render(board({ onAddManual: undefined }));
    expect(html).not.toContain("Add another item");
  });
});
