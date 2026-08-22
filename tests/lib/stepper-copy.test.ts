import { describe, expect, it } from "vitest";
import { SETTLEMENT_STATUS, type SettlementStatus } from "@/convex/lib/settlementState";
import {
  buildSettlementProgressView,
  buildSettlementStepperStages,
} from "@/lib/settlement/stepperCopy";

const ALL_STATUSES = Object.values(SETTLEMENT_STATUS) as SettlementStatus[];

describe("settlement stepper copy", () => {
  it("maps ready_for_signature to wallet approval step", () => {
    const stages = buildSettlementStepperStages({
      status: SETTLEMENT_STATUS.READY_FOR_SIGNATURE,
      recipientName: "Maya",
    });

    expect(stages[0]?.label).toBe("Approved in your wallet");
    expect(stages[0]?.detail).toBe("Waiting for you to approve");
    expect(stages[0]?.active).toBe(true);
  });

  it("maps submitted to sending copy with recipient name", () => {
    const view = buildSettlementProgressView({
      status: SETTLEMENT_STATUS.SUBMITTED,
      recipientName: "Maya",
    });

    expect(view.stages[2]?.label).toBe("Sending to Maya");
    expect(view.stages[2]?.detail).toBe("Usually takes a few seconds");
    expect(view.footnote).toBe("You can close this — we'll update the tab either way.");
  });

  it("holds unknown on step three, forward-only, with no retry", () => {
    const view = buildSettlementProgressView({
      status: SETTLEMENT_STATUS.UNKNOWN,
      recipientName: "Maya",
    });

    // The four steps are never collapsed to one row; a step never moves backward.
    expect(view.stages).toHaveLength(4);
    expect(view.stages[0]?.complete).toBe(true);
    expect(view.stages[1]?.complete).toBe(true);
    expect(view.stages[2]?.active).toBe(true);
    expect(view.stages[2]?.label).toBe("Still checking");
    expect(view.footnote).toBe("Still checking — don't pay again.");
    expect(view.actions).toEqual([]);
  });

  it("names the failure cause in place and never says something went wrong", () => {
    const view = buildSettlementProgressView({
      status: SETTLEMENT_STATUS.FAILED,
      recipientName: "Maya",
      failureCode: "CONFIRMATION_REJECTED",
    });

    expect(view.stages).toHaveLength(4);
    expect(view.stages[2]?.label).toBe("The network didn't confirm this payment.");
    expect(view.stages[2]?.failed).toBe(true);
    expect(view.stages[0]?.complete).toBe(true);
    expect(view.footnote).toBe("Nothing left your wallet. Your share is unchanged.");
    expect(view.actions).toEqual(["try_again", "back_to_tab"]);
  });

  it("falls back to a named cause, never a generic", () => {
    const view = buildSettlementProgressView({
      status: SETTLEMENT_STATUS.FAILED,
      recipientName: "Maya",
    });

    expect(view.stages[2]?.label).toBe("This payment didn't go through.");
    expect(view.heading).not.toMatch(/something went wrong/i);
    expect(view.stages.map((s) => s.label).join(" ")).not.toMatch(/something went wrong/i);
  });

  it("offers only back to tab when the target was already settled", () => {
    const view = buildSettlementProgressView({
      status: SETTLEMENT_STATUS.FAILED,
      recipientName: "Maya",
      failureCode: "TARGET_ALREADY_SETTLED",
    });

    expect(view.stages[2]?.label).toBe("This one was already settled.");
    expect(view.actions).toEqual(["back_to_tab"]);
  });

  it("completes every step on confirmed and names what the recipient received", () => {
    const view = buildSettlementProgressView({
      status: SETTLEMENT_STATUS.CONFIRMED,
      recipientName: "Maya",
      billName: "Sukhumvit Dinner",
      recipientReceivesLabel: "8.25 USDC",
    });

    expect(view.stages.every((stage) => stage.complete)).toBe(true);
    expect(view.stages.some((stage) => stage.active)).toBe(false);
    expect(view.stages[3]?.detail).toBe("Maya received 8.25 USDC");
    expect(view.footnote).toBe("Your share of Sukhumvit Dinner is settled.");
    expect(view.announcement).toContain("Confirmed");
  });

  it("never shows expired or superseded as an approved payment", () => {
    for (const status of [SETTLEMENT_STATUS.EXPIRED, SETTLEMENT_STATUS.SUPERSEDED]) {
      const view = buildSettlementProgressView({ status, recipientName: "Maya" });
      expect(view.surface).toBe("sheet");
      expect(view.stages.some((stage) => stage.active)).toBe(false);
      expect(view.stages.some((stage) => stage.complete)).toBe(false);
    }

    expect(
      buildSettlementProgressView({
        status: SETTLEMENT_STATUS.EXPIRED,
        recipientName: "Maya",
      }).heading,
    ).toBe("Quote expired. Refresh it.");

    expect(
      buildSettlementProgressView({
        status: SETTLEMENT_STATUS.SUPERSEDED,
        recipientName: "Maya",
      }).heading,
    ).toBe("This bill changed. Refresh to see your new amount.");
  });

  it("routes created and quoting back to the sheet", () => {
    for (const status of [SETTLEMENT_STATUS.CREATED, SETTLEMENT_STATUS.QUOTING]) {
      const view = buildSettlementProgressView({ status, recipientName: "Maya" });
      expect(view.surface).toBe("sheet");
      expect(view.actions).toEqual(["back_to_sheet"]);
    }
  });

  it("maps all ten persisted states with four steps and no banned vocabulary", () => {
    expect(ALL_STATUSES).toHaveLength(10);

    for (const status of ALL_STATUSES) {
      const view = buildSettlementProgressView({ status, recipientName: "Maya" });
      const text = [view.heading, view.footnote ?? "", view.announcement, ...view.stages.map((s) => s.label), ...view.stages.map((s) => s.detail ?? "")].join(" ");

      expect(view.stages).toHaveLength(4);
      expect(view.announcement.length).toBeGreaterThan(0);
      expect(text).not.toMatch(
        /\bexecute|\bswap|\broute\b|\bbroadcast|\btransaction|\bsignature|\bmint\b|\bgas\b|\blamports|\bslippage|\bblockhash|\bRPC\b|\bintent\b|\bsubmitted\b|confirmed-on-chain/i,
      );
    }
  });
});
