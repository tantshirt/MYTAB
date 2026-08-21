import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { runFixtureExtraction } from "../lib/receiptExtraction";

/** Runs receipt extraction via fixture adapter (Story 8.2 AC4 fixture mode). */
export const runExtraction = internalMutation({
  args: {
    importId: v.id("receiptImports"),
  },
  handler: async (ctx, args) => {
    const receiptImport = await ctx.db.get(args.importId);
    if (!receiptImport || receiptImport.status === "deleted") {
      return { skipped: true };
    }

    await ctx.db.patch(args.importId, {
      status: "extracting",
      updatedAt: Date.now(),
    });

    try {
      const result = runFixtureExtraction();
      await ctx.db.patch(args.importId, {
        status: "needs_review",
        extraction: result.parsed,
        rawExtraction: result.raw,
        fieldConfidence: result.fieldConfidence,
        reconciliation: result.parsed.reconciliation,
        modelMetadata: result.modelMetadata,
        updatedAt: Date.now(),
      });
      return { ok: true };
    } catch (error) {
      const failureCode =
        error instanceof Error && error.message === "RECEIPT_SCHEMA_REJECTED"
          ? "SCHEMA_REJECTED"
          : "EXTRACTION_FAILED";
      await ctx.db.patch(args.importId, {
        status: "failed",
        failureCode,
        updatedAt: Date.now(),
      });
      return { failed: true, failureCode };
    }
  },
});
