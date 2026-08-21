import { describe, expect, it } from "vitest";
import {
  USDC_DECIMALS,
  deserializeCryptoAmount,
  formatCryptoAmountDisplay,
  serializeCryptoAmount,
  usdcAmountFromAtomicString,
} from "@/lib/domain";

describe("AC2 — crypto is atomic units with persisted decimals", () => {
  it("represents USDC as bigint atomic units with explicit decimals", () => {
    const amount = usdcAmountFromAtomicString("1500000");
    expect(amount.amountAtomic).toBe(1500000n);
    expect(amount.decimals).toBe(USDC_DECIMALS);
    expect(typeof amount.amountAtomic).toBe("bigint");
  });

  it("serializes across JSON as decimal string plus decimals", () => {
    const amount = usdcAmountFromAtomicString("291740000");
    const serialized = serializeCryptoAmount(amount);
    expect(serialized).toEqual({
      amountAtomic: "291740000",
      decimals: 6,
    });

    const roundTrip = deserializeCryptoAmount(JSON.parse(JSON.stringify(serialized)));
    expect(roundTrip.amountAtomic).toBe(291740000n);
    expect(roundTrip.decimals).toBe(6);
  });

  it("does not assume decimals from token symbol alone", () => {
    const eightDecimals = usdcAmountFromAtomicString("100000000");
    const customDecimals = deserializeCryptoAmount({
      amountAtomic: "100000000",
      decimals: 8,
    });

    expect(eightDecimals.decimals).toBe(6);
    expect(customDecimals.decimals).toBe(8);
    expect(formatCryptoAmountDisplay(customDecimals)).toBe("1.00000000");
  });

  it("formats atomic display without returning floats for storage", () => {
    const amount = usdcAmountFromAtomicString("291740000");
    expect(formatCryptoAmountDisplay(amount)).toBe("291.740000");
    expect(typeof amount.amountAtomic).toBe("bigint");
  });
});
