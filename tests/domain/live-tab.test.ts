import { describe, expect, it } from "vitest";
import {
  claimProgress,
  isLiveTab,
  pickLiveTab,
  stillChoosingCount,
  type LiveTabCandidate,
} from "@/lib/domain/liveTab";

function candidate(overrides: Partial<LiveTabCandidate> = {}): LiveTabCandidate {
  return {
    tabId: "tabs:t1",
    status: "open",
    itemCount: 12,
    claimedItemCount: 8,
    unclaimedCount: 4,
    participants: [],
    updatedAt: 100,
    ...overrides,
  };
}

describe("isLiveTab", () => {
  it("counts draft and open as live", () => {
    expect(isLiveTab({ status: "open" })).toBe(true);
    expect(isLiveTab({ status: "draft" })).toBe(true);
  });

  /*
   * A locked tab is in settlement. Presenting it as a room people are still
   * choosing in would be a lie about what is happening on the other phones.
   */
  it("does not count locked, settled or closed as live", () => {
    expect(isLiveTab({ status: "locked" })).toBe(false);
    expect(isLiveTab({ status: "settled" })).toBe(false);
    expect(isLiveTab({ status: "closed" })).toBe(false);
  });
});

describe("pickLiveTab", () => {
  it("returns null when nothing is live", () => {
    expect(pickLiveTab([candidate({ status: "locked" })])).toBeNull();
    expect(pickLiveTab([])).toBeNull();
  });

  it("picks the most recently touched live tab", () => {
    const older = candidate({ tabId: "tabs:old", updatedAt: 10 });
    const newer = candidate({ tabId: "tabs:new", updatedAt: 20 });

    expect(pickLiveTab([older, newer])?.tabId).toBe("tabs:new");
    expect(pickLiveTab([newer, older])?.tabId).toBe("tabs:new");
  });

  it("never picks a locked tab over a live one, however recent", () => {
    const liveButOld = candidate({ tabId: "tabs:live", status: "open", updatedAt: 1 });
    const lockedAndFresh = candidate({ tabId: "tabs:locked", status: "locked", updatedAt: 999 });

    expect(pickLiveTab([liveButOld, lockedAndFresh])?.tabId).toBe("tabs:live");
  });
});

describe("claimProgress", () => {
  it("is a plain fraction of items claimed", () => {
    expect(claimProgress({ itemCount: 12, claimedItemCount: 8 })).toBeCloseTo(8 / 12);
    expect(claimProgress({ itemCount: 4, claimedItemCount: 4 })).toBe(1);
    expect(claimProgress({ itemCount: 4, claimedItemCount: 0 })).toBe(0);
  });

  /*
   * A bill with no items has not started. Zero would draw an empty bar and
   * assert "0% done" about work nobody can do yet.
   */
  it("is null when there is nothing to claim", () => {
    expect(claimProgress({ itemCount: 0, claimedItemCount: 0 })).toBeNull();
  });

  it("never reports more than complete", () => {
    expect(claimProgress({ itemCount: 3, claimedItemCount: 9 })).toBe(1);
    expect(claimProgress({ itemCount: 3, claimedItemCount: -2 })).toBe(0);
  });
});

describe("stillChoosingCount", () => {
  it("counts everyone who has taken nothing, viewer included", () => {
    expect(
      stillChoosingCount([
        { userId: "u1", displayName: "Andre", claimedCount: 0 },
        { userId: "u2", displayName: "Maya", claimedCount: 2 },
        { userId: "u3", displayName: "Tim", claimedCount: 0 },
      ]),
    ).toBe(2);
  });

  it("is zero when everyone has claimed", () => {
    expect(
      stillChoosingCount([{ userId: "u1", displayName: "Andre", claimedCount: 1 }]),
    ).toBe(0);
  });

  it("is zero on an empty room", () => {
    expect(stillChoosingCount([])).toBe(0);
  });
});
