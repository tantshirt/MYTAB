import { describe, expect, it } from "vitest";
import { encodeQrModules, qrVersionFor } from "../../lib/qr/encode";

function hasFinder(modules: boolean[][], row: number, col: number): boolean {
  for (let r = 0; r < 7; r += 1) {
    for (let c = 0; c < 7; c += 1) {
      const onRing = r === 0 || r === 6 || c === 0 || c === 6;
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      const expected = onRing || inCore;
      if (modules[row + r]![col + c] !== expected) {
        return false;
      }
    }
  }
  return true;
}

describe("QR encoder — D-24 carrier", () => {
  it("places finder patterns on a deep-link payload", () => {
    const url = "https://t.me/mytab_live_bot/app?startapp=opaque-invite-token-value";
    const modules = encodeQrModules(url);
    const n = modules.length;
    expect(n).toBeGreaterThanOrEqual(21);
    expect(hasFinder(modules, 0, 0)).toBe(true);
    expect(hasFinder(modules, 0, n - 7)).toBe(true);
    expect(hasFinder(modules, n - 7, 0)).toBe(true);
  });

  it("is deterministic for the same payload", () => {
    const url = "https://t.me/mytab_live_bot/app?startapp=same-token";
    const a = encodeQrModules(url);
    const b = encodeQrModules(url);
    expect(a).toEqual(b);
  });

  it("picks a version that fits a 32-byte token URL", () => {
    const token = "a".repeat(43);
    const url = `https://t.me/mytab_live_bot/app?startapp=${token}`;
    expect(qrVersionFor(url)).toBeLessThanOrEqual(10);
    expect(encodeQrModules(url).length).toBeGreaterThanOrEqual(21);
  });
});
