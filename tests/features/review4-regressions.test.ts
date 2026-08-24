import { afterEach, describe, expect, it, vi } from "vitest";
import { quoteWithTimeout } from "@/features/settlement/useSettleSheetData";
import {
  claimAutomaticSettlementCreation,
  isCurrentSettlementOperation,
} from "@/features/settlement/operationFence";
import { finalizeReceiptUploadWithExactReplay } from "@/features/receipts/useReceiptUpload";
import {
  clampItemQuantity,
  currencyUnitToMinor,
  minorToCurrencyUnit,
  safeLineTotalMinor,
} from "@/features/bills/ItemEditor";
import { isCurrentInviteOperation } from "@/features/invite/InviteSheet";
import { runQrScan } from "@/features/telegram/useQrScanner";

afterEach(() => vi.useRealTimers());

describe("iteration-5 review regression seams", () => {
  it("times out a quote and ignores the eventual late source result", async () => {
    vi.useFakeTimers();
    let resolve!: (value: string) => void;
    const source = new Promise<string>((done) => { resolve = done; });
    const timed = quoteWithTimeout(source, 10);
    const observed: string[] = [];
    void timed.then((value) => observed.push(value), (error) => observed.push(error.message));
    await vi.advanceTimersByTimeAsync(10);
    expect(observed).toEqual(["SETTLE_QUOTE_TIMEOUT"]);
    resolve("late");
    await Promise.resolve();
    expect(observed).toEqual(["SETTLE_QUOTE_TIMEOUT"]);
  });

  it("claims automatic creation once per obligation and fences stale continuations", () => {
    const claims = new Set<string>();
    expect(claimAutomaticSettlementCreation(claims, "o1", "USDC")).toBe(true);
    expect(claimAutomaticSettlementCreation(claims, "o1", "USDC")).toBe(false);
    expect(claimAutomaticSettlementCreation(claims, "o2", "USDC")).toBe(true);
    expect(isCurrentSettlementOperation("o2", 4, "o1", 3)).toBe(false);
    expect(isCurrentSettlementOperation("o2", 4, "o2", 4)).toBe(true);
  });

  it("replays receipt finalization exactly once after a lost response", async () => {
    const finalize = vi.fn()
      .mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce({ ok: true });
    await expect(finalizeReceiptUploadWithExactReplay(finalize)).resolves.toEqual({ ok: true });
    expect(finalize).toHaveBeenCalledTimes(2);
  });

  it("preserves exact currency strings and refuses an unsafe line product", () => {
    expect(currencyUnitToMinor("0.10", "USD")).toBe(10);
    expect(currencyUnitToMinor("0.101", "USD")).toBe(0);
    expect(minorToCurrencyUnit(10, "USD")).toBe("0.10");
    expect(safeLineTotalMinor(Number.MAX_SAFE_INTEGER, 2)).toBeNull();
    expect(safeLineTotalMinor(125, 3)).toBe(375);
    expect(clampItemQuantity("1000")).toBe(999);
    expect(clampItemQuantity("not-a-number")).toBe(1);
    expect(clampItemQuantity("1.5", 3)).toBe(3);
  });

  it("fences old-tab invite work and surfaces router callback failures", () => {
    expect(isCurrentInviteOperation("tabs:2", 2, "tabs:1", 1)).toBe(false);
    let callback: ((raw: string) => boolean | void) | undefined;
    const errors: Array<string | null> = [];
    runQrScan({
      showScanQrPopup: (_params, next) => { callback = next; },
      closeScanQrPopup: () => undefined,
    }, () => { throw new Error("router failed"); }, (error) => errors.push(error));
    callback?.("https://t.me/mytab_live_bot/app?startapp=opaque_token-123");
    expect(errors.at(-1)).toMatch(/couldn't open/i);
  });
});
