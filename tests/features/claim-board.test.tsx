import { describe, expect, it } from "vitest";
import { FIXTURE_CLAIM_BOARD } from "@/features/claims/ClaimBoard";
import { FIXTURE_BILL_REVIEW } from "@/features/claims/BillReview";
import { formatFiatMinorThb, perHeadDisplayMinor, thbMinorFromInteger } from "@/lib/domain";

describe("Story 5.4 — claim board fixture", () => {
  it("AC2 — shared item shows split copy", () => {
    const shared = FIXTURE_CLAIM_BOARD.items.find((item) => item.claimantIds.length === 2);
    expect(shared).toBeTruthy();
    const each = formatFiatMinorThb(
      perHeadDisplayMinor(thbMinorFromInteger(shared!.lineTotalMinor), 2),
    );
    expect(each).toBe("฿120.00");
  });

  it("AC6 — unassigned row flagged", () => {
    expect(FIXTURE_CLAIM_BOARD.unassignedCount).toBe(1);
    expect(FIXTURE_CLAIM_BOARD.items.some((item) => item.unassigned)).toBe(true);
  });
});

describe("Story 5.6 — sticky footer states", () => {
  it("AC3 — organizer sees unassigned count in disabled action", () => {
    expect(FIXTURE_CLAIM_BOARD.isOrganizer).toBe(true);
    expect(FIXTURE_CLAIM_BOARD.unassignedCount).toBe(1);
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

describe("Story 5.5 — presence fixture", () => {
  it("AC1 — presence excludes viewer", () => {
    expect(FIXTURE_CLAIM_BOARD.presenceUserIds).not.toContain(FIXTURE_CLAIM_BOARD.viewerUserId);
  });
});
