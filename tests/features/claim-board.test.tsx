import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ClaimBoard,
  FIXTURE_CLAIM_BOARD,
  claimFooterAction,
  unassignedPhrase,
  type ClaimBoardProps,
} from "@/features/claims/ClaimBoard";
import { claimRowAriaLabel, claimRowStateTag } from "@/components/claim-row";
import { FIXTURE_BILL_REVIEW } from "@/features/claims/BillReview";
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
    expect(html).toContain("Scan a receipt");
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
