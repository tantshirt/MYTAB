import { describe, expect, it } from "vitest";
import { coordinateReciprocalReads } from "@/features/balances/useOweData";

describe("reciprocal obligation read coordination", () => {
  it("preserves the owing side when it resolves first", () => {
    expect(coordinateReciprocalReads({
      owingData: ["I owe"],
      owedData: undefined,
      owingResolved: true,
      owedResolved: false,
      owingError: null,
      owedError: null,
    })).toEqual({ status: "loading", owingData: ["I owe"], owedData: [] });

    expect(coordinateReciprocalReads({
      owingData: ["I owe"],
      owedData: ["owed to me"],
      owingResolved: true,
      owedResolved: true,
      owingError: null,
      owedError: null,
    })).toEqual({ status: "ready", owingData: ["I owe"], owedData: ["owed to me"] });
  });

  it("preserves the owed side when it resolves first", () => {
    expect(coordinateReciprocalReads({
      owingData: undefined,
      owedData: ["owed to me"],
      owingResolved: false,
      owedResolved: true,
      owingError: null,
      owedError: null,
    })).toEqual({ status: "loading", owingData: [], owedData: ["owed to me"] });
  });
});
