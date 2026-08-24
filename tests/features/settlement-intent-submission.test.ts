import { describe, expect, it, vi } from "vitest";
import { submitPaymentIntent } from "@/features/settlement/intentSubmission";

describe("settlement token switch and quote refresh seam", () => {
  it("commits the requested token only after the replacement writer succeeds", async () => {
    const writer = vi.fn(async () => ({ intentId: "intents:new" }));
    await expect(submitPaymentIntent({
      obligationId: "obligations:one",
      inputMint: "mint:new",
      idempotencyKey: "switch:key",
      writer,
    })).resolves.toEqual({ inputMint: "mint:new" });
    expect(writer).toHaveBeenCalledWith({
      obligationId: "obligations:one",
      inputMint: "mint:new",
      idempotencyKey: "switch:key",
    });
  });

  it("rejects a failed replacement without returning a token to commit", async () => {
    const writer = vi.fn(async () => { throw new Error("QUOTE_FAILED"); });
    await expect(submitPaymentIntent({
      obligationId: "obligations:one",
      inputMint: "mint:failed",
      idempotencyKey: "switch:failed",
      writer,
    })).rejects.toThrow("QUOTE_FAILED");
  });

  it("uses the same boundary with the refresh writer", async () => {
    const refreshWriter = vi.fn(async () => ({ intentId: "intents:refreshed" }));
    await expect(submitPaymentIntent({
      obligationId: "obligations:one",
      inputMint: "mint:current",
      idempotencyKey: "refresh:key",
      writer: refreshWriter,
    })).resolves.toEqual({ inputMint: "mint:current" });
    expect(refreshWriter).toHaveBeenCalledOnce();
  });
});
