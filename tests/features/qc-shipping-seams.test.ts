import { afterEach, describe, expect, it, vi } from "vitest";
import { USDC_MINT, WRAPPED_SOL_MINT } from "@/lib/solana/constants";
import { assembleObligationQuote } from "@/lib/settlement/obligationQuote";
import { mapObligationQuoteToSheet } from "@/features/settlement/mapSettleSheet";
import { isCurrentSettlementOperation } from "@/features/settlement/operationFence";
import { submitPaymentIntent } from "@/features/settlement/intentSubmission";
import { isCurrentInviteOperation } from "@/features/invite/InviteSheet";
import { performReceiptUpload } from "@/features/receipts/useReceiptUpload";
import type { Id } from "@/convex/_generated/dataModel";

describe("QC shipping seams", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not apply a late settlement token selection after obligation switch", async () => {
    let selected = "USDC";
    const writer = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { intentId: "intents:old" };
    });
    const generation = 1;
    const promise = submitPaymentIntent({
      obligationId: "obligations:old",
      inputMint: "mint:bonk",
      idempotencyKey: "key:1",
      writer,
    }).then(({ inputMint }) => {
      if (isCurrentSettlementOperation("obligations:new", 2, "obligations:old", generation)) {
        selected = inputMint;
      }
    });
    await promise;
    expect(selected).toBe("USDC");
  });

  it("formats routed spend caps without approximating the figure", () => {
    const quote = assembleObligationQuote({
      recipientName: "Maya",
      recipientId: "users:maya",
      tabName: "Dinner",
      displayAmountThbMinor: 1000n,
      displayCurrency: "THB",
      outputDecimals: 6,
      outputSymbol: "USDC",
      intentId: "intents:1",
      status: "ready_for_signature",
      quoteResolving: false,
      quoteExpired: false,
      quoteRemainingMs: 60_000,
      staleRevision: false,
      quotedOtherAmountThreshold: 8_250_000n,
      minimumOutputAtomic: 8_250_000n,
      obligationAmountAtomic: 8_250_000n,
      maximumInputAtomic: 41_200_000n,
      inputMint: WRAPPED_SOL_MINT,
      outputMint: USDC_MINT,
      roundUpAtomic: null,
      rateNumeratorAtomic: null,
      rateDenominatorMinor: null,
      walletKind: "external",
      walletProvider: "phantom",
      preparedTxBase64: "tx",
      tokens: [{
        mint: WRAPPED_SOL_MINT,
        fallbackName: "SOL",
        fallbackDecimals: 9,
        balanceAtomic: 100_000_000n,
        requiredAtomic: 41_200_000n,
        affordable: true,
      }],
      metadata: [],
    });
    const sheet = mapObligationQuoteToSheet(quote);
    expect(sheet.spendLabel).toMatch(/^Up to /);
    expect(sheet.spendLabel).not.toContain("≈");
  });

  it("does not discard a receipt import after finalize has started", async () => {
    const discard = vi.fn(async () => undefined);
    const finalize = vi.fn()
      .mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ storageId: "storage:page1" }), { status: 200 })));
    await expect(performReceiptUpload({
      createTicket: async () => ({
        importId: "receiptImports:one" as Id<"receiptImports">,
        uploadTicketHash: "ticket-1",
      }),
      generateUrl: async () => "https://upload.example/page",
      registerPage: async () => undefined,
      discardCandidate: async () => undefined,
      finalize,
      discard,
    }, "tabs:1", [new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" })]))
      .resolves.toBe("receiptImports:one");
    expect(finalize).toHaveBeenCalledTimes(2);
    expect(discard).not.toHaveBeenCalled();
  });

  it("does not toggle invite QR after the tab identity changes mid-load", () => {
    let showQr = false;
    const wouldToggle = isCurrentInviteOperation("tabs:2", 2, "tabs:1", 1);
    if (wouldToggle) {
      showQr = !showQr;
    }
    expect(wouldToggle).toBe(false);
    expect(showQr).toBe(false);
  });
});
