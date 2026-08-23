import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findPreviousReceivingWallet } from "@/convex/lib/walletSync";
import { WALLET_MOVE_FAILURE } from "@/convex/lib/walletMoveSync";

describe("move received USDC", () => {
  it("the public action accepts only an idempotency key — no address arguments", () => {
    const source = readFileSync("convex/wallets.ts", "utf8");
    const action = source.slice(source.indexOf("export const createWalletMove"));
    expect(action).toContain("idempotencyKey");
    expect(action).not.toContain("solanaAddress");
    expect(action).not.toContain("recipientAddress");
    expect(action).not.toContain("destinationAddress");
    expect(WALLET_MOVE_FAILURE.NO_PREVIOUS_WALLET).toBe("NO_PREVIOUS_WALLET");
  });

  it("previous receiving row is the one that last lost default", () => {
    const previous = findPreviousReceivingWallet([
      {
        _id: "wallets:old" as never,
        isDefaultReceiving: false,
        lastDefaultAt: 10,
        createdAt: 1,
      },
      {
        _id: "wallets:new" as never,
        isDefaultReceiving: true,
        createdAt: 20,
      },
      {
        _id: "wallets:older" as never,
        isDefaultReceiving: false,
        createdAt: 2,
      },
    ]);
    expect(previous?._id).toBe("wallets:old");
  });
});
