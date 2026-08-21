import { describe, expect, it } from "vitest";
import { SETTLEMENT_STATUS } from "@/convex/lib/settlementState";
import { buildSettlementStepperStages } from "@/lib/settlement/stepperCopy";

describe("settlement stepper copy", () => {
  it("maps ready_for_signature to wallet approval step", () => {
    const stages = buildSettlementStepperStages({
      status: SETTLEMENT_STATUS.READY_FOR_SIGNATURE,
      recipientName: "Maya",
    });

    expect(stages[0]?.label).toBe("Approved in your wallet");
    expect(stages[0]?.active).toBe(true);
  });

  it("maps submitted to sending copy with recipient name", () => {
    const stages = buildSettlementStepperStages({
      status: SETTLEMENT_STATUS.SUBMITTED,
      recipientName: "Maya",
    });

    expect(stages[2]?.label).toBe("Sending to Maya");
    expect(stages[2]?.detail).toBe("Usually takes a few seconds");
  });

  it("shows unknown-state copy without going backward", () => {
    const stages = buildSettlementStepperStages({
      status: SETTLEMENT_STATUS.UNKNOWN,
      recipientName: "Maya",
    });

    expect(stages).toHaveLength(1);
    expect(stages[0]?.label).toContain("Still checking");
  });
});
