import { describe, expect, it } from "vitest";
import { ACTIVITY_EVENT_TYPE } from "@/lib/domain/activityTypes";
import { assertActivityEventImmutable } from "@/convex/lib/activitySync";
import {
  validateAndParseExtraction,
  runFixtureExtraction,
} from "@/convex/lib/receiptExtraction";
import { RECEIPT_TARGET_SUBSET } from "@/lib/domain/receiptFixture";

describe("Story 7.3 — activity events", () => {
  it("AC2 — rejects mutation on immutable events", () => {
    expect(() => assertActivityEventImmutable()).toThrow("ACTIVITY_EVENT_IMMUTABLE");
  });

  it("AC1 — domain action types defined", () => {
    expect(ACTIVITY_EVENT_TYPE.PAYMENT).toBe("payment");
    expect(ACTIVITY_EVENT_TYPE.WAIVER).toBe("waiver");
    expect(ACTIVITY_EVENT_TYPE.CASH_PROPOSED).toBe("cash_proposed");
  });
});

describe("Story 8.2 — receipt extraction stub", () => {
  it("AC1 — rejects schema mismatch", () => {
    expect(() => validateAndParseExtraction({ lines: [] })).toThrow("RECEIPT_SCHEMA_REJECTED");
  });

  it("AC2 — stores provenance in fixture result", () => {
    const result = runFixtureExtraction();
    expect(result.fieldConfidence).toBeDefined();
    expect(result.modelMetadata.provider).toBe("fixture");
    expect(result.parsed.lines.length).toBeGreaterThan(0);
  });

  it("AC5 — failure uses stable code path", () => {
    expect(() => validateAndParseExtraction(null)).toThrow("RECEIPT_SCHEMA_REJECTED");
  });
});

describe("Story 8.7 — receipt subset documented", () => {
  it("AC1 — target subset named", () => {
    expect(RECEIPT_TARGET_SUBSET.length).toBeGreaterThanOrEqual(4);
    expect(RECEIPT_TARGET_SUBSET.some((s) => s.includes("Thai"))).toBe(true);
    expect(RECEIPT_TARGET_SUBSET.some((s) => s.includes("English"))).toBe(true);
  });
});
