import { describe, expect, it, vi } from "vitest";
import {
  confirmIrreversibleWaiver,
  WAIVER_CONFIRMATION,
} from "@/features/balances/OweSurface";

describe("owed balance actions", () => {
  it("requires an explicit irreversible-waiver confirmation", () => {
    const decline = vi.fn(() => false);
    const accept = vi.fn(() => true);

    expect(confirmIrreversibleWaiver(decline)).toBe(false);
    expect(confirmIrreversibleWaiver(accept)).toBe(true);
    expect(decline).toHaveBeenCalledWith(WAIVER_CONFIRMATION);
    expect(accept).toHaveBeenCalledWith(WAIVER_CONFIRMATION);
  });
});
