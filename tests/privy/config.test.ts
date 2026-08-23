import { describe, expect, it } from "vitest";
import { createPrivyConfig, isPrivyFixtureMode } from "@/lib/privy/config";

describe("lib/privy/config", () => {
  it("enters fixture mode when NEXT_PUBLIC_PRIVY_APP_ID is missing", () => {
    const previous = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;

    expect(isPrivyFixtureMode()).toBe(true);

    if (previous !== undefined) {
      process.env.NEXT_PUBLIC_PRIVY_APP_ID = previous;
    }
  });

  it("configures Telegram identity with opt-in embedded wallet and external connectors", () => {
    const config = createPrivyConfig();

    expect(config.loginMethods).toEqual(["telegram"]);
    expect(config.appearance?.walletChainType).toBe("solana-only");
    expect(config.embeddedWallets?.solana?.createOnLogin).toBe("off");
    expect(config.externalWallets?.solana?.connectors).toBeDefined();
  });
});
